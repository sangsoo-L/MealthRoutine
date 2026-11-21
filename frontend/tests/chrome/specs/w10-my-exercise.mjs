// [chrome 회귀] W10 나의 운동(오늘의 운동 상태 · 완료한 운동 기록 · 내일 계획 안내)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only w10-my-exercise`. 상세: tests/chrome/README.md
// S8-4B 신규, S8-4D 보강(접근성 이름·W14 복귀 경로·읽기 전용·스키마·계정 전환 경쟁·시간 초과를 FAIL로 기록). 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다.
// 지난 날짜 기록은 history.mjs의 시드(저장소 `now` 옵션)로 만든다. 앱 소스를 수정하지 않는다.
import { completeCurrent, start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  armReadFail,
  disarmReadFail,
  dumpStores,
  holdReads,
  mustClick,
  mustUntil,
  readFailHits,
  readsLog,
  releaseReads,
  READONLY_RESULT,
  schemaInfo,
  seedRun,
  settleScreen,
  shortDateExpr,
  trackReads,
  waitPath,
} from '../lib/history.mjs'

const MY = '/records/exercise/my'
const check = (h, n, ok, d = '') => h.check(n, ok, d)

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(h, `${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

// 화면이 안정되지 않으면 조용히 넘어가지 않고 예외를 던진다(시나리오가 FAIL로 기록). W10·W01 각각의 경로·h1·로딩 문구가 끝났는지 확인한다.
const settle = (h) => settleScreen(h, { path: MY, h1: '나의 운동' })
const settleW01 = (h) =>
  settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
const openMy = async (h) => {
  await h.go(MY, 150)
  await settle(h)
}
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    return {
      h1:[...m.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      h2:[...m.querySelectorAll('h2')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()),
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links:[...m.querySelectorAll('a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')})),
      items:[...m.querySelectorAll('[data-record-item]')].map(li=>({
        date:li.querySelector('time')?.getAttribute('datetime'),
        title:li.querySelector('p')?.innerText.trim(),
      })),
      bottom:[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] [aria-current=page]')].map(x=>x.innerText.trim()),
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    }})()`)
const RESULT_SCREEN = `!!document.querySelector('[data-result-screen]')`
const toResult = async (h) => {
  await mustClick(h, '^운동 결과 확인$')
  // 측정 중인 시간이 있으면 이동 전 확인 패널이 먼저 나온다(정상 동작). 결과 화면 또는 확인 패널 중 먼저 나타나는 쪽을 조건으로 기다린다.
  await mustUntil(
    h,
    `${RESULT_SCREEN} || /측정 중인 시간은 기록되지 않아요/.test(document.querySelector('main')?.innerText ?? '')`,
    80,
  )
  if (!(await h.ev(RESULT_SCREEN))) await mustClick(h, '^결과 확인으로 이동$')
  await mustUntil(h, RESULT_SCREEN, 80)
}

