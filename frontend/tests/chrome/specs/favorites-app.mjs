// [chrome 회귀] 즐겨찾기 공유 상태(앱 안 이동)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 3단계: 실제 앱(StrictMode 포함)에서 공유 즐겨찾기 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-fav3a-' + Date.now()
const t = await launch(OUT, 9621, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const FK = (id) => `mealthroutine.dev.mock.exerciseFavorite.${id}`
await vp(390, 844)
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{const log=[];window.__stor=log;for(const m of ['getItem','setItem','removeItem']){const o=Storage.prototype[m];Storage.prototype[m]=function(k,...r){log.push(m+':'+k);return o.call(this,k,...r)}}})()`,
})

const setVal = (sel, v) =>
  ev(
    `(()=>{const i=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
const until = async (expr, n = 60) => {
  for (let i = 0; i < n; i++) {
    if (await ev(expr)) return true
    await sleep(100)
  }
  return false
}
// 페이지를 다시 불러오지 않는 앱 안 이동(React Router 이동). 공유 상태가 유지되는지 보려면 전체 로드가 아니어야 한다.
const spa = async (path) => {
  await ev(
    `(()=>{history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate',{state:{}}))})()`,
  )
  await until(`location.pathname===${JSON.stringify(path)}`, 20)
}
// 앱 안 이동 후 운동 정보가 그려진 즉시(추가 대기 없이) 별 라벨을 읽는다. 즐겨찾기 조회를 다시 하면 이 시점에 '확인 중'이 보인다.
const spaE02 = async (path) => {
  await spa(path)
  await until(`!!document.querySelector('main article h1')`, 40)
  return starLabel()
}
const starLabel = () =>
  ev(
    `document.querySelector('main article header button[aria-label^="즐겨찾기"]')?.getAttribute('aria-label')??null`,
  )
const waitStar = (re) =>
  until(
    `/${re}/.test(document.querySelector('main article header button[aria-label^="즐겨찾기"]')?.getAttribute('aria-label')||'')`,
    50,
  )
const stor = () => ev(`window.__stor.slice()`)
const reads = async (uid) =>
  (await stor()).filter((x) => x === `getItem:${FK(uid)}`).length
const writes = async (uid) =>
  (await stor()).filter((x) => x === `setItem:${FK(uid)}`).length

await go('/login', 900)
await ev(`localStorage.clear();sessionStorage.clear()`)
await ev(
  `localStorage.setItem(${JSON.stringify(FK('free'))},JSON.stringify({v:1,ids:['16']}))`,
)
await ev(
  `localStorage.setItem(${JSON.stringify(FK('full'))},JSON.stringify({v:1,ids:['22']}))`,
)
await go('/login', 900)
await setVal('input[type=email]', 'member.free@example.com')
await setVal('input[type=password]', 'Mr-Dev-Free-2026')
await ev(`document.querySelector('form').requestSubmit()`)
await sleep(1500)

console.log('\n===== A. 앱 안 이동 중 재조회 없음 (StrictMode 개발 서버) =====')
await go('/exercises/5', 700)
check(
  '회원 E02(푸시업): 로드 후 별이 "추가" 상태',
  await waitStar('즐겨찾기에 추가: 푸시업'),
)
await sleep(500)
const base = await reads('free')
console.log('  최초 조회 키 읽기(StrictMode는 개발에서 효과를 2번 실행):', base)
check(
  '최초 로드의 즐겨찾기 키 읽기가 1~2회(list 호출만큼, 소비자 수·운동 수와 무관)',
  base >= 1 && base <= 2,
  String(base),
)
let lb = await spaE02('/exercises/16')
check(
  '앱 안 이동(푸시업→맨몸 스쿼트): 운동 정보가 그려진 즉시 별이 "해제"(squat 등록) — "확인 중"을 거치지 않음',
  /즐겨찾기 해제: 맨몸 스쿼트/.test(lb || ''),
  String(lb),
)
lb = await spaE02('/exercises/22')
check(
  '플랭크(미등록): 즉시 "추가"',
  /즐겨찾기에 추가: 플랭크/.test(lb || ''),
  String(lb),
)
lb = await spaE02('/exercises/5')
check(
  '다시 푸시업: 즉시 "추가", 매번 새로 조회하지 않음',
  /즐겨찾기에 추가: 푸시업/.test(lb || ''),
  String(lb),
)
check(
  '운동 상세를 4번 오갔어도 즐겨찾기 키 읽기가 늘지 않음(첫 로드와 같은 횟수)',
  (await reads('free')) === base,
  `${await reads('free')} vs ${base}`,
)

console.log('\n===== B. 등록 결과가 이동 후에도 공유 =====')
await ev(`window.__stor.length=0`)
await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]').click()`,
)
check(
  '푸시업 등록: 저장 중 라벨 유지·aria-disabled, 저장 전에는 "해제"로 바뀌지 않음',
  await (async () => {
    await sleep(100)
    const b = await ev(
      `(()=>{const e=document.querySelector('main article header button[aria-label^="즐겨찾기"]');return{l:e.getAttribute('aria-label'),d:e.getAttribute('aria-disabled')}})()`,
    )
    return /즐겨찾기에 추가: 푸시업/.test(b.l) && b.d === 'true'
  })(),
)
check(
  '저장 완료: "해제" + 보이지 않는 안내 "즐겨찾기에 추가했어요."',
  (await waitStar('즐겨찾기 해제: 푸시업')) &&
    (await ev(
      `document.querySelector('main article [role=status]').textContent`,
    )) === '즐겨찾기에 추가했어요.',
)
await spaE02('/exercises/16')
lb = await spaE02('/exercises/5')
check(
  '다른 운동을 보고 돌아와도 푸시업은 즉시 "해제"(등록 유지), 추가 조회 없음(키 읽기 = add의 1회)',
  /즐겨찾기 해제: 푸시업/.test(lb || '') && (await reads('free')) === 1,
  `${lb} / reads=${await reads('free')}`,
)
check(
  '저장소에는 squat·push-up',
  JSON.stringify(
    await ev(
      `JSON.parse(localStorage.getItem(${JSON.stringify(FK('free'))})).ids`,
    ),
  ) === JSON.stringify(['16', '5']),
)

