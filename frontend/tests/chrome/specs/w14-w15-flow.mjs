// [chrome 회귀] W14 운동 진행 → W15 결과 저장·조회
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// W15 S3 실제 Chrome + 개발용 IndexedDB 통합 검증. 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다.
import { start, toSession, completeCurrent } from '../lib/session.mjs'

const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const TODAY = `(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()`
const recs = (h, u) =>
  h.store(
    u,
    `const t=${TODAY};return (await records.listByDateRange(t,t)).items`,
  )
const active = (h, u) => h.store(u, `return await sessions.getActive()`)
const sid = async (h) => (await h.path()).split('session=')[1]
const getSession = (h, u, id) =>
  h.store(u, `return await sessions.get(${JSON.stringify(id)})`)
const setVal = (h, id, v) => h.setVal('#' + id, v)
const clickId = (h, id) =>
  h.ev(
    `(()=>{const e=document.getElementById(${JSON.stringify(id)});if(!e)return false;e.click();return true})()`,
  )
const toResult = async (h) => {
  await h.click('^운동 결과 확인$')
  await h.sleep(350)
  // 측정 시간이 쌓인 세트가 있으면 이동 전 확인 패널이 먼저 나온다(정상 동작).
  if (await h.has('측정 중인 시간은 기록되지 않아요'))
    await h.click('^결과 확인으로 이동$')
  await h.until(`!!document.querySelector('[data-result-screen]')`, 80)
  await h.sleep(250)
}
const card0 = (h) =>
  h.ev(`document.querySelector('[aria-labelledby=result-ex-0]').innerText`)
const waitPath = (h, re, n = 80) =>
  h.until(`new RegExp(${JSON.stringify(re)}).test(location.pathname)`, n)
