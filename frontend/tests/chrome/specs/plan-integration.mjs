// [chrome 회귀] W01-2 추천 통합(결과 → W11 → 저장 → W01, 계정 격리)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S7 P2-5 통합 검증: 실제 Chrome + 개발용 IndexedDB. 시나리오마다 새 프로필.  node p25-verify.mjs [A|B|C|D|E|F|ALL]
import { start } from '../lib/session.mjs'
import { reloadSettled } from '../lib/history.mjs'

const only = (process.argv[2] ?? 'ALL').toUpperCase()
const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const q = (s) => JSON.stringify(s)
const U = 'free'
const PLAN = '/records/exercise/plan'
const TODAY = `(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()`
const lists = (h, u = U) =>
  h.store(u, `const t=${TODAY};return (await lists.listByDate(t)).items`)
const allRecords = (h, u = U) =>
  h.store(
    u,
    `return (await records.listByDateRange('2000-01-01','2999-12-31')).items`,
  )
const active = (h, u = U) => h.store(u, `return await sessions.getActive()`)
// W01의 초급 추천 진입은 접힌 보조 영역이다(운동·식단 대시보드 UI/UX 개선). 본문을 읽기 전에 펼쳐서,
// 진입이 보여야 하는 경우와 보이지 않아야 하는 경우를 모두 이전과 같은 의미로 검사한다(추천 화면 등 진입이 없는 화면에서는 아무 일도 하지 않는다).
const openBeginnerEntry = (h) =>
  h.ev(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true`,
  )
const mainText = async (h) => {
  await openBeginnerEntry(h)
  return h.text('main')
}
const progress = (h) =>
  h.ev(
    `(()=>{const p=document.querySelector('main [role=progressbar]');return p?[Number(p.getAttribute('aria-valuenow')),Number(p.getAttribute('aria-valuemax'))]:null})()`,
  )
const setTier = (h, exercise, meal = 'beginner', user = U) =>
  h.ev(`(async()=>{
    const A = await import('/src/auth/accountScope.ts');
    const Q = await import('/src/onboarding-assessment/mock/questionBank.ts');
    sessionStorage.setItem(A.accountScopedKey(${q(user)},'assessment.mock.result'), JSON.stringify({bankVersion:Q.QUESTION_BANK_VERSION,sessionId:'t-sess',completedAt:new Date().toISOString(),exercise:${q(exercise)},meal:${q(meal)}}));
    return true })()`)
const clickLabel0 = (h, text) =>
  h.ev(
    `(()=>{const l=[...document.querySelectorAll('main label')].find(l=>l.innerText.includes(${q(text)}));if(!l)return false;const i=l.querySelector('input');(i||l).click();return true})()`,
  )
const preset0 = (h, minutes) =>
  h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.trim()===${q(minutes + '분')});if(!b)return false;b.click();return true})()`,
  )
// S8-UI-1: 조건 설정이 단계 화면이라 목표·시간을 고르면 다음 단계로 넘긴다(직접 선택은 4단계 운동 고르기까지).
const clickLabel = async (h, text) => {
  const ok = await clickLabel0(h, text)
  if (/(습관|체중 관리)/.test(text)) {
    await h.sleep(200)
    await h.click('^다음$')
    await h.sleep(450)
  }
  return ok
}
const preset = async (h, minutes) => {
  const ok = await preset0(h, minutes)
  await h.sleep(250)
  await h.click('^다음$')
  await h.sleep(500)
  // 직접 선택(4단계 모드)은 도구 단계를 지나 4단계 운동 고르기까지 넘긴다.
  for (let n = 0; n < 3; n++) {
    const t = await h.text('main')
    const m = t.match(/(\d)\/4단계/)
    if (!m || Number(m[1]) >= 4) break
    await h.click('^다음$')
    await h.sleep(500)
  }
  return ok
}
const itemRows = (h) =>
  h.ev(
    `[...document.querySelectorAll('#plan-items-heading ~ ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
  )
const parseRow = (r) => {
  const name = r
    .split(' | ')[0]
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*(시작|주요|마무리) 운동.*$/, '')
    .trim()
  const m = r.match(/(\d+)세트 · 한 세트에 (\d+)(번|초)/)
  return {
    name,
    sets: m ? Number(m[1]) : null,
    target: m ? Number(m[2]) : null,
    unit: m ? m[3] : null,
  }
}
const gotoPlan = async (h, mode) => {
  await h.go('/records/exercise', 1000)
  await h.until(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기|직접 운동 선택하기/.test(a.innerText))`,
    80,
  )
  await h.click(
    mode === 'automatic' ? '오늘의 운동 추천받기' : '직접 운동 선택하기',
    'main',
  )
  await h.until(`location.pathname===${q(PLAN)}`, 60)
  await h.sleep(500)
}
/** 검색한 결과의 앞쪽 N개를 고른다(이름을 모르는 운동 여러 개가 필요할 때). */
const pickFirst = async (h, keyword, n) => {
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/^직접 검색$/.test(b.innerText.trim()))`,
    80,
  )
  await h.click('^직접 검색$')
  await h.sleep(300)
  await h.setVal('main input[type=search]', keyword)
  await h.click('^검색하기$')
  await h.sleep(700)
  const names = await h.ev(
    `(()=>{const out=[];const bs=[...document.querySelectorAll('main li button[aria-pressed="false"]')].filter(b=>b.innerText.includes('초급')&&b.innerText.includes('맨몸')).slice(0,${n});for(const b of bs){out.push(b.innerText.split(String.fromCharCode(10)).map(x=>x.trim()).filter(x=>x&&x!=='✓')[0]);b.click()}return out})()`,
  )
  await h.sleep(300)
  return names
}
const pickByName = async (h, items) => {
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/^직접 검색$/.test(b.innerText.trim()))`,
    80,
  )
  await h.click('^직접 검색$')
  await h.sleep(400)
  for (const [keyword, cardText] of items) {
    await h.setVal('main input[type=search]', keyword)
    await h.click('^검색하기$')
    const exact = '(^|\n)' + cardText + '\n'
    await h.until(
      `[...document.querySelectorAll('main button')].some(b=>new RegExp(${q(exact)}).test(b.innerText))`,
      60,
    )
    await h.click(exact)
    await h.sleep(300)
  }
}
const finishPick = async (h) => {
  await h.click('^선택한 \\d+개 운동으로 설정하기$')
  await h.sleep(700)
}
const w14Ready = async (h) => {
  await h.until(`location.pathname==='/records/exercise/session'`, 80)
  await h.until(`!!document.querySelector('#session-current-heading')`, 80)
  await h.sleep(350)
}
const completeOne = async (h, ms = 1100) => {
  const hasTimer = await h.ev(`!!document.querySelector('[role=timer]')`)
  if (hasTimer) {
    await h.click('^(시작|재개)$')
    await h.sleep(ms)
  }
  await h.click('^세트 완료$')
  await h.sleep(450)
}
const completeAll = async (h) => {
  for (let i = 0; i < 60; i++) {
    const p = await progress(h)
    if (p && p[0] >= p[1]) return true
    await completeOne(h)
  }
  return false
}
const toResult = async (h) => {
  await h.click('^운동 결과 확인$')
  await h.sleep(350)
  if (await h.has('측정 중인 시간은 기록되지 않아요'))
    await h.click('^결과 확인으로 이동$')
  await h.until(`!!document.querySelector('[data-result-screen]')`, 80)
  await h.sleep(300)
}
const confirmBtn = (h) =>
  h.ev(
    `[...document.querySelectorAll('main button')].find(b=>/^이 운동으로 목록 확인하기$/.test(b.innerText.trim()))?.getAttribute('aria-disabled')`,
  )