console.log('\n===== C. 이중 클릭 =====')
await ev(`window.__stor.length=0`)
await ev(
  `(()=>{const b=document.querySelector('main article header button[aria-label^="즐겨찾기"]');b.click();b.click();b.click()})()`,
)
await waitStar('즐겨찾기에 추가: 푸시업')
await sleep(200)
check(
  '같은 틱에 별 3번 클릭: 저장(setItem) 1회, 결과는 한 번만 바뀜(해제 1회)',
  (await writes('free')) === 1 &&
    /즐겨찾기에 추가: 푸시업/.test((await starLabel()) || ''),
  `writes=${await writes('free')} label=${await starLabel()}`,
)
check(
  '저장소: squat만 남음',
  JSON.stringify(
    await ev(
      `JSON.parse(localStorage.getItem(${JSON.stringify(FK('free'))})).ids`,
    ),
  ) === JSON.stringify(['16']),
)

console.log(
  '\n===== D. 로그아웃 → 다른 계정 로그인 (페이지를 새로 불러오지 않음) =====',
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
await spa('/exercises/16')
await until(`!!document.querySelector('main article h1')`)
await sleep(900)
const g = await ev(
  `(()=>{const a=document.querySelector('main article');return{h1:a.querySelector('h1').textContent,buttons:a.querySelectorAll('button').length,fav:[...a.querySelectorAll('[aria-label]')].filter(n=>n.getAttribute('aria-label').startsWith('즐겨찾기')).length}})()`,
)
const gs = await stor()
check(
  '로그아웃: 운동 정보는 보이고 즐겨찾기·오늘 기록·내일 계획 버튼 DOM 없음',
  lo === true && g.h1 === '맨몸 스쿼트' && g.buttons === 0 && g.fav === 0,
  JSON.stringify(g),
)
check(
  '로그아웃 후 즐겨찾기 키 접근 0건(이전 계정 조회·저장 없음)',
  !gs.some((x) => x.includes('exerciseFavorite')),
  JSON.stringify(gs.filter((x) => x.includes('exerciseFavorite'))),
)
await spa('/login')
await until(`!!document.querySelector('input[type=email]')`)
await setVal('input[type=email]', 'member.full@example.com')
await setVal('input[type=password]', 'Mr-Dev-Full-2026')
await ev(`window.__stor.length=0`)
await ev(`document.querySelector('form').requestSubmit()`)
await sleep(1500)
await spa('/exercises/16')
await until(`!!document.querySelector('main article h1')`)
check(
  '다른 계정(full) 로그인: 맨몸 스쿼트는 이 계정에서 미등록이라 "추가" — 이전 계정(free)의 squat 등록이 보이지 않음',
  await waitStar('즐겨찾기에 추가: 맨몸 스쿼트'),
  String(await starLabel()),
)
lb = await spaE02('/exercises/22')
check(
  '이 계정의 등록(plank)이 "해제"로 보임',
  await waitStar('즐겨찾기 해제: 플랭크'),
  String(await starLabel()),
)
const ds = await stor()
check(
  'free 계정 키는 읽지도 쓰지도 않았고 full 키만 조회',
  !ds.some((x) => x.endsWith(`.free`)) &&
    ds.some((x) => x === `getItem:${FK('full')}`),
  JSON.stringify(ds.filter((x) => x.includes('exerciseFavorite'))),
)
check(
  '계정 전환 과정에서 콘솔 오류·경고 없음',
  t.problems.filter((p) => !/Download the React DevTools/.test(p)).length === 0,
  JSON.stringify(t.problems.slice(0, 3)),
)

console.log('\n===== E. 오류·미연결 안내(기존 승인 문구 그대로) =====')
await go('/exercises/5', 500)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exerciseFavorite')`,
)
await go('/exercises/5', 900)
await until(
  `/다시 시도/.test(document.querySelector('main article header button[aria-label^="즐겨찾기"]')?.getAttribute('aria-label')||'')`,
)
check(
  '조회 실패: 별 라벨 "…확인하지 못했어요. 다시 시도: 푸시업" + 안내 문구',
  /즐겨찾기 상태를 확인하지 못했어요\. 다시 시도: 푸시업/.test(
    (await starLabel()) || '',
  ) &&
    (
      await ev(`document.querySelector('main article [aria-live]').innerText`)
    ).includes('즐겨찾기 상태를 확인하지 못했어요.'),
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]').click()`,
)
check(
  '별 버튼 다시 시도 → 재조회 성공(안내 사라지고 정상 별)',
  (await waitStar('즐겨찾기(에 추가| 해제): 푸시업')) &&
    !(
      await ev(`document.querySelector('main article [aria-live]').innerText`)
    ).includes('확인하지 못했어요'),
)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failSave','exerciseFavorite')`,
)
await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]').click()`,
)
await sleep(700)
check(
  '저장 실패: 승인 문구 "즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요." 표시, 별 상태 유지',
  (
    await ev(`document.querySelector('main article [aria-live]').innerText`)
  ).includes('즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요.') &&
    /즐겨찾기(에 추가| 해제): 푸시업/.test((await starLabel()) || ''),
)
await ev(
  `localStorage.removeItem('mealthroutine.dev.mock.flag.failSave');localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exerciseFavorite')`,
)
await go('/exercises/5', 900)
await until(
  `!!document.querySelector('main article header button[aria-label^="즐겨찾기"]')`,
)
await sleep(600)
await ev(
  `document.querySelector('main article header button[aria-label^="즐겨찾기"]').click()`,
)
await sleep(200)
check(
  '데이터 소스 미연결: 누르면 "즐겨찾기 기능을 준비하고 있어요." 안내',
  (
    await ev(`document.querySelector('main article [aria-live]').innerText`)
  ).includes('즐겨찾기 기능을 준비하고 있어요.'),
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`)

const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
t.close()
process.exit(fails.length ? 1 : 0)