const uiSave = async (h) => {
  await h.click('^(운동 결과 저장하기|다시 시도)$')
}

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(`${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

// ── A. 정상 흐름(부분 완료) + 새로고침 ───────────────────────────────
await scenario('A-normal', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await completeCurrent(h)
  check(
    '1~2. W01에서 시작해 W14 진입, 일부 세트 완료',
    (await h.path()) === '/records/exercise/session' &&
      (await h.has('완료 2 / 6세트')),
  )
  await toResult(h)
  const id = await sid(h)
  check(
    '3~4. W15 이동(URL에 session) 후 결과 확인',
    /\/records\/exercise\/result\?session=./.test(await h.path()) &&
      (await h.has('부분 완료')) &&
      (await h.has('2/6')),
  )
  check(
    '4-1. 시간형 포함 → W15, 미완료 세트는 "기록 없음 (미완료)"',
    (await h.ev(
      `document.querySelector('[data-result-screen]').dataset.resultScreen`,
    )) === 'W15' && (await h.has('기록 없음 \\(미완료\\)')),
  )
  // 수정: 잘못된 입력 → 오류가 입력과 연결, 취소, 다시 수정
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '0')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(200)
  check(
    '5-1. 잘못된 횟수는 거부되고 오류가 해당 입력에 연결',
    await h.ev(
      `(()=>{const i=document.getElementById('result-reps-0-0');return i.getAttribute('aria-invalid')==='true'&&document.getElementById(i.getAttribute('aria-describedby'))?.innerText.includes('1~999')})()`,
    ),
  )
  await setVal(h, 'result-reps-0-0', '12')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(250)
  check(
    '5-2. 수정 적용: 12회·수정됨 표시·수정 취소 버튼',
    (await h.has('12회')) &&
      (await h.has('수정됨')) &&
      (await h.has('수정 취소')),
  )
  check(
    '5-3. 저장 전에는 저장소 값이 그대로(편집은 화면 초안뿐)',
    (await getSession(h, 'free', id)).performed[0][0].actualReps === 10,
  )
  await h.click('^수정 취소$')
  await h.sleep(200)
  check(
    '5-4. 수정 취소 → 원래 값(10회)으로 복원',
    !(await h.has('수정됨')) &&
      (await h.ev(
        `document.querySelector('[data-set-state=done] dd:nth-of-type(2)')?.innerText`,
      )) === '10회',
  )
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '12')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(250)
  // 이탈 보호: 수정이 있는 채 W01로 이동 시도
  const beforeUnloadRisk = await h.ev(
    `(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`,
  )
  check(
    '9-1. 저장 안 한 수정이 있으면 beforeunload 경고(새로고침·탭 닫기)',
    beforeUnloadRisk === true,
  )
  await h.click('^이전$', 'main')
  await h.sleep(500)
  check(
    '9-2. 이동 시 확인 패널(계속 수정하기 / 수정 내용 버리고 이동)',
    (await h.has('저장하지 않은 수정 내용이 있어요')) &&
      (await h.path()).startsWith('/records/exercise/result'),
  )
  await h.click('^계속 수정하기$')
  await h.sleep(300)
  check(
    '9-3. 계속 수정하기 → 머무르고 수정값 유지',
    (await h.path()).startsWith('/records/exercise/result') &&
      (await h.has('수정됨')),
  )
  // 최종 저장
  await uiSave(h)
  await waitPath(h, '^/records/exercise$')
  check('6~7. 저장 후 W01로 이동', (await h.path()) === '/records/exercise')
  const list = await recs(h, 'free')
  check(
    '7-1. 완료 기록 1건, 수정값(12)·완료 2세트 저장',
    list.length === 1 &&
      list[0].exercises[0].completedSets[0].actualReps === 12 &&
      list[0].totals.completedSetCount === 2 &&
      list[0].totals.plannedSetCount === 6,
  )
  check(
    '10-1. 완료된 세션이 진행 중으로 남지 않음(getActive null)',
    (await active(h, 'free')) === null,
  )
  await h.sleep(400)
  const w01 = await h.text()
  check(
    '10-2. W01에 진행 중 카드·시작 버튼이 없고 완료 안내',
    !/진행 중인 운동 이어서|이 목록으로 바로 운동 시작/.test(w01),
    w01.replace(/\n+/g, ' ').slice(0, 120),
  )
  await h.go('/records/exercise', 1200)
  await h.sleep(600)
  const after = await recs(h, 'free')
  check(
    '8. 새로고침 후에도 기록 유지·진행 중 세션 없음',
    after.length === 1 && (await active(h, 'free')) === null,
  )
  // 완료된 세션 URL 직접 접근(읽기 전용)
  await h.go(`/records/exercise/result?session=${id}`, 800)
  await h.until(`!!document.querySelector('main h1')`)
  await h.sleep(500)
  const done = await h.text()
  check(
    '22. 완료된 세션 URL: 읽기 전용(저장된 기록·편집/저장 버튼 없음·W01 이동)',
    /저장된 기록/.test(done) &&
      /이미 저장된 운동 기록이에요/.test(done) &&
      !/운동 결과 저장하기|수정 취소|완료 해제/.test(done) &&
      (await h.ev(
        `!![...document.querySelectorAll('main a')].find(a=>a.innerText.includes('오늘의 운동으로 돌아가기'))`,
      )) &&
      (await h.ev(`document.querySelectorAll('main button').length`)) === 0,
  )
  await h.shot('w15-completed.png')
})

// ── B. 전체 완료 + 중복 저장 ───────────────────────────────────────
await scenario('B-full', async (h) => {
  await toSession(h, 'free', 'mixed')
  for (let i = 0; i < 6; i++) await completeCurrent(h)
  check(
    '9. 모든 세트 완료 → W14 "모든 세트를 마쳤어요" + 운동 결과 확인',
    (await h.has('모든 세트를 마쳤어요')) && (await h.has('운동 결과 확인')),
  )
  await toResult(h)
  check(
    '10. W15 전체 완료(A안: 시간형도 측정한 시간이 있어 "측정 기록 없음"이 없음)',
    (await h.has('전체 완료')) &&
      !(await h.has('측정 기록 없음')) &&
      (await h.has('6/6')),
  )
  // 더블 클릭: 같은 틱에 두 번 클릭
  await h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^운동 결과 저장하기$/.test(b.innerText.trim()));b.click();b.click()})()`,
  )
  await waitPath(h, '^/records/exercise$')
  await h.sleep(500)
  const list = await recs(h, 'free')
  const s = await h.store('free', `return (await sessions.getActive())`)
  check(
    '11~12. 전체 완료 저장·연타해도 완료 기록은 1건',
    list.length === 1 &&
      list[0].totals.completedSetCount === 6 &&
      list[0].totals.plannedSetCount === 6 &&
      s === null,
  )
  const sess = await getSession(h, 'free', list[0].sessionId)
  check(
    '12-1. 세션은 completed, 기록과 연결',
    sess.status === 'completed' && sess.recordId === list[0].id,
  )
})

