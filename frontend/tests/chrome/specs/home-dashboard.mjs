// [chrome 회귀] 로그인 홈(H01) 대시보드: 구성 순서(이번 주 나의 활동 → 빠른 실행 → 오늘의 기록 → 최근 활동) · 오늘의 추천·검색 튜토리얼 제거 ·
// 주간 집계(월~일·기록일·요일별 상태) · 최근 활동 3건과 상세 이동 · 읽는 중·조회 실패(0일 아님) · 계정 전환 · 조회 비중복 ·
// 비회원 랜딩의 검색 튜토리얼 · 키·몸무게 카드 우선 · 390/320/195/160px 레이아웃
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only home-dashboard`. 상세: tests/chrome/README.md
// 개발 서버의 개발용 모의 계정과 이 브라우저(시나리오마다 새 프로필)의 IndexedDB만 쓴다. 기록은 앱과 같은 저장소 코드로 시드한다(UI를 거치지 않는 시드).
// 운영 빌드에는 저장소가 없어 이 스크립트를 쓸 수 없다(운영 환경은 Node 테스트가 확인한다).
import { start } from '../lib/session.mjs'
import {
  holdReads,
  mustUntil,
  releaseReads,
  seedRun,
  waitPath,
} from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const q = (s) => JSON.stringify(s)

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

const seedProfile = (h, id) =>
  h.ev(`(async()=>{
    const b = await import('/src/body-measurements/bodySource.ts')
    await b.createBodyRepository(${q(id)}).save({ heightCm: 170, weightKg: 65 })
    return true
  })()`)

const seedMeal = (h, id, offset, reqId, type = 'lunch') =>
  h.ev(`(async()=>{
    const m = await import('/src/food/local/indexedDbMealRepository.ts')
    const fd = await import('/src/food/dev/devFoodSamples.ts')
    const wm = await import('/src/exercise/workoutModel.ts')
    const x = new Date(); x.setDate(x.getDate() + ${offset})
    await m.createIndexedDbMealRecordRepository(${q(id)}).create({
      requestId: ${q(reqId)}, localDate: wm.toLocalDate(x), mealType: ${q(type)}, food: fd.DEV_FOODS[0], portion: 'normal',
    })
    return true
  })()`)

const seedExercise = (h, id, dayOffset, reqId) =>
  seedRun(h, id, { dayOffset, runs: 1, reqId })

/** 이번 주(월~일) 범위와 오늘. 앱과 같은 계산(dashboardWeek)을 쓴다. */
const weekInfo = (h) =>
  h.ev(`(async()=>{
    const wm = await import('/src/exercise/workoutModel.ts')
    const sel = await import('/src/exercise/dashboardSelectors.ts')
    const today = wm.toLocalDate(new Date())
    const w = sel.dashboardWeek(today)
    const off = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return wm.toLocalDate(x) }
    return { today, from: w.from, to: w.to, off: [0,-1,-2,-8].map(off) }
  })()`)

const openHome = async (h) => {
  await h.go('/home', 300)
  await mustUntil(h, `!!document.querySelector('[data-home-weekly]')`, 100)
}
const settled = (h) =>
  mustUntil(
    h,
    `(()=>{const w=document.querySelector('[data-home-weekly]');return !!w && !w.querySelector('.animate-pulse') && !document.querySelector('[data-home-recent] .animate-pulse')})()`,
    120,
  )
const h2s = (h) =>
  h.ev(
    `[...document.querySelectorAll('main h2')].map((e) => e.innerText.trim())`,
  )
const stat = (h, label) =>
  h.ev(`(()=>{
    const dt = [...document.querySelectorAll('[data-home-weekly] dt')].find((e) => e.innerText.includes(${q(label)}))
    return dt ? dt.parentElement.innerText.replace(/\\s+/g, ' ').trim() : null
  })()`)
const recentItems = (h) =>
  h.ev(`[...document.querySelectorAll('[data-recent-kind]')].map((a) => ({
    kind: a.getAttribute('data-recent-kind'),
    href: a.getAttribute('href'),
    text: a.innerText.replace(/\\s+/g, ' ').trim(),
  }))`)
const backHref = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].find((a)=>/^이전/.test(a.innerText.trim()))?.getAttribute('href') ?? null`,
  )

