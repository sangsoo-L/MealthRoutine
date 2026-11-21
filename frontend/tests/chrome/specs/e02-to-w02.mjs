// [chrome 회귀] E02 → W02 오늘 기록 연결(S8-3)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S8-3 Chrome 검증: E02 "오늘 기록에 추가" → W02. 개발 서버(5199)와 실제 IndexedDB·sessionStorage. 프로젝트 소스는 수정하지 않는다.
import { start, q } from '../lib/session.mjs'

const A = '2' // 원암 덤벨 로우
const B = '36' // 프론 Y 레이즈
const NAME = {
  2: '원암 덤벨 로우',
  36: '프론 Y 레이즈',
  34: '덤벨 벤트오버 로우',
}
let fails = 0
const results = []
const mk = (h) => (n, ok, d) => {
  h.check(n, ok, d)
  results.push({ n, ok: !!ok })
  if (!ok) fails++
}

const draftIds = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>/workout-draft/.test(k));if(!k)return null;const d=JSON.parse(sessionStorage.getItem(k));return d.draft.items.map(i=>i.exerciseId)})()`,
  )
const draftRaw = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>/workout-draft/.test(k));return k?sessionStorage.getItem(k):null})()`,
  )
const e02 = async (h, id) => {
  await h.goSettled(`/exercises/${id}`, 900)
  await h.until(
    `!!document.querySelector('button[aria-label^="오늘 기록에 추가"]')`,
    80,
  )
}
const todayBtn = (h) =>
  h.ev(
    `document.querySelector('button[aria-label^="오늘 기록에 추가"]').click()`,
  )
const panelText = (h) =>
  h.ev(`document.querySelector('#exercise-add-panel')?.innerText ?? null`)
const clickIn = (h, re) =>
  h.ev(
    `(()=>{const el=[...document.querySelectorAll('#exercise-add-panel button')].find(b=>new RegExp(${q(re)}).test(b.innerText.trim()));if(!el)return false;el.click();return true})()`,
  )
const composeNames = (h) =>
  h.ev(
    `[...document.querySelectorAll('main ol > li')].map(li=>li.querySelector('h2,h3')?.innerText?.trim()??li.innerText.split('\\n')[0])`,
  )

const ONLY = process.env.ONLY || ''
const on = (n) => !ONLY || ONLY.split(',').includes(n)
// ─── 시나리오 1: E01 → E02 → W02 → W11 → W01 (초안 없음) ───────
if (on('1')) {
  const h = await start('s83-1')
  const check = mk(h)
  console.log('--- 1. 초안 없음: E01 → E02 → W02 → W11 → 저장 → W01')
  await h.login('free')
  await h.goSettled('/exercises', 900)
  await h.setVal('input[type=search], input[type=text]', '덤벨 로우')
  await h.sleep(200)
  await h.ev(`document.querySelector('form')?.requestSubmit()`)
  await h.until(
    `!![...document.querySelectorAll('main a')].find(a=>/\\/exercises\\/2$/.test(a.getAttribute('href')))`,
    80,
  )
  const hasCard = await h.ev(
    `!![...document.querySelectorAll('main a')].find(a=>/\\/exercises\\/2$/.test(a.getAttribute('href')))`,
  )
  check('E01 검색 결과에 운동 카드가 있다', hasCard)
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/\\/exercises\\/2$/.test(a.getAttribute('href'))).click()`,
  )
  await h.until(`location.pathname==='/exercises/2'`, 60)
  await h.until(
    `!!document.querySelector('button[aria-label^="오늘 기록에 추가"]')`,
    80,
  )
  check('E02에 도착해 "오늘 기록" 버튼이 있다', true)
  check('초안 없음: 저장소에 초안이 없다', (await draftIds(h)) === null)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  check(
    'W12를 거치지 않고 W02로 바로 간다',
    (await h.path()) === '/records/exercise/compose',
  )
  await h.sleep(500)
  check('W02 안내: 운동 1개를 추가했어요', await h.has('운동 1개를 추가했어요'))
  check('W02에 운동이 담겨 있다', await h.has(NAME[A]))
  check(
    '초안(sessionStorage)에 운동 1개',
    JSON.stringify(await draftIds(h)) === JSON.stringify([A]),
  )
  // 기록 방식·기본 목표: 시드의 기본값(weight_reps → 중량+횟수형), 세트 1개
  const raw = JSON.parse(await draftRaw(h))
  const item = raw.draft.items[0]
  check(
    '기본 기록 방식은 카탈로그 기본값(중량 weight)',
    item.recordType === 'weight',
    item.recordType,
  )
  check(
    '기본 목표 세트 1개(10회·60초 기본값)',
    item.sets.length === 1 && item.sets[0].reps === 10,
  )
  await h.click('운동 목록 등록 · 최종 검토')
  await h.until(`location.pathname==='/records/exercise/review'`, 60)
  check('W11로 이동', (await h.path()) === '/records/exercise/review')
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/오늘의 운동으로 저장/.test(b.innerText)&&b.getAttribute('aria-disabled')!=='true')`,
    120,
  )
  await h.click('오늘의 운동으로 저장')
  await h.until(`location.pathname==='/records/exercise'`, 80)
  await h.sleep(800)
  check('저장 후 W01로 이동', (await h.path()) === '/records/exercise')
  check('W01 오늘 운동 목록에 운동이 보인다', await h.has(NAME[A]))
  check('저장 뒤 초안이 비워진다', (await draftIds(h)) === null)
  check(
    '콘솔 오류 없음',
    h.problems.length === 0,
    h.problems.slice(0, 3).join(' / '),
  )
  h.close()
}