// ── C. 저장 실패·재시도 ─────────────────────────────────────────────
await scenario('C-save-fail', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '15')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(200)
  await h.arm('save', 1)
  await h.click('^운동 결과 저장하기$')
  await h.until(`/다시 시도할 수 있어요/.test(document.body.innerText)`, 60)
  check(
    '13. saveProgress 실패 주입 → 재시도 가능 안내',
    (await h.hits()) === 1 &&
      (await h.has('운동 결과를 저장하지 못했어요\\. 다시 시도할 수 있어요')) &&
      (await h.has('운동 결과 화면에 머무르기')),
  )
  check(
    '13-1. 저장소는 그대로·수정값은 화면에 남음',
    (await getSession(h, 'free', id)).performed[0][0].actualReps === 10 &&
      (await h.has('15회')) &&
      (await recs(h, 'free')).length === 0,
  )
  await h.shot('w15-error.png')
  await h.click('^운동 결과 화면에 머무르기$')
  await h.sleep(200)
  check(
    '13-2. 머무르기 → 요약 배너가 남고 다시 시도 가능',
    (await h.has('운동 결과를 저장하지 못했어요\\.')) &&
      !(await h.has('운동 결과 화면에 머무르기')),
  )
  await h.click('^다시 시도$')
  await waitPath(h, '^/records/exercise$')
  const list = await recs(h, 'free')
  check(
    '14. 재시도 성공 → W01 이동, 수정값(15) 기록 1건',
    list.length === 1 &&
      list[0].exercises[0].completedSets[0].actualReps === 15,
  )
})

await scenario('C-complete-fail', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '14')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(200)
  const rev0 = (await getSession(h, 'free', id)).revision
  await h.arm('complete', 1)
  await h.click('^운동 결과 저장하기$')
  await h.until(
    `/최종 완료 처리가 끝나지 않았어요/.test(document.body.innerText)`,
    60,
  )
  const mid = await getSession(h, 'free', id)
  check(
    '15. saveProgress 성공 후 complete 실패 → "수정한 운동 기록은 저장됐지만…" 안내',
    (await h.hits()) === 1 &&
      (await h.has(
        '수정한 운동 기록은 저장됐지만 최종 완료 처리가 끝나지 않았어요',
      )),
  )
  check(
    '15-1. 편집값은 저장소에 반영(revision +1)·세션은 진행 중·기록 없음',
    mid.performed[0][0].actualReps === 14 &&
      mid.revision === rev0 + 1 &&
      mid.status === 'in_progress' &&
      (await recs(h, 'free')).length === 0,
    `rev ${rev0}→${mid.revision}`,
  )
  check(
    '15-2. 수정 컨트롤 잠김 안내',
    await h.has('저장 요청이 시작되어 지금은 수정할 수 없어요'),
  )
  await h.click('^다시 시도$')
  await waitPath(h, '^/records/exercise$')
  const end = await getSession(h, 'free', id)
  const list = await recs(h, 'free')
  check(
    '16. 재시도 시 saveProgress를 반복하지 않음(revision은 complete로 +1만)',
    end.revision === rev0 + 2 &&
      end.status === 'completed' &&
      list.length === 1 &&
      list[0].exercises[0].completedSets[0].actualReps === 14,
    `final rev ${end.revision}, expect ${rev0 + 2}`,
  )
})

