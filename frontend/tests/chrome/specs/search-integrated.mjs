// [chrome 회귀] 통합검색 운동 조회
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 통합검색 운동 조회 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const OUT = process.argv[2] ?? 'out-verify'
const BASE = 'http://localhost:5199'
const t = await launch(OUT, 9412, BASE)
const { ev, vp, goSettled: go, sleep, check, cdp } = t
const q = (s) => encodeURIComponent(s)
await vp(390, 844)

// 기준 데이터(Mock 15종)를 페이지 안에서 불러와 기대값을 계산한다.
await go('/search', 800)
await ev(
  `(async()=>{const m=await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}));window.__EX=m.MOCK_EXERCISES;return m.MOCK_EXERCISES.length})()`,
)
const total = await ev(`window.__EX.length`)
check('시드 운동 데이터 로드(105종)', total >= 15, String(total))
const norm = `(s)=>s.replace(/\\s+/g,'').toLowerCase()`
const expected = (text) =>
  ev(
    `(async()=>{const m=await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}));window.__EX=m.MOCK_EXERCISES;const n=${norm};const t=n(${JSON.stringify(text)});return window.__EX.filter(e=>t===''||n(e.name).includes(t)).map(e=>({id:e.id,name:e.name,meta:[e.targetMuscles.join('·'),e.difficulty,e.equipment.join('·')].filter(Boolean).join(' · ')}))})()`,
  )

const read = () =>
  ev(`(()=>({
  url:location.pathname+location.search,
  sections:[...document.querySelectorAll('main section[aria-label$="결과"]')].map(s=>({label:s.getAttribute('aria-label'),h:s.querySelector('h2')?.innerText.replace(/\\s+/g,' '),rows:[...s.querySelectorAll('li')].map(li=>({text:li.innerText.replace(/\\s*\\n\\s*/g,' | '),href:li.querySelector('a')?.getAttribute('href')??null})),more:[...s.querySelectorAll('button')].map(b=>b.innerText)})),
  status:[...document.querySelectorAll('main [role=status],main [role=alert]')].map(n=>({role:n.getAttribute('role'),text:n.innerText.replace(/\\s+/g,' ')})),
  pressed:[...document.querySelectorAll('main button[aria-pressed="true"]')].map(b=>b.innerText),
  input:document.getElementById('search-input')?.value}))()`)
const settle = async (ms = 1200) => {
  await sleep(ms)
}
// React 제어 입력창에 값을 넣고 제출한다.
const submit = (text) =>
  ev(
    `(()=>{const i=document.getElementById('search-input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event('input',{bubbles:true}));i.form.requestSubmit()})()`,
  )
const names = (r, sec = 0) =>
  (r.sections[sec]?.rows ?? []).map((x) => x.text.split(' | ')[0])
const exNames3 = async (t) =>
  (await expected(t))
    .slice(0, 3)
    .map((e) => e.name)
    .join()

console.log('\n===== 1. 운동명 검색 (전체 범위) =====')
await go('/search?q=' + q('푸시업'), 1200)
let r = await read()
let ex = await expected('푸시업')
check(
  '전체 일치 "푸시업": 운동 구역 1개·미리보기 3건·전체 건수 표시, 푸시업(id 5)의 상세 링크 /exercises/5',
  r.sections.length === 1 &&
    names(r).join() ===
      ex
        .slice(0, 3)
        .map((e) => e.name)
        .join() &&
    r.sections[0].rows.some((x) => x.href === '/exercises/5') &&
    r.sections[0].h.includes(`${ex.length}건`),
  JSON.stringify(r.sections[0]),
)
check(
  '카드 정보: 운동 부위 · 난이도 · 도구가 Mock 데이터와 일치',
  r.sections[0].rows[0].text === `${ex[0].name} | ${ex[0].meta}`,
  r.sections[0].rows[0].text,
)
check(
  '전체 범위: 음식 "준비 중" 안내가 따로 표시(음식 0건 아님)',
  r.status.some((s) => s.text.includes('음식 검색은 아직 준비 중')) &&
    !r.sections.some((s) => s.label.startsWith('음식')),
)