// ── A. 흐름: W01 → W10 → 시작·이어하기 → 완료·저장 → W10 기록 → W15 → 이전 ─────────────
await scenario('A-flow', async (h) => {
  await h.login('free')
  await h.seedList('free', 'mixed', 'w10-a')
  await h.go('/records/exercise', 150)
  await settleW01(h)
  check(
    h,
    'A1. W01 "최근 운동 기록" 제목 옆에 "전체 기록 보기" 링크',
    await h.has('전체 기록 보기'),
  )
  await mustClick(h, '^전체 기록 보기$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  let s = await snap(h)
  check(
    h,
    'A2. W01 → W10 이동(경로 /records/exercise/my)',
    (await h.path()) === MY,
  )
  check(
    h,
    'A3. h1 "나의 운동" 1개',
    s.h1.length === 1 && s.h1[0] === '나의 운동',
    JSON.stringify(s.h1),
  )
  check(
    h,
    'A4. 영역(h2): 오늘의 운동 → 완료한 운동 기록 → 내일 계획',
    JSON.stringify(s.h2) ===
      JSON.stringify(['오늘의 운동', '완료한 운동 기록', '내일 계획']),
    JSON.stringify(s.h2),
  )
  check(
    h,
    'A5. 하단 탭 "기록" 활성(하단 탭 유지)',
    JSON.stringify(s.bottom) === JSON.stringify(['기록']),
    JSON.stringify(s.bottom),
  )
  check(
    h,
    'A6. 오늘 대표 목록(운동 3개)과 시작 버튼, 완료 기록은 빈 상태',
    /운동\s*3개/.test(s.text) &&
      /이 목록으로 바로 운동 시작/.test(s.text) &&
      /아직 저장된 운동 기록이 없어요/.test(s.text),
  )
  check(
    h,
    'A7. 내일 계획 영역: 계획이 없으면 빈 상태와 "내일 운동 계획 만들기"(W02, day=tomorrow) 링크(FAST-04C, 준비 중 안내 없음)',
    /아직 내일 계획이 없어요/.test(s.text) &&
      !/내일 계획은 아직 준비 중이에요/.test(s.text) &&
      s.links.some((l) => l.h === '/records/exercise/compose?day=tomorrow'),
  )
  // 오늘 계획 목록이 있으면 카드의 "목록 다시 구성하기"가 이미 W12로 가므로 같은 곳으로 가는 링크는 하나뿐이다(중복 없음).
  const toNew = s.links.filter((l) => l.h === '/records/exercise/new')
  check(
    h,
    'A8. 이동 링크: W12로 가는 링크는 "목록 다시 구성하기" 하나뿐(중복 없음), 이전 운동 리스트 보기 → W16, "이전" → W01',
    toNew.length === 1 &&
      toNew[0].t === '목록 다시 구성하기' &&
      !s.links.some((l) => /새 운동 목록 만들기/.test(l.t)) &&
      s.links.filter((l) => l.h === '/records/exercise/previous').length ===
        1 &&
      s.links.some(
        (l) =>
          /이전 운동 리스트 보기/.test(l.t) &&
          l.h === '/records/exercise/previous',
      ) &&
      s.links.some((l) => l.t === '이전' && l.h === '/records/exercise'),
    JSON.stringify(s.links),
  )
  check(h, 'A9. 가로 스크롤 없음', s.over <= 0, String(s.over))

  // W10에서 시작 → W14 → "이전" → W10(진입한 화면으로 돌아온다)
  await mustClick(h, '이 목록으로 바로 운동 시작')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  check(
    h,
    'A10. W10에서 운동 시작 → W14 진입(기존 흐름)',
    (await h.path()) === '/records/exercise/session',
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  check(
    h,
    'A10-2. W10에서 시작한 W14의 "이전" → W10(W01이 아니다)',
    (await h.path()) === MY,
  )
  // 이어하기: 진행 중인 채로 W10에 돌아온 상태에서 이어서 운동하기
  s = await snap(h)
  check(
    h,
    'A11. 진행 중에는 "이어서 운동하기"(시작 버튼 대신)',
    /이어서 운동하기/.test(s.text) &&
      !/이 목록으로 바로 운동 시작/.test(s.text),
  )
  check(
    h,
    'A12. 진행 중인 세션은 완료 기록에 들어가지 않는다',
    /아직 저장된 운동 기록이 없어요/.test(s.text) && s.items.length === 0,
  )
  // 진행 중인 세션이 있을 때 W10의 이어하기(진행 중인 운동 카드) → W14 → "이전" → W10
  await mustClick(h, '^이어서 운동하기$')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  check(
    h,
    'A12-2. W10에서 이어하기한 W14의 "이전" → W10',
    (await h.path()) === MY,
  )
  await mustClick(h, '^이어서 운동하기$')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  for (let i = 0; i < 6; i++) await completeCurrent(h)
  await toResult(h)
  await mustClick(h, '^(운동 결과 저장하기|다시 시도)$')
  await waitPath(h, '^/records/exercise$', 80)
  await settleW01(h)

  // 저장 뒤 W10에 기록 반영
  await mustClick(h, '^전체 기록 보기$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===1`,
    50,
  )
  s = await snap(h)
  check(
    h,
    'A13. 저장한 운동이 완료 기록 1건으로 반영("전체 1건 중 1건")',
    s.items.length === 1 && /전체 1건 중 1건/.test(s.text),
    JSON.stringify(s.items),
  )
  check(
    h,
    'A14. 기록 요약: 운동 수·세트 수·실제 측정 시간 표시',
    /운동 3개/.test(s.text) &&
      /6세트 수행/.test(s.text) &&
      // 측정 시간 표기 형식: "N초" 또는 "N분 M초"(앱의 measuredDurationLabel 형식, 시간형 세트를 실제로 약 1초 이상 측정했다)
      /측정 (\d+분( \d+초)?|\d+초)/.test(s.text),
    s.text.slice(0, 300),
  )
  check(
    h,
    'A15. 오늘 목록은 "오늘 운동을 마쳤어요"(다시 시작하지 않음)',
    /오늘 운동을 마쳤어요/.test(s.text) &&
      !/이 목록으로 바로 운동 시작/.test(s.text),
  )
  // 오늘 운동을 마친 뒤에도 오늘의 운동 카드는 같은 목록을 보여 주며 "목록 다시 구성하기"(W12)를 그린다. 하단에 같은 곳으로 가는 링크를 더 두지 않는다.
  const doneLinks = s.links.filter((l) => l.h === '/records/exercise/new')
  check(
    h,
    'A15-2. 오늘 운동을 마친 뒤에도 W12 링크는 카드의 "목록 다시 구성하기" 하나뿐(하단에 중복 링크 없음)',
    doneLinks.length === 1 && doneLinks[0].t === '목록 다시 구성하기',
    JSON.stringify(doneLinks),
  )
  // 완료 기록 날짜(오늘)가 짧은 날짜 표기로 정확히 보인다(앱의 문자열 해석과 무관하게 Date 연산으로 만든 값과 비교).
  const todayShort = await h.ev(shortDateExpr(0))
  const shownDate = await h.ev(
    `document.querySelector('[data-record-item] time')?.innerText.trim()`,
  )
  check(
    h,
    'A15-3. 완료 기록의 날짜가 오늘의 짧은 날짜 표기와 정확히 같다',
    shownDate === todayShort,
    `${shownDate} / ${todayShort}`,
  )

  // 완료 기록 → W15 읽기 전용 → 이전 → W10
  await mustClick(h, '^기록 자세히 보기')
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  check(
    h,
    'A16. 완료 기록 → W15 읽기 전용(이미 저장된 기록 안내)',
    await h.has('이미 저장된 운동 기록이에요'),
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  check(h, 'A17. W15 "이전" → W10(state.from)', (await h.path()) === MY)
  // 오늘 목록의 "운동 기록 자세히 보기"도 W10으로 돌아온다
  await settle(h)
  await mustClick(h, '^운동 기록 자세히 보기$')
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  check(
    h,
    'A18. 오늘 목록의 기록 보기 → W15 → "이전" → W10',
    (await h.path()) === MY,
  )
  // 브라우저 뒤로가기
  await settle(h)
  await mustClick(h, '^기록 자세히 보기')
  await waitPath(h, '^/records/exercise/result$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/records/exercise/my$')
  check(h, 'A19. 브라우저 뒤로가기 → W10', (await h.path()) === MY)
  // 직접 URL로 W15에 들어오면 기본 복귀(W01)
  // 뒤로가기 뒤 W10이 기록을 다시 읽어 링크를 그릴 때까지 기다린다(전체 회귀의 부하에서 링크가 아직 없어 주소가 빈 값이 되던 간헐 실패 방지).
  await mustUntil(
    h,
    `!!document.querySelector('main a[href^="/records/exercise/result"]')`,
    80,
  )
  const url = await h.ev(
    `document.querySelector('main a[href^="/records/exercise/result"]')?.getAttribute('href') ?? ''`,
  )
  await h.goSettled(url, 900)
  await mustUntil(h, READONLY_RESULT, 60)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(
    h,
    'A20. 직접 URL로 연 W15의 "이전"은 기본 경로(W01) 유지',
    (await h.path()) === '/records/exercise',
  )
  // W10 "이전" → W01
  await openMy(h)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(h, 'A21. W10 "이전" → W01', (await h.path()) === '/records/exercise')
})

// ── B. 20건씩 더 보기 · 정렬 · 1년 범위 · 같은 날 여러 기록 ─────────────────────────────
await scenario('B-paging', async (h) => {
  await h.login('free')
  // 45건: 15일 × 하루 3건(오전 8시·낮 12시·저녁 18시). 이름으로 같은 날 순서를 구분한다.
  for (let i = 0; i < 45; i++) {
    await seedRun(h, 'free', {
      dayOffset: -(1 + Math.floor(i / 3)),
      hour: [8, 12, 18][i % 3],
      runs: 1,
      kind: 'reps',
      reqId: `pg-${i}`,
      name: `기록${i}`,
    })
  }
  // 1년보다 오래된 기록(제외되어야 한다)
  await seedRun(h, 'free', {
    dayOffset: -400,
    hour: 9,
    runs: 1,
    kind: 'reps',
    reqId: 'pg-old',
    name: '오래된기록',
  })
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length>0`,
    80,
  )
  let s = await snap(h)
  check(
    h,
    'B1. 처음 20건만 표시, 전체 건수 45건(1년 밖 기록 제외)',
    s.items.length === 20 && /전체 45건 중 20건/.test(s.text),
    `${s.items.length}`,
  )
  check(
    h,
    'B2. "더 보기"가 남은 건수 25건을 알린다',
    /더 보기\s*\(남은 25건\)/.test(s.text),
  )
  check(
    h,
    'B3. 최신순: 같은 날 저녁 → 낮 → 오전 순서, 날짜는 내림차순',
    s.items
      .slice(0, 3)
      .map((x) => x.title)
      .join() === '기록2,기록1,기록0' &&
      s.items.every((x, i) => i === 0 || x.date <= s.items[i - 1].date),
    JSON.stringify(s.items.slice(0, 4)),
  )
  // 화면에 보이는 날짜 표기(첫 3건은 어제, 다음 3건은 그저께). 앱의 날짜 문자열 해석과 무관하게 Date 연산으로 만든 값과 비교한다.
  const labels = await h.ev(
    `[...document.querySelectorAll('[data-record-item] time')].slice(0,6).map(t=>t.innerText.trim())`,
  )
  const yesterday = await h.ev(shortDateExpr(-1))
  const twoDaysAgo = await h.ev(shortDateExpr(-2))
  check(
    h,
    'B3-2. 보이는 날짜 표기: 첫 3건은 어제, 다음 3건은 그저께',
    JSON.stringify(labels) ===
      JSON.stringify([
        yesterday,
        yesterday,
        yesterday,
        twoDaysAgo,
        twoDaysAgo,
        twoDaysAgo,
      ]),
    JSON.stringify(labels),
  )
  check(h, 'B4. 1년 밖 기록은 어디에도 없다', !/오래된기록/.test(s.text))
  await mustClick(h, '^더 보기')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===40`,
    40,
  )
  s = await snap(h)
  check(
    h,
    'B5. 더 보기 → 40건("전체 45건 중 40건")',
    s.items.length === 40 && /전체 45건 중 40건/.test(s.text),
  )
  const focus1 = await h.ev(
    `(()=>{const li=document.querySelectorAll('[data-record-item]')[20];return !!li && li.contains(document.activeElement)})()`,
  )
  check(
    h,
    'B6. 더 보기 뒤 포커스가 새로 보이는 첫 기록(21번째)으로 이동',
    focus1,
  )
  // 키보드로도 누른다
  await h.ev(
    `[...document.querySelectorAll('main button')].find(b=>/더 보기/.test(b.innerText))?.focus()`,
  )
  await h.press('Enter', 'Enter', 13)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===45`,
    40,
  )
  s = await snap(h)
  check(
    h,
    'B7. 키보드(Enter)로 더 보기 → 45건, 더 보기 버튼 사라짐',
    s.items.length === 45 && !/더 보기/.test(s.text),
  )
  const focus2 = await h.ev(
    `(()=>{const li=document.querySelectorAll('[data-record-item]')[40];return !!li && li.contains(document.activeElement)})()`,
  )
  check(
    h,
    'B8. 마지막 더 보기 뒤에도 포커스가 문서 처음으로 빠지지 않는다',
    focus2,
  )
  check(h, 'B9. 가로 스크롤 없음', s.over <= 0, String(s.over))
})

// ── C. 계정 분리 · 새로고침 ──────────────────────────────────────────────────────────
await scenario('C-accounts', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'c-f1',
    name: '내기록A',
  })
  await seedRun(h, 'free', {
    dayOffset: -3,
    hour: 9,
    runs: 1,
    reqId: 'c-f2',
    name: '내기록B',
  })
  await seedRun(h, 'full', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'c-u1',
    name: '다른계정기록',
  })
  await h.seedList('free', 'mixed', 'c-today')
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length>0`,
    60,
  )
  let s = await snap(h)
  check(
    h,
    'C1. free 계정: 자기 기록 2건만(다른 계정 기록 없음)',
    s.items.length === 2 &&
      /내기록A/.test(s.text) &&
      /내기록B/.test(s.text) &&
      !/다른계정기록/.test(s.text),
    JSON.stringify(s.items),
  )
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length>0`,
    60,
  )
  s = await snap(h)
  check(
    h,
    'C2. 새로고침 후에도 같은 기록 2건',
    s.items.length === 2 && /전체 2건 중 2건/.test(s.text),
  )
  // 다른 계정으로 전환
  await h.go('/settings', 900)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(900)
  await h.login('full')
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length>0`,
    60,
  )
  s = await snap(h)
  check(
    h,
    'C3. full 계정: 자기 기록 1건만, free 계정의 기록·목록이 보이지 않는다',
    s.items.length === 1 &&
      /다른계정기록/.test(s.text) &&
      !/내기록/.test(s.text) &&
      !/이 목록으로 바로 운동 시작/.test(s.text),
    JSON.stringify(s.items),
  )
  check(
    h,
    'C4. full 계정의 오늘 영역은 빈 상태(목록 만들기)',
    /운동 목록 만들기/.test(s.text),
  )
})

