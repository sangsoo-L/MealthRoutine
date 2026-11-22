// [chrome 회귀] W13 운동 검색·즐겨찾기 등록
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// W13-B 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-w13-' + Date.now()
const t = await launch(OUT, 9801, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const FK = (id) => `mealthroutine.dev.mock.exerciseFavorite.${id}`
const PATH = '/records/exercise/select'
const PENDING = '구성 화면이 준비 중이에요. 선택한 운동은 저장되지 않았어요.'
const q = (s) => JSON.stringify(s)
await vp(390, 844)
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{const log=[];window.__stor=log;for(const m of ['getItem','setItem','removeItem']){const o=Storage.prototype[m];Storage.prototype[m]=function(k,...r){log.push(m+':'+k);return o.call(this,k,...r)}}})()`,
})

const until = async (expr, n = 60) => {
  for (let i = 0; i < n; i++) {
    if (await ev(expr)) return true
    await sleep(100)
  }
  return false
}
const press = async (k, code, vk) => {
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key: k,
    code,
    windowsVirtualKeyCode: vk,
  })
  if (k === 'Enter')
    await cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: '\r',
      key: k,
      code,
      windowsVirtualKeyCode: vk,
    })
  if (k === ' ')
    await cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: ' ',
      key: k,
      code,
      windowsVirtualKeyCode: vk,
    })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: k,
    code,
    windowsVirtualKeyCode: vk,
  })
  await sleep(150)
}
const setVal = (sel, v) =>
  ev(
    `(()=>{const i=document.querySelector(${q(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${q(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
const spa = async (path, state) => {
  await ev(
    `(()=>{history.pushState({usr:${JSON.stringify(state ?? null)},key:'k'+Date.now(),idx:(history.state?.idx??0)+1},'',${q(path)});dispatchEvent(new PopStateEvent('popstate',{state:{}}))})()`,
  )
  await until(`location.pathname===${q(path.split('?')[0])}`, 20)
  await sleep(200)
}
const login = async (email, pw) => {
  await go('/login', 900)
  await setVal('input[type=email]', email)
  await setVal('input[type=password]', pw)
  await ev(`document.querySelector('form').requestSubmit()`)
  await sleep(1400)
}
const seedFav = (uid, ids) =>
  ev(
    `localStorage.setItem(${q(FK(uid))},JSON.stringify({v:1,ids:${JSON.stringify(ids)}}))`,
  )
const favStored = (uid) =>
  ev(`JSON.parse(localStorage.getItem(${q(FK(uid))})||'{"ids":[]}').ids`)
const flag = (name, v) =>
  ev(
    v
      ? `localStorage.setItem('mealthroutine.dev.mock.flag.${name}',${q(v)})`
      : `localStorage.removeItem('mealthroutine.dev.mock.flag.${name}')`,
  )
const stor = () => ev(`window.__stor.slice()`)
const settled = `!!document.querySelector('main section[aria-label="운동 목록"]')&&!/찾는 중이에요/.test(document.querySelector('main section[aria-label="운동 목록"]').innerText)`
const open = async (p = PATH) => {
  await go(p, 500)
  await until(settled, 70)
  await sleep(150)
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const snap = () =>
  ev(`(()=>{
  const m=document.querySelector('main');const frame=m.querySelector('section[aria-label="운동 목록"]');
  const rows=frame?[...frame.querySelectorAll('ul > li')].filter(li=>li.querySelector('button[aria-pressed]')).map(li=>{const sel=li.querySelector('button[aria-pressed]');const star=li.querySelector('button[aria-label^="즐겨찾기"]');return{name:sel.querySelector('span span').textContent.trim(),pressed:sel.getAttribute('aria-pressed')==='true',star:star.getAttribute('aria-label'),starDisabled:star.getAttribute('aria-disabled'),failed:/변경하지 못했어요/.test(li.innerText)}}):[];
  const foot=m.querySelector('section[aria-label="선택한 운동"]');
  const prim=foot&&[...foot.querySelectorAll('button')].find(b=>/개 운동 등록/.test(b.innerText));
  const toggle=foot&&[...foot.querySelectorAll('button[aria-expanded]')][0];
  return{h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),
    nav:document.querySelectorAll('nav').length,
    tabs:[...m.querySelectorAll('[role=group][aria-label="운동 찾는 방법"] button')].map(b=>b.innerText.trim()+':'+b.getAttribute('aria-pressed')),
    sub:m.querySelector('header p')?.textContent,
    rows,count:[...(frame?.querySelectorAll('p[role=status]')??[])].map(p=>p.textContent).find(t=>t.endsWith('개 운동')&&t.length<9&&!isNaN(parseInt(t)))??null,
    frameText:frame?frame.innerText.replace(/\\s+/g,' ').trim():null,
    alert:!!frame?.querySelector('[role=alert]'),
    footCount:foot?.querySelector('p[role=status]')?.textContent??null,
    primary:prim?{t:prim.innerText.trim(),dis:prim.disabled}:null,
    sel:foot?[...foot.querySelectorAll('ol li')].map(li=>li.querySelector('span').textContent.replace(/^\\d+/,'').trim()):[],
    toggle:toggle?{t:toggle.innerText.trim(),exp:toggle.getAttribute('aria-expanded')}:null,
    notice:foot?.querySelector('[aria-live] p')?.textContent??null,
    announce:m.querySelector('p.sr-only[role=status]')?.textContent??null,
    cancel:foot?[...foot.querySelectorAll('a')].map(a=>({t:a.innerText.trim(),h:a.getAttribute('href')})):[],
    back:m.querySelector('header a')?.getAttribute('href')??null,
    input:m.querySelector('input#picker-query')?.value??null,
    path:location.pathname+location.search}})()`)
const clickRow = (name) =>
  ev(
    `(()=>{const li=[...document.querySelectorAll('main section[aria-label="운동 목록"] ul > li')].find(l=>l.querySelector('button[aria-pressed] span span')?.textContent.trim()===${q(name)});li.querySelector('button[aria-pressed]').click()})()`,
  )
const clickStar = (name) =>
  ev(
    `(()=>{const li=[...document.querySelectorAll('main section[aria-label="운동 목록"] ul > li')].find(l=>l.querySelector('button[aria-pressed] span span')?.textContent.trim()===${q(name)});li.querySelector('button[aria-label^="즐겨찾기"]').click()})()`,
  )
const tab = (label) =>
  ev(
    `[...document.querySelectorAll('[role=group][aria-label="운동 찾는 방법"] button')].find(b=>b.innerText.trim()===${q(label)}).click()`,
  )
const search = async (v) => {
  await setVal('input#picker-query', v)
  await ev(`document.querySelector('form[role=search]').requestSubmit()`)
  await sleep(200)
}
const names = (s) => s.rows.map((r) => r.name)
const footBtn = (re) =>
  ev(
    `[...document.querySelectorAll('main section[aria-label="선택한 운동"] button')].find(b=>${re}.test(b.getAttribute('aria-label')||b.innerText)).click()`,
  )

await go('/login', 800)
await ev(`localStorage.clear();sessionStorage.clear()`)
await go('/exercises', 700)
const EX = await ev(
  `(async()=>(await import('/src/exercise/seed/seedData.ts')).getSeedCatalog().getAllExercises())()`,
)
check('시드 운동 로드(105종)', EX.length >= 15)
const catalogOrder = (ids) =>
  EX.filter((e) => ids.includes(e.id)).map((e) => e.name)
const norm = (s) => s.replace(/\s+/g, '').toLowerCase()
const expectSearch = (qq) =>
  EX.filter((e) =>
    [e.name, e.category, ...e.targetMuscles, ...e.equipment].some((f) =>
      norm(f).includes(norm(qq)),
    ),
  ).map((e) => e.name)

console.log('\n===== A. 접근: 비회원 / 회원 =====')
await go('/login', 600)
await ev(`localStorage.clear()`)
await ev(`window.__stor.length=0`)
await go(PATH, 900)
await sleep(700)
const gtext = await ev(
  `document.querySelector('main').innerText.replace(/\\s+/g,' ')`,
)
const gstor = await stor()
check(
  '비회원 직접 접근: 기존 승인 로그인 안내만 표시, 주소 유지',
  gtext.includes('로그인 후 이용할 수 있어요') &&
    gtext.includes('건강 관리 서비스를 이용하려면 로그인이 필요해요.') &&
    (await ev(`location.pathname`)) === PATH,
  gtext.slice(0, 90),
)
check(
  '비회원: 운동 선택 UI(탭·검색·목록·선택 영역) DOM 없음, h1은 화면 이름 1개(보조기기용)',
  await ev(
    `!document.querySelector('[aria-label="운동 찾는 방법"],[aria-label="운동 목록"],[aria-label="선택한 운동"]')&&document.querySelectorAll('h1').length===1&&document.querySelector('h1').textContent==='운동 검색·등록'`,
  ),
)
check(
  '비회원: 즐겨찾기·운동 데이터 저장소 접근 0건(개발용 Mock 키·스위치 키를 읽지도 쓰지도 않음. 라우터·세션 복원 키는 앱 공통)',
  !gstor.some((x) => x.includes('mealthroutine.dev.mock')) &&
    !gstor.some(
      (x) => /^(set|remove)Item:/.test(x) && !x.includes('react-router'),
    ),
  JSON.stringify(gstor),
)
check(
  '하단 공통 탭 없음(비회원 안내에서도)',
  (await ev(`document.querySelectorAll('nav').length`)) === 0,
)
for (const [w, h] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
]) {
  await vp(w, h)
  await sleep(250)
  const m = await ev(
    `(()=>{const d=document.documentElement;const sec=document.querySelector('main section');const r=sec.getBoundingClientRect();return{scrollOver:d.scrollHeight-innerHeight,secH:Math.round(r.height),vh:innerHeight,blankBelow:Math.round(innerHeight-r.bottom-20),xo:d.scrollWidth-d.clientWidth}})()`,
  )
  console.log(`  [측정] 비회원 안내 ${w}x${h}:`, JSON.stringify(m))
  check(
    `비회원 안내 ${w}x${h}: 세로 스크롤·가로 넘침 없고 하단탭 자리를 비워 두지 않음(안내 아래 빈 공간 ≤2px)`,
    m.scrollOver <= 0 && m.xo <= 0 && m.blankBelow <= 2 && m.blankBelow >= -2,
    JSON.stringify(m),
  )
}
await vp(390, 844)
await go('/onboarding/assessment', 900)
await sleep(500)
const ob = await ev(
  `(()=>{const sec=document.querySelector('main section');const r=sec.getBoundingClientRect();return{txt:document.querySelector('main').innerText.replace(/\s+/g,' ').slice(0,40),blank:Math.round(innerHeight-r.bottom-20),over:document.documentElement.scrollHeight-innerHeight}})()`,
)
check(
  '(같은 수정이 적용되는 이해도 확인 화면의 비회원 안내) 로그인 안내 표시, 스크롤 없음, 하단 빈 공간 ≤2px',
  ob.txt.includes('로그인 후 이용할 수 있어요') &&
    ob.over <= 0 &&
    Math.abs(ob.blank) <= 2,
  JSON.stringify(ob),
)

await login('member.free@example.com', 'Mr-Dev-Free-2026')
await seedFav('free', ['16', '5', '22'])
await open()
let s = await snap()
check(
  '회원: h1 "운동 검색·등록" 1개, 하단 공통 탭 없음, 부제 표시',
  same(s.h1, ['운동 검색·등록']) &&
    s.nav === 0 &&
    s.sub === '운동을 여러 개 선택한 뒤 목록에 추가해 주세요.',
  JSON.stringify([s.h1, s.nav, s.sub]),
)
check(
  '초기 탭은 즐겨찾기(눌림), 직접 검색은 눌리지 않음',
  same(s.tabs, ['즐겨찾기:true', '직접 검색:false']),
  JSON.stringify(s.tabs),
)
check(
  '이전 링크와 하단 취소 링크 = 임시 상위 화면 /records/exercise',
  s.back === '/records/exercise' &&
    s.cancel.length === 1 &&
    s.cancel[0].h === '/records/exercise' &&
    s.cancel[0].t === '선택 취소 · 구성으로 돌아가기',
  JSON.stringify([s.back, s.cancel]),
)

console.log('\n===== B. 즐겨찾기 탭 =====')
check(
  '즐겨찾기 3개: 카탈로그 순서(푸시업·맨몸 스쿼트·플랭크)로 표시(등록 순서 맨몸 스쿼트·푸시업·플랭크가 아님)',
  same(names(s), ['푸시업', '맨몸 스쿼트', '플랭크']) &&
    same(names(s), catalogOrder(['16', '5', '22'])),
  JSON.stringify(names(s)),
)
check(
  '"3개 운동" 개수 안내와 시안 안내 "별표로 저장해 둔 운동을 선택할 수 있어요."',
  s.count === '3개 운동' &&
    s.frameText.includes('별표로 저장해 둔 운동을 선택할 수 있어요.'),
)
check(
  '별 접근 이름은 E02 형식("즐겨찾기 해제: 이름"), 선택 버튼은 모두 미선택',
  s.rows.every((r) => r.star === `즐겨찾기 해제: ${r.name}` && !r.pressed),
)
check(
  '선택 0개: 등록 버튼 "선택한 0개 운동 등록" 비활성, "선택한 운동 0개", 선택 목록 없음',
  s.primary.dis &&
    s.primary.t === '선택한 0개 운동 등록' &&
    s.footCount === '선택한 운동 0개' &&
    s.sel.length === 0,
  JSON.stringify([s.primary, s.footCount]),
)
await clickRow('플랭크')
await clickRow('푸시업')
await sleep(100)
s = await snap()
check(
  '플랭크 → 푸시업 순으로 선택: 선택 목록이 선택한 순서, 개수 2, 등록 버튼 "선택한 2개 운동 등록" 활성',
  same(s.sel, ['플랭크', '푸시업']) &&
    s.footCount === '선택한 운동 2개' &&
    !s.primary.dis &&
    s.primary.t === '선택한 2개 운동 등록',
  JSON.stringify([s.sel, s.footCount, s.primary]),
)
check(
  '선택된 행만 aria-pressed=true(푸시업·플랭크)',
  same(
    s.rows.filter((r) => r.pressed).map((r) => r.name),
    ['푸시업', '플랭크'],
  ),
)
await clickStar('푸시업')
await sleep(120)
let mid = await snap()
check(
  '별 저장 중: 해당 별 aria-disabled, 행은 아직 그대로(저장 전에는 사라지지 않음)',
  mid.rows.find((r) => r.name === '푸시업')?.starDisabled === 'true' &&
    mid.rows.length === 3,
  JSON.stringify(mid.rows.find((r) => r.name === '푸시업')),
)
await sleep(500)
s = await snap()
check(
  '푸시업 별 해제 성공: 즐겨찾기 탭에서 행이 사라짐, 보이지 않는 안내 "푸시업: 즐겨찾기에서 삭제했어요."',
  same(names(s), ['맨몸 스쿼트', '플랭크']) &&
    s.count === '2개 운동' &&
    s.announce === '푸시업: 즐겨찾기에서 삭제했어요.',
  JSON.stringify([names(s), s.announce]),
)
check(
  '★ 숨은 선택 해결: 행이 사라져도 선택은 유지, 하단 선택 목록에 푸시업이 남고 개수 2·등록 활성',
  same(s.sel, ['플랭크', '푸시업']) &&
    s.footCount === '선택한 운동 2개' &&
    !s.primary.dis,
  JSON.stringify([s.sel, s.footCount]),
)
check('저장소 반영(푸시업 제거)', same(await favStored('free'), ['16', '22']))

console.log('\n===== C. 직접 검색 탭 =====')
await tab('직접 검색')
await sleep(150)
s = await snap()
const ph = await ev(`document.querySelector('input#picker-query').placeholder`)
check(
  '검색 전: 결과 미표시, "운동을 검색해 주세요", 입력 안내 "운동명·부위·도구 검색", 검색 폼 role=search, 선택 유지',
  s.rows.length === 0 &&
    s.frameText.includes('어떤 운동을 찾고 계신가요?') &&
    ph === '운동명·부위·도구 검색' &&
    (await ev(`!!document.querySelector('form[role=search]')`)) &&
    same(s.sel, ['플랭크', '푸시업']),
  JSON.stringify([s.frameText, ph]),
)
check(
  '입력만 하고 검색하기를 누르기 전에는 결과가 나오지 않음',
  await (async () => {
    await setVal('input#picker-query', '덤벨')
    await sleep(200)
    return (await snap()).rows.length === 0
  })(),
)
const cases = [
  ['푸시', ['푸시업']],
  ['가슴', ['푸시업', '밴드 로우']],
  ['덤벨', ['덤벨 숄더 프레스', '원암 덤벨 로우', '덤벨 루마니안 데드리프트']],
  ['허리', ['힙 브릿지', '덤벨 루마니안 데드리프트', '플랭크']],
  ['스트레칭', ['폼롤러 등 풀기', '마사지볼 어깨 풀기']],
  ['  푸 시업 ', ['푸시업']],
]
for (const [qq, expected] of cases) {
  await search(qq)
  s = await snap()
  check(
    `검색 "${qq.trim()}": ${expected.length}건 ${expected.join('·')}`,
    same(names(s), expectSearch(qq)) &&
      s.frameText.includes(`조건에 맞는 운동 ${expectSearch(qq).length}개`),
    JSON.stringify(names(s)),
  )
}
for (const [qq, n, label] of [
  ['맨몸', 8, '운동 도구'],
  ['상체', 7, '대분류'],
  ['하체', 5, '대분류'],
  ['전신', 3, '대분류'],
]) {
  await search(qq)
  s = await snap()
  check(
    `${label} 검색 "${qq}": ${n}건(계산한 기대값과 일치)`,
    same(names(s), expectSearch(qq)),
    `${s.rows.length}: ${names(s).join(',')}`,
  )
}
await search('')
s = await snap()
check(
  '빈 검색어로 검색하기: 운동 15종 전체(스토리보드의 includes("") 동작), "15개 운동"',
  s.rows.length === EX.length &&
    same(
      names(s),
      EX.map((e) => e.name),
    ),
)
await search('zzzz')
s = await snap()
check(
  '일치 없음: "검색 결과가 없어요" 안내, 행 없음',
  s.rows.length === 0 && s.frameText.includes('조건에 맞는 운동이 없어요'),
)
await search('덤벨')
await clickRow('원암 덤벨 로우')
await sleep(80)
await tab('즐겨찾기')
await sleep(100)
await tab('직접 검색')
await sleep(150)
s = await snap()
check(
  '탭 왕복: 검색어·검색 결과(3건)·선택(3개)이 그대로 유지, 덤벨 로우 눌림 유지',
  s.input === '덤벨' &&
    s.rows.length === expectSearch('덤벨').length &&
    same(s.sel, ['플랭크', '푸시업', '원암 덤벨 로우']) &&
    s.rows.find((r) => r.name === '원암 덤벨 로우').pressed,
  JSON.stringify([s.input, s.rows.length, s.sel]),
)
await search('밴드')
s = await snap()
check(
  '검색어를 바꿔 다시 검색해도 기존 선택 3개 유지, 결과는 밴드 로우만',
  same(names(s), expectSearch('밴드')) &&
    same(s.sel, ['플랭크', '푸시업', '원암 덤벨 로우']),
)
await search('푸시업')
s = await snap()
check(
  '검색 결과의 선택 상태가 선택 목록과 일치(푸시업 눌림)',
  s.rows.find((r) => r.name === '푸시업').pressed === true &&
    s.rows.find((r) => r.name === '푸시업').star === '즐겨찾기에 추가: 푸시업',
)
await clickStar('푸시업')
await sleep(600)
s = await snap()
check(
  '검색 탭에서 별 등록: 같은 공유 상태가 바뀜(별 "해제", 저장소에 반영, 안내 "푸시업: 즐겨찾기에 추가했어요.")',
  s.rows.find((r) => r.name === '푸시업').star === '즐겨찾기 해제: 푸시업' &&
    same(await favStored('free'), ['16', '22', '5']) &&
    s.announce === '푸시업: 즐겨찾기에 추가했어요.',
  JSON.stringify([s.rows[0], await favStored('free'), s.announce]),
)
await tab('즐겨찾기')
await sleep(150)
s = await snap()
check(
  '즐겨찾기 탭에도 곧바로 반영(푸시업·맨몸 스쿼트·플랭크), 푸시업은 여전히 선택됨',
  same(
    names(s),
    ['푸시업', '맨몸 스쿼트', '플랭크'].sort(
      (a, b) =>
        EX.findIndex((e) => e.name === a) - EX.findIndex((e) => e.name === b),
    ),
  ) && s.rows.find((r) => r.name === '푸시업').pressed === true,
)
await tab('직접 검색')
await search('리버스 런지')
await ev(`window.__stor.length=0`)
await ev(
  `(()=>{const b=document.querySelector('main section[aria-label="운동 목록"] button[aria-label^="즐겨찾기"]');b.click();b.click();b.click()})()`,
)
await sleep(700)
const wr = (await stor()).filter((x) => x === `setItem:${FK('free')}`).length
s = await snap()
check(
  '같은 틱에 별 3번 클릭: 저장 1회, 결과는 한 번만 바뀜(런지 "해제")',
  wr === 1 &&
    s.rows[0].star.startsWith('즐겨찾기 해제') &&
    (await favStored('free')).length === 4,
  `writes=${wr} ${s.rows[0].star}`,
)
await ev(
  `document.querySelector('main section[aria-label="운동 목록"] button[aria-label^="즐겨찾기"]').click()`,
)
await sleep(600)
check('(정리) 첫 행 즐겨찾기 해제', (await favStored('free')).length === 3)

console.log('\n===== D. 선택 규칙 · 완료 · 초기화 =====')
const before = await ev(
  `JSON.stringify([localStorage,sessionStorage].map(st=>Object.fromEntries(Object.keys(st).sort().map(k=>[k,st.getItem(k)]))))`,
)
check(
  '(선택 3개가 있는 상태에서) 주소에 선택 id가 없고 history state에도 없음',
  await ev(
    `location.search===''&&location.hash===''&&!/push-up|plank|dumbbell-row/.test(JSON.stringify(history.state))`,
  ),
)
await open()
s = await snap()
check(
  '새로고침(재진입): 선택이 모두 사라짐, 초기 탭은 다시 즐겨찾기, 검색어 비어 있음',
  s.sel.length === 0 &&
    s.footCount === '선택한 운동 0개' &&
    same(s.tabs, ['즐겨찾기:true', '직접 검색:false']) &&
    s.primary.dis,
)
await tab('직접 검색')
await search('')
for (const e of EX) await clickRow(e.name)
await sleep(120)
s = await snap()
check(
  '선택 개수 상한 없음: 15개 모두 선택, "선택한 15개 운동 등록", 선택 목록 15개(카탈로그 순서로 클릭한 순서)',
  s.sel.length === EX.length &&
    s.footCount === `선택한 운동 ${EX.length}개` &&
    s.primary.t === `선택한 ${EX.length}개 운동 등록` &&
    !s.primary.dis &&
    same(
      s.sel,
      EX.map((e) => e.name),
    ),
  s.sel.length + '',
)
await clickRow('푸시업')
await clickRow('푸시업')
await sleep(100)
s = await snap()
check(
  '같은 운동을 두 번 누르면 해제 후 다시 선택(중복 없음), 선택 순서는 선택한 시점 순서라 마지막으로 이동',
  s.sel.length === EX.length &&
    s.sel.filter((x) => x === '푸시업').length === 1 &&
    s.sel.at(-1) === '푸시업',
  JSON.stringify(s.sel.slice(-3)),
)
await ev(
  `(()=>{const li=[...document.querySelectorAll('main section[aria-label="운동 목록"] ul > li')].find(l=>l.querySelector('button[aria-pressed] span span')?.textContent.trim()==='밴드 로우');const b=li.querySelector('button[aria-pressed]');b.click();b.click();b.click()})()`,
)
await sleep(100)
s = await snap()
check(
  '같은 틱에 3번 눌러도 중복 선택 없음(홀수 번이라 해제 상태, 개수 14)',
  s.sel.filter((x) => x === '밴드 로우').length === 0 &&
    s.sel.length === EX.length - 1 &&
    new Set(s.sel).size === s.sel.length,
  `${s.sel.length}`,
)
await clickRow('밴드 로우')
await sleep(80)
await footBtn('/^선택 해제: 풀업$/')
await sleep(150)
s = await snap()
check(
  '하단 선택 목록에서 해제: 풀업 선택 해제(개수 14), 목록 행의 눌림도 해제',
  s.sel.length === EX.length - 1 &&
    !s.sel.includes('풀업') &&
    s.rows.find((r) => r.name === '풀업').pressed === false,
)
check(
  '해제 뒤 포커스가 사라지지 않고 하단 선택 영역 안에 남음',
  await ev(
    `!!document.activeElement.closest('section[aria-label="선택한 운동"]')&&document.activeElement!==document.body`,
  ),
)
await footBtn('/^접기$/')
await sleep(80)
s = await snap()
check(
  '"접기": 선택 목록 숨김(aria-expanded=false), 개수는 계속 표시, 버튼은 "펼치기"',
  s.sel.length === 0 &&
    s.toggle.exp === 'false' &&
    s.toggle.t === '펼치기' &&
    s.footCount === `선택한 운동 ${EX.length - 1}개`,
)
await footBtn('/^펼치기$/')
await sleep(80)
s = await snap()
check(
  '"펼치기": 선택 목록 14개 복원',
  s.sel.length === EX.length - 1 &&
    s.toggle.exp === 'true' &&
    s.toggle.t === '접기',
)
for (let i = 0; i < EX.length - 1; i++) {
  await ev(
    `document.querySelector('main section[aria-label="선택한 운동"] ol button').click()`,
  )
  await sleep(40)
}
await sleep(120)
s = await snap()
check(
  '선택을 모두 해제: 개수 0, 등록 버튼 다시 비활성, 선택 목록·접기 버튼 없음, 포커스는 개수 줄로',
  s.sel.length === 0 &&
    s.footCount === '선택한 운동 0개' &&
    s.primary.dis &&
    s.toggle === null &&
    (await ev(`document.activeElement.textContent`)) === '선택한 운동 0개',
  JSON.stringify([s.footCount, s.toggle]),
)
await search('맨몸 스쿼트')
await clickRow('맨몸 스쿼트')
await search('푸시업')
await clickRow('푸시업')
await sleep(80)
await ev(`window.__stor.length=0`)
const p0 = await ev(`location.pathname+location.search`)
await ev(
  `[...document.querySelectorAll('main section[aria-label="선택한 운동"] button')].find(b=>/개 운동 등록/.test(b.innerText))?.title`,
)
await sleep(200)
s = await snap()
const afterStore = await ev(
  `JSON.stringify([localStorage,sessionStorage].map(st=>Object.fromEntries(Object.keys(st).sort().map(k=>[k,st.getItem(k)]))))`,
)
check(
  '(W13-C 이후) 등록 전: 구 "준비 중" 안내 없음, 선택 2개 유지, 주소 그대로',
  s.notice === null && same(s.sel, ['맨몸 스쿼트', '푸시업']) && s.path === p0,
  JSON.stringify([s.notice, s.sel, s.path]),
)
check(
  '등록 클릭: 저장 성공·등록 완료 문구 없음, 저장소 쓰기 0건, 저장소 내용 불변',
  !/저장했어요|등록했어요|추가했어요/.test(
    await ev(
      `document.querySelector('main section[aria-label="선택한 운동"]').innerText`,
    ),
  ) &&
    !(await stor()).some(
      (x) => x.startsWith('setItem:') || x.startsWith('removeItem:'),
    ) &&
    afterStore.length > 0,
  JSON.stringify((await stor()).filter((x) => !x.startsWith('getItem'))),
)
await clickRow('푸시업')
await sleep(80)
s = await snap()
check(
  '선택을 바꾸면 이전 등록 안내는 사라짐(맞지 않는 안내를 남기지 않음)',
  s.notice === null && s.sel.length === 1,
)
check(
  '안내 영역은 aria-live=polite로 항상 존재',
  await ev(
    `!!document.querySelector('main section[aria-label="선택한 운동"] [aria-live=polite]')`,
  ),
)

console.log('\n===== E. 상태: 빈 즐겨찾기 · 누락 ID · 실패 · 미연결 =====')
await seedFav('free', [])
await open()
s = await snap()
check(
  '즐겨찾기 0개: "즐겨찾기한 운동이 없어요" + 시안 안내 + "직접 검색하기" 버튼, 등록 비활성',
  s.frameText.includes('즐겨찾기한 운동이 없어요') &&
    s.frameText.includes(
      '직접 검색에서 운동을 찾고 별표를 눌러 저장해 보세요.',
    ) &&
    s.frameText.includes('직접 검색하기') &&
    s.primary.dis,
  s.frameText,
)
await ev(
  `[...document.querySelectorAll('main section[aria-label="운동 목록"] button')].find(b=>b.innerText.trim()==='직접 검색하기').click()`,
)
await sleep(150)
s = await snap()
check(
  '"직접 검색하기" 누르면 직접 검색 탭으로 이동',
  s.tabs[1] === '직접 검색:true',
)
await seedFav('free', ['16', 'ghost-id', 'ghost-2'])
await open()
s = await snap()
check(
  '카탈로그에 없는 즐겨찾기 ID 2개: 보이는 운동(맨몸 스쿼트)만 표시하고 누락 개수 안내(없는 운동은 만들지 않음)',
  same(names(s), ['맨몸 스쿼트']) &&
    s.frameText.includes(
      '즐겨찾기한 운동 2개는 운동 정보를 찾지 못해 보여 드리지 못해요.',
    ) &&
    s.count === '1개 운동',
  s.frameText,
)
await seedFav('free', ['ghost-id'])
await open()
s = await snap()
check(
  '누락 ID만 있는 경우: "즐겨찾기한 운동이 없어요"로 오인하게 하지 않고 누락 안내 1개 + 직접 검색 버튼',
  !s.frameText.includes('즐겨찾기한 운동이 없어요') &&
    s.frameText.includes('즐겨찾기한 운동 1개는') &&
    s.frameText.includes('직접 검색하기') &&
    s.rows.length === 0,
  s.frameText,
)
await seedFav('free', ['16', '5'])
await flag('failSave', 'exerciseFavorite')
await open()
await clickRow('맨몸 스쿼트')
await clickStar('맨몸 스쿼트')
await sleep(600)
s = await snap()
const sq = s.rows.find((r) => r.name === '맨몸 스쿼트')
check(
  '별 저장 실패: 승인 문구 "즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요." 를 그 운동 행에만 표시, 별·행·선택 상태 유지, 저장소 불변',
  sq.failed &&
    sq.star === '즐겨찾기 해제: 맨몸 스쿼트' &&
    sq.pressed &&
    !s.rows.find((r) => r.name === '푸시업').failed &&
    same(s.sel, ['맨몸 스쿼트']) &&
    same(await favStored('free'), ['16', '5']),
  JSON.stringify([sq, s.sel]),
)
check(
  '저장 실패를 보이지 않는 안내로도 알림("맨몸 스쿼트: 즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요.")',
  s.announce ===
    '맨몸 스쿼트: 즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요.',
  String(s.announce),
)
await flag('failSave', null)
await clickStar('맨몸 스쿼트')
await sleep(600)
s = await snap()
check(
  '스위치를 끄고 다시 누르면 해제 성공: 실패 표시 사라짐, 행은 목록에서 사라지고 선택은 유지',
  same(names(s), ['푸시업']) &&
    same(s.sel, ['맨몸 스쿼트']) &&
    same(await favStored('free'), ['5']),
  JSON.stringify([names(s), s.sel]),
)
await seedFav('free', ['16', '5'])
await flag('failLoad', 'exerciseFavorite')
await open()
s = await snap()
check(
  '즐겨찾기 조회 실패: role=alert로 "즐겨찾기 상태를 확인하지 못했어요." + "다시 시도" (운동 목록 오류가 아님)',
  s.alert &&
    s.frameText.includes('즐겨찾기 상태를 확인하지 못했어요.') &&
    s.frameText.includes('다시 시도') &&
    !s.frameText.includes('운동을 불러오지 못했어요'),
  s.frameText,
)
await tab('직접 검색')
await search('맨몸 스쿼트')
s = await snap()
check(
  '즐겨찾기가 실패해도 직접 검색·선택은 동작: 결과 표시, 별 이름은 "…다시 시도", 즐겨찾기 오류는 보조 안내로만',
  names(s).join() === '맨몸 스쿼트' &&
    s.rows[0].star.includes(
      '즐겨찾기 상태를 확인하지 못했어요. 다시 시도: 맨몸 스쿼트',
    ) &&
    s.frameText.includes('즐겨찾기 다시 시도'),
  s.frameText,
)
await clickRow('맨몸 스쿼트')
await sleep(60)
s = await snap()
check('즐겨찾기 실패 중에도 선택 가능(개수 1)', same(s.sel, ['맨몸 스쿼트']))
await flag('failLoad', null)
await tab('즐겨찾기')
await sleep(100)
await ev(
  `[...document.querySelectorAll('main section[aria-label="운동 목록"] button')].find(b=>b.innerText.trim()==='다시 시도').click()`,
)
check(
  '다시 시도를 누른 직후 포커스가 목록 영역으로 옮겨짐(사라진 버튼 때문에 body로 빠지지 않음)',
  await ev(
    `document.activeElement===document.querySelector('main section[aria-label="운동 목록"]')`,
  ),
)
await sleep(600)
s = await snap()
check(
  '재조회 성공: 즐겨찾기 목록(푸시업·맨몸 스쿼트) 표시, 선택(맨몸 스쿼트) 유지',
  same(names(s), ['푸시업', '맨몸 스쿼트']) &&
    same(s.sel, ['맨몸 스쿼트']) &&
    !s.alert,
  JSON.stringify([names(s), s.sel]),
)
await flag('unavailable', 'exerciseFavorite')
await ev(`window.__stor.length=0`)
await open()
s = await snap()
check(
  '즐겨찾기 소스 미연결: "즐겨찾기 기능을 준비하고 있어요." 안내 + 직접 검색 이동 버튼(해제/없음으로 표시하지 않음)',
  s.frameText.includes('즐겨찾기 기능을 준비하고 있어요.') &&
    s.frameText.includes('직접 검색하기') &&
    s.rows.length === 0 &&
    !s.frameText.includes('즐겨찾기한 운동이 없어요'),
  s.frameText,
)
check(
  '  즐겨찾기 키 접근 없음(저장소를 만들지 않음)',
  !(await stor()).some((x) => x.includes('exerciseFavorite.')),
)
await tab('직접 검색')
await search('푸시업')
s = await snap()
await clickStar('푸시업')
await sleep(150)
s = await snap()
check(
  '  검색 탭은 정상 동작, 별을 누르면 "즐겨찾기 기능을 준비하고 있어요." 안내(저장하지 않음)',
  same(names(s), expectSearch('푸시업')) &&
    s.frameText.includes('즐겨찾기 기능을 준비하고 있어요.') &&
    same(await favStored('free'), ['16', '5']),
)
await flag('unavailable', null)
await flag('failLoad', 'exercise')
await open()
s = await snap()
check(
  '운동 목록 조회 실패: role=alert "운동을 불러오지 못했어요" + 다시 시도(즐겨찾기 실패 문구와 구분)',
  s.alert &&
    s.frameText.includes('운동을 불러오지 못했어요') &&
    !s.frameText.includes('즐겨찾기 상태를 확인하지 못했어요'),
  s.frameText,
)
await tab('직접 검색')
await search('푸시')
s = await snap()
check(
  '  검색 탭에서도 같은 오류와 재시도 제공, 입력한 검색어 유지',
  s.alert && s.input === '푸시' && s.frameText.includes('다시 시도'),
)
await flag('failLoad', null)
await ev(
  `[...document.querySelectorAll('main section[aria-label="운동 목록"] button')].find(b=>b.innerText.trim()==='다시 시도').click()`,
)
const focusedFrame = await ev(
  `document.activeElement===document.querySelector('main section[aria-label="운동 목록"]')`,
)
await sleep(600)
s = await snap()
check(
  '  재시도: 클릭 직후 포커스가 목록 영역에 있고, 성공하면 검색어("푸시")의 결과 표시',
  focusedFrame && same(names(s), expectSearch('푸시')),
  JSON.stringify([focusedFrame, names(s)]),
)
await flag('unavailable', 'exercise')
await open()
s = await snap()
check(
  '운동 데이터 미연결: "운동 검색을 준비하고 있어요" 안내(결과 없음·오류와 구분), 즐겨찾기 실패 문구 없음',
  s.frameText.includes('운동 검색을 준비하고 있어요') &&
    !s.alert &&
    !s.frameText.includes('즐겨찾기 상태를 확인하지 못했어요'),
  s.frameText,
)
await tab('직접 검색')
await search('푸시')
s = await snap()
check(
  '  검색 탭도 같은 미연결 안내, Mock으로 대체하지 않음(행 0개)',
  s.frameText.includes('운동 검색을 준비하고 있어요') && s.rows.length === 0,
)
await flag('unavailable', null)

console.log('\n===== F. E02와의 동기화 =====')
await seedFav('free', ['16'])
await open()
await tab('직접 검색')
await search('플랭크')
await clickStar('플랭크')
await sleep(650)
await spa('/exercises/22')
await until(`!!document.querySelector('main article h1')`, 40)
let lb = await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]')?.getAttribute('aria-label')`,
)
check(
  'W13에서 등록한 플랭크가 E02에서 즉시 "즐겨찾기 해제"(같은 공유 상태, 재조회 없음)',
  lb === '즐겨찾기 해제: 플랭크',
  String(lb),
)
await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]').click()`,
)
await sleep(650)
await spa(PATH)
await until(settled, 40)
s = await snap()
check(
  'E02에서 해제한 결과가 W13 즐겨찾기 탭에 즉시 반영(맨몸 스쿼트만 남음)',
  same(names(s), ['맨몸 스쿼트']) && same(await favStored('free'), ['16']),
  JSON.stringify(names(s)),
)

console.log('\n===== G. 취소 · 이전 · 직접 접근 =====')
await open()
await clickRow('맨몸 스쿼트')
await ev(
  `[...document.querySelectorAll('main section[aria-label="선택한 운동"] a')][0].click()`,
)
await sleep(500)
check(
  '취소 링크: 존재하는 임시 상위 화면(/records/exercise)으로 이동, 존재하지 않는 화면으로 가지 않음',
  (await ev(`location.pathname`)) === '/records/exercise' &&
    (await ev(`document.querySelector('main').innerText`)).length > 0,
)
await spa(PATH)
await until(settled, 40)
s = await snap()
check('취소 후 다시 들어오면 선택이 비어 있음', s.sel.length === 0)
await ev(`document.querySelector('main header a').click()`)
await sleep(400)
check(
  '헤더 이전 링크(접근 이름 "이전 화면으로 돌아가기")도 /records/exercise로 이동',
  (await ev(`location.pathname`)) === '/records/exercise',
)
await spa('/explore')
await spa(PATH, { from: '/explore' })
await until(settled, 40)
s = await snap()
check(
  '진입한 화면(state.from=/explore)을 알면 이전·취소가 그곳으로',
  s.back === '/explore' && s.cancel[0].h === '/explore',
  JSON.stringify([s.back, s.cancel]),
)
for (const bad of [
  '//evil.example.com',
  'https://evil.example.com',
  '/\\evil.example.com',
]) {
  await spa(PATH, { from: bad })
  s = await snap()
  check(
    `외부·위험 경로(state.from="${bad}")는 무시하고 임시 상위 화면으로`,
    s.back === '/records/exercise' && s.cancel[0].h === '/records/exercise',
    JSON.stringify([s.back, s.cancel]),
  )
}
await spa('/home')
await spa(PATH)
await until(settled, 40)
await ev(`history.back()`)
await sleep(600)
check(
  '브라우저 뒤로가기: 진입 전 화면(/home)으로 돌아감',
  (await ev(`location.pathname`)) === '/home',
)
await ev(`history.forward()`)
await sleep(700)
await until(settled, 40)
check(
  '브라우저 앞으로가기: W13 복귀(선택은 새로 시작)',
  (await ev(`location.pathname`)) === PATH && (await snap()).sel.length === 0,
)

console.log('\n===== H. 키보드 · 접근성 =====')
await seedFav('free', ['16', '5', '22'])
await open()
await ev(
  `document.activeElement&&document.activeElement.blur();window.scrollTo(0,0)`,
)
const stops = []
for (let i = 0; i < 9; i++) {
  await press('Tab', 'Tab', 9)
  stops.push(
    await ev(
      `(()=>{const e=document.activeElement;return (e.getAttribute('aria-label')||e.innerText||'').trim().replace(/\\s+/g,' ').slice(0,26)})()`,
    ),
  )
}
console.log('  Tab 순서:', JSON.stringify(stops))
check(
  'Tab 순서: 이전 → 즐겨찾기 → 직접 검색 → 푸시업 선택 → 푸시업 별 → 맨몸 스쿼트 선택 → 맨몸 스쿼트 별 …',
  stops[0] === '이전 화면으로 돌아가기' &&
    stops[1] === '즐겨찾기' &&
    stops[2] === '직접 검색' &&
    stops[3].startsWith('푸시업') &&
    stops[4] === '즐겨찾기 해제: 푸시업' &&
    stops[5].startsWith('맨몸 스쿼트') &&
    stops[6] === '즐겨찾기 해제: 맨몸 스쿼트',
  JSON.stringify(stops),
)
check(
  '키보드 포커스 표시(outline)가 보임',
  await ev(`getComputedStyle(document.activeElement).outlineStyle!=='none'`),
)
await ev(
  `[...document.querySelectorAll('main section[aria-label="운동 목록"] button[aria-pressed]')][0].focus()`,
)
await press('Enter', 'Enter', 13)
s = await snap()
check(
  'Enter로 운동 선택(aria-pressed=true), 선택 목록·개수 반영',
  s.rows[0].pressed && same(s.sel, ['푸시업']),
)
await press(' ', 'Space', 32)
s = await snap()
check('Space로 선택 해제', !s.rows[0].pressed && s.sel.length === 0)
await press('Enter', 'Enter', 13)
await ev(
  `document.querySelector('main section[aria-label="선택한 운동"] ol button').focus()`,
)
await press('Enter', 'Enter', 13)
s = await snap()
check(
  '키보드로 선택 목록에서 해제 가능(Enter)',
  s.sel.length === 0 && !s.rows[0].pressed,
)
const aria = await ev(
  `(()=>{const m=document.querySelector('main');return{group:m.querySelector('[role=group]')?.getAttribute('aria-label'),foot:!!m.querySelector('section[aria-label="선택한 운동"]'),frame:!!m.querySelector('section[aria-label="운동 목록"]'),statuses:m.querySelectorAll('[role=status]').length,live:m.querySelectorAll('[aria-live]').length,h1:document.querySelectorAll('h1').length,nestedBtn:m.querySelectorAll('button button').length,backLabel:m.querySelector('header a')?.getAttribute('aria-label')}})()`,
)
check(
  '접근성 구조: 탭 그룹 "운동 찾는 방법", 목록·선택 영역 이름, role=status·aria-live 존재, h1 1개, 버튼 안 버튼 없음, 이전 링크 이름 유지',
  aria.group === '운동 찾는 방법' &&
    aria.foot &&
    aria.frame &&
    aria.statuses >= 2 &&
    aria.live >= 1 &&
    aria.h1 === 1 &&
    aria.nestedBtn === 0 &&
    aria.backLabel === '이전 화면으로 돌아가기',
  JSON.stringify(aria),
)
await tab('직접 검색')
await search('푸시업')
const sr = await ev(
  `(()=>{const f=document.querySelector('form[role=search]');return{label:document.querySelector('label[for=picker-query]')?.textContent,hasInput:!!document.getElementById('picker-query'),btn:f.querySelector('button[type=submit]')?.innerText}})()`,
)
check(
  '검색 폼: 보이지 않는 label "운동명·부위·도구 검색", 제출 버튼 "검색하기"',
  sr.label === '운동명·부위·도구 검색' && sr.hasInput && sr.btn === '검색하기',
  JSON.stringify(sr),
)
check(
  'Enter 키로 검색 제출 가능',
  await (async () => {
    await setVal('input#picker-query', '맨몸 스쿼트')
    await press('Enter', 'Enter', 13)
    return same(names(await snap()), ['맨몸 스쿼트'])
  })(),
)

console.log('\n===== I. 반응형 =====')
await seedFav('free', ['16', '5', '22'])
for (const [w, h] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
]) {
  await vp(w, h)
  await open()
  await sleep(200)
  // 짧은 목록(즐겨찾기 3개)에서 하단 영역이 화면 맨 아래에 붙는지
  const short = await ev(
    `(()=>{const f=document.querySelector('main section[aria-label="선택한 운동"]').getBoundingClientRect();const d=document.documentElement;return{footBottom:Math.round(f.bottom),vh:innerHeight,fits:d.scrollHeight<=innerHeight+1,xo:d.scrollWidth-d.clientWidth,w:Math.round(f.width),left:Math.round(f.left)}})()`,
  )
  check(
    `${w}x${h} 짧은 목록: 하단 영역이 화면 맨 아래에 붙음, 가로 넘침 없음`,
    Math.abs(short.footBottom - short.vh) <= 1 && short.xo <= 0,
    JSON.stringify(short),
  )
  // 긴 목록(15개) + 선택 3개
  await tab('직접 검색')
  await search('')
  await clickRow('푸시업')
  await clickRow('밴드 로우')
  await clickRow('원암 덤벨 로우')
  await sleep(150)
  await ev(`window.scrollTo(0,0)`)
  await sleep(100)
  const top = await ev(
    `(()=>{const f=document.querySelector('main section[aria-label="선택한 운동"]').getBoundingClientRect();return{footBottom:Math.round(f.bottom),footH:Math.round(f.height),vh:innerHeight}})()`,
  )
  await ev(`window.scrollTo(0,document.documentElement.scrollHeight)`)
  await sleep(150)
  const end = await ev(
    `(()=>{const f=document.querySelector('main section[aria-label="선택한 운동"]').getBoundingClientRect();const rows=[...document.querySelectorAll('main section[aria-label="운동 목록"] ul > li')];const last=rows.at(-1).getBoundingClientRect();const d=document.documentElement;const clipped=[...document.querySelectorAll('main ul > li button[aria-pressed] span.block')].filter(e=>e.scrollWidth>e.clientWidth+1).length;const ol=document.querySelector('main section[aria-label="선택한 운동"] ol');return{olOver:ol?ol.scrollWidth-ol.clientWidth:0,footBottom:Math.round(f.bottom),vh:innerHeight,lastBottom:Math.round(last.bottom),footTop:Math.round(f.top),xo:d.scrollWidth-d.clientWidth,clipped,width:Math.round(f.width)}})()`,
  )
  console.log(
    `  [측정] ${w}x${h}: 하단 영역 높이 ${top.footH}px(${Math.round((top.footH / top.vh) * 100)}%), 앱 폭 ${end.width}px`,
  )
  check(
    `${w}x${h} 긴 목록(15개)·선택 3개: 스크롤 맨 위·맨 아래 모두 하단 영역이 화면 아래에 붙음`,
    Math.abs(top.footBottom - top.vh) <= 1 &&
      Math.abs(end.footBottom - end.vh) <= 1,
    JSON.stringify([top, end]),
  )
  check(
    `${w}x${h}: 마지막 운동 행이 하단 영역에 가려지지 않음, 이름 잘림·가로 넘침 없음`,
    end.lastBottom <= end.footTop + 1 &&
      end.clipped === 0 &&
      end.xo <= 0 &&
      end.olOver <= 0,
    JSON.stringify(end),
  )
  if (w >= 640)
    check(
      `${w}x${h}: 넓은 화면에서도 하단 영역이 앱 폭(390px)을 넘지 않음`,
      end.width <= 390,
      String(end.width),
    )
}
await vp(390, 844)

console.log('\n===== J. 조회 횟수 (N+1 없음) =====')
await seedFav('free', ['16', '5', '22'])
await ev(`window.__stor.length=0`)
await open()
await sleep(400)
const cnt = async () => {
  const l = await stor()
  return {
    unavail: l.filter(
      (x) => x === 'getItem:mealthroutine.dev.mock.flag.unavailable',
    ).length,
    failLoad: l.filter(
      (x) => x === 'getItem:mealthroutine.dev.mock.flag.failLoad',
    ).length,
    favKey: l.filter((x) => x === `getItem:${FK('free')}`).length,
  }
}
const base = await cnt()
console.log(
  '  [측정] 첫 로드(StrictMode 개발 서버) 읽기 횟수:',
  JSON.stringify(base),
)
await tab('직접 검색')
await search('덤벨')
await search('')
await search('zzz')
await tab('즐겨찾기')
await tab('직접 검색')
await search('')
for (const e of EX) await clickRow(e.name)
for (const e of EX) await clickRow(e.name)
await ev(`document.querySelector('form[role=search] input').focus()`)
await sleep(300)
const after = await cnt()
check(
  '탭 전환·검색 7회·선택 30회 뒤에도 운동 목록(list/getById)·즐겨찾기 조회 횟수가 첫 로드와 같음(추가 조회·N+1 없음)',
  same(base, after) && base.favKey >= 1 && base.favKey <= 2,
  JSON.stringify([base, after]),
)
check(
  '운동 목록 조회 읽기: 운동 15종을 한 번에 조회(마운트당 1회, 개발 StrictMode에서만 2회)',
  base.failLoad <= 4 && base.failLoad >= 2,
  JSON.stringify(base),
)

console.log('\n===== K. 계정 전환 격리 =====')
await seedFav('free', ['16'])
await seedFav('full', ['22'])
await open()
await clickRow('맨몸 스쿼트')
await sleep(80)
check(
  'free 계정: 즐겨찾기 맨몸 스쿼트를 선택해 둠',
  same((await snap()).sel, ['맨몸 스쿼트']),
)
await spa('/settings')
await sleep(500)
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
await sleep(900)
await ev(`window.__stor.length=0`)
await spa(PATH)
await sleep(500)
const txt = await ev(
  `document.querySelector('main').innerText.replace(/\\s+/g,' ')`,
)
const lst = await stor()
check(
  '로그아웃 후 W13 접근: 로그인 안내만 표시, 이전 계정의 선택·즐겨찾기 노출 없음, 저장소 접근 0건',
  lo === true &&
    txt.includes('로그인 후 이용할 수 있어요') &&
    !txt.includes('맨몸 스쿼트') &&
    lst.length === 0,
  JSON.stringify([txt.slice(0, 80), lst]),
)
await spa('/login')
await until(`!!document.querySelector('input[type=email]')`)
await setVal('input[type=email]', 'member.full@example.com')
await setVal('input[type=password]', 'Mr-Dev-Full-2026')
await ev(`window.__stor.length=0`)
await ev(`document.querySelector('form').requestSubmit()`)
await sleep(1500)
await spa(PATH)
await until(settled, 50)
await sleep(200)
s = await snap()
check(
  '다른 계정(full) 로그인: 선택이 비어 있고 즐겨찾기는 이 계정의 것(플랭크)만 표시',
  s.sel.length === 0 && same(names(s), ['플랭크']),
  JSON.stringify([s.sel, names(s)]),
)
check(
  '이전 계정(free)의 즐겨찾기 키를 읽지도 쓰지도 않음',
  !(await stor()).some((x) => x.endsWith('.free')),
  JSON.stringify((await stor()).filter((x) => x.includes('exerciseFavorite'))),
)

console.log(
  '\n===== L. 코드 검토 후속: 포커스 가림 · 별 해제 후 포커스 · 안내 재낭독 · aria-controls =====',
)
// 앞 구간(K)에서 full 계정으로 로그인한 상태를 이어서 쓴다.
await seedFav('full', ['16', '5', '22'])
await vp(390, 844)
await open()
await tab('직접 검색')
await search('')
for (const n of ['푸시업', '맨몸 스쿼트', '플랭크']) await clickRow(n)
await sleep(200)
await ev(`window.scrollTo(0,0);document.activeElement.blur()`)
const covered = []
for (let i = 0; i < 70; i++) {
  await press('Tab', 'Tab', 9)
  const r = await ev(
    `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;if(e.closest('section[aria-label="선택한 운동"]'))return null;const f=document.querySelector('main section[aria-label="선택한 운동"]').getBoundingClientRect();const b=e.getBoundingClientRect();return b.bottom>f.top+1?{label:(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,14),bottom:Math.round(b.bottom),footTop:Math.round(f.top)}:null})()`,
  )
  if (r) covered.push(r)
}
check(
  '키보드로 목록을 끝까지 Tab 이동해도 포커스된 행·별이 하단 고정 영역에 가려지지 않음(15개 결과, 선택 3개, 390x844)',
  covered.length === 0,
  JSON.stringify(covered.slice(0, 3)),
)
await ev(`window.scrollTo(0,document.documentElement.scrollHeight)`)
await sleep(150)
await vp(320, 568)
await sleep(250)
await ev(`window.scrollTo(0,0);document.activeElement.blur()`)
const covered2 = []
for (let i = 0; i < 70; i++) {
  await press('Tab', 'Tab', 9)
  const r = await ev(
    `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;if(e.closest('section[aria-label="선택한 운동"]'))return null;const f=document.querySelector('main section[aria-label="선택한 운동"]').getBoundingClientRect();const b=e.getBoundingClientRect();return b.bottom>f.top+1?{label:(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,14),bottom:Math.round(b.bottom),footTop:Math.round(f.top)}:null})()`,
  )
  if (r) covered2.push(r)
}
check(
  '320x568에서도 Tab 정지점이 하단 고정 영역에 가려지지 않음',
  covered2.length === 0,
  JSON.stringify(covered2.slice(0, 3)),
)
await vp(390, 844)
// 별 해제 후 포커스
await seedFav('full', ['16', '5', '22'])
await open()
await ev(
  `document.querySelector('main section[aria-label="운동 목록"] ul > li button[aria-label^="즐겨찾기"]').focus()`,
)
await press('Enter', 'Enter', 13)
await sleep(650)
s = await snap()
check(
  '즐겨찾기 탭에서 키보드로 별을 해제하면 행이 사라져도 포커스가 목록 영역에 남음(body로 빠지지 않음)',
  names(s).length === 2 &&
    (await ev(
      `document.activeElement===document.querySelector('main section[aria-label="운동 목록"]')`,
    )),
  JSON.stringify(names(s)),
)
// 검색 탭에서 즐겨찾기 조회 실패 중 별을 누르면 포커스를 옮기지 않음
await seedFav('full', ['16'])
await flag('failLoad', 'exerciseFavorite')
await open()
await tab('직접 검색')
await search('맨몸 스쿼트')
await ev(
  `document.querySelector('main section[aria-label="운동 목록"] button[aria-label^="즐겨찾기"]').focus()`,
)
await ev(`document.activeElement.click()`)
await sleep(100)
check(
  '검색 탭에서 즐겨찾기 조회 실패 중 별을 눌러도 포커스는 그 별 버튼에 남음(재조회만 시작)',
  await ev(
    `document.activeElement?.getAttribute('aria-label')?.startsWith('즐겨찾기')===true&&document.activeElement.closest('li')!==null`,
  ),
)
await flag('failLoad', null)
await sleep(600)
// 등록 안내 재낭독, aria-controls
await seedFav('full', ['16'])
await open()
await clickRow('맨몸 스쿼트')
// (W13-C 이후 등록은 W02로 이동하므로 구 "등록 안내 재낭독" 검사는 해당 없음)
const ac1 = await ev(
  `(()=>{const b=document.querySelector('main section[aria-label="선택한 운동"] button[aria-expanded]');return{c:b.getAttribute('aria-controls'),target:!!document.getElementById(b.getAttribute('aria-controls')||'-')}})()`,
)
await footBtn('/^접기$/')
await sleep(100)
const ac2 = await ev(
  `document.querySelector('main section[aria-label="선택한 운동"] button[aria-expanded]').hasAttribute('aria-controls')`,
)
check(
  'aria-controls: 펼친 상태에서는 존재하는 목록을 가리키고, 접은 상태에서는 존재하지 않는 id를 가리키지 않음(속성 없음)',
  ac1.c === 'picker-selected-list' && ac1.target && ac2 === false,
  JSON.stringify([ac1, ac2]),
)

const bad = t.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
t.close()
process.exit(fails.length ? 1 : 0)