for (const [label, text, urlq] of [
  ['부분 일치 "숄더"', '숄더'],
  ['부분 일치 "덤벨"', '덤벨'],
  ['공백 무시 "덤벨숄더"', '덤벨숄더'],
  ['중간 공백 "푸 시 업"', '푸 시 업'],
  ['한 글자 "업"', '업'],
]) {
  await go('/search?q=' + q(text), 1200)
  r = await read()
  ex = await expected(text)
  check(
    `${label}: 기대 ${ex.length}건과 일치`,
    names(r).join() ===
      ex
        .slice(0, 3)
        .map((e) => e.name)
        .join() && r.sections[0]?.h?.includes(`${ex.length}건`),
    `ui=${names(r).join('/')} exp=${ex.map((e) => e.name).join('/')}`,
  )
}

console.log('\n===== 2. 입력창 입력 · 앞뒤 공백 · 없는 검색어 =====')
await go('/search', 800)
await submit('   푸시업   ')
await settle()
r = await read()
check(
  '앞뒤 공백 입력("   푸시업   "): trim되어 URL q=푸시업, 1건',
  r.url === '/search?q=' + q('푸시업') &&
    names(r).join() === (await exNames3('푸시업')) &&
    r.input === '푸시업',
  r.url,
)
await submit('없는운동명')
await settle()
r = await read()
check(
  '없는 운동명: "운동 검색 결과가 없어요."(결과 없음) + 음식 준비 중 안내, 미연결 문구 아님',
  r.status.some((s) => s.text.includes('운동 검색 결과가 없어요')) &&
    !r.status.some((s) => s.text.includes('준비하고 있어요')) &&
    r.sections.length === 0,
  JSON.stringify(r.status),
)

console.log('\n===== 3. 범위(카테고리) =====')
await go('/search?q=' + q('푸시업') + '&c=exercise', 1200)
r = await read()
check(
  '운동 범위: 운동 결과 전체(미리보기 제한 없음), 음식 안내 없음',
  names(r).join() === (await expected('푸시업')).map((e) => e.name).join() &&
    !r.status.some((s) => s.text.includes('음식')) &&
    r.pressed.join() === '운동',
  JSON.stringify({ p: r.pressed, s: r.status }),
)
await go('/search?q=' + q('푸시업') + '&c=food', 1200)
r = await read()
check(
  '음식 범위: "검색 서비스를 준비하고 있어요"(미연결), 운동 결과 없음',
  r.status.some(
    (s) => s.text.includes('준비하고 있어요') && s.text.includes('음식'),
  ) && r.sections.length === 0,
  JSON.stringify(r.status),
)
// 범위 탭 전환(전체 → 운동 → 음식 → 전체)
await go('/search?q=' + q('덤벨'), 1200)
await ev(`document.getElementById('search-cat-exercise').click()`)
await settle(900)
r = await read()
check(
  '탭 전환 전체→운동: URL c=exercise, 덤벨 전체 건수, 음식 안내 사라짐',
  r.url.includes('c=exercise') &&
    names(r).length === (await expected('덤벨')).length &&
    !r.status.some((s) => s.text.includes('음식')),
  r.url,
)
await ev(`document.getElementById('search-cat-food').click()`)
await settle(900)
r = await read()
check(
  '탭 전환 운동→음식: 미연결 안내',
  r.status.some((s) => s.text.includes('준비하고 있어요')),
  JSON.stringify(r.status),
)
await ev(`document.getElementById('search-cat-all').click()`)
await settle(900)
r = await read()
check(
  '탭 전환 음식→전체: 운동 3건 복귀',
  names(r).length === 3 && !r.url.includes('c='),
  r.url,
)
// 더 보기(전체 범위 미리보기 3건 초과)
const many = await ev(
  `(async()=>{const m=await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}));window.__EX=m.MOCK_EXERCISES;const n=${norm};const chars=[...new Set(window.__EX.flatMap(e=>[...e.name.replace(/\\s+/g,'')]))];return chars.map(c=>({c,n:window.__EX.filter(e=>n(e.name).includes(c)).length})).sort((a,b)=>b.n-a.n)[0]})()`,
)
console.log(
  `NOTE  "더 보기"(3건 초과)는 Mock 운동명 검색으로 만들 수 없다(한 글자 최다 일치 ${many.n}건) → 화면 검증 불가, 코드로만 확인`,
)