// ── D. 충돌 ─────────────────────────────────────────────────────────
await scenario('D-conflict', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '12')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(200)
  // 다른 탭: 3세트 중 2세트를 완료 처리(revision 증가)
  await h.store(
    'free',
    `const s=await sessions.get(${JSON.stringify(id)});const p=s.performed.map(a=>a.map(x=>({...x})));p[0][1]={completed:true,actualReps:10};await sessions.saveProgress(s.id,{expectedRevision:s.revision,cursor:s.cursor,performed:p,timer:s.timer})`,
  )
  await h.click('^운동 결과 저장하기$')
  await h.until(
    `/다른 곳에서 운동 내용이 변경됐어요/.test(document.body.innerText)`,
    60,
  )
  const s1 = await getSession(h, 'free', id)
  check(
    '17~18. 다른 탭 revision 변경 → 충돌 안내(changed), 자동 병합·덮어쓰기 없음',
    (await h.has('자동으로 합치거나 덮어쓰지 않고')) &&
      s1.performed[0][1].completed === true &&
      s1.performed[0][0].actualReps === 10 &&
      (await recs(h, 'free')).length === 0,
  )
  check(
    '18-1. 충돌 버튼: 최신 상태 불러오기·W14로 돌아가기·머무르기, 수정값은 화면에 남음',
    (await h.has('^최신 상태 불러오기$')) &&
      (await h.has('운동 진행\\(W14\\)으로 돌아가기')) &&
      (await h.has('^머무르기$')) &&
      /실제\s*12회/.test(await card0(h)),
  )
  await h.shot('w15-conflict.png')
  await h.click('^최신 상태 불러오기$')
  await h.sleep(300)
  check(
    '20-1. 편집값이 있으면 삭제 확인 창',
    await h.has(
      '최신 운동 기록을 불러오면 저장하지 않은 수정 내용이 사라질 수 있어요',
    ),
  )
  await h.click('^취소$')
  await h.sleep(250)
  check(
    '20-2. 취소하면 수정값(12)이 그대로',
    /실제\s*12회/.test(await card0(h)) &&
      !(await h.has('최신 운동 기록을 불러오면')),
  )
  await h.click('^최신 상태 불러오기$')
  await h.sleep(300)
  await h.click('^최신 기록 불러오기$')
  await h.sleep(900)
  const t = await h.text()
  check(
    '19~20. 최신 불러오기 확정 → 저장소 값(2세트 완료·1세트 10회)으로 갱신, 충돌 해제',
    /2\/6/.test(t) &&
      !/실제\s*12회/.test(await card0(h)) &&
      /실제\s*10회/.test(await card0(h)) &&
      !/다른 곳에서 운동 내용이 변경됐어요/.test(t) &&
      !(await h.has('수정됨')),
  )
  await uiSave(h)
  await waitPath(h, '^/records/exercise$')
  const list = await recs(h, 'free')
  check(
    '19-1. 최신 상태에서 다시 저장 성공(2세트)',
    list.length === 1 && list[0].totals.completedSetCount === 2,
  )
})

await scenario('D-ended-gone', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  await h.store(
    'free',
    `const s=await sessions.get(${JSON.stringify(id)});await sessions.abandon(s.id)`,
  )
  await h.click('^운동 결과 저장하기$')
  await h.until(`/운동이 이미 종료됐어요/.test(document.body.innerText)`, 60)
  check(
    '18-2. ended: 다른 곳에서 종료된 세션 → "운동이 이미 종료됐어요"',
    (await h.has('운동이 이미 종료됐어요')) &&
      (await recs(h, 'free')).length === 0,
  )
  await h.click('^최신 상태 불러오기$')
  await h.until(`/기록 없이 끝난 운동이에요/.test(document.body.innerText)`, 40)
  check(
    '18-3. 최신 불러오기 → 기록 없이 끝난 운동 안내',
    await h.has('기록 없이 끝난 운동이에요'),
  )
})

await scenario('D-gone', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  // 개발 도구: 저장소에서 세션 행을 직접 삭제한다(앱 기능이 아님).
  await h.ev(
    `(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('mealthroutine-exercise');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise((res,rej)=>{const tx=db.transaction('workoutSessions','readwrite');tx.objectStore('workoutSessions').delete(${JSON.stringify(id)});tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()})()`,
  )
  await h.click('^운동 결과 저장하기$')
  await h.until(`/운동을 찾을 수 없어요/.test(document.body.innerText)`, 60)
  check(
    '18-4. gone: 세션이 사라짐 → "운동을 찾을 수 없어요", 기록 없음',
    (await h.has('운동을 찾을 수 없어요')) &&
      (await recs(h, 'free')).length === 0,
  )
})

