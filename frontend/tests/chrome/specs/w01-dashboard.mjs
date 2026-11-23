// [chrome 회귀] W01 대시보드 현행 구조
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S8-3A 신규: W01 현행 기준 검증. 기준 문서: 운동 대시보드 설계 메모(2026-11-12 사용자 지시 리디자인 + 2026-11-16 S8-2 실제 기록 연결).
// 구 w01·r2 스크립트가 기대하던 구조(h1 "운동 대시보드", 목표 배너 최상단, 내 운동 루틴 섹션 등)는 이 문서의 구조로 대체되었다. 프로젝트 소스는 수정하지 않는다.
import { start } from '../lib/session.mjs'

let fails = 0
const check = (n, ok, d = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    
    const links=[...(m.querySelectorAll('a'))].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')}));
    return {
      h1:[...document.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      h2:[...m.querySelectorAll('h2')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()),
      toggle:[...m.querySelectorAll('a[href="/records/exercise"],a[href="/records/meal"]')].slice(0,2).map(a=>{const c=getComputedStyle(a);return{n:a.getAttribute('aria-label')||a.innerText.replace(/\\s+/g,' ').trim(),cur:a.getAttribute('aria-current'),fw:c.fontWeight,h:Math.round(a.getBoundingClientRect().height),href:a.getAttribute('href'),bg:c.backgroundColor}}),
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links,
      bottom:[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] [aria-current=page]')].map(x=>x.innerText.trim()),
      alerts:m.querySelectorAll('[role=alert]').length,
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth}})()`)

const h = await start('w01-current')
await h.vp(390, 844)

console.log('--- 비회원')
await h.go('/records/exercise', 1000)
await h.until(`!!document.querySelector('main')`, 60)
await h.sleep(500)
let s = await snap(h)
check(
  '비회원: 로그인 안내만 보이고 대시보드 영역(이번 주 운동 등)이 없다',
  /로그인 후 이용할 수 있어요/.test(s.text) && !/이번 주 운동/.test(s.text),
)

console.log('--- 회원(기본: 저장된 기록 없음)')
await h.login('free')
await h.go('/records/exercise', 1200)
await h.until(`!!document.querySelector('main h1')`, 60)
await h.sleep(800)
s = await snap(h)
check(
  'h1 "운동 기록" 1개(문서 기준)',
  s.h1.length === 1 && s.h1[0] === '운동 기록',
  JSON.stringify(s.h1),
)
check(
  '영역(h2) 순서: 오늘의 운동(주요 행동) → 이번 주 운동 → 최근 운동 기록 → 운동 관리. 초급 추천 진입(W01-2, 화면명세 보완본)은 오늘의 운동 다음의 접힌 보조 영역이다',
  JSON.stringify(s.h2) ===
    JSON.stringify([
      '오늘의 운동',
      '이번 주 운동',
      '최근 운동 기록',
      '운동 관리',
    ]) &&
    (await h.ev(
      `(()=>{const sec=document.querySelector('main [data-beginner-plan]');const today=document.getElementById('dashboard-today-title');const weekly=document.getElementById('dashboard-weekly-title');if(!sec||!today||!weekly)return false;const d=sec.querySelector('details');return !d.open&&/오늘 뭘 할지 고민되나요\\?/.test(sec.innerText)&&sec.getAttribute('aria-labelledby')==='beginner-plan-title'&&(today.compareDocumentPosition(sec)&Node.DOCUMENT_POSITION_FOLLOWING)>0&&(sec.compareDocumentPosition(weekly)&Node.DOCUMENT_POSITION_FOLLOWING)>0})()`,
    )),
  JSON.stringify(s.h2),
)
check(
  '390×844 첫 화면: 빈 상태의 주요 행동 "운동 목록 만들기"가 스크롤 없이 보인다(하단 탭에 가리지 않음)',
  await h.ev(
    `(()=>{const a=[...document.querySelectorAll('main a')].find(a=>/^운동 목록 만들기/.test(a.innerText.trim()));if(!a)return false;const r=a.getBoundingClientRect();const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]').getBoundingClientRect();return r.top>=0&&r.bottom<=nav.top&&r.height>=48})()`,
  ),
)
check(
  '운동/식단 전환: 운동이 현재(aria-current=page), 굵기 600, 채움 배경, 터치 높이 ≥44, 식단은 /records/meal',
  s.toggle.length === 2 &&
    s.toggle[0].cur === 'page' &&
    s.toggle[1].cur === null &&
    s.toggle[0].fw === '600' &&
    s.toggle[0].bg !== 'rgba(0, 0, 0, 0)' &&
    s.toggle.every((x) => x.h >= 44) &&
    s.toggle[1].href === '/records/meal',
  JSON.stringify(s.toggle),
)
check(
  '하단 탭 "기록" 활성',
  JSON.stringify(s.bottom) === JSON.stringify(['기록']),
)
check(
  '이번 주 운동: 월~일 7칸, 0회·"0일 운동했어요", 가짜 수치·달성률(%) 없음',
  /0\s*회/.test(s.text) &&
    /0일 운동했어요/.test(s.text) &&
    ['월', '화', '수', '목', '금', '토', '일'].every((d) =>
      s.text.includes(d),
    ) &&
    !/%/.test(s.text),
)
check(
  '최근 운동 기록: 기록이 없으면 "아직 저장된 운동 기록이 없어요"(예시 데이터로 채우지 않음)',
  /아직 저장된 운동 기록이 없어요/.test(s.text),
)
// 초급 추천 진입은 접혀 있다. 요약(summary)을 눌러 펼친 뒤 두 진입을 확인한다.
await h.ev(
  `document.querySelector('main [data-beginner-plan] summary').click()`,
)
await h.sleep(200)
s = await snap(h)
check(
  '초급 추천 진입: 펼치면 추천 진입("오늘의 운동 추천받기"→/records/exercise/plan)과 직접 선택 진입이 있고 링크 주소가 있다',
  s.links.some(
    (l) =>
      /오늘의 운동 추천받기/.test(l.t) &&
      l.h.startsWith('/records/exercise/plan'),
  ) &&
    s.links.some((l) => /직접 운동 선택하기/.test(l.t) && !!l.h && l.h !== '#'),
  JSON.stringify(s.links.filter((l) => /추천|선택|목록/.test(l.t))),
)
// 루틴 목록은 비동기로 읽어 링크가 늦게 나타난다. 링크가 그려질 때까지 기다린 뒤 다시 읽는다(없으면 아래 검사가 실패한다).
await h.until(
  `[...document.querySelectorAll('main a')].some(a=>a.getAttribute('href')==='/records/exercise/routines')`,
  80,
)
s = await snap(h)
check(
  '운동 관리: 운동 목표(목표 설정)·내 운동 루틴(W06 링크)·운동 기록 통계(통계 링크)·다음 운동 준비하기',
  [
    '운동 목표',
    '목표 설정',
    '내 운동 루틴',
    '운동 기록 통계',
    '다음 운동 준비하기',
  ].every((t) => s.text.includes(t)) &&
    s.links.some(
      (l) =>
        l.h === '/records/exercise/routines' && /루틴 (만들기|보기)/.test(l.t),
    ) &&
    s.links.some(
      (l) => l.h === '/records/exercise/stats' && /통계 보기/.test(l.t),
    ) &&
    // 내일 운동 계획(W10)과 주간 리포트(I05)가 모두 연결된 현재 동작: 접힌 "다음 운동 준비하기" 요약에도 "준비 중"이 없다.
    // (이전에는 주간 리포트만 "준비 중"이었다. NextExerciseSection이 리포트 경로를 받아 활성 항목으로 바뀌었다.)
    (s.text.slice(s.text.indexOf('운동 관리')).match(/준비 중/g) ?? [])
      .length === 0 &&
    /내일 운동 계획 · 주간 리포트/.test(
      s.text.slice(s.text.indexOf('운동 관리')),
    ),
  JSON.stringify({
    links: s.links.filter((l) => /routines|stats/.test(l.h ?? '')),
    pending: (s.text.match(/준비 중/g) ?? []).length,
    management: s.text.slice(s.text.indexOf('운동 관리')),
  }),
)
check('조회 오류 표시(role=alert) 없음', s.alerts === 0)
check(
  '운동 관리: 이동할 곳이 하나인 행(운동 목표·내 운동 루틴·운동 기록 통계)은 행 전체가 링크 하나이고 그 안에 다른 링크·버튼이 없다',
  await h.ev(
    `(()=>{const ids=['dashboard-goal-title','dashboard-routine-title','dashboard-statistics-title'];return ids.every(id=>{const t=document.getElementById(id);const a=t&&t.closest('a');return !!a&&a.querySelectorAll('a,button').length===0&&a.getBoundingClientRect().height>=44})})()`,
  ),
)

