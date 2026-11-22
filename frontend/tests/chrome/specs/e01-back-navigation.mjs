// [chrome 회귀] E01·E02 이전 버튼 경로와 조작된 state 방어
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E01 이전 경로 수정 회귀 테스트 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const t = await launch('out-back2-' + Date.now(), 9531, 'http://localhost:5199')
const { ev, vp, goSettled: go, sleep, check } = t
const q = encodeURIComponent
await vp(390, 844)

const BACK = 'a[aria-label="이전 화면으로 돌아가기"]'
const backHref = () =>
  ev(
    `document.querySelector(${JSON.stringify(BACK)})?.getAttribute('href')??null`,
  )
const where = () => ev(`location.pathname+location.search`)
const origin = () => ev(`location.origin`)
const submitQuery = (text) =>
  ev(
    `(()=>{const i=document.querySelector('main input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event('input',{bubbles:true}));i.form.requestSubmit()})()`,
  )
const waitCards = async (n = 1) => {
  for (let i = 0; i < 30; i++) {
    if (
      (await ev(
        `document.querySelectorAll('main a[href^="/exercises/"]').length`,
      )) >= n
    )
      return true
    await sleep(150)
  }
  return false
}
const clickBack = async () => {
  await ev(`document.querySelector(${JSON.stringify(BACK)}).click()`)
  await sleep(1100)
}

async function enter(kind) {
  if (kind === 'explore') {
    await go('/explore', 800)
    await ev(
      `[...document.querySelectorAll('main a')].find(a=>a.getAttribute('href')==='/exercises').click()`,
    )
  } else if (kind === 'home') {
    await go('/home', 800)
    await ev(
      `[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/exercises').click()`,
    )
  } else {
    await go('/exercises', 800)
  }
  await sleep(900)
}

const EXPECT = { explore: '/explore', home: '/home', direct: '/home' }
const LABEL = {
  explore: '탐색 → 운동 찾기',
  home: '홈 바로가기 → 운동 찾기',
  direct: '주소 직접 입력',
}
for (const kind of ['explore', 'home', 'direct']) {
  const exp = EXPECT[kind]
  console.log(`\n===== 진입: ${LABEL[kind]} (기대 이전 목적지 ${exp}) =====`)
  await enter(kind)
  check(
    `[${kind}] 검색 전 화면의 이전 = ${exp}`,
    (await backHref()) === exp,
    String(await backHref()),
  )
  await submitQuery('덤벨')
  await sleep(1500)
  await waitCards(3)
  check(
    `[${kind}] 검색하기 → 결과 화면의 이전 = ${exp} (수정 전: /home으로 손실)`,
    (await backHref()) === exp && (await where()).includes('view=results'),
    `${await backHref()} @ ${await where()}`,
  )
  const resultsUrl = await where()
  const n0 = await ev(
    `document.querySelectorAll('main a[href^="/exercises/"]').length`,
  )
  await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
  await sleep(1100)
  check(
    `[${kind}] 결과 → 상세: 상세 이전 = 검색 결과 주소(조건 유지)`,
    (await backHref()) === resultsUrl,
    `${await backHref()}`,
  )
  await clickBack()
  check(
    `[${kind}] 상세 이전 클릭 → 같은 검색 결과 복귀(검색어·필터 유지, 건수 동일)`,
    (await where()) === resultsUrl &&
      (await ev(
        `document.querySelectorAll('main a[href^="/exercises/"]').length`,
      )) === n0,
    await where(),
  )
  check(
    `[${kind}] 복귀한 결과 화면의 이전 = ${exp} (수정 전: /home으로 손실)`,
    (await backHref()) === exp,
    String(await backHref()),
  )
  // 조건 수정 시트로 재검색(주소가 바뀜) 뒤에도 유지
  await ev(
    `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('조건 수정')).click()`,
  )
  await sleep(700)
  await ev(
    `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='중급').click()`,
  )
  await sleep(400)
  await ev(
    `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.includes('재검색')).click()`,
  )
  await sleep(1600)
  check(
    `[${kind}] 조건 수정 시트로 난이도 변경 재검색 → 주소에 조건 반영, 이전 = ${exp}`,
    (await where()).includes(q('중급')) && (await backHref()) === exp,
    `${await backHref()} @ ${await where()}`,
  )
  const cond = await where()
  await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
  await sleep(1000)
  await clickBack()
  check(
    `[${kind}] 필터 조건 결과 → 상세 → 이전: 조건(덤벨+중급) 유지, 이전 = ${exp}`,
    (await where()) === cond && (await backHref()) === exp,
    `${await where()} / ${await backHref()}`,
  )
  // 결과 없음 → 조건 초기화(검색어도 비움) 후에도 유지
  await ev(
    `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('조건 수정')).click()`,
  )
  await sleep(700)
  await ev(
    `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='초기화').click()`,
  )
  await sleep(300)
  await ev(
    `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.includes('재검색')).click()`,
  )
  await sleep(1600)
  check(
    `[${kind}] 시트 초기화 후 재검색(전체, 필터 결과 이상) → 이전 = ${exp}`,
    (await backHref()) === exp &&
      (await ev(
        `document.querySelectorAll('main a[href^="/exercises/"]').length`,
      )) >= n0,
    `${await backHref()}`,
  )
  await clickBack()
  check(
    `[${kind}] E01 이전 버튼 클릭 → ${exp} 이동`,
    (await where()) === exp,
    await where(),
  )
}