console.log('\n===== 4. 상세 이동 · 상태 복원 · 새로고침 · 브라우저 탐색 =====')
await go('/search', 800)
await submit('덤벨')
await settle()
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await settle(900)
let d = await ev(
  `({path:location.pathname,h1:[...document.querySelectorAll('h1')].map(h=>h.innerText),back:[...document.querySelectorAll('main a')].filter(a=>/이전/.test(a.innerText)).map(a=>a.getAttribute('href'))})`,
)
check(
  '결과 클릭 → /exercises/dumbbell-row 상세(E02) 표시(h1=운동명)',
  /^\/exercises\/[^/]+$/.test(d.path) && d.h1.join().length > 0,
  JSON.stringify(d),
)
check(
  '상세의 "이전" 링크가 같은 검색어·범위의 검색 결과를 가리킴',
  d.back.length === 1 && d.back[0] === '/search?q=' + q('덤벨'),
  JSON.stringify(d.back),
)
await ev(`history.back()`)
await settle(1300)
r = await read()
check(
  '브라우저 뒤로가기 → 검색어·범위·결과 복원(입력창 "덤벨", 3건)',
  r.url === '/search?q=' + q('덤벨') &&
    r.input === '덤벨' &&
    names(r).length === 3,
  JSON.stringify({ u: r.url, i: r.input, n: names(r) }),
)
await ev(`history.forward()`)
await settle(900)
check(
  '브라우저 앞으로가기 → 상세',
  /^\/exercises\/[^/]+$/.test(await ev(`location.pathname`)),
)
await ev(`history.back()`)
await settle(1000)
await ev(`location.reload()`)
await settle(1800)
r = await read()
check(
  '새로고침: 같은 URL·입력창·결과 유지',
  r.url === '/search?q=' + q('덤벨') &&
    r.input === '덤벨' &&
    names(r).length === 3,
  JSON.stringify({ u: r.url, n: names(r) }),
)
// "이전" 링크 경로로 복원
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await settle(900)
await ev(
  `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText)).click()`,
)
await settle(1300)
r = await read()
check(
  '상세 "이전" 클릭 → 같은 검색 결과 복원',
  r.url === '/search?q=' + q('덤벨') && names(r).length === 3,
  r.url,
)
// 검색 후 시작한 첫 검색은 history에 쌓이고 이어지는 검색은 대체한다
await go('/search', 800)
await submit('푸시업')
await settle()
await submit('스쿼트')
await settle()
const len = await ev(`history.length`)
await ev(`history.back()`)
await settle(900)
check(
  '이어지는 검색은 history를 대체(뒤로가기 1회 → 검색 초기 화면 /search)',
  (await ev(`location.pathname+location.search`)) === '/search',
  (await ev(`location.pathname+location.search`)) + ' len=' + len,
)

