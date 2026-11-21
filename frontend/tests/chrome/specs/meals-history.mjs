// [chrome 회귀] FAST-04: 식단 리스트(D03) · 이전 식단 상세(D03-1) · D01 연결 · P07 음식 즐겨찾기 탭
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only meals-history`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 기록은 앱과 같은 저장소 코드를 페이지 안에서 불러 만들고(날짜는 오늘 기준 오프셋), 기대값은 Date 연산과
// 개발용 예시 음식(스토리보드 foodDB)의 100g 값에서 손으로 계산한다(현미밥 153kcal, 닭가슴살 165kcal, 그린 샐러드 35kcal). 앱 소스를 수정하지 않는다.
import { start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  dumpStores,
  mustClick,
  mustUntil as baseUntil,
  schemaInfo,
  settleScreen as baseSettle,
  waitPath as basePath,
} from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const mustUntil = (h, expr, n = 80) => baseUntil(h, expr, n * 2)
const waitPath = (h, re, n = 80) => basePath(h, re, n * 2)
const j = JSON.stringify
// 새 프로필의 첫 화면은 개발 서버가 모듈을 받느라 오래 걸릴 수 있어 화면 안정 대기 한도를 늘린다(조건이 맞으면 바로 넘어간다).
const settleScreen = (h, o) => baseSettle(h, { timeoutMs: 40000, ...o })

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

const PRE = `
  const m = await import('/src/food/local/indexedDbMealRepository.ts');
  const fd = await import('/src/food/dev/devFoodSamples.ts');
  const wm = await import('/src/exercise/workoutModel.ts');
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return wm.toLocalDate(x) };
`
const run = (h, body) => h.ev(`(async()=>{ ${PRE} ${body} })()`)

const pad = (n) => String(n).padStart(2, '0')
/** 오늘에서 n일 전의 로컬 날짜(YYYY-MM-DD). 앱의 toLocalDate와 같은 규칙이다. */
const day = (n) => {
  const x = new Date()
  x.setDate(x.getDate() - n)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
/** 오늘이 이번 주(월~일)의 몇 번째 날인지(0=월). */
const weekIndex = () => (new Date().getDay() + 6) % 7
/** 월요일이 속한 달 기준 "YYYY년 M월 N주차". offsetDays는 오늘 기준 이동 일수(음수=과거). */
const weekLabelOf = (offsetDays) => {
  const x = new Date()
  x.setDate(x.getDate() + offsetDays)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${Math.ceil(x.getDate() / 7)}주차`
}
const dateTextOf = (n) => {
  const x = new Date()
  x.setDate(x.getDate() - n)
  return `${x.getMonth() + 1}월 ${x.getDate()}일 (${'월화수목금토일'[(x.getDay() + 6) % 7]})`
}

const clickSel = (h, sel) =>
  h.ev(
    `(()=>{const e=document.querySelector(${j(sel)});if(!e)return false;e.click();return true})()`,
  )
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    return {
      path:location.pathname+location.search,
      h1:[...m.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links:[...m.querySelectorAll('a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')})),
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    }})()`)
const waitH1 = (h, text) =>
  mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()===${j(text)}`,
    80,
  )
const waitText = (h, re) =>
  mustUntil(h, `${re}.test(document.querySelector('main').innerText)`, 80)
const logout = async (h) => {
  await h.ev(`sessionStorage.clear()`)
  await h.go('/home', 900)
}
const mealRows = async (h) => JSON.parse(await dumpStores(h)).mealRecords
const exerciseRows = async (h) => {
  const all = JSON.parse(await dumpStores(h))
  return j({
    workoutLists: all.workoutLists,
    workoutRecords: all.workoutRecords,
    workoutSessions: all.workoutSessions,
    workoutRoutines: all.workoutRoutines,
  })
}

