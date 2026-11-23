// [chrome 회귀] 검색 사용자 동선(비회원·회원)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 사용자 진입 경로 검증: 탐색 화면 → 통합검색(비회원/회원), 추천 검색어. 개발 서버 5199.
import { launch } from '../lib/cdp.mjs'
const t = await launch('out-journey', 9415, 'http://localhost:5199')
const { ev, vp, go, sleep, check } = t
await vp(390, 844)
const q = (s) => encodeURIComponent(s)
const setVal = (sel, v) =>
  ev(
    `(()=>{const i=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
  )
const names = () =>
  ev(
    `[...document.querySelectorAll('main section[aria-label="운동 결과"] li a')].map(a=>a.innerText.split('\\n')[0])`,
  )
const status = () =>
  ev(
    `[...document.querySelectorAll('main [role=status],main [role=alert]')].map(n=>n.innerText.replace(/\\s+/g,' '))`,
  )

async function journey(who) {
  await go('/explore', 1200)
  const entry = await ev(
    `(()=>{const a=document.querySelector('main a[href="/search"]');if(!a)return null;a.click();return true})()`,
  )
  await sleep(900)
  check(
    `[${who}] 탐색 검색창 → /search 이동`,
    entry && (await ev(`location.pathname`)) === '/search',
  )
  await setVal('#search-input', '푸시업')
  await ev(`document.getElementById('search-input').form.requestSubmit()`)
  await sleep(1300)
  const n = await names()
  check(
    `[${who}] "푸시업" 입력·검색 → 운동 결과 표시`,
    n.length >= 1 && n.every((x) => x.includes('푸시업')),
    JSON.stringify(n),
  )
  // 추천 검색어(검색 초기 화면)
  await go('/search', 900)
  const chips = await ev(
    `[...document.querySelectorAll('main ul button')].map(b=>b.innerText).filter(Boolean)`,
  )
  console.log(`  [${who}] 검색 초기 화면 추천 검색어:`, JSON.stringify(chips))
  await ev(
    `[...document.querySelectorAll('main button')].find(b=>b.innerText.trim()==='스쿼트').click()`,
  )
  await sleep(1300)
  const n2 = await names()
  check(
    `[${who}] 추천 검색어 "스쿼트" → 운동 결과`,
    n2.length >= 1 &&
      n2.every((x) => x.includes('스쿼트')) &&
      (await ev(`location.search`)).includes('c=exercise'),
    JSON.stringify(n2) + ' ' + (await ev(`location.search`)),
  )
  await go('/search', 900)
  await ev(
    `[...document.querySelectorAll('main button')].find(b=>b.innerText.trim()==='맨몸 운동')?.click()`,
  )
  await sleep(1300)
  const n3 = await names()
  const s3 = await status()
  console.log(
    `  [${who}] 추천 검색어 "맨몸 운동" → 운동 ${n3.length}건, 안내: ${JSON.stringify(s3)}`,
  )
  // 탐색 화면 추천 검색어 링크
  await go('/explore', 1200)
  const links = await ev(
    `[...document.querySelectorAll('main a[href^="/search?q="]')].map(a=>decodeURIComponent(a.getAttribute('href')))`,
  )
  console.log(`  [${who}] 탐색 화면 추천 링크:`, JSON.stringify(links))
}
await journey('비회원')

// 개발용 일반 회원으로 로그인
await go('/login', 1200)
const fields = await ev(
  `[...document.querySelectorAll('form input')].map(i=>({type:i.type,name:i.name,id:i.id}))`,
)
console.log('  login inputs:', JSON.stringify(fields))
const email =
  fields.find((f) => f.type === 'email' || /email/i.test(f.name + f.id)) ??
  fields[0]
const pw = fields.find((f) => f.type === 'password')
await setVal(
  email.id ? '#' + email.id : `input[name="${email.name}"]`,
  'member.free@example.com',
)
await setVal(pw.id ? '#' + pw.id : 'input[type=password]', 'Mr-Dev-Free-2026')
await ev(`document.querySelector('form').requestSubmit()`)
await sleep(1500)
const afterLogin = await ev(`location.pathname`)
check('개발용 회원 로그인 → /home', afterLogin === '/home', afterLogin)
await journey('회원')

console.log('console problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length} PASS ${t.res.length - f.length} FAIL ${f.length}`,
)
t.close()
process.exit(0)