// ── D. 빈 상태 · 비로그인 ────────────────────────────────────────────────────────────
await scenario('D-empty-guest', async (h) => {
  await h.goSettled(MY, 1000)
  let s = await snap(h)
  check(
    h,
    'D1. 비로그인: 로그인 안내만 보이고 W10 영역이 없다',
    /로그인 후 이용할 수 있어요/.test(s.text) &&
      !/완료한 운동 기록/.test(s.text),
  )
  await h.login('free')
  await openMy(h)
  s = await snap(h)
  check(
    h,
    'D2. 데이터 없음: 오늘 목록 만들기·기록 없음·내일 계획 없음',
    /운동 목록 만들기/.test(s.text) &&
      /아직 저장된 운동 기록이 없어요/.test(s.text) &&
      /아직 내일 계획이 없어요/.test(s.text),
  )
  check(
    h,
    'D3. 기록이 없으면 "더 보기"·건수 표시가 없다',
    !/더 보기/.test(s.text) && !/전체 \d+건/.test(s.text),
  )
})

// ── E. 조회 오류와 다시 시도 ──────────────────────────────────────────────────────────
await scenario('E-error-retry', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'e-1',
    name: '복구기록',
  })
  await h.goSettled('/records/exercise', 900)
  // 같은 페이지에서 앱 안 이동으로 W10을 연다(주입한 실패가 유지된다). 기록 조회(오늘 시작 정보 + 완료 기록)가 해제할 때까지 실패한다(개발 모드 StrictMode는 효과를 두 번 실행하므로 횟수 대신 해제로 제어한다).
  await armReadFail(h, 'workoutRecords', 99)
  await mustClick(h, '^전체 기록 보기$')
  await waitPath(h, '^/records/exercise/my$')
  await mustUntil(h, `!!document.querySelector('[role=alert]')`, 60)
  // 다른 조회(오늘 시작 정보)의 실패도 모두 일어날 때까지 조건으로 기다린다(고정 대기 없음, 못 채우면 아래 검사가 FAIL).
  await h.until(`(window.__readFail?.hits ?? 0) >= 2`, 30)
  let s = await snap(h)
  const hits = await readFailHits(h)
  check(
    h,
    'E1. 완료 기록 조회가 실패하면 오류 안내와 "다시 시도"(가짜 기록 없음)',
    /완료한 운동 기록을 불러오지 못했어요/.test(s.text) &&
      /다시 시도/.test(s.text) &&
      s.items.length === 0,
    `hits=${hits}`,
  )
  // 오류 주입이 실제로 일어났는지(앱이 workoutRecords를 읽으려다 실패한 횟수). 완료 기록 조회와 오늘 시작 정보 조회가 각각 읽는다.
  check(
    h,
    'E1-2. 주입한 읽기 실패가 실제로 일어났다(완료 기록 조회·시작 정보 조회 모두 workoutRecords를 읽었다)',
    hits >= 2,
    `hits=${hits}`,
  )
  check(
    h,
    'E2. 오류가 나도 다른 영역(내일 계획·링크)은 그대로',
    /아직 내일 계획이 없어요/.test(s.text) &&
      s.links.some((l) => /이전 운동 리스트 보기/.test(l.t)),
  )
  await disarmReadFail(h)
  await h.ev(
    `(()=>{const sec=[...document.querySelectorAll('main section')].find(x=>x.getAttribute('aria-labelledby')==='my-records-title');const b=[...sec.querySelectorAll('button')].find(b=>/다시 시도/.test(b.innerText));b.click()})()`,
  )
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===1`,
    60,
  )
  s = await snap(h)
  check(
    h,
    'E3. 다시 시도하면 기록이 나타난다',
    s.items.length === 1 && /복구기록/.test(s.text),
  )
  // "다시 시도"는 누른 순간 영역(section)으로 포커스를 옮긴다(SlotError). 영역이 다시 그려져도 그대로 남아야 하며 문서 처음(body)으로 빠지면 실패다.
  const focus = await h.ev(
    `(()=>{const sec=document.querySelector('[aria-labelledby=my-records-title]');const a=document.activeElement;return {isSection:!!sec&&a===sec,active:a?a.tagName+(a.getAttribute('aria-labelledby')?'['+a.getAttribute('aria-labelledby')+']':''):null}})()`,
  )
  check(
    h,
    'E4. 다시 시도 뒤 포커스가 완료 기록 영역(section)에 있다(body가 아니다)',
    focus.isSection,
    JSON.stringify(focus),
  )
})

// ── F. 반응형 · 키보드 · 접근성 ──────────────────────────────────────────────────────
await scenario('F-responsive', async (h) => {
  await h.login('free')
  for (let i = 0; i < 3; i++)
    await seedRun(h, 'free', {
      dayOffset: -(i + 1),
      hour: 9,
      runs: 1,
      kind: i === 0 ? 'mixed' : 'reps',
      reqId: `f-${i}`,
      name: `반응형기록${i}`,
    })
  await h.seedList('free', 'mixed', 'f-today')
  const PROBE = `(()=>{
    const w=window.innerWidth;const bad=[];
    for(const e of document.querySelectorAll('main *')){
      const r=e.getBoundingClientRect();
      if(r.width===0||r.height===0||e.closest('.sr-only')||e.classList.contains('sr-only')) continue;
      if(r.right>w+1||r.left<-1) bad.push((e.tagName)+':'+Math.round(r.left)+'~'+Math.round(r.right));
    }
    const small=[...document.querySelectorAll('main a, main button')].filter(e=>{
      const r=e.getBoundingClientRect(); const c=getComputedStyle(e);
      return r.width>0&&r.height>0&&!e.closest('.sr-only')&&c.visibility!=='hidden'&&r.height<43.5&&!e.matches('summary');
    }).map(e=>(e.innerText||'').trim().slice(0,16)+':'+Math.round(e.getBoundingClientRect().height));
    return {ov:document.documentElement.scrollWidth-w, bad:bad.slice(0,4), small:small.slice(0,6)}
  })()`
  for (const [w, hh] of [
    [320, 700],
    [375, 812],
    [390, 844],
    [768, 1024],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    await openMy(h)
    await mustUntil(
      h,
      `document.querySelectorAll('[data-record-item]').length>0`,
      60,
    )
    const p = await h.ev(PROBE)
    check(
      h,
      `F-${w}. 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.bad.length === 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
  // 320px: 맨 아래까지 내렸을 때 하단 탭이 마지막 콘텐츠를 가리지 않는다
  await h.vp(320, 700)
  await openMy(h)
  const overlap = await h.ev(`(()=>{
    window.scrollTo(0, document.documentElement.scrollHeight);
    const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]');
    const links=[...document.querySelectorAll('main a')];
    const last=links[links.length-1]; if(!nav||!last) return 'no-nav-or-link';
    const n=nav.getBoundingClientRect(), l=last.getBoundingClientRect();
    return l.bottom<=n.top+1 ? 'ok' : 'overlap '+Math.round(l.bottom)+'>'+Math.round(n.top);
  })()`)
  check(
    h,
    'F-320 하단. 마지막 링크가 하단 탭에 가려지지 않는다',
    overlap === 'ok',
    String(overlap),
  )
  // 제목 계층: h1 → h2(건너뜀 없음)
  await h.vp(390, 844)
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length>0`,
    60,
  )
  const levels = await h.ev(
    `[...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(x=>+x.tagName[1])`,
  )
  const ok =
    levels[0] === 1 && levels.every((v, i) => i === 0 || v - levels[i - 1] <= 1)
  check(
    h,
    'F-제목. 제목 계층 h1부터 건너뜀 없이 유지',
    ok,
    JSON.stringify(levels),
  )
  // 키보드: Tab으로 주요 컨트롤을 차례로 지난다. 포커스 표시가 보인다
  await h.ev(
    `document.activeElement?.blur(); document.body.focus(); window.scrollTo(0,0)`,
  )
  const seen = []
  let outlined = true
  // Tab을 누른 뒤 포커스가 body나 없음으로 빠진 횟수. 마지막 컨트롤에 닿기 전에 한 번이라도 빠지면 실패다(예전에는 조용히 건너뛰었다).
  let lost = 0
  for (let i = 0; i < 40; i++) {
    await h.press('Tab', 'Tab', 9)
    const f = await h.ev(
      `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e);return {t:(e.innerText||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().slice(0,24),o:c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0}})()`,
    )
    if (!f) {
      lost++
      continue
    }
    if (seen[seen.length - 1] !== f.t) seen.push(f.t)
    if (!f.o) outlined = false
    if (/이전 운동 리스트 보기/.test(f.t)) break
  }
  const idx = (re) => seen.findIndex((t) => re.test(t))
  // 오늘 계획 목록이 있으므로 카드의 "목록 다시 구성하기"가 W12 링크이고(하단의 중복 "새 운동 목록 만들기"는 없다), 문서 순서는
  // 이전 → 시작 → 목록 다시 구성하기 → 완료 기록 → 하단 "이전 운동 리스트 보기"다.
  check(
    h,
    'F-키보드. Tab 순서: 이전 → 운동 시작 → 목록 다시 구성하기 → 기록 자세히 보기 → 이전 운동 리스트(중간에 포커스를 잃지 않는다)',
    lost === 0 &&
      idx(/^이전$/) === 0 &&
      idx(/운동 시작/) > idx(/^이전$/) &&
      idx(/목록 다시 구성하기/) > idx(/운동 시작/) &&
      idx(/기록 자세히 보기/) > idx(/목록 다시 구성하기/) &&
      idx(/이전 운동 리스트 보기/) > idx(/기록 자세히 보기/) &&
      idx(/새 운동 목록 만들기/) === -1,
    `lost=${lost} ${JSON.stringify(seen)}`,
  )
  check(
    h,
    'F-포커스. 키보드로 지나는 모든 컨트롤에 포커스 표시(outline)가 있다',
    outlined,
  )
})

// ── G. W14 복귀 경로 · 읽기 전용 · 스키마 불변 ─────────────────────────────────────────

// W01에서 시작한 W14의 "이전"은 W01로, W10에서 시작·이어하기한 W14의 "이전"은 W10으로, 주소로 직접 연 W14는 기본(W01)으로 돌아간다.
await scenario('G1-w14-return', async (h) => {
  await h.login('free')
  await h.seedList('free', 'mixed', 'g1-today')
  // W01에서 시작 → W14 → 이전 → W01
  await h.go('/records/exercise', 150)
  await settleW01(h)
  await mustClick(h, '이 목록으로 바로 운동 시작')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  const stateFromW01 = await h.ev(`history.state?.usr ?? null`)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  await settleW01(h)
  check(
    h,
    'G1-1. W01에서 시작한 W14의 "이전" → W01(W01은 진입 경로를 넘기지 않는다)',
    (await h.path()) === '/records/exercise' && stateFromW01 === null,
    JSON.stringify(stateFromW01),
  )
  // 직접 주소로 연 W14(진행 중 세션이 있어도) → 이전 → 기본 경로(W01)
  await h.go('/records/exercise/session', 150)
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(
    h,
    'G1-2. 주소로 직접 연 W14의 "이전"은 기존 기본 경로(W01)',
    (await h.path()) === '/records/exercise',
  )
  // W10에서 이어하기(진행 중 세션) → W14 → 이전 → W10, 이어서 W14의 "이전"이 보낸 W10에서 다시 이어하기
  await openMy(h)
  await mustClick(h, '^이어서 운동하기$')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  const stateFromW10 = await h.ev(`history.state?.usr ?? null`)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  check(
    h,
    'G1-3. W10에서 이어하기한 W14의 "이전" → W10',
    (await h.path()) === MY &&
      JSON.stringify(stateFromW10) === JSON.stringify({ from: MY }),
    JSON.stringify(stateFromW10),
  )
})

await scenario('G2-w14-start-from-w10', async (h) => {
  await h.login('free')
  await h.seedList('free', 'mixed', 'g2-today')
  await openMy(h)
  await mustClick(h, '이 목록으로 바로 운동 시작')
  await waitPath(h, '^/records/exercise/session$')
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  const state = await h.ev(`history.state?.usr ?? null`)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  check(
    h,
    'G2-1. W10에서 새로 시작한 W14의 "이전" → W10',
    (await h.path()) === MY &&
      JSON.stringify(state) === JSON.stringify({ from: MY }),
    JSON.stringify(state),
  )
  // 충돌: 진행 중인 세션이 있는 상태에서 W10의 "이어서 운동하기"가 아닌 다른 경로(브라우저 새로고침)로 W14를 열면 기본 복귀
  await h.go('/records/exercise/session', 150)
  await mustUntil(h, `!!document.querySelector('#session-current-heading')`, 80)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(
    h,
    'G2-2. 주소 직접 입력으로 W14에 들어가면 W10에서 시작한 적이 있어도 기본 경로(W01)',
    (await h.path()) === '/records/exercise',
  )
})

// W10·W16·W15(읽기 전용)를 둘러보는 동안 저장소의 어떤 행도 바뀌지 않고, 스키마(버전·저장소·인덱스)도 그대로다.
await scenario('G3-readonly-schema', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 2,
    kind: 'mixed',
    reqId: 'g3-1',
    name: '읽기전용A',
  })
  await seedRun(h, 'free', {
    dayOffset: -4,
    hour: 9,
    runs: 1,
    reqId: 'g3-2',
    name: '읽기전용B',
  })
  await h.seedList('free', 'mixed', 'g3-today')
  const before = await dumpStores(h)
  const schemaBefore = await schemaInfo(h)
  check(
    h,
    'G3-1. 스키마가 기대와 같다(version 6, 저장소 9개, 인덱스 19개의 keyPath·unique·multiEntry)',
    JSON.stringify(schemaBefore) === JSON.stringify(EXPECTED_SCHEMA),
    JSON.stringify(schemaBefore).slice(0, 300),
  )
  // W10 → 기록 상세(W15 읽기 전용) → 이전 → W10 → W16 → 세트별 목표 펼치기 → 연결 기록 W15 → 이전 → W16
  await openMy(h)
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===3`,
    60,
  )
  await mustClick(h, '^기록 자세히 보기')
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settle(h)
  await mustClick(h, '^이전 운동 리스트 보기')
  await waitPath(h, '^/records/exercise/previous$')
  await mustUntil(h, `document.querySelectorAll('main article').length===2`, 60)
  await h.ev(
    `document.querySelectorAll('main article details').forEach(d=>d.open=true)`,
  )
  await mustClick(h, '^저장한 수행 기록 보기')
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/previous$')
  const after = await dumpStores(h)
  const schemaAfter = await schemaInfo(h)
  check(
    h,
    'G3-2. W10·W16·W15 읽기 전용 조회 뒤 세 저장소의 모든 행이 원본과 바이트 단위로 같다',
    after === before,
    `전 ${before.length}자 / 후 ${after.length}자`,
  )
  check(
    h,
    'G3-3. 조회 뒤에도 스키마가 그대로다(DB 버전·저장소·인덱스 불변)',
    JSON.stringify(schemaAfter) === JSON.stringify(EXPECTED_SCHEMA),
  )
})