console.log('\n===== 브라우저 history는 기존 정책 그대로 =====')
await enter('explore')
await submitQuery('푸시업')
await sleep(1500)
await waitCards(1)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(1100)
globalThis.__pu = await where()
await clickBack()
await ev(`history.back()`)
await sleep(1000)
check(
  '상세 이전(push) 뒤 브라우저 뒤로가기 → 상세(기존 동작 유지)',
  (await where()) === globalThis.__pu,
  await where(),
)
await ev(`history.back()`)
await sleep(1000)
check(
  '한 번 더 뒤로 → 결과(기존 동작 유지)',
  (await where()).includes('view=results'),
  await where(),
)
await ev(`history.back()`)
await sleep(1000)
check(
  '한 번 더 뒤로 → 검색 전 화면(검색하기가 한 칸 쌓이는 기존 정책 유지)',
  (await where()) === '/exercises',
  await where(),
)
check(
  '  검색 전 화면으로 돌아와도 이전 = /explore(처음 진입 state 보존)',
  (await backHref()) === '/explore',
  String(await backHref()),
)
await ev(`history.forward()`)
await sleep(1000)
check(
  '브라우저 앞으로가기 → 결과, 이전 = /explore',
  (await where()).includes('view=results') && (await backHref()) === '/explore',
  `${await where()} / ${await backHref()}`,
)

console.log('\n===== 조작된 state: 외부·잘못된 경로로 이동하지 않음 =====')
const inject = (usr) =>
  ev(
    `(()=>{const h=history.state||{};history.replaceState({...h,usr:${JSON.stringify(usr)}},'');dispatchEvent(new PopStateEvent('popstate',{state:history.state}))})()`,
  )
const RES = `/exercises?q=${q('덤벨')}&view=results`
for (const [label, bad] of [
  ['"//" 외부', '//evil.example.com'],
  ['"/\\" 외부(브라우저가 //로 해석)', '/\\evil.example.com'],
  ['절대 URL', 'https://evil.example.com'],
  ['javascript:', 'javascript:alert(1)'],
  ['제어 문자 포함', '/exercises\u0000x'],
  ['줄바꿈 포함', '/home\n/evil'],
  ['중간 역슬래시', '/a\\b'],
]) {
  await go(RES, 800)
  await inject({ from: bad })
  await sleep(500)
  const b = await backHref()
  check(
    `E01 결과에 잘못된 from(${label}): 이전은 기본값 /home, 외부 주소 아님`,
    b === '/home',
    String(b),
  )
  await clickBack()
  check(
    `  클릭해도 같은 사이트의 /home에 머묾`,
    (await origin()) === 'http://localhost:5199' && (await where()) === '/home',
    `${await origin()} ${await where()}`,
  )
}
await go('/exercises/2', 800)
for (const [label, usr, expectBack, expectNext] of [
  [
    '정상 from + 정상 fromState',
    { from: RES, fromState: { from: '/explore' } },
    RES,
    '/explore',
  ],
  [
    '정상 from + fromState가 외부(//)',
    { from: RES, fromState: { from: '//evil.example.com' } },
    RES,
    '/home',
  ],
  [
    '정상 from + fromState 역슬래시',
    { from: RES, fromState: { from: '/\\evil.example.com' } },
    RES,
    '/home',
  ],
  [
    '정상 from + fromState가 문자열',
    { from: RES, fromState: 'oops' },
    RES,
    '/home',
  ],
  [
    '정상 from + fromState 중첩(3단계)',
    {
      from: RES,
      fromState: {
        from: '/explore',
        fromState: { from: '//evil.example.com' },
      },
    },
    RES,
    '/explore',
  ],
  [
    'from이 외부(//)',
    { from: '//evil.example.com', fromState: { from: '/explore' } },
    '/exercises',
    '/home',
  ],
  ['from이 역슬래시', { from: '/\\evil.example.com' }, '/exercises', '/home'],
]) {
  await go('/exercises/2', 800)
  await inject(usr)
  await sleep(500)
  const b = await backHref()
  let ok = b === expectBack
  await clickBack()
  const w = await where()
  const nextBack = await backHref()
  check(
    `E02 상세 state(${label}): 이전 = ${expectBack === RES ? '검색 결과' : expectBack}, 클릭 후 E01의 이전 = ${expectNext}, 같은 사이트`,
    ok &&
      nextBack === expectNext &&
      (await origin()) === 'http://localhost:5199',
    `back=${b} → ${w} / E01 back=${nextBack}`,
  )
}