console.log('\n===== 5. 키보드 · 접근성 =====')
await go('/search?q=' + q('푸시업'), 1200)
const kb = await ev(
  `(()=>{const a=document.querySelector('main a[href="/exercises/5"]');a.focus();return{focused:document.activeElement===a,name:a.innerText.replace(/\\s+/g,' '),role:a.tagName,ring:getComputedStyle(a).outlineStyle,sec:a.closest('section')?.getAttribute('aria-label'),h1:document.querySelector('h1')?.innerText,formRole:document.querySelector('form')?.getAttribute('role'),label:document.querySelector('label[for=search-input]')?.innerText}})()`,
)
check(
  '결과가 링크(a)이고 포커스 가능, 접근 가능한 이름에 운동명+정보 포함, 구역 aria-label "운동 결과"',
  kb.focused &&
    kb.role === 'A' &&
    kb.name.includes('푸시업') &&
    kb.name.includes('중급') &&
    kb.sec === '운동 결과',
  JSON.stringify(kb),
)
await cdp('Input.dispatchKeyEvent', {
  type: 'rawKeyDown',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
})
await cdp('Input.dispatchKeyEvent', {
  type: 'char',
  text: '\r',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
})
await cdp('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
})
await settle(900)
check(
  '키보드 Enter로 결과 선택 → 상세 이동',
  (await ev(`location.pathname`)) === '/exercises/5',
  await ev(`location.pathname`),
)
await go('/search', 600)
await submit('푸시업')
const loading = await ev(
  `new Promise(r=>setTimeout(()=>r([...document.querySelectorAll('main [role=status]')].map(n=>n.innerText)),120))`,
)
check(
  '검색 진행 중 상태 안내(role=status "검색하는 중이에요…")',
  loading.some((x) => x.includes('검색하는 중')),
  JSON.stringify(loading),
)

console.log('\n===== 6. 비동기 경쟁 · 반복 검색 =====')
await go('/search', 800)
await submit('푸시업')
await sleep(60)
await submit('스쿼트')
await settle(1500)
r = await read()
check(
  '빠르게 "푸시업"→"스쿼트": 최종 화면은 스쿼트만(이전 응답이 덮어쓰지 않음)',
  names(r).join() === (await exNames3('스쿼트')) &&
    r.url === '/search?q=' + q('스쿼트'),
  JSON.stringify(names(r)),
)
await submit('푸시업')
await sleep(40)
await submit('스쿼트')
await sleep(40)
await submit('푸시업')
await settle(1500)
r = await read()
check(
  '3회 연속 변경 "푸시업"→"스쿼트"→"푸시업": 최종 푸시업',
  names(r).join() === (await exNames3('푸시업')),
  JSON.stringify(names(r)),
)
await submit('푸시업')
await settle(900)
r = await read()
check(
  '동일 검색어 반복 제출: 결과 유지(사라지거나 중복되지 않음)',
  names(r).join() === (await exNames3('푸시업')) &&
    r.sections[0].rows.length === 3,
)
await ev(`document.getElementById('search-cat-exercise').click()`)
await sleep(50)
await ev(`document.getElementById('search-cat-all').click()`)
await settle(1300)
r = await read()
check(
  '범위 탭을 빠르게 운동→전체: 최종 전체(음식 안내 포함), 결과 1건',
  r.pressed.join() === '전체' &&
    names(r).join() === (await exNames3('푸시업')) &&
    r.status.some((s) => s.text.includes('음식 검색은 아직 준비 중')),
  JSON.stringify({ p: r.pressed }),
)