// ─── 시나리오 2: 기존 초안 — 추가 / 새 구성 / 취소 / 중복 / 새로고침 / 뒤로가기 ───
if (on('2')) {
  const h = await start('s83-2')
  const check = mk(h)
  console.log('--- 2. 기존 초안 처리')
  await h.login('free')
  // 기존 초안 만들기: B를 E02에서 담는다.
  await e02(h, B)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(400)
  check(
    '준비: 초안 [B]',
    JSON.stringify(await draftIds(h)) === JSON.stringify([B]),
  )

  // 2-a 뒤로가기: W02 → E02
  await h.ev(`history.back()`)
  await h.until(`location.pathname==='/exercises/${B}'`, 60)
  check('뒤로가기: W02 → E02', (await h.path()) === `/exercises/${B}`)

  // 2-b 다른 운동 A에서 누르기 → 패널
  await e02(h, A)
  const before = await draftRaw(h)
  await todayBtn(h)
  await h.sleep(300)
  const p1 = await panelText(h)
  check(
    '기존 초안 있음: 확인 패널이 열린다',
    !!p1 && /구성 중이던 운동 목록이 있어요/.test(p1),
    p1,
  )
  check(
    '패널: 기존 구성에 추가·새 구성·취소 선택지',
    /기존 구성에 추가하기/.test(p1) &&
      /새 구성으로 시작하기/.test(p1) &&
      /취소/.test(p1),
  )
  check('확인 전에는 이동하지 않는다', (await h.path()) === `/exercises/${A}`)
  check('확인 전에는 초안이 그대로다', (await draftRaw(h)) === before)
  const focusInPanel = await h.ev(
    `document.activeElement?.id==='exercise-add-panel'`,
  )
  check('패널이 열리면 포커스가 패널로 간다', focusInPanel)

  // 2-c 취소
  await clickIn(h, '^취소$')
  await h.sleep(400)
  check('취소: 패널이 닫힌다', (await panelText(h)) === null)
  check('취소: 같은 화면에 머문다', (await h.path()) === `/exercises/${A}`)
  check('취소: 초안이 그대로다', (await draftRaw(h)) === before)
  check(
    '취소: 포커스가 "오늘 기록" 버튼으로 돌아간다',
    await h.ev(
      `/오늘 기록에 추가/.test(document.activeElement?.getAttribute('aria-label')||'')`,
    ),
  )

  // 2-d 새 구성 → 확인 단계에서 취소
  await todayBtn(h)
  await h.sleep(250)
  await clickIn(h, '^새 구성으로 시작하기$')
  await h.sleep(250)
  const p2 = await panelText(h)
  check(
    '새 구성: 기존 구성이 사라진다는 안내',
    !!p2 &&
      /사라지고/.test(p2) &&
      /되돌릴 수 없어요/.test(p2) &&
      /1개/.test(p2),
    p2,
  )
  check('새 구성 확인 중에도 초안은 그대로다', (await draftRaw(h)) === before)
  await clickIn(h, '^취소$')
  await h.sleep(250)
  check(
    '확인 단계 취소: 처음 선택으로 돌아간다',
    /기존 구성에 추가하기/.test((await panelText(h)) ?? ''),
  )
  check('확인 단계 취소: 초안이 그대로다', (await draftRaw(h)) === before)

  // 2-e 기존 구성에 추가
  await clickIn(h, '^기존 구성에 추가하기$')
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(500)
  check(
    '기존 구성에 추가: W02로 이동',
    (await h.path()) === '/records/exercise/compose',
  )
  check(
    '초안 [B, A] 순서(끝에 추가)',
    JSON.stringify(await draftIds(h)) === JSON.stringify([B, A]),
    JSON.stringify(await draftIds(h)),
  )
  check('W02 안내: 운동 1개를 추가했어요', await h.has('운동 1개를 추가했어요'))
  check(
    'W02에 두 운동이 보인다',
    (await h.has(NAME[A])) && (await h.has(NAME[B])),
  )

  // 2-f 새로고침 후 초안 복원
  await h.go('/records/exercise/compose', 900)
  await h.until(`!![...document.querySelectorAll('main')].length`, 40)
  await h.sleep(500)
  check(
    '새로고침 후 초안 복원: 두 운동',
    (await h.has(NAME[A])) && (await h.has(NAME[B])),
  )
  check(
    '새로고침 후 안내 문구는 다시 나타나지 않는다',
    !(await h.has('운동 1개를 추가했어요')),
  )

  // 2-g 중복 운동 선택 (A는 이미 초안에 있다)
  await e02(h, A)
  const beforeDup = await draftRaw(h)
  await todayBtn(h)
  await h.sleep(300)
  const p3 = await panelText(h)
  check(
    '중복: 이미 있어서 다시 담지 않는다는 안내',
    !!p3 && /이미 있어서 다시 담지 않아요/.test(p3),
    p3,
  )
  check(
    '중복: "기존 구성에 추가하기"는 없고 "구성 중인 목록 보기"가 있다',
    !/기존 구성에 추가하기/.test(p3) && /구성 중인 목록 보기/.test(p3),
  )
  check('중복: 초안 변화 없음', (await draftRaw(h)) === beforeDup)
  await clickIn(h, '^구성 중인 목록 보기$')
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(400)
  check(
    '중복: 목록 보기로 W02 이동, 운동 2개 그대로',
    JSON.stringify(await draftIds(h)) === JSON.stringify([B, A]),
  )
  check(
    '중복: W02에 "추가했어요" 안내가 없다',
    !(await h.has('운동 1개를 추가했어요')),
  )

  // 2-h 새 구성으로 시작 (확정)
  await h.goSettled('/exercises/34', 900)
  await h.until(
    `!!document.querySelector('button[aria-label^="오늘 기록에 추가"]')`,
    80,
  )
  await todayBtn(h)
  await h.sleep(250)
  await clickIn(h, '^새 구성으로 시작하기$')
  await h.sleep(200)
  const p4 = await panelText(h)
  check('새 구성: 기존 2개가 사라진다는 안내', /2개/.test(p4 ?? ''), p4)
  await clickIn(h, '^지우고 새 구성으로 시작하기$')
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(500)
  check(
    '새 구성: 초안이 ["34"] 하나뿐',
    JSON.stringify(await draftIds(h)) === JSON.stringify(['34']),
    JSON.stringify(await draftIds(h)),
  )
  check(
    '새 구성: W02에 이전 운동이 없다',
    !(await h.has(NAME[A])) &&
      !(await h.has(NAME[B])) &&
      (await h.has(NAME[34])),
  )

  // 2-i 내일 계획 = 준비 중, 저장·이동 없음
  await e02(h, A)
  const beforeT = await draftRaw(h)
  await h.ev(
    `document.querySelector('button[aria-label^="내일 계획에 추가"]').click()`,
  )
  await h.sleep(300)
  check(
    '내일 계획: 준비 중 안내',
    await h.has('내일 계획은 아직 준비 중이에요'),
  )
  check(
    '내일 계획: 이동하지 않고 초안도 그대로',
    (await h.path()) === `/exercises/${A}` && (await draftRaw(h)) === beforeT,
  )
  check(
    '콘솔 오류 없음',
    h.problems.length === 0,
    h.problems.slice(0, 3).join(' / '),
  )
  h.close()
}