await scenario('A-structure', async (h) => {
  await h.login('free')
  // 키·몸무게가 없으면 필수 안내 카드가 이번 주 나의 활동보다 먼저다.
  await openHome(h)
  await h.sleep(600)
  const order = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const card = [...main.querySelectorAll('h2')].find((e) => /키와 몸무게/.test(e.innerText))
    const week = main.querySelector('[data-home-weekly]')
    return card && week ? !!(card.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING) : null
  })()`)
  check(
    h,
    'A0. 키·몸무게 미등록: 필수 안내 카드가 이번 주 나의 활동보다 먼저 보인다',
    order === true,
    String(order),
  )
  await seedProfile(h, 'free')
  await openHome(h)
  await settled(h)
  const titles = await h2s(h)
  check(
    h,
    'A1. 홈 구성 순서: 이번 주 나의 활동 → 빠른 실행 → 오늘의 기록 → 최근 활동',
    titles.slice(0, 4).join('|') ===
      '이번 주 나의 활동|빠른 실행|오늘의 기록|최근 활동',
    titles.join('|'),
  )
  check(
    h,
    'A2. 이번 주 나의 활동이 인사 바로 다음(최상단 핵심 카드)이다',
    await h.ev(`(()=>{
      const main = document.querySelector('main')
      const first = [...main.children[0].children].filter((e) => e.matches('section,div'))
      return !!main.querySelector('[data-home-weekly]') && main.querySelector('[data-home-weekly]').getBoundingClientRect().top < main.querySelector('[data-home-shortcuts]').getBoundingClientRect().top
    })()`),
  )
  check(
    h,
    'A3. 오늘의 추천과 검색 튜토리얼(처음이라면 여기부터)이 없다',
    !(await h.has('오늘의 추천')) &&
      !(await h.has('처음이라면 여기부터')) &&
      !(await h.has('운동 탐색 시작하기')) &&
      !(await h.has('음식 검색 시작하기')) &&
      (await h.ev(`!document.querySelector('[data-recommendation]')`)),
  )
  const shortcuts =
    await h.ev(`[...document.querySelectorAll('[data-home-shortcuts] li')].map((li) => ({
    t: li.innerText.replace(/\\s+/g, ' ').trim(), href: li.querySelector('a')?.getAttribute('href') ?? null,
  }))`)
  check(
    h,
    'A4. 빠른 실행 6개(이름·경로)와 커뮤니티는 C01(/community)로 연결(준비 중 표시 없음)',
    JSON.stringify(
      shortcuts.map((s) => [s.t.replace(/ 준비 중$/, ''), s.href]),
    ) ===
      JSON.stringify([
        ['💪 운동 기록', '/records/exercise'],
        ['🍽️ 식단 기록', '/records/meal'],
        ['✨ AI 코칭', '/ai'],
        ['🏋️ 운동 찾기', '/exercises'],
        ['🔎 음식 찾기', '/foods'],
        ['💬 커뮤니티', '/community'],
      ]) && !/준비 중/.test(shortcuts[5].t),
    JSON.stringify(shortcuts),
  )
  const cols = await h.ev(`(()=>{
    const xs = [...document.querySelectorAll('[data-home-shortcuts] li')].slice(0, 3).map((li) => Math.round(li.getBoundingClientRect().left))
    const ys = [...document.querySelectorAll('[data-home-shortcuts] li')].map((li) => Math.round(li.getBoundingClientRect().top))
    return { xs, rows: new Set(ys).size }
  })()`)
  check(
    h,
    'A5. 빠른 실행은 3열 × 2행',
    new Set(cols.xs).size === 3 && cols.rows === 2,
    JSON.stringify(cols),
  )
  check(
    h,
    'A6. 기록이 없다고 확인되면 0일·"아직 기록이 없어요"·"아직 남긴 활동이 없어요."',
    /운동 기록일 0 ?일/.test(await stat(h, '운동 기록일')) &&
      /식단 기록일 0 ?일/.test(await stat(h, '식단 기록일')) &&
      (await h.has('아직 남긴 활동이 없어요\\.')) &&
      (await h.has('운동이나 식단을 기록하면 이곳에서 확인할 수 있어요\\.')) &&
      (await h.ev(
        `document.querySelector('[data-home-today]').innerText.match(/아직 기록이 없어요/g)?.length`,
      )) === 2,
  )
  check(
    h,
    'A7. 퀴즈 카드와 공지가 그대로 있다',
    (await h.ev(`!!document.querySelector('main a[href="/quiz"]')`)) &&
      (await h.has('공지사항')),
  )
  check(
    h,
    'A8. 이번 주 날짜 범위와 요일 7개(오늘 표시)',
    await h.ev(`(()=>{
      const w = document.querySelector('[data-home-weekly]')
      const label = w.querySelector('p').innerText.trim()
      const lis = [...w.querySelectorAll('ol li')]
      return /^\\d+월 \\d+일 ~ (\\d+월 )?\\d+일$/.test(label) && lis.length === 7 &&
        lis.filter((li) => /오늘/.test(li.querySelector('.sr-only').innerText)).length === 1
    })()`),
  )
})

await scenario('B-data', async (h) => {
  await h.login('free')
  await seedProfile(h, 'free')
  const wk = await weekInfo(h)
  const [d0, d1, d2, d8] = wk.off
  // 운동: 오늘 2건(같은 날 중복)·어제·8일 전(이번 주 밖). 식단: 오늘 2건(같은 날 중복)·2일 전·8일 전.
  await seedExercise(h, 'free', 0, 'b-ex-0a')
  await seedExercise(h, 'free', 0, 'b-ex-0b')
  await seedExercise(h, 'free', -1, 'b-ex-1')
  await seedExercise(h, 'free', -8, 'b-ex-8')
  await seedMeal(h, 'free', 0, 'b-m-0a', 'lunch')
  await seedMeal(h, 'free', 0, 'b-m-0b', 'dinner')
  await seedMeal(h, 'free', -2, 'b-m-2', 'breakfast')
  await seedMeal(h, 'free', -8, 'b-m-8', 'dinner')
  const inWeek = (d) => d >= wk.from && d <= wk.to
  const exDays = new Set([d0, d1, d8].filter(inWeek)).size
  const mealDays = new Set([d0, d2, d8].filter(inWeek)).size
  await openHome(h)
  await settled(h)
  const exStat = await stat(h, '운동 기록일')
  const mealStat = await stat(h, '식단 기록일')
  check(
    h,
    'B1. 운동·식단 기록일은 이번 주(월~일)의 날짜 수이고 같은 날 여러 건은 1일이다',
    new RegExp(`운동 기록일 ${exDays} ?일`).test(exStat) &&
      new RegExp(`식단 기록일 ${mealDays} ?일`).test(mealStat),
    JSON.stringify({ exStat, mealStat, exDays, mealDays, wk }),
  )
  const todayLi = await h.ev(
    `[...document.querySelectorAll('[data-home-weekly] ol li')].find((li)=>/오늘/.test(li.querySelector('.sr-only').innerText)).querySelector('.sr-only').innerText`,
  )
  check(
    h,
    'B2. 오늘 칸: 운동·식단 모두 기록 있음으로 전달(글로도 전달)',
    /운동 기록 있음, 식단 기록 있음/.test(todayLi),
    todayLi,
  )
  const future = await h.ev(
    `[...document.querySelectorAll('[data-home-weekly] ol li .sr-only')].map((e)=>e.innerText).filter((t)=>/아직 오지 않은 날/.test(t)).length`,
  )
  const expectedFuture = await h.ev(
    `(()=>{ const t = new Date(); return (7 - (((t.getDay() + 6) % 7) + 1)) })()`,
  )
  check(
    h,
    'B3. 아직 오지 않은 날은 기록 없음과 구분해 표시한다',
    future === expectedFuture,
    `${future} vs ${expectedFuture}`,
  )
  const todayRows = await h.ev(
    `document.querySelector('[data-home-today]').innerText.replace(/\\s+/g, ' ')`,
  )
  check(
    h,
    'B4. 오늘의 기록: 운동 2건·식단 2건과 "상세 보기"',
    /오늘 2건 기록했어요/.test(todayRows) &&
      (todayRows.match(/상세 보기/g) ?? []).length === 2,
    todayRows,
  )
  const items = await recentItems(h)
  check(
    h,
    'B5. 최근 활동은 최대 3건이고 가장 최근(오늘) 기록이 앞선다',
    items.length === 3 &&
      items.every((i) => /오늘/.test(i.text) || true) &&
      /오늘/.test(items[0].text),
    JSON.stringify(items),
  )
  check(
    h,
    'B6. 최근 활동 항목의 경로는 기존 상세 화면이다(운동 결과·끼니 상세)',
    items.every((i) =>
      i.kind === 'exercise'
        ? /^\/records\/exercise\/result\?session=/.test(i.href)
        : /^\/records\/meal\/(breakfast|lunch|dinner)$/.test(i.href) ||
          /^\/records\/meal\/previous\//.test(i.href),
    ),
    JSON.stringify(items),
  )
  // 운동 항목 → W15 읽기 전용 결과 → "이전"은 홈
  const exItem = items.find((i) => i.kind === 'exercise')
  if (exItem) {
    await h.ev(
      `document.querySelector('[data-recent-kind="exercise"]').click()`,
    )
    await waitPath(h, '^/records/exercise/result')
    await mustUntil(h, `!!document.querySelector('main h1')`, 80)
    check(
      h,
      'B7. 최근 활동의 운동 항목이 완료 기록 결과로 열리고 "이전"은 홈으로 돌아온다',
      (await backHref(h)) === '/home',
      String(await backHref(h)),
    )
    await h.go('/home', 300)
    await settled(h)
  }
  const mealItem = (await recentItems(h)).find((i) => i.kind === 'meal')
  if (mealItem) {
    await h.ev(`document.querySelector('[data-recent-kind="meal"]').click()`)
    await waitPath(h, '^/records/meal/')
    await mustUntil(h, `!!document.querySelector('main h1')`, 80)
    check(
      h,
      'B8. 최근 활동의 식단 항목이 식단 상세로 열린다',
      /^\/records\/meal\//.test(await h.path()),
      await h.path(),
    )
    await h.go('/home', 300)
    await settled(h)
  }
  await h.ev(
    `document.querySelector('[data-home-weekly] a[href="/ai/weekly-report"]').click()`,
  )
  await waitPath(h, '^/ai/weekly-report$')
  await mustUntil(h, `!!document.querySelector('main h1')`, 80)
  check(
    h,
    'B9. "주간 활동 자세히 보기"가 주간 리포트로 이동하고 "이전"은 홈으로 돌아온다',
    (await backHref(h)) === '/home',
    String(await backHref(h)),
  )
  await h.go('/home', 300)
  await settled(h)
  const before = await stat(h, '운동 기록일')
  await h.ev(`location.reload()`)
  await openHome(h)
  await settled(h)
  check(
    h,
    'B10. 새로고침해도 같은 수치다',
    (await stat(h, '운동 기록일')) === before,
  )
  // 홈에 다시 들어오면 새 기록이 반영된다.
  await seedMeal(h, 'free', 0, 'b-m-new', 'breakfast')
  await h.go('/home', 300)
  await settled(h)
  check(
    h,
    'B11. 기록을 추가한 뒤 홈에 다시 들어오면 오늘의 기록에 반영된다',
    /오늘 3건 기록했어요/.test(
      await h.ev(`document.querySelector('[data-home-today]').innerText`),
    ),
  )
})

/** 지정한 저장소들의 읽기를 count번까지 실패시킨다(쓰기는 건드리지 않는다). 앱 안의 이동(SPA)에서만 동작한다. */
const armReadFails = (h, stores, count = 4) =>
  h.ev(`(()=>{
    window.__readFails = { stores: ${q(stores)}, left: ${count}, hits: 0 }
    if (!window.__readFailsPatched) {
      window.__readFailsPatched = true
      const orig = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (names, mode, opts) {
        const f = window.__readFails
        const list = Array.isArray(names) ? names : [names]
        if (f && f.left > 0 && (mode === undefined || mode === 'readonly') && list.some((n) => f.stores.includes(n))) {
          f.left--; f.hits++
          throw new DOMException('주입한 읽기 실패', 'UnknownError')
        }
        return orig.call(this, names, mode, opts)
      }
    }
  })()`)
const disarmReadFails = (h) => h.ev(`window.__readFails = null`)

/** 기록 탭이 자리 잡은 뒤(arm 실행) 하단 탭 "홈"으로 돌아온다. 기록 탭 화면도 운동 기록을 읽어 주입 횟수를 쓰기 때문이다. */
const spaHome = async (h, arm) => {
  await h.click('기록', 'nav')
  await mustUntil(h, `location.pathname.startsWith('/records')`, 60)
  await h.sleep(1200)
  if (arm) await arm()
  await h.click('^홈$', 'nav')
  await waitPath(h, '^/home$')
  await mustUntil(h, `!!document.querySelector('[data-home-weekly]')`, 100)
}

await scenario('C-states', async (h) => {
  await h.login('free')
  await seedProfile(h, 'free')
  await seedExercise(h, 'free', 0, 'c-ex')
  await seedMeal(h, 'free', 0, 'c-meal')
  await openHome(h)
  await settled(h)
  const loadedHeight = await h.ev(
    `Math.round(document.querySelector('[data-home-weekly]').getBoundingClientRect().height)`,
  )

  // 운동 기록을 읽는 중: 자리 표시가 보이고 0일이 아니며 카드 크기는 거의 같다. 식단은 먼저 보인다.
  await h.click('기록', 'nav')
  await mustUntil(h, `location.pathname.startsWith('/records')`, 60)
  await h.sleep(1200)
  await holdReads(h, 'c1')
  await h.click('^홈$', 'nav')
  await waitPath(h, '^/home$')
  await mustUntil(h, `!!document.querySelector('[data-home-weekly]')`, 100)
  await mustUntil(
    h,
    `!!document.querySelector('[data-home-weekly] .animate-pulse')`,
    60,
  )
  const loading = await h.ev(`(()=>{
    const w = document.querySelector('[data-home-weekly]')
    const ex = [...w.querySelectorAll('dt')].find((e) => /운동 기록일/.test(e.innerText)).parentElement
    return { pulse: !!ex.querySelector('.animate-pulse'), text: ex.innerText.replace(/\\s+/g, ' '), height: Math.round(w.getBoundingClientRect().height),
      recent: document.querySelector('[data-home-recent]').innerText.replace(/\\s+/g, ' '),
      today: document.querySelector('[data-home-today]').innerText.replace(/\\s+/g, ' ') }
  })()`)
  check(
    h,
    'C1. 운동 기록을 읽는 중: 자리 표시(불러오는 중)이고 0일·"기록 없음"으로 보이지 않는다',
    loading.pulse &&
      !/\b0 ?일/.test(loading.text) &&
      !/아직 남긴 활동이 없어요/.test(loading.recent) &&
      /확인하는 중이에요/.test(loading.today) &&
      !/아직 기록이 없어요/.test(loading.today.split('식단')[0]),
    JSON.stringify(loading),
  )
  check(
    h,
    'C2. 읽는 중에도 카드 크기가 읽은 뒤와 크게 다르지 않다',
    Math.abs(loading.height - loadedHeight) <= 6,
    `${loading.height} vs ${loadedHeight}`,
  )
  await releaseReads(h, 'c1')
  await settled(h)
  check(
    h,
    'C3. 읽기가 끝나면 수치가 보인다',
    /운동 기록일 1 ?일/.test(await stat(h, '운동 기록일')),
  )

  // 운동 기록만 읽지 못한다 → 운동은 확인 불가(0일 아님), 식단 수치는 그대로
  await spaHome(h, () => armReadFails(h, ['workoutRecords'], 4))
  await mustUntil(
    h,
    `!document.querySelector('[data-home-weekly] .animate-pulse')`,
    100,
  )
  const hits = await h.ev(`window.__readFails?.hits ?? 0`)
  const failed = await h.ev(`(()=>{
    const w = document.querySelector('[data-home-weekly]')
    return { ex: [...w.querySelectorAll('dt')].find((e)=>/운동 기록일/.test(e.innerText)).parentElement.innerText.replace(/\\s+/g,' '),
      meal: [...w.querySelectorAll('dt')].find((e)=>/식단 기록일/.test(e.innerText)).parentElement.innerText.replace(/\\s+/g,' '),
      recent: document.querySelector('[data-home-recent]').innerText.replace(/\\s+/g,' '),
      today: document.querySelector('[data-home-today]').innerText.replace(/\\s+/g,' '),
      marks: [...w.querySelectorAll('ol li .sr-only')].slice(0,1).map((e)=>e.innerText) }
  })()`)
  check(h, 'C4. 읽기 실패 주입이 적중했다', hits >= 1, String(hits))
  check(
    h,
    'C5. 운동 기록 조회 실패: 운동은 "확인하지 못했어요"(0일 아님)·다시 확인, 식단 수치는 그대로',
    /기록을 확인하지 못했어요/.test(failed.ex) &&
      /다시 확인/.test(failed.ex) &&
      !/\b0 ?일/.test(failed.ex) &&
      /식단 기록일 1 ?일/.test(failed.meal),
    JSON.stringify(failed),
  )
  check(
    h,
    'C6. 한 영역만 실패하면 읽은 기록은 보여 주고 일부를 불러오지 못했다고 알린다',
    /일부 기록은 불러오지 못했어요/.test(failed.recent) &&
      /기록을 확인하지 못했어요/.test(failed.today),
    failed.recent,
  )
  check(
    h,
    'C7. 실패한 요일 칸은 "확인할 수 없음"(기록 없음 아님)으로 전달된다',
    /운동 확인할 수 없음/.test(failed.marks[0] ?? ''),
    JSON.stringify(failed.marks),
  )
  await disarmReadFails(h)
  await h.click('^다시 확인$', '[data-home-weekly]')
  await settled(h)
  check(
    h,
    'C8. "다시 확인"으로 운동 수치를 다시 읽는다',
    /운동 기록일 1 ?일/.test(await stat(h, '운동 기록일')),
  )

  // 운동·식단 모두 실패 → 두 영역 모두 확인 불가, 최근 활동은 오류(빈 상태 아님)
  await spaHome(h, () => armReadFails(h, ['workoutRecords', 'mealRecords'], 8))
  await mustUntil(
    h,
    `!document.querySelector('[data-home-weekly] .animate-pulse')`,
    100,
  )
  const both = await h.ev(`({
    weekly: document.querySelector('[data-home-weekly]').innerText.replace(/\\s+/g,' '),
    recent: document.querySelector('[data-home-recent]').innerText.replace(/\\s+/g,' '),
  })`)
  check(
    h,
    'C9. 모두 실패: 두 수치 모두 0일이 아니고 최근 활동은 "아직 남긴 활동이 없어요"가 아니라 불러오지 못했다고 안내한다',
    (both.weekly.match(/기록을 확인하지 못했어요/g) ?? []).length === 2 &&
      !/\b0 ?일/.test(both.weekly) &&
      /최근 활동을 불러오지 못했어요/.test(both.recent) &&
      !/아직 남긴 활동이 없어요/.test(both.recent),
    JSON.stringify(both),
  )
})

await scenario('D-account-switch', async (h) => {
  await h.login('free')
  await seedProfile(h, 'free')
  await seedExercise(h, 'free', 0, 'd-ex')
  await seedMeal(h, 'free', 0, 'd-meal')
  await openHome(h)
  await settled(h)
  check(
    h,
    'D1. free: 기록이 있어 운동 1일·식단 1일·최근 활동 2건',
    /운동 기록일 1 ?일/.test(await stat(h, '운동 기록일')) &&
      /식단 기록일 1 ?일/.test(await stat(h, '식단 기록일')) &&
      (await recentItems(h)).length === 2,
  )
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main button')`, 80)
  await h.click('^로그아웃$')
  await waitPath(h, '^/home$')
  await mustUntil(h, `!!document.querySelector('#explore')`, 80)
  check(
    h,
    'D2. 로그아웃하면 이전 계정의 기록이 화면에 남지 않는다(랜딩이 보인다)',
    (await h.has('무료로 시작하기', 'body')) &&
      !(await h.has('이번 주 나의 활동', 'body')) &&
      !(await h.has('최근 활동', 'body')),
  )
  await h.login('full')
  await seedProfile(h, 'full')
  await openHome(h)
  await settled(h)
  check(
    h,
    'D3. 다른 계정(full)은 자기 기록(없음)만 본다 — free의 기록이 섞이지 않는다',
    /운동 기록일 0 ?일/.test(await stat(h, '운동 기록일')) &&
      /식단 기록일 0 ?일/.test(await stat(h, '식단 기록일')) &&
      (await h.has('아직 남긴 활동이 없어요\\.')),
  )
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main button')`, 80)
  await h.click('^로그아웃$')
  await waitPath(h, '^/home$')
  await h.login('free')
  await openHome(h)
  await settled(h)
  check(
    h,
    'D4. free로 다시 로그인하면 free의 기록이 다시 보인다(지워지지 않았다)',
    /운동 기록일 1 ?일/.test(await stat(h, '운동 기록일')) &&
      (await recentItems(h)).length === 2,
  )
})