// ── E. 접근·복원 ────────────────────────────────────────────────────
await scenario('E-access', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  // 21. W15 새로고침: 미저장 수정은 복원하지 않고 저장된 값으로 다시 집계
  await clickId(h, 'result-edit-0-0')
  await h.until(`!!document.getElementById('result-reps-0-0')`)
  await setVal(h, 'result-reps-0-0', '12')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(200)
  await h.go(`/records/exercise/result?session=${id}`, 900)
  await h.until(`!!document.querySelector('[data-result-screen]')`, 80)
  await h.sleep(300)
  check(
    '21. 새로고침: 저장된 값 복원·재집계, 미저장 수정은 복원하지 않음',
    (await h.has('부분 완료')) &&
      (await h.has('1/6')) &&
      !(await h.has('수정됨')) &&
      !/실제\s*12회/.test(await card0(h)),
  )
  const noRisk = await h.ev(
    `(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`,
  )
  check('21-1. 수정이 없으면 beforeunload 경고 없음', noRisk === false)
  // 23. 잘못된 sessionId: 활성 세션이 있어도 대체하지 않음
  await h.go('/records/exercise/result?session=nope', 800)
  await h.until(`!!document.querySelector('main h1')`)
  await h.sleep(500)
  let t = await h.text()
  check(
    '23. 없는 sessionId → "운동을 찾을 수 없어요", 진행 중 세션으로 대체하지 않음',
    /운동을 찾을 수 없어요/.test(t) &&
      !/푸시업|운동 결과 저장하기/.test(t) &&
      /오늘의 운동으로 돌아가기/.test(t),
  )
  await h.go('/records/exercise/result?session=', 800)
  await h.until(`!!document.querySelector('main h1')`)
  await h.sleep(500)
  t = await h.text()
  check(
    '23-1. 빈 sessionId → "올바르지 않은 운동 주소예요"(대체 없음)',
    /올바르지 않은 운동 주소예요/.test(t) && !/푸시업/.test(t),
  )
  // 24. 다른 계정
  await h.ev(`sessionStorage.clear()`)
  await h.login('full')
  await h.go(`/records/exercise/result?session=${id}`, 900)
  await h.until(`!!document.querySelector('main h1')`)
  await h.sleep(600)
  t = await h.text()
  check(
    '24. 다른 계정으로 접근 → 접근 불가(운동 정보 노출 없음)',
    /운동을 찾을 수 없어요/.test(t) && !/푸시업|덤벨|플랭크|부분 완료/.test(t),
  )
  await h.go('/records/exercise', 900)
  await h.sleep(900)
  t = await h.text()
  check(
    '24-1. 다른 계정 W01에는 이 계정의 진행 중 운동·기록이 없음',
    !/진행 중인 운동 이어서/.test(t) &&
      (await active(h, 'full')) === null &&
      (await recs(h, 'full')).length === 0,
  )
})