// ─── 시나리오 3: 비로그인 / 계정 격리 ───────────────────────
if (on('3')) {
  const h = await start('s83-3')
  const check = mk(h)
  console.log('--- 3. 비로그인·계정 격리')
  await h.goSettled(`/exercises/${A}`, 900)
  await h.until(`!!document.querySelector('main h1')`, 60)
  check('비회원: E02는 열린다', await h.has(NAME[A]))
  check(
    '비회원: 오늘 기록·내일 계획 버튼이 DOM에 없다',
    await h.ev(`!document.querySelector('button[aria-label*="에 추가"]')`),
  )
  await h.goSettled('/records/exercise/compose', 900)
  check('비회원: W02는 로그인 안내(AuthGate)', await h.has('로그인'))
  check('비회원: 초안이 저장되지 않는다', (await draftIds(h)) === null)

  await h.login('free')
  await e02(h, A)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  check(
    '계정 free: 초안 [A]',
    JSON.stringify(await draftIds(h)) === JSON.stringify([A]),
  )
  // 로그아웃(P09) 후 다른 계정으로 로그인
  await h.goSettled('/settings', 900)
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/로그아웃/.test(b.innerText))`,
    60,
  )
  await h.click('로그아웃')
  await h.sleep(800)
  check('로그아웃 뒤 초안이 지워진다', (await draftIds(h)) === null)
  await h.login('full')
  check('계정 full: 초안 없음', (await draftIds(h)) === null)
  await e02(h, B)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(400)
  check(
    '계정 full: 확인 패널 없이 바로 새 초안 [B]',
    JSON.stringify(await draftIds(h)) === JSON.stringify([B]),
  )
  check('계정 full: W02에 free 계정 운동이 없다', !(await h.has(NAME[A])))
  // 초안이 있는 채 계정이 바뀐 경우(로그아웃이 정리 못한 값): 소유자 지문 불일치 초안은 쓰지 않는다
  const rawFull = await draftRaw(h)
  await h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>/workout-draft/.test(k));const d=JSON.parse(sessionStorage.getItem(k));d.owner='other-owner';sessionStorage.setItem(k,JSON.stringify(d))})()`,
  )
  await e02(h, A)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  await h.sleep(400)
  check(
    '타 소유자 초안은 무시: 확인 패널 없이 새 초안 [A]',
    JSON.stringify(await draftIds(h)) === JSON.stringify([A]),
    JSON.stringify(await draftIds(h)),
  )
  void rawFull
  check(
    '콘솔 오류 없음',
    h.problems.length === 0,
    h.problems.slice(0, 3).join(' / '),
  )
  h.close()
}