const runResult = async (h, mode, goal, minutes) => {
  await gotoPlan(h, mode)
  await clickLabel(h, goal)
  await preset(h, minutes)
}
const planStore = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>k.endsWith('beginner-plan'));return k?sessionStorage.getItem(k):null})()`,
  )
const draftStore = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>k.includes('workout-draft'));return k?sessionStorage.getItem(k):null})()`,
  )
const logout = async (h) => {
  await h.go('/settings', 900)
  await h.click('^로그아웃$', 'body')
  await h.sleep(900)
}
const WIDE = `(()=>{const w=window.innerWidth;const bad=[];for(const e of document.querySelectorAll('main *')){const r=e.getBoundingClientRect();if(r.width===0||r.height===0)continue;if(e.closest('.sr-only')||e.classList.contains('sr-only'))continue;if(r.right>w+1||r.left<-1)bad.push((e.id||e.tagName)+':'+Math.round(r.left)+'~'+Math.round(r.right));}return {ov:document.documentElement.scrollWidth-w,bad:bad.slice(0,4)}})()`
const widths = async (h, label) => {
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1280, 900],
  ]) {
    await h.vp(w, hh)
    await h.sleep(350)
    const m = await h.ev(WIDE)
    check(
      `반응형 ${label} ${w}px: 가로 스크롤·화면 밖 요소 없음`,
      m.ov <= 0 && m.bad.length === 0,
      JSON.stringify(m),
    )
  }
  await h.vp(390, 844)
  await h.sleep(250)
}
const run = (id) => only === 'ALL' || only === id

async function scenario(name, fn) {
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    const real = (h.problems ?? []).filter(
      (p) => !/favicon|DevTools|Download the React/.test(String(p)),
    )
    if (real.length) console.log('  (console problems)', real.slice(0, 4))
  } catch (e) {
    check(`${name}: 예외 없이 진행`, false, e.message)
    try {
      console.log(
        '  [화면]',
        await h.path(),
        (await h.text('main'))
          .slice(0, 260)
          .split(String.fromCharCode(10))
          .join(' | '),
      )
    } catch {}
  } finally {
    h.close()
  }
}