await scenario('E-no-duplicate-reads', async (h) => {
  await h.login('free')
  await seedProfile(h, 'free')
  await seedExercise(h, 'free', 0, 'e-ex')
  await seedMeal(h, 'free', 0, 'e-meal')
  await openHome(h)
  await settled(h)
  await h.click('기록', 'nav')
  await mustUntil(h, `location.pathname.startsWith('/records')`, 60)
  await h.sleep(1200)
  await h.ev(`(()=>{
    window.__txLog = []
    if (!window.__txLogPatched) {
      window.__txLogPatched = true
      const orig = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (names, mode, opts) {
        const list = Array.isArray(names) ? names : [names]
        window.__txLog.push({ stores: list, mode: mode ?? 'readonly', at: performance.now() })
        return orig.call(this, names, mode, opts)
      }
    }
  })()`)
  await h.click('^홈$', 'nav')
  await waitPath(h, '^/home$')
  await settled(h)
  await h.sleep(800)
  const log = await h.ev(`window.__txLog`)
  const count = (store) =>
    log.filter((t) => t.mode === 'readonly' && t.stores.includes(store)).length
  const writes = log.filter((t) => t.mode !== 'readonly').length
  check(
    h,
    'E1. 홈 진입 한 번에 운동·식단 기록 저장소를 같은 횟수만 읽는다(추천 조회·영역별 중복 조회 없음)',
    count('workoutRecords') <= 2 &&
      count('mealRecords') <= 2 &&
      count('workoutRecords') === count('mealRecords'),
    JSON.stringify({
      workout: count('workoutRecords'),
      meal: count('mealRecords'),
    }),
  )
  check(h, 'E2. 홈이 기록을 쓰지 않는다(읽기만)', writes === 0, String(writes))
  const pin = await h.ev(
    `Object.keys(localStorage).filter((k) => k.includes('exercise-goal'))`,
  )
  check(
    h,
    'E3. 홈은 운동 목표·PIN 저장소를 만들거나 읽어 바꾸지 않는다',
    pin.length === 0,
    JSON.stringify(pin),
  )
})