console.log(
  '\n===== 다른 화면은 영향 없음 (fromState가 없으면 기존과 동일) =====',
)
await go('/settings', 900)
check(
  '설정(P09) 이전 = /mypage',
  (await ev(
    `document.querySelector('main ${BACK}')?.getAttribute('href')??document.querySelector(${JSON.stringify(BACK)})?.getAttribute('href')`,
  )) === '/mypage',
)
await go('/login', 900)
check(
  '로그인(A01) 이전 = /home',
  (await backHref()) === '/home',
  String(await backHref()),
)
await go('/explore', 800)
await ev(
  `[...document.querySelectorAll('main a')].find(a=>a.getAttribute('href')==='/foods').click()`,
)
await sleep(900)
const foodBack = await ev(
  `(()=>{const a=[...document.querySelectorAll('a')].find(x=>/돌아가기/.test(x.getAttribute('aria-label')||''));return a?a.getAttribute('href'):null})()`,
)
check(
  '음식 탐색(F01)은 변경 없음: 탐색에서 들어오면 이전 = /explore',
  foodBack === '/explore',
  String(foodBack),
)
await go(`/search?q=${q('스쿼트')}&c=exercise`, 1200)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(1100)
check(
  '통합검색 → 상세 이전 = 통합검색 주소(기존 동작)',
  (await backHref()) === `/search?q=${q('스쿼트')}&c=exercise`,
  String(await backHref()),
)
await clickBack()
check(
  '  이전 클릭 → 통합검색 결과 복귀',
  (await where()) === `/search?q=${q('스쿼트')}&c=exercise`,
)
check(
  '접근 이름: E01·E02 이전 버튼 모두 "이전 화면으로 돌아가기"',
  true &&
    (await (async () => {
      await go('/exercises', 700)
      const a = await ev(`!!document.querySelector(${JSON.stringify(BACK)})`)
      await go('/exercises/5', 900)
      const b = await ev(`!!document.querySelector(${JSON.stringify(BACK)})`)
      return a && b
    })()),
)

console.log('\n===== E01 반응형 (검색 전·결과 화면) =====')
for (const [w, h, note] of [
  [160, 640, '200%(320 기준)'],
  [195, 844, '200%(390 기준)'],
  [320, 640, ''],
  [390, 844, ''],
  [768, 1024, ''],
  [1440, 900, ''],
]) {
  await vp(w, h)
  for (const [name, url] of [
    ['검색 전', '/exercises'],
    ['결과', '/exercises?view=results'],
  ]) {
    await go(url, 900)
    const m = await ev(
      `(()=>{const d=document.documentElement;return{sw:d.scrollWidth,cw:d.clientWidth,cards:document.querySelectorAll('main a[href^="/exercises/"]').length}})()`,
    )
    check(
      `E01 ${name} ${w}px ${note}: 가로 스크롤 없음${name === '결과' ? ', 카드 15개 이상' : ''}`,
      m.sw <= m.cw && (name === '검색 전' || m.cards >= 15),
      JSON.stringify(m),
    )
  }
}

console.log('\nconsole problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `\nTOTAL ${t.res.length}  PASS ${t.res.length - f.length}  FAIL ${f.length}`,
)
f.forEach((x) => console.log('  FAIL: ' + x.n))
t.close()
process.exit(0)
