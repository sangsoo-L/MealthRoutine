// [chrome 회귀] E02 운동 상세(비회원 전수)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E02 비회원 접근 정책 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
import { writeFileSync } from 'node:fs'
const OUT = 'out-e02v3-' + Date.now()
const t = await launch(OUT, 9501, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const q = encodeURIComponent
const FAVKEY = (id) => `mealthroutine.dev.mock.exerciseFavorite.${id}`
await vp(390, 844)

// Storage 호출 기록(문서가 새로 열릴 때마다 새 기록). 비회원이 즐겨찾기 저장소에 접근하지 않는지 본다.
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{const log=[];window.__stor=log;for(const m of ['getItem','setItem','removeItem']){const o=Storage.prototype[m];Storage.prototype[m]=function(k,...r){log.push((this===window.localStorage?'L':'S')+':'+m+':'+k);return o.call(this,k,...r)}}})()`,
})
const storLog = () => ev(`window.__stor.slice()`)
const press = async (k, code, vk, mod = 0) => {
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: k,
    code,
    windowsVirtualKeyCode: vk,
    modifiers: mod,
  })
  if (k === 'Enter')
    await cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: '\r',
      key: k,
      code,
      windowsVirtualKeyCode: vk,
    })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: k,
    code,
    windowsVirtualKeyCode: vk,
    modifiers: mod,
  })
  await sleep(120)
}
const setVal = (sel, v) =>
  ev(
    `(()=>{const i=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
const login = async (email, pw) => {
  await go('/login', 900)
  await setVal('input[type=email]', email)
  await setVal('input[type=password]', pw)
  await ev(`document.querySelector('form').requestSubmit()`)
  await sleep(1400)
}
const waitArticle = async (n = 40) => {
  for (let i = 0; i < n; i++) {
    if (await ev(`!!document.querySelector('main article h1')`)) return true
    await sleep(150)
  }
  return false
}

await go('/exercises', 800)
const EX = await ev(
  `(async()=>(await import('/src/exercise/seed/seedData.ts')).getSeedCatalog().getAllExercises())()`,
)
check('시드 카탈로그 로드(105종)', EX.length >= 15)
await ev(`localStorage.clear();sessionStorage.clear()`)

const snapshot = () =>
  ev(`(()=>{
  const m=document.querySelector('main');const a=m?.querySelector('article');if(!a)return null;
  const r=(el)=>el?el.getBoundingClientRect():null;
  const header=a.querySelector('header');const h1=a.querySelector('h1');const chipsRow=header?.children[1];const fig=a.querySelector('figure');const h2=a.querySelector('h2');
  const tx=(s)=>[...a.querySelectorAll(s)].map(n=>n.textContent.trim());
  const labels=[...a.querySelectorAll('[aria-label]')].map(n=>n.getAttribute('aria-label'));
  return {
    h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),
    headerKids:header?[...header.children].map(c=>c.tagName+(c===h1?'(h1)':'')):[],
    buttons:a.querySelectorAll('button').length,
    fav:labels.filter(l=>l.startsWith('즐겨찾기')).length,
    routine:labels.filter(l=>/기록에 추가|계획에 추가/.test(l)).length,
    live:a.querySelectorAll('[aria-live]').length,status:a.querySelectorAll('[role=status]').length,
    loginLink:m.querySelectorAll('a[href="/login"]').length,
    dialogs:document.querySelectorAll('[role=dialog],[role=alertdialog]').length,
    mainText:m.innerText,
    diff:a.querySelector('[role=group][aria-label=난이도]')?.textContent.trim(),
    cat:tx('ul[aria-label="운동 분류"] li'),parts:tx('ul[aria-label="운동 부위"] li'),tools:tx('ul[aria-label="운동 도구"] li'),
    steps:tx('ol > li p'),cautions:tx('section[aria-labelledby="exercise-cautions-title"] li'),h2s:tx('h2'),
    gapFigH1:h1&&fig?Math.round(r(h1).top-r(fig).bottom):null,
    gapH1Chips:h1&&chipsRow?Math.round(r(chipsRow).top-r(h1).bottom):null,
    gapChipsH2:chipsRow&&h2?Math.round(r(h2).top-r(chipsRow).bottom):null,
    headerTrail:header&&chipsRow?Math.round(r(header).bottom-r(chipsRow).bottom):null,
    h1w:h1?Math.round(r(h1).width):null,mainW:Math.round(m.clientWidth-parseFloat(getComputedStyle(m).paddingLeft)-parseFloat(getComputedStyle(m).paddingRight))}})()`)

console.log('\n===== A. 비회원: 시드 전체 =====')
const bad = []
for (const e of EX) {
  await go('/exercises/' + e.id, 600)
  await waitArticle()
  const r = await snapshot()
  const ok =
    r &&
    r.h1.length === 1 &&
    r.h1[0] === e.name &&
    r.buttons === 0 &&
    r.fav === 0 &&
    r.routine === 0 &&
    r.live === 0 &&
    r.status === 0 &&
    r.loginLink === 0 &&
    r.dialogs === 0 &&
    r.headerKids.join() === 'H1(h1),DIV' &&
    !/로그인/.test(r.mainText) &&
    r.diff === e.difficulty &&
    r.cat.join() === e.category &&
    r.parts.join() === e.targetMuscles.join() &&
    r.tools.join() === e.equipment.join() &&
    r.steps.join('\n') === e.instructions.join('\n') &&
    r.cautions.join('\n') === e.precautions.join('\n') &&
    r.h2s.join() ===
      [...(e.summary ? ['운동 소개'] : []), '운동 방법', '주의사항'].join() &&
    Math.abs(r.gapFigH1 - 20) <= 2 &&
    Math.abs(r.gapH1Chips - 12) <= 2 &&
    r.gapChipsH2 >= 30 &&
    r.gapChipsH2 <= 36 &&
    r.headerTrail <= 1
  if (!ok) bad.push({ id: e.id, r: { ...r, mainText: undefined } })
}
check(
  '시드 전체: 운동 정보(운동명·난이도·분류·부위·도구·방법·주의사항) 정상 표시 + 즐겨찾기·오늘 기록·내일 계획 버튼 0개(DOM 미존재) + live 영역·status·로그인 링크·안내문·대화상자 없음 + 헤더 자식은 h1과 칩 줄뿐',
  bad.length === 0,
  bad.length ? JSON.stringify(bad[0]).slice(0, 600) : '',
)
await go('/exercises/27', 900)
await waitArticle()
let g = await snapshot()
console.log(
  '  비회원 레이아웃 간격(px):',
  JSON.stringify({
    '미디어→운동명': g.gapFigH1,
    '운동명→칩': g.gapH1Chips,
    '칩→운동방법': g.gapChipsH2,
    헤더끝여백: g.headerTrail,
    h1너비: g.h1w,
    '본문 콘텐츠 폭': g.mainW,
  }),
)
check(
  '비회원 레이아웃: 운동명이 본문 전체 폭 사용(별 버튼 자리 빈 공간 없음), 미디어→운동명 20 · 운동명→칩 12 · 칩→운동 방법 32(액션 영역·빈 컨테이너 여백 없음)',
  g.h1w === g.mainW &&
    g.gapFigH1 === 20 &&
    g.gapH1Chips === 12 &&
    Math.abs(g.gapChipsH2 - 32) <= 2 &&
    g.headerTrail <= 1,
  JSON.stringify(g),
)

console.log('\n===== B. 비회원: 접근·이동 (강제 로그인 이동·안내 없음) =====')
await go('/exercises/5', 700)
await waitArticle()
await sleep(1500)
let pth = await ev(`location.pathname`)
g = await snapshot()
check(
  '상세 직접 접근: 주소 유지(로그인 페이지로 이동하지 않음), 1.5초 뒤에도 그대로, 운동 정보 표시, 안내·대화상자 없음',
  pth === '/exercises/5' &&
    g.h1[0] === '푸시업' &&
    g.dialogs === 0 &&
    g.status === 0 &&
    !/로그인/.test(g.mainText),
  pth,
)
await ev(`location.reload()`)
await sleep(1300)
await waitArticle()
pth = await ev(`location.pathname`)
g = await snapshot()
check(
  '새로고침: 같은 상세 유지, 버튼 없음',
  pth === '/exercises/5' && g.h1[0] === '푸시업' && g.buttons === 0,
)
const e01 = `/exercises?q=${q('덤벨')}&difficulty=${q('중급')}&view=results`
await go(e01, 1400)
globalThis.__n = await ev(
  `document.querySelectorAll('main a[href^="/exercises/"]').length`,
)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(900)
await waitArticle()
g = await snapshot()
check(
  'E01 결과 → E02(덤벨 로우): 정보 표시, 버튼 없음, 주소 유지',
  /^\/exercises\/[^/]+$/.test(await ev(`location.pathname`)) &&
    !!g.h1[0] &&
    g.buttons === 0 &&
    g.loginLink === 0,
)
check(
  '  "이전" 링크 = 검색 조건이 담긴 E01 결과 주소',
  (await ev(
    `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))?.getAttribute('href')`,
  )) === e01,
)
await ev(
  `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText)).click()`,
)
await sleep(1400)
check(
  '  "이전" → 검색 조건·결과(덤벨 중급, 건수 동일) 복원',
  (await ev(`location.pathname+location.search`)) === e01 &&
    (await ev(
      `document.querySelectorAll('main a[href^="/exercises/"]').length`,
    )) === globalThis.__n,
)
await ev(`document.querySelector('main a[href="/exercises/7"]').click()`)
await sleep(900)
await ev(`history.back()`)
await sleep(1200)
check(
  '  브라우저 뒤로가기 → E01 결과 복원',
  (await ev(`location.pathname+location.search`)) === e01,
)
await ev(`history.forward()`)
await sleep(1100)
await waitArticle()
g = await snapshot()
check(
  '  브라우저 앞으로가기 → E02, 버튼 없음',
  g && g.h1[0] === '덤벨 숄더 프레스' && g.buttons === 0,
)
const sr = `/search?q=${q('맨몸 스쿼트')}&c=exercise`
await go(sr, 1300)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(900)
await waitArticle()
g = await snapshot()
check(
  '통합검색 결과 → E02(맨몸 스쿼트): 정보 표시, 버튼 없음',
  !!g.h1[0] &&
    g.buttons === 0 &&
    /^\/exercises\/[^/]+$/.test(await ev(`location.pathname`)),
)
check(
  '  "이전" = 통합검색 주소',
  (await ev(
    `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))?.getAttribute('href')`,
  )) === sr,
)
// 키보드 Tab 순서: 회원 전용 버튼이 끼지 않는다
await go('/exercises/5', 700)
await waitArticle()
await ev(`document.activeElement&&document.activeElement.blur()`)
const stops = []
for (let i = 0; i < 7; i++) {
  await press('Tab', 'Tab', 9)
  stops.push(
    await ev(
      `(()=>{const e=document.activeElement;return (e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,22)})()`,
    ),
  )
}
console.log('  Tab 순서:', JSON.stringify(stops))
check(
  'Tab 순서: 첫 정지점은 "이전", 즐겨찾기·오늘 기록·내일 계획 정지점 없음(이후는 하단 탭)',
  stops[0] === '이전 화면으로 돌아가기' &&
    !stops.some((x) => /즐겨찾기|에 추가/.test(x)) &&
    stops.slice(1, 6).join() === '홈,탐색,기록,AI,마이',
  JSON.stringify(stops),
)
// 상태 화면(비회원도 기존 방식 그대로)
await go('/exercises/no-such-exercise', 1200)
check(
  '없는 운동 ID(비회원): "찾을 수 없는 운동이에요", 로그인 이동 없음',
  await ev(
    `document.querySelector('main').innerText.includes('찾을 수 없는 운동이에요')&&location.pathname==='/exercises/no-such-exercise'`,
  ),
)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exercise')`,
)
await go('/exercises/5', 1200)
check(
  '운동 조회 실패(비회원): role=alert, 로그인 이동 없음',
  await ev(
    `!!document.querySelector('main [role=alert]')&&location.pathname==='/exercises/5'`,
  ),
)
await ev(
  `localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad');localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exercise')`,
)
await go('/exercises/5', 1200)
check(
  '운동 데이터 미연결(비회원): "운동 정보를 준비하고 있어요", 로그인 이동 없음',
  await ev(
    `document.querySelector('main').innerText.includes('운동 정보를 준비하고 있어요')&&location.pathname==='/exercises/5'`,
  ),
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`)

console.log('\n===== C. 즐겨찾기 저장소 접근 (Storage 호출 기록) =====')
await ev(`localStorage.clear()`)
await go('/exercises/5', 700)
await waitArticle()
await sleep(800)
const gl = await storLog()
const flagReads = (l) =>
  l.filter((x) => x.startsWith('L:getItem:mealthroutine.dev.mock.flag.')).length
check(
  '비회원: 즐겨찾기 키(exerciseFavorite)를 읽지도 쓰지도 않음, 개발용 저장소에 쓰기(setItem) 없음',
  !gl.some((x) => x.includes('exerciseFavorite')) &&
    !gl.some((x) => x.startsWith('L:setItem:mealthroutine.dev.mock')) &&
    !gl.some((x) => x.includes(':removeItem:')),
  JSON.stringify(gl),
)
await login('member.free@example.com', 'Mr-Dev-Free-2026')
await go('/exercises/5', 700)
await waitArticle()
await sleep(1200)
const ml = await storLog()
check(
  '회원: 같은 화면에서 즐겨찾기 키를 읽음(조회 수행)',
  ml.some((x) => x === `L:getItem:${FAVKEY('free')}`),
  JSON.stringify(ml.filter((x) => x.includes('exerciseFavorite'))),
)
check(
  `개발용 스위치(flag) 읽기 횟수: 비회원 ${flagReads(gl)}회 < 회원 ${flagReads(ml)}회 (즐겨찾기 저장소 생성·조회분만큼 회원이 더 읽음)`,
  flagReads(gl) > 0 && flagReads(ml) > flagReads(gl),
  `${flagReads(gl)} / ${flagReads(ml)}`,
)

console.log('\n===== D. 실제 로그인·로그아웃 흐름 (같은 탭) =====')
await go('/exercises/5', 700)
await waitArticle()
g = await snapshot()
check(
  '로그인 회원: 버튼 3개(즐겨찾기 별·오늘 기록·내일 계획) 표시, 운동 정보도 표시',
  g.fav === 1 && g.routine === 2 && g.buttons === 3 && g.h1[0] === '푸시업',
)
const m = await ev(
  `(()=>{const a=document.querySelector('main article');const h1=a.querySelector('h1');const star=a.querySelector('header button[aria-label^="즐겨찾기"]');const hdr=a.querySelector('header');return{starRight:Math.round(star.getBoundingClientRect().left)>Math.round(h1.getBoundingClientRect().left),rows:hdr.children.length,sameRowTop:Math.abs(h1.getBoundingClientRect().top-star.getBoundingClientRect().top)<14}})()`,
)
check(
  '회원 레이아웃: 별이 운동명 오른쪽, 헤더는 [운동명 줄·칩 줄·액션 영역] 구성(기존 디자인 유지)',
  m.starRight && m.sameRowTop,
  JSON.stringify(m),
)
// 설정 화면의 로그아웃 → 같은 상세 재방문
await go('/settings', 1000)
for (
  let i = 0;
  i < 80 &&
  !(await ev(
    `!![...document.querySelectorAll('main button')].find(x=>/로그아웃/.test(x.innerText))`,
  ));
  i++
)
  await sleep(100)
const lo = await ev(
  `(()=>{const b=[...document.querySelectorAll('main button')].find(x=>/로그아웃/.test(x.innerText));if(!b)return null;b.click();return true})()`,
)
await sleep(1200)
console.log('  로그아웃 클릭:', lo, '→ path', await ev(`location.pathname`))
await go('/exercises/5', 700)
await waitArticle()
g = await snapshot()
check(
  '로그아웃 후 같은 상세: 운동 정보 표시, 즐겨찾기·오늘 기록·내일 계획 버튼 DOM 없음',
  lo === true &&
    g.h1[0] === '푸시업' &&
    g.buttons === 0 &&
    g.fav === 0 &&
    g.routine === 0,
)
await ev(`localStorage.clear()`)

console.log(
  '\n===== E. 인증 상태별 처리 (인증 Context 값을 직접 바꿔 가며 격리 렌더) =====',
)
await go('/exercises', 700)
const srcText = (
  await Promise.all(
    ['/src/main.tsx', '/src/pages/ExerciseDetailPage.tsx'].map((u) =>
      fetch('http://localhost:5199' + u).then((x) => x.text()),
    ),
  )
).join('\n')
const dep = (nm) => {
  const i = srcText.indexOf('/node_modules/.vite/deps/' + nm + '.js?v=')
  if (i < 0) throw new Error('dep ' + nm)
  return srcText.slice(i).match(/^[^"'\s]+/)[0]
}
const URLS = {
  dom: dep('react-dom_client'),
  router: dep('react-router'),
  react: dep('react'),
}
await ev(
  `localStorage.setItem(${JSON.stringify(FAVKEY('free'))},JSON.stringify({v:1,ids:['5']}))`,
)
await ev(`(async()=>{
  const U=${JSON.stringify(URLS)};
  const [dom,{MemoryRouter},react,{AuthContext},{default:View},{default:FavProvider},SEEDMOD] = await Promise.all([import(U.dom),import(U.router),import(U.react),import('/src/auth/authContext.ts'),import('/src/components/exercise/ExerciseDetailView.tsx'),import('/src/exercise/FavoritesProvider.tsx'),import('/src/exercise/seed/seedData.ts')]); const {default:DraftProvider}=await import('/src/exercise/WorkoutDraftProvider.tsx');
  const h = react.createElement ?? react.default.createElement; const createRoot = dom.createRoot ?? dom.default.createRoot;
  const host=document.createElement('div'); host.id='host'; host.style.cssText='padding:0 20px;width:100%;box-sizing:border-box'; document.body.appendChild(host);
  const root=createRoot(host); const ex=SEEDMOD.getSeedCatalog().getExerciseById('5');
  const mk=(id)=>({id,email:id+'@example.com',nickname:id,entitlement:'free'});
  window.__setAuth=async(status,userId)=>{
    root.render(h(MemoryRouter,null,h(AuthContext,{value:{status,user:userId?mk(userId):null,login:async()=>({ok:false,reason:'invalid'}),logout(){}}},h(FavProvider,null,h(DraftProvider,null,h(View,{exercise:ex}))))));
    await new Promise(r=>setTimeout(r,60));
  };
})()`)
const probe = () =>
  ev(
    `(()=>{const a=document.querySelector('#host article');const labels=[...a.querySelectorAll('[aria-label]')].map(n=>n.getAttribute('aria-label'));return{h1:a.querySelector('h1')?.textContent,buttons:a.querySelectorAll('button').length,star:labels.find(l=>l.startsWith('즐겨찾기'))??null,routine:labels.filter(l=>/기록에 추가|계획에 추가/.test(l)).length,live:a.querySelectorAll('[aria-live]').length,steps:a.querySelectorAll('ol > li').length}})()`,
  )
const settle = async (pred, n = 25) => {
  let p
  for (let i = 0; i < n; i++) {
    p = await probe()
    if (pred(p)) return p
    await sleep(120)
  }
  return p
}
const clearLog = () => ev(`window.__stor.length=0`)

await clearLog()
await ev(`window.__setAuth('unauthenticated',null)`)
await sleep(400)
let p = await probe()
let lg = await storLog()
check(
  '① 비회원(unauthenticated): 운동 정보 표시, 버튼 0개·live 영역 없음, 즐겨찾기 저장소 접근 없음',
  p.h1 === '푸시업' &&
    p.steps === 0 &&
    p.buttons === 0 &&
    p.live === 0 &&
    !lg.some((x) => x.includes('exerciseFavorite')),
  JSON.stringify({ p, lg }),
)
await ev(`window.__setAuth('authenticated','free')`)
p = await settle((x) => x.star && !x.star.includes('확인 중'))
check(
  '② 비회원 → 로그인 회원(free): 별·오늘 기록·내일 계획 3개 표시, 등록된 운동이라 "즐겨찾기 해제"',
  p.buttons === 3 && p.routine === 2 && p.star === '즐겨찾기 해제: 푸시업',
  JSON.stringify(p),
)
lg = await storLog()
check(
  '  이때 free의 즐겨찾기 키를 읽음',
  lg.includes(`L:getItem:${FAVKEY('free')}`),
  JSON.stringify(lg.filter((x) => x.includes('exerciseFavorite'))),
)
await ev(`window.__setAuth('authenticated','full')`)
await sleep(30)
p = await probe()
check(
  '③ 계정 변경(free → full) 직후: 이전 계정의 "해제" 상태가 보이지 않음(조회 중이거나 full의 상태)',
  p.star !== null && !p.star.startsWith('즐겨찾기 해제'),
  JSON.stringify(p),
)
p = await settle((x) => x.star && !x.star.includes('확인 중'))
check(
  '  full의 상태 확정: 미등록이라 "즐겨찾기에 추가", 버튼 3개 유지',
  p.star === '즐겨찾기에 추가: 푸시업' && p.buttons === 3,
  JSON.stringify(p),
)
await ev(`window.__setAuth('authenticated','free')`)
await sleep(30)
p = await probe()
check(
  '  다시 free로 변경해도 full의 상태가 남지 않음(조회 중이거나 free의 상태)',
  p.star !== null &&
    (p.star.includes('확인 중') || p.star === '즐겨찾기 해제: 푸시업'),
  JSON.stringify(p),
)
p = await settle((x) => x.star && !x.star.includes('확인 중'))
check(
  '  free 상태 확정: "즐겨찾기 해제"',
  p.star === '즐겨찾기 해제: 푸시업',
  JSON.stringify(p),
)
await clearLog()
await ev(`window.__setAuth('unauthenticated',null)`)
await sleep(400)
p = await probe()
lg = await storLog()
check(
  '④ 로그인 회원 → 로그아웃: 버튼 3개 모두 제거(DOM 없음), 운동 정보는 그대로, 이후 즐겨찾기 저장소 접근 없음',
  p.h1 === '푸시업' &&
    p.steps === 0 &&
    p.buttons === 0 &&
    p.star === null &&
    p.live === 0 &&
    !lg.some((x) => x.includes('exerciseFavorite')),
  JSON.stringify({ p, lg }),
)
for (const [status, uid, label] of [
  [
    'authenticated',
    null,
    '⑤ 인증 상태 불명확: authenticated인데 사용자 정보 없음',
  ],
  ['loading', null, '⑥ 인증 확인 중: status=loading, 사용자 없음'],
  [
    'loading',
    'free',
    '⑦ 인증 확인 중이지만 사용자 정보가 이미 있는 경우: status=loading',
  ],
  [
    'unauthenticated',
    'free',
    '⑧ 모순된 상태: unauthenticated인데 사용자 정보가 남은 경우',
  ],
  ['unknown', 'free', '⑨ 알 수 없는 status 값'],
]) {
  await clearLog()
  await ev(`window.__setAuth(${JSON.stringify(status)},${JSON.stringify(uid)})`)
  await sleep(400)
  p = await probe()
  lg = await storLog()
  check(
    `${label}: 회원 전용 버튼 숨김(DOM 없음), 운동 정보는 표시, 즐겨찾기 저장소 접근 없음`,
    p.h1 === '푸시업' &&
      p.steps === 0 &&
      p.buttons === 0 &&
      p.live === 0 &&
      !lg.some((x) => x.includes('exerciseFavorite')),
    JSON.stringify({ p, lg }),
  )
}
await ev(`window.__setAuth('authenticated','free')`)
p = await settle(
  (x) => x.buttons === 3 && x.star && !x.star.includes('확인 중'),
)
check(
  '불명확한 상태에서 확정된 회원 상태로 돌아오면 버튼 3개가 다시 나타남',
  p.buttons === 3,
  JSON.stringify(p),
)

console.log('\n===== F. 반응형 (비회원·회원) =====')
for (const [who, setup] of [
  [
    '비회원',
    async () => {
      await ev(`sessionStorage.clear()`)
    },
  ],
  [
    '회원',
    async () => {
      await login('member.free@example.com', 'Mr-Dev-Free-2026')
    },
  ],
]) {
  await vp(390, 844)
  await setup()
  for (const [w, h, note] of [
    [160, 640, '200%(320 기준)'],
    [195, 844, '200%(390 기준)'],
    [320, 640, ''],
    [390, 844, ''],
    [768, 1024, ''],
    [1440, 900, ''],
  ]) {
    await vp(w, h)
    await go('/exercises/27', 700)
    await waitArticle()
    const r = await ev(
      `(()=>{const d=document.documentElement;const els=[...document.querySelectorAll('main article *')].filter(e=>e.getBoundingClientRect().width>0&&!(e.closest('figure')&&e.getAttribute('aria-hidden')==='true'));const a=document.querySelector('main article');return{sw:d.scrollWidth,cw:d.clientWidth,over:els.filter(e=>e.getBoundingClientRect().right>d.clientWidth+0.5||e.getBoundingClientRect().left<-0.5).length,buttons:a.querySelectorAll('button').length}})()`,
    )
    check(
      `${who} ${w}px ${note}: 가로 스크롤·잘림 없음, 버튼 ${who === '회원' ? '3' : '0'}개`,
      r.sw <= r.cw && r.over === 0 && r.buttons === (who === '회원' ? 3 : 0),
      JSON.stringify(r),
    )
  }
}
// 긴 운동명(비회원): 운동명이 전체 폭을 쓰며 잘리지 않는다
await vp(320, 640)
await ev(`sessionStorage.clear()`)
await go('/exercises/27', 700)
await waitArticle()
g = await snapshot()
check(
  '긴 운동명(덤벨 루마니안 데드리프트, 비회원 320px): 운동명이 본문 전체 폭, 칩 줄바꿈 후 운동 방법이 이어짐',
  g.h1w === g.mainW &&
    g.gapChipsH2 >= 30 &&
    g.gapChipsH2 <= 36 &&
    g.buttons === 0,
  JSON.stringify({ h1w: g.h1w, mainW: g.mainW, gap: g.gapChipsH2 }),
)
await vp(390, 844)
await go('/exercises/27', 700)
await waitArticle()
const sc = await cdp('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
})
writeFileSync(`${t.out}/guest-390.png`, Buffer.from(sc.data, 'base64'))
await vp(320, 640)
await go('/exercises/27', 700)
await waitArticle()
const sc2 = await cdp('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
})
writeFileSync(`${t.out}/guest-320.png`, Buffer.from(sc2.data, 'base64'))

console.log('\nconsole problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `\nTOTAL ${t.res.length}  PASS ${t.res.length - f.length}  FAIL ${f.length}`,
)
f.forEach((x) => console.log('  FAIL: ' + x.n))
console.log('OUT=' + t.out)
t.close()
process.exit(0)