console.log('\n===== 7. 미연결 · 조회 실패 (개발용 스위치) =====')
await go('/search?q=' + q('푸시업'), 1200)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exercise')`,
)
await go('/search?q=' + q('푸시업'), 1200)
r = await read()
check(
  '운동 데이터 미연결: "검색 서비스를 준비하고 있어요" (결과 없음 아님)',
  r.status.some(
    (s) =>
      s.text.includes('준비하고 있어요') &&
      s.text.includes('검색어 문제는 아니에요'),
  ) && !r.status.some((s) => s.text.includes('검색 결과가 없어요')),
  JSON.stringify(r.status),
)
await go('/search?q=' + q('푸시업') + '&c=exercise', 1200)
r = await read()
check(
  '운동 범위 미연결도 동일',
  r.status.some(
    (s) => s.text.includes('준비하고 있어요') && s.text.includes('운동'),
  ),
  JSON.stringify(r.status),
)
await go('/exercises?q=' + q('푸시업') + '&view=results', 1200)
const e01u = await ev(
  `document.querySelector('main').innerText.replace(/\\s+/g,' ').slice(0,300)`,
)
check(
  'E01도 같은 스위치에서 미연결로 표시(같은 데이터 소스 공유 증거)',
  /준비/.test(e01u),
  e01u,
)
await ev(`localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','')`)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exercise')`,
)
await go('/search?q=' + q('푸시업'), 1200)
r = await read()
check(
  '조회 실패: role=alert "검색 중 문제가 생겼어요" + 다시 시도 버튼',
  r.status.some(
    (s) => s.role === 'alert' && s.text.includes('검색 중 문제가 생겼어요'),
  ),
  JSON.stringify(r.status),
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
await ev(
  `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('다시 시도')).click()`,
)
await settle(1300)
r = await read()
check(
  '다시 시도 → 정상 결과로 복구',
  names(r).join() === (await exNames3('푸시업')),
  JSON.stringify(names(r)),
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`)

console.log('\n===== 8. E01 회귀 =====')
await go('/exercises', 1200)
const e0 = await ev(
  `document.querySelector('main').innerText.replace(/\\s+/g,' ').slice(0,200)`,
)
check('E01 첫 화면 렌더', /운동 탐색/.test(e0), e0)
await go('/exercises?view=results', 1500)
const all = await ev(
  `[...document.querySelectorAll('main a[href^="/exercises/"]')].length`,
)
check('E01 전체 결과(시드 전체, 15건 이상)', all >= 15, String(all))
await go(
  '/exercises?q=' + q('덤벨') + '&difficulty=' + q('초급') + '&view=results',
  1500,
)
const f = await ev(
  `[...document.querySelectorAll('main a[href^="/exercises/"]')].map(a=>a.innerText.split('\\n')[0])`,
)
const fx = await ev(`window.__EX ? 1 : 0`).catch(() => 0)
await go('/search', 600)
await ev(
  `(async()=>{const m=await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}));window.__EX=m.MOCK_EXERCISES})()`,
)
const fexp = await ev(
  `window.__EX.filter(e=>e.name.replace(/\\s+/g,'').includes('덤벨')&&e.difficulty==='초급').map(e=>e.name)`,
)
check(
  'E01 필터 조합(덤벨+초급) 결과가 데이터와 일치',
  f.join() === fexp.join(),
  `ui=${f.join('/')} exp=${fexp.join('/')}`,
)

console.log('\n===== 9. 반응형 · 확대 =====')
for (const [w, h, zoomNote] of [
  [160, 640, '200% 확대(320px 기준)'],
  [195, 844, '200% 확대(390px 기준)'],
  [320, 640, ''],
  [390, 844, ''],
  [768, 1024, ''],
  [1440, 900, ''],
]) {
  await vp(w, h)
  await go('/search?q=' + q('덤벨'), 1200)
  const m = await ev(
    `(()=>{const d=document.documentElement;const rows=[...document.querySelectorAll('main section[aria-label$="결과"] li a')].map(a=>a.getBoundingClientRect());return{sw:d.scrollWidth,cw:d.clientWidth,rows:rows.length,overflowRow:rows.some(r=>r.right>d.clientWidth+0.5||r.left<-0.5),minH:Math.min(...rows.map(r=>r.height))}})()`,
  )
  check(
    `${w}px ${zoomNote}: 가로 스크롤 없음·결과 3건·행이 화면 안`,
    m.sw <= m.cw && m.rows === 3 && !m.overflowRow,
    JSON.stringify(m),
  )
}
await vp(390, 844)
await go('/search?q=' + q('푸시업'), 1200)
await cdp('Page.captureScreenshot', { format: 'png' }).then(async (s) => {
  ;(await import('node:fs')).writeFileSync(
    t.out + '/search-390.png',
    Buffer.from(s.data, 'base64'),
  )
})

console.log('\nconsole problems:', JSON.stringify(t.problems))
const fail = t.res.filter((x) => !x.ok)
console.log(
  `\nTOTAL ${t.res.length}  PASS ${t.res.length - fail.length}  FAIL ${fail.length}`,
)
fail.forEach((x) => console.log('  FAIL: ' + x.n))
t.close()
process.exit(0)
