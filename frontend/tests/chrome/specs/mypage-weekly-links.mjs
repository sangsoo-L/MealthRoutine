// [chrome 회귀] P01 이번 주 활동: 데이터 상태별 진입 링크 · P01에서 W10·D03·I05 진입과 복귀 · 다른 화면·직접 접근·새로고침의 기본 복귀 · 320~390px
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only mypage-weekly-links`. 상세: tests/chrome/README.md
// 활동 데이터 있음·없음·실패는 개발 서버 전용 `?sample=1|empty|error`(메모리 예시)로 만든다. 아무것도 저장하지 않는다. 로딩 상태는 P01에 없다(조회 호출이 없다).
import { start } from '../lib/session.mjs'
import { mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const TARGETS = [
  ['/records/exercise/my', '/records/exercise'],
  ['/records/meal/list', '/records/meal'],
  ['/ai/weekly-report', '/ai'],
]
const HAS_BACK = `[...document.querySelectorAll('main a')].some(a=>/^이전/.test(a.innerText.trim()))`
const WEEK = `document.querySelector('#my-week-title').closest('section')`

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

const hrefs = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href'))`,
  )
const backHref = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
  )
const openMy = async (h, query = '') => {
  await h.go(`/mypage${query}`, 300)
  await mustUntil(h, `!!document.querySelector('#my-week-title')`, 80)
}
const clickTo = async (h, path) => {
  await h.ev(`document.querySelector('main a[href="${path}"]').click()`)
  await waitPath(h, `^${path}$`)
  await mustUntil(h, HAS_BACK, 80)
}
const clickBack = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim())).click()`,
  )

await scenario('A-states', async (h) => {
  await h.login('free')
  for (const [query, label, expected] of [
    ['', '연결 전(저장 수단 없음)', /아직 연결된 활동 기록이 없어요/],
    ['?sample=empty', '기록 0건', /이번 주 활동 기록이 아직 없어요/],
    ['?sample=error', '불러오기 실패', /활동 기록을 불러오지 못했어요/],
  ]) {
    await openMy(h, query)
    const links = (await hrefs(h)).filter((x) => TARGETS.some(([p]) => p === x))
    check(
      h,
      `A1. ${label}: 문구 + 진입 링크 3개`,
      expected.test(await h.ev(`${WEEK}.innerText`)) && links.length === 3,
      JSON.stringify(links),
    )
    check(
      h,
      `A2. ${label}: 수치 타일이 없다`,
      !(await h.ev(`!!${WEEK}.querySelector('.tabular-nums')`)),
    )
  }
  await openMy(h, '?sample=error')
  check(
    h,
    'A3. 실패는 alert로 알린다',
    await h.ev(`!!${WEEK}.querySelector('[role=alert]')`),
  )
  await openMy(h, '?sample=1')
  const links = (await hrefs(h)).filter((x) => TARGETS.some(([p]) => p === x))
  check(
    h,
    'A4. 데이터 있음: 기존 타일과 링크 유지(별도 링크 목록 없음)',
    links.length === 3 &&
      /주간 점수/.test(await h.ev(`${WEEK}.innerText`)) &&
      !(await h.ev(`!!document.querySelector('[data-weekly-entry-links]')`)),
  )
})

await scenario('B-from-mypage', async (h) => {
  await h.login('free')
  for (const [query, label] of [
    ['', '값 없음'],
    ['?sample=1', '값 있음'],
  ]) {
    for (const [path] of TARGETS) {
      await openMy(h, query)
      await clickTo(h, path)
      check(
        h,
        `B1. ${label} P01 → ${path}: 이전은 마이페이지`,
        (await backHref(h)) === '/mypage',
        String(await backHref(h)),
      )
      await clickBack(h)
      await waitPath(h, '^/mypage$')
      check(h, `B2. ${label} ${path}: 이전 버튼으로 P01 복귀`, true)
    }
  }
  // 브라우저 뒤로 가기는 화면의 이전 버튼과 별개로 직전 기록(P01)으로 돌아간다
  await openMy(h)
  await clickTo(h, '/records/meal/list')
  await h.ev(`history.back()`)
  await waitPath(h, '^/mypage$')
  check(h, 'B3. 브라우저 뒤로 가기는 P01로 돌아온다', true)
})

await scenario('C-other-entry', async (h) => {
  await h.login('free')
  for (const [path, parent] of TARGETS) {
    await h.go(path, 300)
    await mustUntil(h, HAS_BACK, 80)
    check(
      h,
      `C1. ${path} 직접 접근: 이전은 기본 상위 화면`,
      (await backHref(h)) === parent,
      String(await backHref(h)),
    )
  }
  await h.go('/records/exercise', 300)
  await mustUntil(
    h,
    `!!document.querySelector('main a[href="/records/exercise/my"]')`,
    80,
  )
  await clickTo(h, '/records/exercise/my')
  check(
    h,
    'C2. W01에서 진입한 W10: 이전은 마이페이지가 아니다',
    (await backHref(h)) !== '/mypage',
    String(await backHref(h)),
  )
  await h.go('/settings', 300)
  await mustUntil(
    h,
    `!!document.querySelector('main a[href="/records/meal/list"]')`,
    80,
  )
  await clickTo(h, '/records/meal/list')
  check(
    h,
    'C3. 설정에서 진입한 D03: 이전은 설정(기존 동작)',
    (await backHref(h)) === '/settings',
  )
})

await scenario('D-reload', async (h) => {
  await h.login('free')
  await openMy(h)
  await clickTo(h, '/records/exercise/my')
  // 같은 주소를 다시 여는 것은 새로고침이라 진입 정보가 남는다(D2). 다른 곳을 거쳐 주소로 새로 들어가면 진입 정보가 없다(직접 접근).
  await h.go('/home', 300)
  await h.go('/records/exercise/my', 300)
  await mustUntil(h, HAS_BACK, 80)
  check(
    h,
    'D1. 주소로 새로 들어가면(직접 접근) 기본 복귀 경로',
    (await backHref(h)) === '/records/exercise',
    String(await backHref(h)),
  )
  await openMy(h)
  await clickTo(h, '/ai/weekly-report')
  await h.ev(`location.reload()`)
  await h.sleep(1200)
  await mustUntil(h, HAS_BACK, 80)
  check(
    h,
    'D2. 새로고침 뒤에도 이전이 유효한 내부 경로',
    ['/mypage', '/ai'].includes(await backHref(h)),
    String(await backHref(h)),
  )
})

await scenario('E-responsive', async (h) => {
  await h.login('free')
  for (const w of [390, 320]) {
    await h.vp(w, 844)
    for (const query of ['', '?sample=1', '?sample=empty', '?sample=error']) {
      await openMy(h, query)
      const p = await h.ev(`(()=>{const s=${WEEK};
        const small=[...s.querySelectorAll('a')].filter(a=>a.getBoundingClientRect().height<43.5).map(a=>a.innerText.trim());
        return {ov:document.documentElement.scrollWidth-window.innerWidth, small}})()`)
      check(
        h,
        `E1. ${w}px ${query || '(기본)'}: 가로 넘침 없음·링크 높이 ≥44px`,
        p.ov <= 0 && p.small.length === 0,
        JSON.stringify(p),
      )
    }
  }
})