await scenario('E-unavailable', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await toResult(h)
  const id = await sid(h)
  // 저장소 사용 불가: 이후 모든 문서에서 indexedDB를 숨긴다.
  await h.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(window,'indexedDB',{get(){return undefined},configurable:true})`,
  })
  await h.go(`/records/exercise/result?session=${id}`, 900)
  await h.until(`!!document.querySelector('main h1')`)
  await h.sleep(600)
  const t = await h.text()
  check(
    '25. 저장소 unavailable → "준비 중" 안내, 가짜 기록 없음',
    /운동 결과 기능을 준비 중이에요/.test(t) &&
      !/저장된 기록|전체 완료|부분 완료|운동 결과 저장하기/.test(t),
    t.replace(/\n+/g, ' ').slice(0, 100),
  )
})

// ── F. W14 진입 차단 ────────────────────────────────────────────────
await scenario('F-w14-gate', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  const id = (await active(h, 'free')).id
  // 26. 저장된 세션에 실행 중 타이머가 남아 있는 채 W15 직접 진입 → 차단
  await h.store(
    'free',
    `const s=await sessions.get(${JSON.stringify(id)});await sessions.saveProgress(s.id,{expectedRevision:s.revision,cursor:s.cursor,performed:s.performed,timer:{accumulatedMs:0,runningSince:new Date().toISOString()}})`,
  )
  await h.go(`/records/exercise/result?session=${id}`, 900)
  await h.until(`!!document.querySelector('[data-result-screen]')`, 80)
  await h.sleep(300)
  check(
    '26. 실행 중 타이머가 저장돼 있으면 W15 저장 차단 안내',
    (await h.has('타이머가 아직 측정 중이에요')) &&
      (await h.ev(
        `[...document.querySelectorAll('main button')].find(b=>/^운동 결과 저장하기$/.test(b.innerText.trim())).getAttribute('aria-disabled')`,
      )) === 'true',
  )
  await h.click('^운동 결과 저장하기$')
  await h.sleep(500)
  check(
    '26-1. 차단 상태에서 저장을 눌러도 기록 없음',
    (await recs(h, 'free')).length === 0 && (await active(h, 'free')) !== null,
  )
  // W14로 돌아가 타이머를 멈추고(복원) 결과 확인으로 정상 이동
  await h.click('운동 진행\\(W14\\)으로 돌아가기')
  await h.until(`!!document.querySelector('#session-current-heading')`, 80)
  await h.sleep(600)
  await toResult(h)
  check(
    '26-2. W14에서 타이머가 멈춘 뒤 결과 확인으로 이동하면 차단 없음',
    !(await h.has('타이머가 아직 측정 중이에요')) &&
      (await h.ev(
        `[...document.querySelectorAll('main button')].find(b=>/^운동 결과 저장하기$/.test(b.innerText.trim())).getAttribute('aria-disabled')`,
      )) === 'false',
  )
})

await scenario('F-w14-timer-flow', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await completeCurrent(h)
  await completeCurrent(h) // 푸시업 3세트 완료 → 덤벨 컬
  for (let i = 0; i < 2; i++) await completeCurrent(h) // 덤벨 컬 2세트 → 플랭크(시간형)
  await h.until(
    `!!document.querySelector('#session-current-heading')?.innerText.includes('플랭크')`,
    40,
  )
  await h.click('^타이머 시작$|^시작$')
  await h.sleep(1500)
  const running = await h.ev(
    `!!document.querySelector('[aria-label*="타이머"], [role=timer]') || /일시정지/.test(document.querySelector('main').innerText)`,
  )
  check('26-3. W14 시간형에서 타이머 시작(측정 중)', running)
  await h.click('^운동 결과 확인$')
  await h.sleep(500)
  check(
    '26-4. 측정 중이면 이동 전에 "측정 중인 시간은 기록되지 않아요" 확인',
    await h.has('측정 중인 시간은 기록되지 않아요'),
  )
  await h.click('^결과 확인으로 이동$')
  await h.until(`!!document.querySelector('[data-result-screen]')`, 100)
  await h.sleep(400)
  const id = await sid(h)
  const s = await getSession(h, 'free', id)
  check(
    '26-5. 확인 후 타이머 일시정지·저장 뒤 W15 도착(runningSince null), 미완료 시간형은 기록 없음',
    s.timer.runningSince === null &&
      (await h.has('5/6')) &&
      !(await h.has('타이머가 아직 측정 중이에요')),
  )
})

await scenario('F-w14-saving', async (h) => {
  await toSession(h, 'free', 'mixed')
  await completeCurrent(h)
  await h.arm('save', 20)
  await completeCurrent(h) // 저장 실패(미저장 변경)
  await h.sleep(600)
  check(
    '27. W14 저장 실패 상태 확인',
    await h.has('저장 다시 시도|진행 상태를 저장하지 못했어요'),
  )
  await h.click('^운동 결과 확인$')
  await h.until(
    `/결과 화면으로 이동하지 못했어요/.test(document.body.innerText)`,
    60,
  )
  check(
    '27-1. 미저장·저장 실패 상태에서는 W15로 이동하지 않고 이유를 안내',
    (await h.path()) === '/records/exercise/session' &&
      (await h.has('진행 상태를 저장하지 못했어요')),
  )
  await h.click('^머무르기$')
  await h.disarm()
  await h.sleep(300)
  await h.click('^운동 결과 확인$')
  await h.until(`!!document.querySelector('[data-result-screen]')`, 100)
  check('27-2. 저장이 복구되면 W15로 이동하고 2세트가 반영', await h.has('2/6'))
})

// ── G. 반응형·키보드 ────────────────────────────────────────────────
await scenario('G-responsive', async (h) => {
  await toSession(h, 'free', 'mixed')
  for (let i = 0; i < 4; i++) await completeCurrent(h)
  await toResult(h)
  await clickId(h, 'result-edit-1-0')
  await h.until(`!!document.getElementById('result-weight-1-0')`)
  await setVal(h, 'result-reps-1-0', '0')
  await setVal(h, 'result-weight-1-0', '2.55')
  await h.ev(
    `document.querySelector('form[aria-label*="실제 값 수정"]').requestSubmit()`,
  )
  await h.sleep(250)
  for (const [w, hh] of [
    [320, 640],
    [375, 812],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
  ]) {
    await h.vp(w, hh)
    await h.sleep(400)
    const m = await h.ev(`(()=>{
      const de=document.documentElement;
      const form=document.querySelector('form[aria-label*="실제 값 수정"]');
      const fr=form.getBoundingClientRect();
      const inputs=[...form.querySelectorAll('input')].map(i=>i.getBoundingClientRect());
      const err=[...form.querySelectorAll('[role=alert]')].map(e=>({w:e.scrollWidth,c:e.clientWidth,r:e.getBoundingClientRect().right}));
      const save=[...document.querySelectorAll('main button')].find(b=>/^운동 결과 저장하기$/.test(b.innerText.trim()));
      const sr=save.getBoundingClientRect();
      return {sw:de.scrollWidth,cw:de.clientWidth,iw:window.innerWidth,formRight:fr.right,formLeft:fr.left,inputsOk:inputs.every(r=>r.left>=0&&r.right<=window.innerWidth&&r.width>=120),errOk:err.length===2&&err.every(e=>e.w<=e.c+1&&e.r<=window.innerWidth),saveInView:sr.bottom<=window.innerHeight+1&&sr.top>=0&&sr.width>=200,saveH:sr.height}
    })()`)
    check(
      `반응형 ${w}px: 가로 스크롤 없음·입력 잘림 없음·오류 메시지 안 잘림·저장 버튼 접근 가능(≥44px)`,
      m.sw <= m.cw &&
        m.formLeft >= 0 &&
        m.formRight <= m.iw &&
        m.inputsOk &&
        m.errOk &&
        m.saveInView &&
        m.saveH >= 44,
      JSON.stringify(m),
    )
    if (w === 320 || w === 1024) await h.shot(`w15-${w}.png`)
  }
  // 키보드: 수정 버튼 포커스 → Enter로 열기 → 입력 → Enter로 적용 → 포커스 복귀
  await h.vp(390, 844)
  await h.click('^닫기$')
  await h.sleep(200)
  await h.ev(`document.getElementById('result-edit-0-0').focus()`)
  await h.press('Enter', 'Enter', 13)
  await h.sleep(300)
  const focusedReps = await h.ev(
    `document.activeElement?.id==='result-reps-0-0'`,
  )
  await h.ev(
    `(()=>{const i=document.getElementById('result-reps-0-0');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'11');i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
  await h.press('Enter', 'Enter', 13)
  await h.sleep(500)
  const back = await h.ev(`document.activeElement?.id==='result-edit-0-0'`)
  check(
    '키보드: 수정 버튼 Enter로 열기(입력에 포커스)→Enter로 적용→수정 버튼으로 포커스 복귀',
    focusedReps && back && (await h.has('11회')),
    `focusedReps=${focusedReps} back=${back}`,
  )
})

const failed = results.filter((r) => !r.ok)
console.log(`\n== ${results.length - failed.length}/${results.length} PASS ==`)
if (failed.length)
  console.log('FAILED:\n' + failed.map((f) => ' - ' + f.n).join('\n'))