console.log('--- 반응형(가로 넘침 없음)')
for (const [w, hh, note] of [
  [160, 640, '200% 확대(320 기준)'],
  [195, 844, '200% 확대(390 기준)'],
  [320, 640, ''],
  [390, 844, ''],
  [768, 1024, ''],
  [1440, 900, ''],
]) {
  await h.vp(w, hh)
  await h.go('/records/exercise', 900)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(500)
  s = await snap(h)
  check(
    `${w}px ${note}: 가로 스크롤 없음, 4개 영역 + 초급 추천 진입 유지`,
    s.over <= 0 &&
      s.h2.length === 4 &&
      (await h.ev(`!!document.querySelector('main [data-beginner-plan]')`)),
    `over=${s.over} h2=${s.h2.length}`,
  )
  // 모든 폭에서 한 열(오늘 아래 주간)이고 앱 폭은 390px 이하이며 하단 탭도 같은 폭이다.
  const layout = await h.ev(
    `(()=>{const m=document.querySelector('main');const today=document.getElementById('dashboard-today-title').getBoundingClientRect();const weekly=document.getElementById('dashboard-weekly-title').getBoundingClientRect();const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]').getBoundingClientRect();const frame=m.parentElement.getBoundingClientRect();return {frame:Math.round(frame.width),nav:Math.round(nav.width),twoCol:weekly.left>today.right,stacked:weekly.top>today.bottom}})()`,
  )
  check(
    `${w}px: 한 열(오늘 아래 주간), 앱 폭 ≤390·하단 탭 같은 폭`,
    layout.stacked &&
      !layout.twoCol &&
      layout.frame <= 390 &&
      layout.nav === layout.frame,
    JSON.stringify(layout),
  )
}
await h.vp(390, 844)