await scenario('F-landing', async (h) => {
  await h.go('/home', 600)
  await mustUntil(h, `!!document.querySelector('#explore')`, 80)
  const text = await h.text('body')
  check(
    h,
    'F1. 비회원 랜딩: Hero·가입 CTA·로그인 링크가 그대로이고 로그인 홈 영역이 없다',
    /무료로 시작하기/.test(text) &&
      (await h.ev(
        `!!document.querySelector('a[href="/signup"]') && !!document.querySelector('a[href="/login"]')`,
      )) &&
      !/이번 주 나의 활동|오늘의 기록|최근 활동/.test(text),
  )
  const explore = await h.ev(`(()=>{
    const s = document.querySelector('#explore')
    return {
      steps: [...s.querySelectorAll('ol')[0].querySelectorAll('li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim()),
      captions: (s.innerText.match(/검색 화면 미리보기 · 예시/g) ?? []).length,
      topics: [...s.querySelectorAll('article h3')].map((e) => e.innerText.trim()),
      links: [...s.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      previews: s.querySelectorAll('[role=img]').length,
      filters: ['난이도', '운동 부위', '운동 도구', '식품 구분', '음식 종류'].every((t) => s.innerText.includes(t)),
    }
  })()`)
  check(
    h,
    'F2. 둘러보기 섹션에 검색 튜토리얼(3단계·운동/음식 미리보기·예시 표기)이 있다',
    JSON.stringify(explore.steps) ===
      JSON.stringify(['1 검색어 입력', '2 조건 선택', '3 결과 확인']) &&
      explore.captions === 2 &&
      explore.topics.length === 2 &&
      explore.previews === 2 &&
      explore.filters,
    JSON.stringify(explore),
  )
  check(
    h,
    'F3. 눌리는 것은 운동·음식 시작하기 링크 둘뿐이다(타일과 중복되지 않는다)',
    JSON.stringify(explore.links) === JSON.stringify(['/exercises', '/foods']),
    JSON.stringify(explore.links),
  )
  check(
    h,
    'F4. 검색은 가입 없이 이용할 수 있다는 안내',
    /검색은 가입 없이 이용할 수 있어요/.test(text),
  )
  const arrived = async (path) => {
    await waitPath(h, `^${path}$`)
    // 도착 화면이 그려지고(랜딩이 사라지고 제목이 있음) 안정될 때까지 기다린 뒤 읽는다.
    await mustUntil(
      h,
      `!document.querySelector('#explore') && !!document.querySelector('main h1')`,
      80,
    )
    await h.sleep(400)
    return h.text()
  }
  await h.ev(`document.querySelector('#explore a[href="/exercises"]').click()`)
  const exercisesText = await arrived('/exercises')
  check(
    h,
    'F5. "운동 탐색 시작하기"가 비회원도 열 수 있는 운동 찾기로 이동한다',
    !/로그인 후 이용/.test(exercisesText),
    exercisesText.slice(0, 80),
  )
  await h.go('/home', 600)
  await mustUntil(h, `!!document.querySelector('#explore')`, 80)
  await h.ev(`document.querySelector('#explore a[href="/foods"]').click()`)
  const foodsText = await arrived('/foods')
  check(
    h,
    'F6. "음식 검색 시작하기"가 음식 찾기로 이동한다',
    !/로그인 후 이용/.test(foodsText),
    foodsText.slice(0, 80),
  )
  // 둘러보기 앵커
  await h.go('/home', 600)
  await mustUntil(h, `!!document.querySelector('a[href$="#explore"]')`, 80)
  await h.ev(`document.querySelector('a[href$="#explore"]').click()`)
  await h.sleep(400)
  check(
    h,
    'F7. 헤더·히어로의 "둘러보기"가 검색 튜토리얼 섹션으로 간다',
    await h.ev(`location.hash === '#explore'`),
  )
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await h.sleep(200)
    const r = await h.ev(`(()=>{
      const W = window.innerWidth
      const s = document.querySelector('#explore')
      const els = [s, ...s.querySelectorAll('*')]
      const bad = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
      const links = [...s.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().height))
      return { ov: document.documentElement.scrollWidth - W, bad, links }
    })()`)
    check(
      h,
      `F8. ${width}px 랜딩 검색 안내: 가로 스크롤·잘림 없음, 시작하기 링크 44px 이상`,
      r.ov <= 0 && r.bad === 0 && r.links.every((x) => x >= 44),
      JSON.stringify(r),
    )
  }
})