/** free 계정: 오늘(카페라테)·어제(현미밥 보통+닭가슴살 많이)·3일 전(그린 샐러드)·9일 전(현미밥). full 계정: 어제(그린 샐러드). */
const SEED = `
  const free = m.createIndexedDbMealRecordRepository('free');
  const full = m.createIndexedDbMealRecordRepository('full');
  const F = fd.DEV_FOODS;
  await free.create({ requestId: 's-today', localDate: day(0), mealType: 'breakfast', food: F[3], portion: 'normal' });
  await free.create({ requestId: 's-y-1', localDate: day(1), mealType: 'breakfast', food: F[0], portion: 'normal' });
  await free.create({ requestId: 's-y-2', localDate: day(1), mealType: 'lunch', food: F[1], portion: 'more' });
  await free.create({ requestId: 's-3', localDate: day(3), mealType: 'dinner', food: F[2], portion: 'normal' });
  await free.create({ requestId: 's-9', localDate: day(9), mealType: 'lunch', food: F[0], portion: 'normal' });
  await full.create({ requestId: 's-full', localDate: day(1), mealType: 'dinner', food: F[2], portion: 'less' });
  return true;
`

await scenario('C-history', async (h) => {
  await h.login('free')
  await run(h, SEED)
  const exBefore = await exerciseRows(h)
  const mealBefore = JSON.stringify(await mealRows(h))
  const idx = weekIndex()
  const inWeek = [0, 1, 3, 9].filter((o) => o <= idx).length

  // D01: 기록한 날 수(내 계정만)와 D03 링크
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/기록한 날 4일/')
  const d01 = await snap(h)
  check(
    h,
    'H1. D01: 내 식단 리스트에 기록한 날 4일(다른 계정 기록은 세지 않음)과 "식단 리스트 보기" 링크가 있고 준비 중 표시는 없다',
    /기록한 날 4일/.test(d01.text) &&
      d01.links.some((l) => l.h === '/records/meal/list') &&
      d01.links.some((l) => l.h === '/favorites?tab=food') &&
      !(await h.ev(
        `/준비 중/.test(document.querySelector('[role=group][aria-label="내 식단 리스트"]').innerText)`,
      )) &&
      d01.links.some((l) => l.h === '/records/meal/plan') &&
      !(await h.ev(
        `/준비 중/.test(document.querySelector('[role=group][aria-label="내일 식단 계획"]').innerText)`,
      )),
    d01.text.slice(0, 200),
  )
  check(
    h,
    'H2. D01 오늘 합계는 오늘 기록(카페라테 60kcal)만 쓴다(어제 기록이 섞이지 않음)',
    (await h.ev(`document.querySelector('[data-today-kcal]')?.innerText`)) ===
      '60kcal',
  )

  // D01 → D03
  await mustClick(h, '식단 리스트 보기')
  await settleScreen(h, { path: '/records/meal/list', h1: '식단 리스트' })
  await mustUntil(h, `!!document.querySelector('[data-week-label]')`)
  const d03 = await snap(h)
  check(
    h,
    'H3. D03: 오늘이 속한 주(주차 라벨·월~일 7칸)와 오늘 날짜가 선택된 채 시작하고 오늘 카드에 카페라테가 있다',
    (await h.ev(`document.querySelector('[data-week-label]').innerText`)) ===
      weekLabelOf(0) &&
      (await h.ev(`document.querySelectorAll('[data-day]').length`)) === 7 &&
      (await h.ev(
        `document.querySelector('button[data-day="${day(0)}"]').getAttribute('aria-pressed')`,
      )) === 'true' &&
      /카페라테/.test(d03.text) &&
      d03.links.some((l) => l.h === '/records/meal/record'),
    d03.text.slice(0, 200),
  )
  check(
    h,
    `H4. D03 주간 요약: 이번 주 기록한 날 ${inWeek}일, 다음 주 버튼 비활성, 미래 요일 비활성`,
    (
      await h.ev(`document.querySelector('[data-week-summary]').innerText`)
    ).startsWith(`기록한 날 ${inWeek}일`) &&
      (await h.ev(
        `document.querySelector('button[aria-label="다음 주"]').getAttribute('aria-disabled')`,
      )) === 'true' &&
      (await h.ev(
        `[...document.querySelectorAll('[data-day]')].filter(b=>b.getAttribute('data-day')>'${day(0)}').every(b=>b.getAttribute('aria-disabled')==='true')`,
      )),
  )

  // 이전 주 / 다음 주: 같은 요일 유지
  await clickSel(h, 'button[aria-label="이전 주"]')
  await mustUntil(
    h,
    `document.querySelector('[data-week-label]').innerText===${j(weekLabelOf(-7))}`,
  )
  check(
    h,
    'H5. 이전 주로 이동하면 주차 라벨이 바뀌고 같은 요일(7일 전)이 선택된다',
    (await h.ev(
      `document.querySelector('button[data-day="${day(7)}"]').getAttribute('aria-pressed')`,
    )) === 'true' && /\?date=/.test(await h.path()),
    await h.path(),
  )
  await clickSel(h, 'button[aria-label="다음 주"]')
  await mustUntil(
    h,
    `document.querySelector('[data-week-label]').innerText===${j(weekLabelOf(0))}`,
  )
  check(
    h,
    'H6. 다음 주로 돌아오면 미래가 되는 날짜는 오늘로 보정된다(주소에서 date 제거)',
    (await h.path()) === '/records/meal/list' &&
      (await h.ev(
        `document.querySelector('button[data-day="${day(0)}"]').getAttribute('aria-pressed')`,
      )) === 'true',
    await h.path(),
  )

  // 기록 없는 날 / 지난 날 카드
  await h.go(`/records/meal/list?date=${day(2)}`, 300)
  await waitText(h, '/이 날은 기록한 식단이 없어요/')
  check(
    h,
    'H7. 기록 없는 지난 날은 "이 날은 기록한 식단이 없어요"이고 D03-1 링크·D02 버튼이 없다',
    !(await h.ev(`!!document.querySelector('a[data-day-card]')`)) &&
      !(await snap(h)).links.some((l) => l.h === '/records/meal/record'),
  )
  await h.go(`/records/meal/list?date=${day(1)}`, 300)
  await mustUntil(h, `!!document.querySelector('a[data-day-card]')`)
  const yesterday = await snap(h)
  check(
    h,
    'H8. 기록 있는 지난 날(어제): 카드 전체가 D03-1 링크이고 총 401kcal(153+247.5)·끼니별 음식(현미밥·닭가슴살)·저녁 "기록 없음"을 보인다',
    yesterday.links.some((l) => l.h === `/records/meal/previous/${day(1)}`) &&
      (await h.ev(`document.querySelector('[data-day-kcal]').innerText`)) ===
        '401kcal' &&
      /현미밥/.test(yesterday.text) &&
      /닭가슴살/.test(yesterday.text) &&
      (await h.ev(
        `/기록 없음/.test(document.querySelector('[data-meal-row=dinner]').innerText)`,
      )) &&
      !!(await h.ev(`!!document.querySelector('[data-macro-share]')`)),
    yesterday.text.slice(0, 200),
  )
  check(
    h,
    'H9. 잘못된·미래 날짜(?date=)는 오늘이 선택된 화면으로 열린다',
    await (async () => {
      await h.go('/records/meal/list?date=2999-01-01', 300)
      await mustUntil(h, `!!document.querySelector('[data-week-label]')`)
      return (
        (await h.ev(
          `document.querySelector('button[data-day="${day(0)}"]').getAttribute('aria-pressed')`,
        )) === 'true'
      )
    })(),
  )

  // D03 → D03-1
  await h.go(`/records/meal/list?date=${day(1)}`, 300)
  await mustUntil(h, `!!document.querySelector('a[data-day-card]')`)
  await clickSel(h, 'a[data-day-card]')
  await waitPath(h, `^/records/meal/previous/${day(1)}$`)
  await waitH1(h, `${dateTextOf(1)} 식단`)
  await mustUntil(h, `!!document.querySelector('[data-day-kcal]')`)
  const prev = await snap(h)
  check(
    h,
    'H10. D03-1: 지난 식단 배지·날짜 제목·하루 총 401kcal·탄단지 막대를 보이고 기본은 아침(현미밥)이다',
    /지난 식단/.test(prev.text) &&
      (await h.ev(`document.querySelector('[data-day-kcal]').innerText`)) ===
        '401kcal' &&
      !!(await h.ev(`!!document.querySelector('[data-macro-share]')`)) &&
      (await h.ev(
        `document.querySelector('#prev-meal-breakfast').getAttribute('aria-checked')`,
      )) === 'true' &&
      (await h.ev(`document.querySelectorAll('[data-meal-record]').length`)) ===
        1 &&
      /현미밥/.test(prev.text) &&
      /보통\(1인분\) · 100g/.test(prev.text),
    prev.text.slice(0, 220),
  )
  check(
    h,
    'H11. D03-1은 읽기 전용이다(수정·삭제 버튼, D02 수정 링크 없음)',
    !/수정|삭제/.test(prev.text) && !prev.links.some((l) => /edit=/.test(l.h)),
  )
  check(
    h,
    'H12. 이전 기록(3일 전)은 링크이고 다음 기록은 없다(오늘은 지난 기록이 아니다)',
    prev.links.some((l) => l.h === `/records/meal/previous/${day(3)}`) &&
      !/다음 기록/.test(prev.text),
    j(prev.links),
  )

  // 끼니 전환 + 그래프 슬라이드
  await mustClick(h, '^점심')
  await mustUntil(
    h,
    `[...document.querySelectorAll('[data-meal-record]')].some(e=>/닭가슴살/.test(e.innerText)&&/많이 · 150g/.test(e.innerText)&&/248kcal/.test(e.innerText))`,
  )
  check(
    h,
    'H13. 점심을 고르면 닭가슴살(많이·150g·248kcal)만 보이고 주소에 meal=lunch가 남는다',
    /meal=lunch/.test(await h.path()) &&
      (await h.ev(`document.querySelectorAll('[data-meal-record]').length`)) ===
        1,
    await h.path(),
  )
  await clickSel(h, 'button[aria-label="다음 그래프"]')
  await mustUntil(h, `!!document.querySelector('[data-meal-pie]')`)
  const pie = await h.ev(`document.querySelector('[data-meal-pie]').innerText`)
  check(
    h,
    'H14. 둘째 그래프(끼니별 열량 비율)는 아침 38%·점심 62%를 글자로 보인다(합 100)',
    /아침[\s\S]*38%/.test(pie) && /점심[\s\S]*62%/.test(pie),
    pie.replace(/\s+/g, ' '),
  )
  await clickSel(h, 'button[aria-label="이전 그래프"]')
  await mustUntil(h, `!!document.querySelector('[data-macro-share]')`)

  // 이전 기록으로 이동: 끼니(점심) 유지, 3일 전 점심은 없다
  await mustClick(h, '이전 기록')
  await waitPath(h, `^/records/meal/previous/${day(3)}$`)
  await waitH1(h, `${dateTextOf(3)} 식단`)
  await waitText(h, '/이 끼니는 기록하지 않았어요/')
  check(
    h,
    'H15. 이전 기록(3일 전)으로 가도 고른 끼니(점심)가 유지되고 그 끼니가 비어 있으면 "이 끼니는 기록하지 않았어요"다',
    /meal=lunch/.test(await h.path()),
    await h.path(),
  )
  await mustClick(h, '^저녁')
  await mustUntil(
    h,
    `[...document.querySelectorAll('[data-meal-record]')].some(e=>/그린 샐러드/.test(e.innerText)&&/35kcal/.test(e.innerText))`,
  )
  check(h, 'H16. 저녁을 고르면 그린 샐러드(35kcal)가 보인다', true)
  const older = await snap(h)
  check(
    h,
    'H17. 3일 전에는 이전 기록(9일 전)과 다음 기록(어제) 링크가 모두 있다',
    older.links.some((l) =>
      l.h.startsWith(`/records/meal/previous/${day(9)}`),
    ) &&
      older.links.some((l) =>
        l.h.startsWith(`/records/meal/previous/${day(1)}`),
      ),
    j(older.links),
  )

  // 뒤로가기: D03(이 날짜 유지)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/meal/list$')
  await mustUntil(h, `!!document.querySelector('[data-week-label]')`)
  check(
    h,
    'H18. D03-1의 "이전"은 D03으로 돌아가며 보던 날짜(3일 전)가 선택되어 있다',
    (await h.path()) === `/records/meal/list?date=${day(3)}` ||
      (await h.ev(
        `document.querySelector('button[data-day="${day(3)}"]')?.getAttribute('aria-pressed')`,
      )) === 'true',
    await h.path(),
  )

  // 날짜 없이 열기 / 지난 날짜가 아닌 날짜
  await h.go('/records/meal/previous', 300)
  await waitH1(h, `${dateTextOf(1)} 식단`)
  check(
    h,
    'H19. 날짜 없이 열면 가장 최근 지난 기록(어제)을 연다',
    (await h.ev(`document.querySelector('[data-day-kcal]').innerText`)) ===
      '401kcal',
  )
  await h.go(`/records/meal/previous/${day(0)}`, 300)
  await waitText(h, '/지난 날짜의 식단만 볼 수 있어요/')
  await h.go('/records/meal/previous/abc', 300)
  await waitText(h, '/지난 날짜의 식단만 볼 수 있어요/')
  check(
    h,
    'H20. 오늘·올바르지 않은 날짜 주소는 안내하고 기록을 보여 주지 않는다',
    true,
  )
  const s390 = await snap(h)
  check(
    h,
    'H21. 390px 폭에서 가로 넘침이 없다',
    s390.over <= 0,
    String(s390.over),
  )

  // 계정 격리
  await logout(h)
  await h.login('full')
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/기록한 날 1일/')
  await h.go(`/records/meal/list?date=${day(1)}`, 300)
  await mustUntil(h, `!!document.querySelector('a[data-day-card]')`)
  const other = await snap(h)
  check(
    h,
    'H22. 다른 계정(full): 기록한 날 1일, 어제 카드에는 자기 기록(그린 샐러드)만 있고 free의 현미밥·닭가슴살은 없다',
    /그린 샐러드/.test(other.text) && !/현미밥|닭가슴살/.test(other.text),
    other.text.slice(0, 200),
  )
  await h.go(`/records/meal/previous/${day(3)}`, 300)
  await mustUntil(
    h,
    `/이 날은 기록한 식단이 없어요/.test(document.querySelector('main').innerText)`,
  )
  check(
    h,
    'H23. 다른 계정의 D03-1에서는 free의 3일 전 기록이 보이지 않는다',
    true,
  )

  // 기존 데이터 보존
  check(
    h,
    'H24. 조회만 했으므로 식단 기록(6건)·운동 저장소의 모든 행이 그대로이고 스키마도 v6이다',
    JSON.stringify(await mealRows(h)) === mealBefore &&
      (await mealRows(h)).length === 6 &&
      (await exerciseRows(h)) === exBefore &&
      j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
  )
})