console.log('--- 개발용 예시 상태(?sample=)에서도 화면이 깨지지 않음')
for (const smp of [
  'filled',
  'before',
  'empty',
  'loading',
  'error',
  'multiple',
  'boundary',
  'partial-error',
  'corrupt',
  'long',
]) {
  await h.go(`/records/exercise?sample=${smp}`, 900)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(400)
  s = await snap(h)
  check(
    `sample=${smp}: h1 "운동 기록"·영역 3개 이상·가로 넘침 없음`,
    s.h1[0] === '운동 기록' && s.h2.length >= 3 && s.over <= 0,
    JSON.stringify([s.h1, s.h2.length, s.over]),
  )
}

console.log('--- 식단 전환')
await h.go('/records/exercise', 900)
await h.until(`!!document.querySelector('main h1')`, 60)
await h.ev(`document.querySelector('main a[href="/records/meal"]').click()`)
await h.sleep(900)
check(
  '식단 클릭: /records/meal 이동, 하단 탭 "기록" 유지',
  (await h.path()) === '/records/meal' &&
    JSON.stringify((await snap(h)).bottom) === JSON.stringify(['기록']),
)
const recordsTabHref = () =>
  h.ev(
    `[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] a')].find(a=>a.innerText.trim()==='기록').getAttribute('href')`,
  )
check(
  '식단 화면의 하단 "기록"은 식단 기록을 가리킨다(눌러도 운동으로 바뀌지 않는다)',
  (await recordsTabHref()) === '/records/meal',
)
await h.ev(
  `[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] a')].find(a=>a.innerText.trim()==='홈').click()`,
)
await h.sleep(900)
check(
  '다른 탭(홈)에서 하단 "기록"은 마지막으로 본 식단 기록으로 돌아가고, 홈은 기존 앱 폭(390px)이다',
  (await h.path()) === '/home' &&
    (await recordsTabHref()) === '/records/meal' &&
    (await h.ev(
      `Math.round(document.querySelector('main').parentElement.getBoundingClientRect().width)<=390`,
    )) &&
    // 기억하는 값은 화면 종류 하나뿐이다.
    (await h.ev(`sessionStorage.getItem('mealthroutine.recordsTab')`)) ===
      'meal',
)
await h.ev(
  `[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] a')].find(a=>a.innerText.trim()==='기록').click()`,
)
await h.sleep(900)
check('홈에서 "기록" → /records/meal', (await h.path()) === '/records/meal')
await h.ev(`document.querySelector('main a[href="/records/exercise"]').click()`)
await h.sleep(900)
check(
  '운동으로 전환하면 하단 "기록"은 다시 운동 기록을 가리킨다',
  (await h.path()) === '/records/exercise' &&
    (await recordsTabHref()) === '/records/exercise',
)

// 다른 화면은 기존 앱 폭이다(홈·마이 등).
await h.vp(1440, 900)
await h.go('/mypage', 900)
await h.sleep(600)
check(
  '1440px: 다른 화면(/mypage)은 기존 앱 폭(390px 이하)',
  await h.ev(
    `Math.round(document.querySelector('main').parentElement.getBoundingClientRect().width)<=390`,
  ),
)
await h.vp(390, 844)

// 로그아웃은 기록 탭 기억값만 지운다(운동·식단 저장소는 건드리지 않는다).
await h.go('/records/meal', 900)
await h.until(`!!document.querySelector('main h1')`, 60)
check(
  '로그아웃 전: 기록 탭 기억값은 meal',
  (await h.ev(`sessionStorage.getItem('mealthroutine.recordsTab')`)) === 'meal',
)
await h.go('/settings', 900)
await h.sleep(600)
await h.click('^로그아웃$')
await h.sleep(800)
if (await h.has('로그아웃', 'body')) await h.click('^로그아웃$', 'body')
await h.sleep(800)
check(
  '로그아웃 후: 기록 탭 기억값 제거',
  (await h.ev(`sessionStorage.getItem('mealthroutine.recordsTab')`)) === null,
)

const bad = h.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
h.close()
console.log(`\n=== W01 현행 기준 ${fails ? '실패 ' + fails : '전부 통과'} ===`)
process.exit(fails ? 1 : 0)