await scenario('G-layout', async (h) => {
  await h.login('free')
  await seedProfile(h, 'free')
  await seedExercise(h, 'free', 0, 'g-ex')
  await seedExercise(h, 'free', -1, 'g-ex1')
  await seedMeal(h, 'free', 0, 'g-m0', 'lunch')
  await seedMeal(h, 'free', -1, 'g-m1', 'dinner')
  await openHome(h)
  await settled(h)
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await h.sleep(250)
    const r = await h.ev(`(()=>{
      const W = window.innerWidth
      const main = document.querySelector('main')
      const els = [...main.querySelectorAll('[data-home-weekly], [data-home-weekly] *, [data-home-shortcuts], [data-home-shortcuts] *, [data-home-today], [data-home-today] *, [data-home-recent], [data-home-recent] *')]
      const bad = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
      const tap = [...main.querySelectorAll('[data-home-weekly] a, [data-home-today] a, [data-home-recent] a, [data-home-shortcuts] a')]
        .filter((a) => a.getBoundingClientRect().height < 43.5).length
      const w = document.querySelector('[data-home-weekly]')
      const lis = [...w.querySelectorAll('ol li')]
      const num = lis[0].querySelectorAll('span')[2]
      const dayNumbersVisible = getComputedStyle(num).display !== 'none'
      const weekdays = lis.every((li) => li.getBoundingClientRect().width > 8)
      const cols = new Set([...document.querySelectorAll('[data-home-shortcuts] li')].slice(0, 3).map((li) => Math.round(li.getBoundingClientRect().left))).size
      return { ov: document.documentElement.scrollWidth - W, bad, tap, dayNumbersVisible, weekdays, cols, lis: lis.length }
    })()`)
    check(
      h,
      `G1. ${width}px: 가로 스크롤·잘림 없음, 이동 링크 44px 이상, 요일 7칸 유지`,
      r.ov <= 0 && r.bad === 0 && r.tap === 0 && r.lis === 7 && r.weekdays,
      JSON.stringify(r),
    )
    if (width >= 320)
      check(h, `G2. ${width}px: 빠른 실행 3열`, r.cols === 3, JSON.stringify(r))
    check(
      h,
      `G3. ${width}px: 날짜 숫자는 ${width >= 320 ? '보이고' : '좁은 화면에서 감춘다(요일·기호만 남김)'}`,
      width >= 320 ? r.dayNumbersVisible : !r.dayNumbersVisible,
      JSON.stringify(r),
    )
    await h.shot(`home-${width}.png`)
  }
})