await scenario('C-empty', async (h) => {
  await h.login('free')
  await h.go('/records/meal/list', 300)
  await settleScreen(h, { path: '/records/meal/list', h1: '식단 리스트' })
  await waitText(h, '/아직 등록된 식단이 없어요/')
  const s = await snap(h)
  check(
    h,
    'H25. 등록된 식단이 하나도 없으면 주간 선택을 숨기고 "식단 등록하기"(D02)를 안내한다',
    !(await h.ev(`!!document.querySelector('[data-day]')`)) &&
      s.links.some(
        (l) => l.h === '/records/meal/record' && /식단 등록하기/.test(l.t),
      ),
    s.text.slice(0, 160),
  )
  await h.go('/records/meal/previous', 300)
  await waitText(h, '/지난 기록이 없어요/')
  check(
    h,
    'H26. 지난 기록이 없을 때 D03-1은 빈 상태와 "식단 기록하기"를 안내한다',
    (await snap(h)).links.some((l) => l.h === '/records/meal/record'),
  )
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/기록한 날 0일/')
  check(h, 'H27. D01은 기록한 날 0일이다', true)
})

await scenario('C-favorites', async (h) => {
  await h.login('free')
  // P07 음식 탭: 비어 있음
  await h.go('/favorites?tab=food', 300)
  await waitH1(h, '즐겨찾기')
  await waitText(h, '/즐겨찾기한 음식이 없어요/')
  check(
    h,
    'H28. P07 음식 탭: 즐겨찾기한 음식이 없으면 안내와 "음식 찾아보기"(F01) 링크를 보인다',
    (await snap(h)).links.some((l) => l.h === '/foods'),
  )
  // F01에서 두 음식을 즐겨찾기
  await h.go('/foods', 300)
  await waitH1(h, '음식 검색')
  await mustClick(h, '^검색하기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-item]').length===4`)
  for (const nth of [1, 2]) {
    const star = `[data-food-item]:nth-child(${nth}) button[data-food-favorite]`
    await mustUntil(
      h,
      `document.querySelector(${j(star)})?.getAttribute('aria-disabled')!=='true'`,
    )
    await clickSel(h, star)
    await mustUntil(
      h,
      `document.querySelector(${j(star)})?.getAttribute('aria-pressed')==='true'`,
    )
  }
  await h.go('/favorites?tab=food', 300)
  await waitH1(h, '즐겨찾기')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-food]').length===2`,
  )
  const fav = await snap(h)
  check(
    h,
    'H29. P07 음식 탭: 즐겨찾기한 현미밥·닭가슴살이 이름·분류·1인분 열량(153·165kcal)으로 보이고 탭에 개수 2가 있다',
    /한식 · 1인분 153kcal/.test(fav.text) &&
      /한식 · 1인분 165kcal/.test(fav.text) &&
      (
        await h.ev(
          `document.querySelector('#favorites-tab-food').innerText.replace(/\\s+/g,' ')`,
        )
      ).includes('2'),
    fav.text.slice(0, 220),
  )
  check(
    h,
    'H30. 이름은 F02, "기록하기"는 해당 음식이 선택된 D02 링크다',
    fav.links.some((l) => l.h === '/foods/dev-food-1') &&
      fav.links.some((l) => l.h === '/records/meal/record?food=dev-food-1') &&
      fav.links.some((l) => l.h === '/records/meal/record?food=dev-food-2'),
    j(fav.links),
  )

  // 기록하기 → D02 양 선택 팝업 → 이전으로 돌아오면 P07
  await clickSel(h, 'a[href="/records/meal/record?food=dev-food-2"]')
  await waitPath(h, '^/records/meal/record$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  check(
    h,
    'H31. 기록하기: D02가 열리고 닭가슴살 양 선택 팝업이 바로 열린다',
    /닭가슴살/.test(
      await h.ev(`document.querySelector('[role=dialog]').innerText`),
    ),
  )
  await mustClick(h, '^취소$', '[role=dialog]')
  await mustUntil(h, `!document.querySelector('[role=dialog]')`)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/favorites$')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-food]').length===2`,
  )
  check(
    h,
    'H32. D02의 "이전"은 P07 음식 탭으로 돌아온다(주소의 탭 유지)',
    /tab=food/.test(await h.path()),
    await h.path(),
  )

  // 해제
  await clickSel(h, 'button[aria-label="즐겨찾기 해제: 닭가슴살"]')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-food]').length===1`,
  )
  const keys = await h.ev(
    `Object.keys(localStorage).filter(k=>/foodFavorite/.test(k))`,
  )
  const stored = await h.ev(`localStorage.getItem(${j(keys[0])})`)
  check(
    h,
    'H33. 별을 누르면 닭가슴살이 목록에서 빠지고 저장소에서도 해제된다(현미밥은 유지)',
    keys.length === 1 &&
      stored.includes('dev-food-1') &&
      !stored.includes('dev-food-2'),
    stored,
  )
  check(
    h,
    'H34. 해제는 F02·D02와 같은 상태다(F02에서 닭가슴살은 즐겨찾기 아님, 현미밥은 즐겨찾기)',
    await (async () => {
      await h.go('/foods/dev-food-2', 300)
      await waitH1(h, '닭가슴살')
      await mustUntil(
        h,
        `document.querySelector('main header button[data-food-favorite]')?.getAttribute('aria-pressed')==='false'`,
      )
      await h.go('/foods/dev-food-1', 300)
      await waitH1(h, '현미밥')
      await mustUntil(
        h,
        `document.querySelector('main header button[data-food-favorite]')?.getAttribute('aria-pressed')==='true'`,
      )
      return true
    })(),
  )

  // D01 → P07 → 이전
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustClick(h, '즐겨찾기 보기')
  await waitPath(h, '^/favorites$')
  await waitH1(h, '즐겨찾기')
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/meal$')
  check(
    h,
    'H35. D01의 "즐겨찾기 보기"로 간 P07에서 "이전"은 식단 대시보드로 돌아온다',
    true,
  )

  // 운동 탭은 그대로
  await h.go('/favorites', 300)
  await waitH1(h, '즐겨찾기')
  await waitText(h, '/즐겨찾기한 운동이 없어요/')
  check(
    h,
    'H36. 운동 탭은 그대로 동작한다(음식 즐겨찾기가 운동 즐겨찾기로 섞이지 않음: 운동 즐겨찾기 없음)',
    await h.ev(
      `/즐겨찾기한 운동이 없어요/.test(document.querySelector('main').innerText)`,
    ),
  )

  // 계정 격리
  await logout(h)
  await h.login('full')
  await h.go('/favorites?tab=food', 300)
  await waitH1(h, '즐겨찾기')
  await waitText(h, '/즐겨찾기한 음식이 없어요/')
  check(
    h,
    'H37. 다른 계정(full)의 P07 음식 탭은 비어 있다(계정별 분리)',
    !(await h.ev(`!!document.querySelector('[data-favorite-food]')`)),
  )
})