// ─── 시나리오 4: 반응형 + 키보드 ────────────────────────────
if (on('4')) {
  const h = await start('s83-4')
  const check = mk(h)
  console.log('--- 4. 반응형·접근성')
  await h.login('free')
  await e02(h, B)
  await todayBtn(h)
  await h.until(`location.pathname==='/records/exercise/compose'`, 60)
  for (const [name, w, hgt] of [
    ['mobile', 375, 740],
    ['tablet', 768, 1024],
    ['desktop', 1280, 900],
  ]) {
    await h.vp(w, hgt)
    await e02(h, A)
    await todayBtn(h)
    await h.sleep(500)
    const m = await h.ev(
      `(()=>{const p=document.querySelector('#exercise-add-panel');const bs=[...p.querySelectorAll('button')].map(b=>Math.round(b.getBoundingClientRect().height));return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,bs,right:Math.round(p.getBoundingClientRect().right),vw:innerWidth}})()`,
    )
    check(`${name}(${w}): 가로 넘침 없음`, m.overflow <= 0, JSON.stringify(m))
    check(
      `${name}(${w}): 패널 버튼 높이 ≥ 44px`,
      m.bs.every((x) => x >= 44),
      JSON.stringify(m.bs),
    )
    check(`${name}(${w}): 패널이 화면 안`, m.right <= m.vw, JSON.stringify(m))
    await h.shot(`s83-${name}.png`)
  }
  await h.vp(375, 740)
  // 키보드: 패널 열기(Enter) → Tab으로 선택지 이동 → Esc는 지원하지 않으므로 취소 버튼
  await e02(h, A)
  await h.ev(
    `document.querySelector('button[aria-label^="오늘 기록에 추가"]').focus()`,
  )
  await h.press('Enter', 'Enter', 13)
  await h.sleep(400)
  check('키보드 Enter로 패널이 열린다', (await panelText(h)) !== null)
  await h.press('Tab', 'Tab', 9)
  check(
    'Tab 이동 시 포커스는 패널 안 버튼',
    await h.ev(
      `!!document.activeElement?.closest('#exercise-add-panel')&&document.activeElement.tagName==='BUTTON'`,
    ),
  )
  check(
    '콘솔 오류 없음',
    h.problems.length === 0,
    h.problems.slice(0, 3).join(' / '),
  )
  h.close()
}

console.log(
  `\n=== S8-3 Chrome: ${results.length - fails}/${results.length} 통과, 실패 ${fails}`,
)
process.exit(fails ? 1 : 0)