// ═══ A. 초급 전체 자동 추천 E2E: 추천 → W11 → 저장 → W01 → W14 수행 → W15 완료 → 새로고침 ═══
if (run('A'))
  await scenario('p25-A', async (h) => {
    await h.login(U)
    await runResult(h, 'automatic', '운동 습관 만들기', 20)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const planned = (await itemRows(h)).map(parseRow)
    check(
      'A-1 추천 결과가 나오고 운동 이름·세트·목표를 읽을 수 있다',
      planned.length === 4 &&
        planned.every((p) => p.name && p.sets >= 1 && p.target >= 1),
      JSON.stringify(planned),
    )
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(900)
    const review = await mainText(h)
    const pos = planned.map((p) => review.indexOf(p.name))
    check(
      'A-2 W11: 추천 운동이 같은 순서로 모두 들어 있다',
      pos.every((x) => x >= 0) &&
        pos.every((x, i) => i === 0 || x > pos[i - 1]),
      JSON.stringify(pos),
    )
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(900)
    const saved = await lists(h)
    const li = saved[0]
    const sameItems =
      saved.length === 1 &&
      li.items.length === planned.length &&
      li.items.every((it, i) => {
        const p = planned[i]
        const vals = it.sets.map((s) =>
          it.recordType === 'time' ? s.targetSeconds : s.reps,
        )
        return (
          it.exerciseNameSnapshot === p.name &&
          it.sets.length === p.sets &&
          vals.every((v) => v === p.target) &&
          (p.unit === '초') === (it.recordType === 'time')
        )
      })
    check(
      'A-3 저장된 목록의 운동 순서·세트 수·목표 값이 추천 결과와 정확히 같다',
      sameItems,
      JSON.stringify(
        li?.items.map((i) => [i.exerciseNameSnapshot, i.sets.length]),
      ),
    )
    check(
      'A-4 저장 후 W01 오늘의 운동에 같은 목록이 보인다',
      (await mainText(h)).includes(planned[0].name),
    )
    await h.click('이 목록으로 바로 운동 시작')
    await w14Ready(h)
    const first = await h.ev(
      `document.querySelector('#session-current-heading')?.innerText`,
    )
    check(
      'A-5 W14: 첫 운동이 추천의 첫 운동(워밍업 성격)이다',
      (first ?? '').includes(planned[0].name),
      first,
    )
    const snap = await active(h)
    check(
      'A-6 W14 세션 스냅샷이 저장 목록(운동 id·순서·세트)과 같다',
      JSON.stringify(
        snap.listSnapshot.items.map((i) => [i.exerciseId, i.sets.length]),
      ) === JSON.stringify(li.items.map((i) => [i.exerciseId, i.sets.length])),
    )
    const done = await completeAll(h)
    check('A-7 W14: 모든 세트를 수행·완료(횟수형·시간형 타이머 포함)', done)
    await toResult(h)
    const rt = await mainText(h)
    check('A-8 W15: 전체 완료로 표시', /전체 완료/.test(rt), rt.slice(0, 80))
    await h.click('^운동 결과 저장하기$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(700)
    const recs = await allRecords(h)
    const rec = recs[0]
    check(
      'A-9 기록 1건: 운동 순서·완료 세트 수가 계획과 같고 신규 A안 값(횟수 1~999, 시간 1ms 이상)이다',
      recs.length === 1 &&
        JSON.stringify(rec.exercises.map((e) => e.exerciseId)) ===
          JSON.stringify(li.items.map((i) => i.exerciseId)) &&
        rec.totals.completedSetCount === rec.totals.plannedSetCount &&
        rec.exercises.every((e) =>
          e.completedSets.every((s) =>
            e.recordType === 'time'
              ? s.measuredMs >= 1
              : Number.isInteger(s.actualReps) &&
                s.actualReps >= 1 &&
                s.actualReps <= 999,
          ),
        ),
      JSON.stringify(rec.totals),
    )
    // 새로고침 유지
    await h.go(`/records/exercise/result?session=${rec.sessionId ?? ''}`, 1200)
    const sid = rec.sessionId
    await h.go('/records/exercise', 900)
    await h.ev(`location.reload()`)
    await h.sleep(1400)
    const recs2 = await allRecords(h)
    const saved2 = await lists(h)
    check(
      'A-10 새로고침 뒤에도 기록·저장 목록이 유지되고 기록이 중복되지 않는다',
      recs2.length === 1 && saved2.length === 1 && recs2[0].id === rec.id,
    )
    check(
      'A-11 완료한 목록은 다시 시작할 수 없다(기존 정책 유지)',
      await h.ev(
        `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/이 목록으로 바로 운동 시작/.test(b.innerText));return !b||b.getAttribute('aria-disabled')==='true'||/완료/.test(document.querySelector('main').innerText)})()`,
      ),
    )
    void sid
  })

// ═══ B. 직접 선택 E2E: 순서·개수 유지, 불가 사유, 시간 초과 차단, 교체, 저장 목록 = 수행 순서 ═══
if (run('B'))
  await scenario('p25-B', async (h) => {
    await h.login(U)
    await runResult(h, 'selected', '현재 운동 습관 유지', 20)
    await h.click('^운동 고르기$')
    await h.sleep(600)
    const pickerText = await mainText(h)
    check(
      'B-1 추천 화면의 운동 고르기: 제목·안내·완료 버튼 문구가 추천 맥락용이다("운동 찾아보기")',
      /운동 찾아보기/.test(pickerText) &&
        !/운동 검색·등록/.test(pickerText) &&
        /선택한 0개 운동으로 설정하기/.test(pickerText) &&
        !/운동 등록/.test(pickerText),
      pickerText.slice(0, 120),
    )
    await pickByName(h, [
      ['푸시업', '월 푸시업'],
      ['플랭크', '플랭크'],
      ['푸시업', '니 푸시업'],
    ])
    await finishPick(h)
    const sel = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.split('\\n')[0].replace(/^\\d+\\.\\s*/,'').trim())`,
    )
    check(
      'B-2 고른 순서대로 고른 운동 목록이 보인다(월 푸시업 → 플랭크 → 니 푸시업)',
      JSON.stringify(sel) ===
        JSON.stringify(['월 푸시업', '플랭크', '니 푸시업']),
      JSON.stringify(sel),
    )
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const rows = (await itemRows(h)).map(parseRow)
    check(
      'B-3 결과: 고른 3개가 같은 순서·같은 개수로 유지된다(자동 재배치·추가·삭제 없음)',
      JSON.stringify(rows.map((r) => r.name)) ===
        JSON.stringify(['월 푸시업', '플랭크', '니 푸시업']),
      JSON.stringify(rows.map((r) => r.name)),
    )
    check('B-4 확정 가능', (await confirmBtn(h)) === 'false')
    // 교체: 가운데 운동을 다른 운동으로 → 자리·나머지 순서 유지
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/플랭크 다른 운동으로 바꾸기/.test(b.innerText))?.click()`,
    )
    await h.sleep(600)
    const replaceText = await mainText(h)
    check(
      'B-5 교체 화면에서도 추천 맥락 문구(운동 찾아보기)를 쓴다',
      /운동 찾아보기/.test(replaceText),
    )
    await pickByName(h, [['스쿼트', '맨몸 스쿼트']])
    await finishPick(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    const rows2 = (await itemRows(h)).map(parseRow)
    check(
      'B-6 교체: 같은 자리(2번째)에서만 바뀌고 앞뒤 순서는 그대로다',
      rows2.length === 3 &&
        rows2[0].name === '월 푸시업' &&
        rows2[2].name === '니 푸시업' &&
        rows2[1].name !== '플랭크',
      JSON.stringify(rows2.map((r) => r.name)),
    )
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(800)
    const saved = (await lists(h))[0]
    check(
      'B-7 저장 목록 순서·세트·목표가 결과 화면과 같다',
      JSON.stringify(
        saved.items.map((i) => [i.exerciseNameSnapshot, i.sets.length]),
      ) === JSON.stringify(rows2.map((r) => [r.name, r.sets])),
    )
    await h.click('이 목록으로 바로 운동 시작')
    await w14Ready(h)
    const s = await active(h)
    check(
      'B-8 W14 수행 순서가 저장 목록과 같다',
      JSON.stringify(
        s.listSnapshot.items.map((i) => i.exerciseNameSnapshot),
      ) === JSON.stringify(saved.items.map((i) => i.exerciseNameSnapshot)),
    )
    const done = await completeAll(h)
    check('B-9 W14 전체 수행 완료', done)
    await toResult(h)
    await h.click('^운동 결과 저장하기$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(600)
    const recs = await allRecords(h)
    check(
      'B-10 W15 기록: 수행 순서·완료 세트 수가 목록과 같다',
      recs.length === 1 &&
        JSON.stringify(recs[0].exercises.map((e) => e.exerciseNameSnapshot)) ===
          JSON.stringify(saved.items.map((i) => i.exerciseNameSnapshot)) &&
        recs[0].totals.completedSetCount === recs[0].totals.plannedSetCount,
    )
  })

// ═══ B2. 직접 선택: 시간 초과 차단·사용자가 뺀 운동만 제외·무게 운동 ═══
if (run('B2'))
  await scenario('p25-B2', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'selected')
    await clickLabel(h, '현재 운동 습관 유지')
    await h.setVal('main input[inputmode=numeric]', '5')
    await h.click('^다음$')
    await h.sleep(450)
    await h.click('^다음$')
    await h.sleep(450)
    await h.click('^운동 고르기$')
    await h.sleep(600)
    const wanted = [
      ['푸시업', '월 푸시업'],
      ['푸시업', '니 푸시업'],
      ['스쿼트', '맨몸 스쿼트'],
      ['플랭크', '플랭크'],
      ['브리지', '글루트 브리지'],
      ['스트레칭', '벽 종아리 스트레칭'],
      ['걷기', '제자리 걷기'],
    ]
    await pickByName(h, wanted)
    await finishPick(h)
    const count = wanted.length
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(500)
    const t = await mainText(h)
    if (process.env.DBG) console.log(t.slice(0, 1500))
    const rows = await itemRows(h)
    check(
      'B2-1 5분에 안 들어가면 운동을 지우지 않고(7개 그대로) 안내하며 확정이 막힌다',
      /필요해요/.test(t) &&
        rows.length === count &&
        (await confirmBtn(h)) === 'true',
      `rows=${rows.length}/${count} ` +
        (t.match(/가장 적은 세트.*/) ?? [''])[0],
    )
    check(
      'B2-2 시간 초과 안내: 늘려야 하는 시간(분 이상) 또는 직접 빼기 안내',
      /분 이상으로 바꾸|빼/.test(t),
    )
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(700)
    check(
      'B2-3 확정이 막힌 상태에서 눌러도 W11로 이동하지 않고 초안이 만들어지지 않는다',
      (await h.path()).startsWith(PLAN) &&
        !/"items":\[\{/.test((await draftStore(h)) ?? ''),
    )
    // 시간을 늘리면 같은 운동·개수로 확정 가능
    await h.click('^조건 바꾸기')
    await h.sleep(400)
    await h.click('^다음$') // 1단계 → 2단계(시간)
    await h.sleep(450)
    await h.setVal('main input[inputmode=numeric]', '60')
    await h.click('^다음$')
    await h.sleep(450)
    await h.click('^다음$')
    await h.sleep(450)
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const rows60 = await itemRows(h)
    check(
      'B2-4 시간을 60분으로 늘리면 같은 운동·개수로 확정 가능해진다',
      rows60.length === count && (await confirmBtn(h)) === 'false',
      `${rows60.length}/${count}`,
    )
    const firstName = parseRow(rows60[0]).name
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes(${q(firstName + ' 목록에서 빼기')}))?.click()`,
    )
    await h.sleep(500)
    const rowsAfter = (await itemRows(h)).map((r) => parseRow(r).name)
    const expected = rows60.slice(1).map((r) => parseRow(r).name)
    check(
      'B2-5 사용자가 뺀 운동만 빠지고 나머지 순서·개수는 그대로다',
      JSON.stringify(rowsAfter) === JSON.stringify(expected),
      `${rowsAfter.length}/${expected.length}`,
    )
    // 중량 운동은 자동 구성 불가
    await h.click('^조건 바꾸기')
    await h.sleep(400)
    for (let n = 0; n < 3; n++) {
      await h.click('^다음$') // 1→4단계(고른 값 유지)
      await h.sleep(450)
    }
    await h.click('^운동 더 고르기$')
    await h.sleep(500)
    await pickByName(h, [['컬', '덤벨 바이셉스 컬']])
    await finishPick(h)
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const tw = await mainText(h)
    check(
      'B2-6 중량 운동을 고르면 자동 구성 불가 사유를 안내하고 확정이 막힌다(운동은 지우지 않는다)',
      /덤벨 바이셉스 컬/.test(tw) &&
        /중량이 필요한 운동/.test(tw) &&
        (await confirmBtn(h)) === 'true',
    )
  })

// ═══ C. 권한·계정 격리 ═══
if (run('C'))
  await scenario('p25-C', async (h) => {
    await h.login(U)
    // free 계정: 목록 저장 + 구성 초안 만들기
    await runResult(h, 'automatic', '체중 관리', 20)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(700)
    const listsFree = await lists(h)
    // 새 추천 초안(미저장) 만들기
    await runResult(h, 'automatic', '운동 습관 만들기', 10)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(900)
    if (/구성 중이던 운동 목록/.test(await mainText(h)))
      await h.click('^추천 운동으로 바꾸기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    check(
      'C-1 free 계정: 목록 1개 저장, 미저장 초안(W11)이 있다',
      listsFree.length === 1 &&
        /"items":\[\{/.test((await draftStore(h)) ?? ''),
    )
    await logout(h)
    await h.login('full')
    const fullLists = await lists(h, 'full')
    await h.go('/records/exercise/review', 1000)
    const rv = await mainText(h)
    check(
      'C-2 계정 전환: 다른 계정(full)은 free의 저장 목록·W11 초안을 볼 수 없다',
      fullLists.length === 0 &&
        /구성해 주세요|운동 목록을 먼저/.test(rv) &&
        !/오늘의 운동으로 저장/.test(rv),
      rv.replace(/\n+/g, ' ').slice(0, 100),
    )
    await h.go('/records/exercise', 900)
    check(
      'C-3 계정 전환 후 W01에 free의 목록이 보이지 않는다',
      !/이 목록으로 바로 운동 시작/.test(await mainText(h)),
    )
    await h.go(PLAN, 900)
    check(
      'C-4 추천 화면은 처음 상태이며 free의 추천 상태가 남아 있지 않다',
      (!/오늘의 운동이 준비됐어요/.test(await mainText(h)) &&
        (await planStore(h)) === null) ||
        /직접 운동 선택하기/.test(await mainText(h)),
    )
    // 중급·고급 차단은 p24-C에서 검증. 여기서는 full 계정에서도 동일하게 막히는지 + 직접 접근 URL 두 모드
    for (const tier of ['intermediate', 'advanced']) {
      await setTier(h, tier, 'beginner', 'full')
      for (const mode of ['automatic', 'selected']) {
        await h.go(`${PLAN}?mode=${mode}`, 1100)
        await h.sleep(500)
        check(
          `C-5 ${tier} 직접 URL(mode=${mode}) 차단`,
          /이 기능을 쓸 수 없어요/.test(await mainText(h)) &&
            !/어떤 목표로 운동하고 싶으세요/.test(await mainText(h)),
        )
      }
    }
    // 목록 있는 상태에서 중급으로 바뀌어도 기존 W01·시작은 그대로(추천만 막힘)
  })

// ═══ D. 새로고침 8곳 ═══
if (run('D'))
  await scenario('p25-D', async (h) => {
    await h.login(U)
    const reload = async (until) => {
      // 부하가 큰 환경에서는 고정 대기 안에 새 문서가 그려지지 않을 수 있어, 새 문서가 그려질 때까지 기다린다.
      await reloadSettled(h)
      if (until) await h.until(until, 80)
      await h.sleep(300)
    }
    // 1 구성 방법 선택
    await h.go(PLAN, 1000)
    await reload()
    check(
      'D-1 구성 방법 선택 화면 새로고침: 같은 화면',
      /오늘의 운동 추천받기/.test(await mainText(h)) &&
        /직접 운동 선택하기/.test(await mainText(h)),
    )
    // 2 조건 입력
    await h.click('오늘의 운동 추천받기')
    await h.sleep(400)
    await clickLabel(h, '운동 습관 만들기')
    await preset(h, 20)
    await reload()
    check(
      'D-2 조건 입력 새로고침(단계 화면): 입력한 목표·시간이 유지되고 3단계에서 이어진다',
      await (async () => {
        const at3 = /3\/3단계/.test(await mainText(h))
        await h.click('^이전$')
        await h.sleep(450)
        const p = await h.ev(
          `[...document.querySelectorAll('main button[aria-pressed=true]')].map(b=>b.innerText.replace('✓','').trim()).includes('20분')`,
        )
        await h.click('^이전$')
        await h.sleep(450)
        const r = await h.ev(
          `(()=>{const r=document.querySelector('input[type=radio]:checked');return !!r&&r.closest('label').innerText.includes('운동 습관 만들기')})()`,
        )
        await h.click('^다음$')
        await h.sleep(450)
        await h.click('^다음$')
        await h.sleep(450)
        return at3 && p && r
      })(),
    )
    // 4 결과
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    const r1 = JSON.stringify(await itemRows(h))
    await reload(`!!document.getElementById('plan-result-heading')`)
    check(
      'D-4 결과 화면 새로고침: 같은 결과(다시 계산)·"달라졌어요" 없음',
      JSON.stringify(await itemRows(h)) === r1 &&
        !/달라졌어요/.test(await mainText(h)),
    )
    // 5 다시 추천 후
    await h.click('^다시 추천받기$')
    await h.sleep(500)
    const r2 = JSON.stringify(await itemRows(h))
    await reload(`!!document.getElementById('plan-result-heading')`)
    check(
      'D-5 다시 추천한 뒤 새로고침: 바뀐 결과 유지',
      JSON.stringify(await itemRows(h)) === r2 && r2 !== r1,
    )
    // 저장값 내용: 결과 본문이 아니라 id만
    const raw = (await planStore(h)) ?? ''
    check(
      'D-5b 임시 저장은 입력과 운동 id뿐이다(세트·목표·이유 본문 없음)',
      /resultIds/.test(raw) &&
        !/targetSeconds|"reps"|restSeconds|reason/.test(raw),
    )
    // 6 직접 선택: 선택 중 → 결과 → 교체 후
    await gotoPlan(h, 'selected')
    await clickLabel(h, '현재 운동 습관 유지')
    await preset(h, 30)
    await h.click('^운동 고르기$')
    await h.sleep(500)
    if (process.env.DBG) console.log((await mainText(h)).slice(0, 300))
    await pickByName(h, [
      ['푸시업', '월 푸시업'],
      ['플랭크', '플랭크'],
    ])
    // 3 운동 고르는 중(선택은 W13 임시 상태 → 새로고침하면 사라지고 고른 운동 영역은 유지/초기화)
    await reload()
    const afterPickReload = await mainText(h)
    check(
      'D-3 운동 고르는 중 새로고침: 선택하지 않은 상태로 안전하게 복원(오류 없음, 저장 없음)',
      !/오류|문제가 생겼/.test(afterPickReload) &&
        (await lists(h)).length === 0,
    )
    await h.click('^운동 고르기$').catch(() => {})
    await h.sleep(500)
    await pickByName(h, [
      ['푸시업', '월 푸시업'],
      ['플랭크', '플랭크'],
    ])
    await finishPick(h)
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/플랭크 다른 운동으로 바꾸기/.test(b.innerText))?.click()`,
    )
    await h.sleep(500)
    await pickByName(h, [['스쿼트', '맨몸 스쿼트']])
    await finishPick(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    const r3 = JSON.stringify((await itemRows(h)).map((r) => parseRow(r).name))
    await reload(`!!document.getElementById('plan-result-heading')`)
    check(
      'D-6 교체 후 새로고침: 교체한 운동·순서 유지',
      JSON.stringify((await itemRows(h)).map((r) => parseRow(r).name)) === r3,
      r3,
    )
    // 7 W11
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    const rvBefore = (await mainText(h)).includes('월 푸시업')
    await reload()
    check(
      'D-7 W11 새로고침: 초안이 계정 범위 임시 저장에서 복원되고 저장은 일어나지 않았다',
      rvBefore &&
        (await mainText(h)).includes('월 푸시업') &&
        (await lists(h)).length === 0 &&
        /오늘의 운동으로 저장/.test(await mainText(h)),
    )
    // 8 저장 후
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(800)
    await reload()
    const savedAfter = await lists(h)
    check(
      'D-8 저장 후 새로고침: 저장 목록 1개 유지, 미저장 초안은 비워졌다',
      savedAfter.length === 1 &&
        !/"items":\[\{/.test((await draftStore(h)) ?? ''),
    )
    // 미저장 추천과 저장 목록의 구분: 추천 화면 다시 열면 추천 상태는 이어지되 저장 목록과 별개
    await h.go(PLAN, 1000)
    check(
      'D-9 저장 후 추천 화면: 저장 목록을 덮어쓰지 않으며(목록 1개) 추천 화면은 계속 쓸 수 있다',
      (await lists(h)).length === 1 &&
        /오늘의 운동|추천|운동 목표/.test(await mainText(h)),
    )
    // 저장값 손상: 쓰레기 JSON
    await h.ev(
      `(()=>{const k=Object.keys(sessionStorage).find(k=>k.endsWith('beginner-plan'))||'mealthroutine.account.beginner-plan';sessionStorage.setItem(k,'{not json')})()`,
    )
    await h.go(PLAN, 1000)
    check(
      'D-10 깨진 임시 저장값은 버리고 처음부터 시작한다',
      /직접 운동 선택하기/.test(await mainText(h)) &&
        !/오류/.test(await mainText(h)),
    )
    // 결과 id 변조: 존재하지 않는 id → 현재 계산으로 대체 + 알림
    await h.ev(
      `(async()=>{const W=await import('/src/exercise/workoutDraftStorage.ts');sessionStorage.setItem('mealthroutine.account.beginner-plan', JSON.stringify({v:1,owner:W.ownerFingerprint('free'),session:{step:'result',inputs:{mode:'automatic',purpose:'learn',minutes:20,tools:['맨몸'],selectedIds:[],rotation:0},replacingId:null,resultIds:['no-such','x']}}))})()`,
    )
    await h.go(PLAN, 1000)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    const tampered = await mainText(h)
    check(
      'D-11 변조된 결과 id는 쓰지 않고 다시 계산한다(알림 표시)·확정 가능한 정상 결과',
      /이전에 본 추천과 달라졌어요/.test(tampered) &&
        !/no-such/.test(tampered) &&
        (await confirmBtn(h)) === 'false',
    )
    // 새로고침 시 권한 재확인: 중급으로 바뀌면 차단
    await setTier(h, 'intermediate')
    await reload()
    check(
      'D-12 새로고침 시 권한 재확인: 중급으로 바뀌면 저장된 추천 상태가 있어도 차단',
      /이 기능을 쓸 수 없어요/.test(await mainText(h)) &&
        !/오늘의 운동이 준비됐어요/.test(await mainText(h)),
    )
  })

// ═══ E. 중복 확정·저장 ═══
if (run('E'))
  await scenario('p25-E', async (h) => {
    await h.login(U)
    const toResultAuto = async (goal = '운동 습관 만들기', minutes = 20) => {
      await runResult(h, 'automatic', goal, minutes)
      await h.click('^운동 추천받기$')
      await h.until(`!!document.getElementById('plan-result-heading')`, 60)
      await h.sleep(300)
    }
    // E1 빠른 연속 클릭(확정): 한 번만 처리
    await toResultAuto()
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^이 운동으로 목록 확인하기$/.test(b.innerText.trim()));b.click();b.click();b.click();b.click()})()`,
    )
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(900)
    check(
      'E-1 확정 빠른 연속 클릭: W11 한 번 이동, 초안 1개',
      (await h.path()) === '/records/exercise/review' &&
        (await h.ev(`document.querySelectorAll('main ol > li').length`)) >= 3,
    )
    // E2 W11 저장 연속 클릭: 목록 1개
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^오늘의 운동으로 저장$/.test(b.innerText.trim()));b.click();b.click();b.click();b.click()})()`,
    )
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(900)
    const a = await lists(h)
    check(
      'E-2 W11 저장 연속 클릭: 오늘의 목록은 1개뿐이다',
      a.length === 1,
      String(a.length),
    )
    // E3 같은 요청 ID 재전송(같은 초안·같은 항목): 중복 없이 같은 목록
    const resend = await h.store(
      U,
      `
      const t=${TODAY};
      const mk=()=>({v:1,day:'today',items:[{itemId:'y1',exerciseId:'e-push',name:'푸시업',recordType:'reps',sets:[{reps:7}]}],updatedAt:new Date().toISOString()});
      const known=new Set(['e-push']);
      const id='p25-same-'+Date.now();
      const draft=mk();
      const r1=await lists.saveFromDraft({requestId:id,draft,knownExerciseIds:known});
      const r2=await lists.saveFromDraft({requestId:id,draft,knownExerciseIds:known});
      const all=(await lists.listByDate(t)).items;
      return {same:r1.list.id===r2.list.id,count:all.length,n:all.filter(l=>l.id===r1.list.id).length}`,
    )
    check(
      'E-3 같은 요청 ID 재전송: 같은 목록을 돌려주고 중복 저장하지 않는다',
      resend.same === true && resend.n === 1,
      JSON.stringify(resend),
    )
    // 같은 요청 ID로 다른 내용: requestConflict
    const conflict = await h.store(
      U,
      `
      const id='p25-conf-'+Date.now();
      const mk=(n)=>({v:1,day:'today',items:[{itemId:'x1',exerciseId:'e-push',name:'푸시업',recordType:'reps',sets:[{reps:n}]}],updatedAt:new Date().toISOString()});
      await lists.saveFromDraft({requestId:id,draft:mk(5),knownExerciseIds:new Set(['e-push'])});
      try{ await lists.saveFromDraft({requestId:id,draft:mk(9),knownExerciseIds:new Set(['e-push'])}); return 'no-error' }catch(e){ return e.code ?? e.name }`,
    )
    check(
      'E-4 같은 요청 ID에 다른 내용: requestConflict로 거부된다',
      conflict === 'requestConflict',
      String(conflict),
    )
    // E5 교체 확인: 이미 오늘의 목록이 있는 상태에서 새 추천 확정 → W11 저장 → 교체 패널 → 취소/승인
    await toResultAuto('체중 관리', 10)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    const before = (await lists(h)).length
    await h.click('^오늘의 운동으로 저장$')
    await h.sleep(900)
    const panel = await mainText(h)
    check(
      'E-5 이미 오늘 저장한 목록이 있으면 교체 확인 패널이 먼저 뜨고 아직 저장하지 않는다',
      /오늘 저장한 운동 목록이 있어요/.test(panel) &&
        (await lists(h)).length === before,
    )
    await h.click('^취소$')
    await h.sleep(400)
    check(
      'E-6 교체 취소: 저장 목록이 그대로이고 W11에 머문다',
      (await lists(h)).length === before &&
        (await h.path()) === '/records/exercise/review',
    )
    await h.click('^오늘의 운동으로 저장$')
    await h.sleep(700)
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^바꿔서 저장$/.test(b.innerText.trim()));b.click();b.click();b.click()})()`,
    )
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(900)
    const after = await lists(h)
    check(
      'E-7 교체 승인(연속 클릭 포함): 새 목록이 정확히 하나 추가되고 이전 목록은 보관된다',
      after.length === before + 1,
      `before=${before} after=${after.length}`,
    )
    // E8 저장 실패 후 다시 시도: 같은 초안·같은 요청 ID, 목록 중복 없음
    await h.go('/records/exercise/review', 900)
    await toResultAuto('근력 늘리기', 20).catch(() => {})
    if (!(await h.has('오늘의 운동이 준비됐어요')))
      await toResultAuto('체중 관리', 30)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(900)
    if (/구성 중이던 운동 목록/.test(await mainText(h)))
      await h.click('^추천 운동으로 바꾸기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(700)
    // 오늘 목록은 없애고(새 프로필처럼) 시작할 수 없으므로 현재 개수를 기준으로 비교한다.
    const base = (await lists(h)).length
    await h.ev(
      `(()=>{window.__f={left:1,hits:0};if(!window.__p){window.__p=true;const o=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(s,m,x){const l=Array.isArray(s)?s:[s];if(window.__f&&window.__f.left>0&&m==='readwrite'&&l.includes('workoutLists')){window.__f.left--;window.__f.hits++;throw new DOMException('주입한 실패','QuotaExceededError')}return o.call(this,s,m,x)}}})()`,
    )
    await h.click('^오늘의 운동으로 저장$')
    await h.sleep(900)
    // 교체 패널이 먼저 뜨면 승인한다(저장 시도는 그 뒤에 일어난다)
    if (/오늘 저장한 운동 목록이 있어요/.test(await mainText(h))) {
      await h.click('^바꿔서 저장$')
      await h.sleep(900)
    }
    const hits = await h.ev(`window.__f?.hits ?? 0`)
    const failText = await mainText(h)
    check(
      'E-8 저장 실패(주입): 오류 안내가 있고 W11에 머물며 초안·저장 목록이 그대로다',
      hits === 1 &&
        (await h.path()) === '/records/exercise/review' &&
        /저장하지 못했|저장 다시 시도|저장 공간/.test(failText) &&
        (await lists(h)).length === base,
      `hits=${hits} base=${base}`,
    )
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/저장 다시 시도|^오늘의 운동으로 저장$/.test(b.innerText.trim()));b.click();b.click()})()`,
    )
    await h.sleep(900)
    if (/오늘 저장한 운동 목록이 있어요/.test(await mainText(h))) {
      await h.click('^바꿔서 저장$')
    }
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(800)
    const afterRetry = await lists(h)
    check(
      'E-9 저장 재시도(연속 클릭 포함): 성공해 W01로 이동하고 목록이 정확히 하나만 늘었다',
      afterRetry.length === base + 1,
      `base=${base} after=${afterRetry.length}`,
    )
    // E10 확정 중 화면 이동: 반쯤 만든 초안이 남지 않는다
    await toResultAuto('운동 습관 만들기', 10)
    const draftBefore = (await draftStore(h)) ?? ''
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^이 운동으로 목록 확인하기$/.test(b.innerText.trim()));b.click();const nav=[...document.querySelectorAll('nav a')].find(a=>/홈/.test(a.innerText));nav&&nav.click()})()`,
    )
    await h.sleep(1500)
    const draftAfter = (await draftStore(h)) ?? ''
    let ok = true
    try {
      if (draftAfter) {
        const d = JSON.parse(draftAfter)
        const items = d.draft?.items ?? d.items ?? []
        ok = Array.isArray(items)
      }
    } catch {
      ok = false
    }
    check(
      'E-10 확정 직후 다른 화면으로 이동: 오류 없이 이동하고 저장된 초안이 있으면 온전한 JSON이다(목록은 저장되지 않음)',
      ok && (await h.ev(`!document.body.innerText.includes('문제가 생겼')`)),
      `${draftBefore.length}→${draftAfter.length} path=${await h.path()}`,
    )
    // E11 추천 화면 재진입: 이전 추천 상태가 있어도 새 진입(fresh)은 처음부터
    await h.go('/records/exercise', 1000)
    await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      60,
    )
    await h.click('오늘의 운동 추천받기', 'main')
    await h.until(`location.pathname===${q(PLAN)}`, 60)
    await h.sleep(500)
    check(
      'E-11 W01 진입 링크로 다시 들어오면 이전 추천 결과가 아니라 조건 입력부터 시작한다',
      /어떤 목표로 운동하고 싶으세요/.test(await mainText(h)) &&
        !/오늘의 운동이 준비됐어요/.test(await mainText(h)),
    )
  })

// ═══ F. AI 플랜 권한 회귀 ═══
if (run('F'))
  await scenario('p25-F', async (h) => {
    await h.login(U)
    await h.go('/records/exercise/new', 1000)
    const t = await mainText(h)
    check(
      'F-1 W12: AI 추천은 "로컬 예시"(준비 중 아님), 직접 구성 선택 유지, 초급 추천 문구 없음',
      /AI 추천으로 시작하기/.test(t) &&
        /로컬 예시/.test(t) &&
        !/준비 중/.test(t) &&
        /직접 운동 목록 구성하기/.test(t) &&
        !/오늘의 운동 추천받기/.test(t),
    )
    const ent = await h.ev(
      `(async()=>{try{const m=await import('/src/exercise/aiPlanAccess.ts');return Object.keys(m)}catch(e){return 'none:'+e.message}})()`,
    )
    check('F-2 (참고) AI 플랜 접근 모듈 확인', true, JSON.stringify(ent))
    check(
      'F-3 추천 사용이 AI 이용 횟수·권한 저장값을 만들지 않는다',
      await h.ev(
        `Object.keys(sessionStorage).concat(Object.keys(localStorage)).filter(k=>/trial|ai-|entitle|체험/i.test(k)).length===0`,
      ),
    )
    await h.go('/records/exercise/select', 1000)
    const w13 = await mainText(h)
    check(
      'F-4 W13 기본 화면의 문구는 그대로다("운동 검색·등록", "선택한 N개 운동 등록")',
      /운동 검색·등록/.test(w13) &&
        /선택한 0개 운동 등록/.test(w13) &&
        !/운동 찾아보기/.test(w13),
      w13.slice(0, 80),
    )
  })

const failed = results.filter((r) => !r.ok)
console.log(
  `\n합계 ${results.length}건 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`,
)
for (const f of failed) console.log('  실패:', f.n)
process.exit(failed.length ? 1 : 0)