// ── H. 조회 도중 계정이 바뀌는 경쟁(W10 완료 기록 훅 · W16 이전 목록 훅) ─────────────────────
// 이 앱의 로그인·로그아웃은 전체 페이지 이동이 아니라 인증 Context 상태(AuthProvider의 setUser) 전환이다. 그래서 같은 JS 환경에서
// "조회가 끝나기 전에 계정이 바뀌는" 상황이 생길 수 있다. 다시 로그인만 하는 시나리오(위 C)로는 이 경쟁을 만들 수 없으므로,
// 실제 앱의 훅(usePreviousLists·useCompletedRecords)을 앱과 같은 React·모듈로 하나의 컴포넌트에 올려 같은 훅 인스턴스에서 계정 id만 바꾼다.
// 조회는 IndexedDB의 쓰기 트랜잭션으로 멈춰 두었다가 계정을 바꾼 뒤에 푼다(이전 계정의 조회가 새 계정으로 바뀐 뒤에 끝난다).
await scenario('H-account-switch-race', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'h-free',
    name: '프리계정운동',
  })
  await seedRun(h, 'full', {
    dayOffset: -3,
    hour: 9,
    runs: 1,
    reqId: 'h-full',
    name: '풀계정운동',
  })
  await trackReads(h)
  // 앱이 쓰는 React와 같은 모듈을 불러온다(개발 서버가 변환한 소스에 적힌 최적화된 의존성 주소를 그대로 쓴다).
  const harness = await h.ev(`(async()=>{
    const hookSrc = await (await fetch('/src/exercise/usePreviousLists.ts')).text();
    const mainSrc = await (await fetch('/src/main.tsx')).text();
    const reactUrl = hookSrc.match(/from\\s+"([^"]*node_modules[^"]*react\\.js[^"]*)"/)?.[1];
    const domUrl = mainSrc.match(/from\\s+"([^"]*react-dom_client[^"]*)"/)?.[1];
    if (!reactUrl || !domUrl) return { ok: false, reactUrl, domUrl };
    // 최적화된 의존성은 이름 내보내기가 없고 default만 있을 수 있다.
    const reactModule = await import(reactUrl);
    const React = reactModule.useState ? reactModule : reactModule.default;
    const domModule = await import(domUrl);
    const dom = domModule.createRoot ? domModule : domModule.default;
    const prev = await import('/src/exercise/usePreviousLists.ts');
    const done = await import('/src/exercise/useCompletedRecords.ts');
    const src = await import('/src/exercise/workoutSource.ts');
    const localToday = await import('/src/exercise/workoutModel.ts');
    const today = localToday.toLocalDate(new Date());
    const log = [];
    // 대조군: 취소·계정 키 확인이 없는 단순한 조회 훅. 이 장치가 경쟁을 정말 만들어 내는지 확인하는 데만 쓴다.
    function useNaive(userId) {
      const [titles, setTitles] = React.useState([]);
      React.useEffect(() => {
        src.createWorkoutListRepository(userId).listBefore(today).then((r) => setTitles(r.items.map((l) => l.items[0].exerciseNameSnapshot)));
      }, [userId]);
      return titles;
    }
    function Probe({ userId }) {
      const p = prev.usePreviousLists(userId, today).slot;
      const c = done.useCompletedRecords(userId, today).slot;
      const naive = useNaive(userId);
      log.push({
        userId,
        prevStatus: p.status,
        prevTitles: p.status === 'ready' ? p.data.groups.flatMap((g) => g.lists.map((l) => l.title)) : [],
        doneStatus: c.status,
        doneTitles: c.status === 'ready' ? c.data.items.map((i) => i.title) : [],
        naive,
      });
      return null;
    }
    const host = document.createElement('div');
    host.id = '__race_host';
    document.body.appendChild(host);
    const root = dom.createRoot(host);
    window.__race = {
      log,
      show: (userId) => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe, { userId }))),
    };
    return { ok: true };
  })()`)
  check(
    h,
    'H0. 앱과 같은 React·훅 모듈을 불러와 시험 장치를 만들었다',
    harness.ok,
    JSON.stringify(harness),
  )
  if (!harness.ok) return

  // 순서(저장소 멈춤은 먼저 만든 것부터 풀린다):
  //   멈춤 1 → free 화면(조회 요청) → 멈춤 2 → 계정을 full로 전환(조회 요청, 멈춤 2 뒤에 대기)
  //   → 멈춤 1을 푼다 = free의 조회만 끝나고 full의 조회는 아직 진행 중인 순간 → 그 순간의 화면 확인 → 멈춤 2를 푼다.
  await holdReads(h, 'first')
  await h.ev(`window.__race.show('free')`)
  // 이전 계정(free)의 조회가 저장소에 요청되어 멈춰 있는지 확인한다.
  await mustUntil(
    h,
    `(window.__reads ?? []).filter((r) => r.owner === 'free').length >= 3`,
    60,
  )
  await holdReads(h, 'second')
  const switchedAt = await h.ev(`performance.now()`)
  await h.ev(`window.__race.show('full')`)
  await mustUntil(
    h,
    `(window.__reads ?? []).filter((r) => r.owner === 'full').length >= 3`,
    60,
  )
  const freeStalled = (await readsLog(h)).filter((r) => r.owner === 'free')
  check(
    h,
    'H1. 계정을 바꾸는 순간 이전 계정(free)의 조회는 아직 끝나지 않았다(조회 도중 전환)',
    freeStalled.length >= 3 && freeStalled.every((r) => r.doneAt === null),
    JSON.stringify(freeStalled),
  )
  const releasedAt = await h.ev(`performance.now()`)
  await releaseReads(h, 'first')
  // 전환 전에 요청한 free의 조회가 모두 끝날 때까지 기다린다(그 뒤에 만들어지는 조회는 멈춤 2에 막혀 있다).
  await mustUntil(
    h,
    `(window.__reads ?? []).filter((r) => r.owner === 'free' && r.calledAt < ${switchedAt}).every((r) => r.doneAt !== null)`,
    60,
  )
  // 이전 계정의 결과가 반영될 시간을 준다: 화면이 두 번 그려지도록 프레임 두 개를 기다린다(고정 대기가 아니라 렌더 확정).
  await h.ev(
    `new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true))))`,
  )
  const midReads = await readsLog(h)
  const midLog = await h.ev(`window.__race.log.at(-1)`)
  const fullPending = midReads.filter(
    (r) => r.owner === 'full' && r.calledAt < releasedAt,
  )
  check(
    h,
    'H2. 이전 계정(free)의 조회는 계정을 바꾼 뒤에 끝났고, 그 순간 새 계정(full)의 조회는 아직 진행 중이다',
    fullPending.length >= 3 &&
      fullPending.every((r) => r.doneAt === null) &&
      midReads
        .filter((r) => r.owner === 'free' && r.calledAt < switchedAt)
        .every((r) => r.doneAt > releasedAt && r.doneAt > switchedAt),
    JSON.stringify({ switchedAt, releasedAt, midReads }),
  )
  check(
    h,
    'H2-2. 그 순간(free 결과 도착, full 조회 중) 화면은 full의 "불러오는 중"이고 free의 값이 없다',
    midLog.userId === 'full' &&
      midLog.prevStatus === 'loading' &&
      midLog.doneStatus === 'loading' &&
      midLog.prevTitles.length === 0 &&
      midLog.doneTitles.length === 0,
    JSON.stringify(midLog),
  )
  await releaseReads(h, 'second')
  // 새 계정의 조회가 모두 끝나고 화면 상태가 반영될 때까지 조건으로 기다린다.
  await mustUntil(
    h,
    `(window.__reads ?? []).every((r) => r.doneAt !== null) && (()=>{const l = window.__race.log.at(-1); return l.userId==='full' && l.prevStatus==='ready' && l.doneStatus==='ready' && l.naive.length>0 && l.naive.every((t) => !/프리계정/.test(t))})()`,
    80,
  )
  const log = await h.ev(`window.__race.log`)
  const asFull = log.filter((l) => l.userId === 'full')
  const leakedHook = asFull.filter((l) =>
    [...l.prevTitles, ...l.doneTitles].some((t) => /프리계정/.test(t)),
  )
  check(
    h,
    'H3. 새 계정(full) 화면의 어떤 렌더에도 이전 계정(free)의 W16 목록·W10 완료 기록이 나타나지 않는다',
    asFull.length > 0 && leakedHook.length === 0,
    JSON.stringify(leakedHook.slice(0, 2)),
  )
  const last = log.at(-1)
  check(
    h,
    'H4. 조회가 모두 끝난 뒤 full 계정에는 자기 목록·기록만 있다(W16: 풀계정운동, W10: 풀계정운동)',
    last.userId === 'full' &&
      JSON.stringify(last.prevTitles) === JSON.stringify(['풀계정운동']) &&
      JSON.stringify(last.doneTitles) === JSON.stringify(['풀계정운동']),
    JSON.stringify(last),
  )
  // 대조군: 방어가 없는 훅은 같은 장치에서 이전 계정의 값이 새 계정 화면에 나타난다(장치가 경쟁을 실제로 만든다는 증거).
  const leakedNaive = asFull.filter((l) =>
    l.naive.some((t) => /프리계정/.test(t)),
  )
  check(
    h,
    'H5. 대조군(취소·계정 확인이 없는 훅)은 이 장치에서 이전 계정의 값이 새 계정 화면에 나타난다(시험 장치 유효성)',
    leakedNaive.length > 0,
    `렌더 ${asFull.length}건 중 ${leakedNaive.length}건`,
  )
})
