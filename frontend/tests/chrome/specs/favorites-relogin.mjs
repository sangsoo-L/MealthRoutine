// [chrome 회귀] 즐겨찾기: 같은 계정 재로그인 뒤 늦은 응답, 서버 무응답(#39 리뷰 P2-01·P2-02)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only favorites-relogin`. 상세: tests/chrome/README.md
// 앱의 실제 모듈(FavoritesProvider·useExerciseFavorite·API 즐겨찾기 저장소·계정 정리)을 불러오고, 저장소의 요청 함수만 응답 시점을
// 이 스크립트가 정하는 가짜로 바꾼다(createRepository). 인증 Context 값은 하네스가 바꾼다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-favrelogin-' + Date.now()
const t = await launch(OUT, 9612, 'http://localhost:5199')
const { ev, vp, go, sleep, check } = t
await vp(390, 844)

await go('/exercises', 900)
await ev(`localStorage.clear();sessionStorage.clear()`)
const srcText = await fetch('http://localhost:5199/src/main.tsx').then((x) =>
  x.text(),
)
const dep = (nm) => {
  const i = srcText.indexOf('/node_modules/.vite/deps/' + nm + '.js?v=')
  if (i < 0) throw new Error('dep ' + nm)
  return srcText.slice(i).match(/^[^"'\s]+/)[0]
}
const URLS = { dom: dep('react-dom_client'), react: dep('react') }

// 요청마다 대기 항목을 만든다. 스크립트가 resolve/reject로 응답 시점을 정한다. signal이 끊기면(시간 상한) 그 요청은 실패한다.
await ev(`(async(URLS)=>{
  const [React,RD,Auth,Prov,Ctx,Hook,Api,Scope]=await Promise.all([import(URLS.react),import(URLS.dom),import('/src/auth/authContext.ts'),import('/src/exercise/FavoritesProvider.tsx'),import('/src/exercise/favoritesContext.ts'),import('/src/exercise/useExerciseFavorite.ts'),import('/src/exercise/api/apiFavoriteRepository.ts'),import('/src/auth/accountScope.ts')])
  const h=React.createElement??React.default.createElement, createRoot=RD.createRoot??RD.default.createRoot, cur={}, calls=[]
  const request=(method,path,options)=>new Promise((resolve,reject)=>{
    const call={method,path,resolve,reject,done:false}
    calls.push(call)
    options?.signal?.addEventListener('abort',()=>{call.done=true;reject(options.signal.reason)},{once:true})
  })
  let timeoutMs=60000
  const createRepository=()=>Api.createApiFavoriteRepository(request,{timeoutMs})
  const base=(extra)=>({login:async()=>({ok:false,reason:'invalid'}),logout(){},...extra})
  const mk=(id)=>base({status:'authenticated',user:{id,email:id+'@example.com',nickname:id,entitlement:'free'}})
  const guest=base({status:'unauthenticated',user:null})
  function Consumer({name,exerciseId}){
    const f=Hook.useExerciseFavorite(exerciseId), c=Ctx.useFavorites()
    cur[name]={...f,status:c.status,ids:[...c.ids],savingIds:[...c.savingIds],failedIds:[...c.failedIds],reload:c.reload}
    return null
  }
  const host=document.createElement('div');document.body.appendChild(host)
  const root=createRoot(host)
  const render=(uid)=>root.render(h(Auth.AuthContext,{value:uid?mk(uid):guest},h(Prov.default,{createRepository},h(Consumer,{name:'A',exerciseId:'2'}))))
  const row=(id)=>({exerciseId:Number(id)})
  window.__h={render,cur,calls,
    open:()=>calls.filter(c=>!c.done).map(c=>c.method+' '+c.path),
    answer:(method,ids)=>{const c=calls.find(x=>!x.done&&x.method===method);if(!c)return false;c.done=true;c.resolve(method==='GET'?ids.map(row).reverse():undefined);return true},
    fail:(method)=>{const c=calls.find(x=>!x.done&&x.method===method);if(!c)return false;c.done=true;c.reject(new Error('fail'));return true},
    relogin:()=>Scope.clearAccountScopedData(),
    setTimeoutMs:(ms)=>{timeoutMs=ms},
    reset:()=>{calls.length=0}}
})(${JSON.stringify(URLS)})`)

const until = async (expr, n = 60) => {
  for (let i = 0; i < n; i++) {
    if (await ev(expr)) return true
    await sleep(100)
  }
  return false
}
const A = () =>
  ev(
    `(()=>{const c=window.__h.cur.A;return {status:c.status,ids:c.ids,saving:c.saving,failed:c.saveFailed,sIds:c.savingIds,fIds:c.failedIds}})()`,
  )
const render = (uid) => ev(`window.__h.render(${JSON.stringify(uid)})`)
const answer = (m, ids = []) =>
  ev(`window.__h.answer(${JSON.stringify(m)},${JSON.stringify(ids)})`)
const open = () => ev(`window.__h.open()`)
const toggle = () => ev(`window.__h.cur.A.toggle()`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

console.log(
  '\n===== R1. 같은 계정 재로그인(로그아웃을 거침): 이전 로그인의 늦은 등록 성공이 새 조회를 덮어쓰지 않음 =====',
)
await render('7')
await until(`window.__h.open().includes('GET /users/me/favorite-exercises')`)
await answer('GET', ['1'])
check('첫 로그인 조회 완료', await until(`window.__h.cur.A.status==='ready'`))
const pending = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().some(x=>x.startsWith('PUT'))`)
check('운동 2 등록 요청 중(저장 중 표시)', (await A()).saving === true)
// 로그아웃 → 같은 계정 로그인. 실제 앱처럼 계정 정리도 함께 돈다.
await ev(`window.__h.relogin()`)
await render(null)
await sleep(100)
await ev(`window.__h.relogin()`)
await render('7')
await until(`window.__h.open().filter(x=>x.startsWith('GET')).length===1`)
await answer('GET', ['3'])
check(
  '새 조회 결과(서버 값)만 보임',
  await until(`JSON.stringify(window.__h.cur.A.ids)==='["3"]'`),
)
check('새 로그인에서는 운동 2가 저장 중이 아님', (await A()).saving === false)
await answer('PUT')
const r1 = await pending
await sleep(200)
const a1 = await A()
check(
  '이전 로그인의 늦은 등록 성공은 반영하지 않음(ids 그대로, 실패·저장 중 표시 없음)',
  r1 === 'ignored' && same(a1.ids, ['3']) && !a1.saving && !a1.failed,
  JSON.stringify({ r1, a1 }),
)
const again = ev(`window.__h.cur.A.toggle()`)
check(
  '새 로그인에서 운동 2를 다시 누를 수 있음(이전 잠금이 남지 않음)',
  await until(`window.__h.open().some(x=>x.startsWith('PUT'))`),
)
await answer('PUT')
check(
  '새 로그인의 등록은 반영됨',
  (await again) === 'added' && same((await A()).ids, ['3', '2']),
)

console.log(
  '\n===== R1b. 같은 계정 재로그인(계정 id가 비는 렌더 없음): 늦은 응답 무시, 저장 중 표시가 남지 않음 =====',
)
const p2 = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().some(x=>x.startsWith('DELETE'))`)
await ev(`window.__h.relogin()`)
await answer('DELETE')
const r2 = await p2
await sleep(200)
const a2 = await A()
check(
  '늦은 해제 성공은 무시하고 저장 중 표시는 풀림',
  r2 === 'ignored' && same(a2.ids, ['3', '2']) && !a2.saving && !a2.failed,
  JSON.stringify({ r2, a2 }),
)
const p3 = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().some(x=>x.startsWith('DELETE'))`)
const busyMark = (await A()).saving
await ev(`window.__h.relogin()`)
const p4 = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().filter(x=>x.startsWith('DELETE')).length===2`)
check('재로그인 뒤 같은 운동을 다시 누를 수 있음', busyMark === true)
await answer('DELETE') // 이전 로그인의 해제가 먼저 끝남
await sleep(150)
check(
  '이전 로그인의 해제가 끝나도 새 로그인의 저장 중 표시는 남음',
  (await A()).saving === true,
)
await answer('DELETE')
const [r3, r4] = [await p3, await p4]
check(
  '새 로그인의 해제만 반영',
  r3 === 'ignored' && r4 === 'removed' && same((await A()).ids, ['3']),
  JSON.stringify({ r3, r4, ids: (await A()).ids }),
)

console.log(
  '\n===== R2. 서버 무응답: 시간 상한 뒤 로딩·버튼 잠금이 풀리고 다시 시도할 수 있음 =====',
)
await ev(`window.__h.setTimeoutMs(400)`)
await ev(`window.__h.reset()`)
await render(null)
await sleep(100)
await render('8')
check(
  '조회 중 loading',
  (await until(`window.__h.open().some(x=>x.startsWith('GET'))`)) &&
    (await A()).status === 'loading',
)
check(
  '응답이 없으면 시간 상한 뒤 error',
  await until(`window.__h.cur.A.status==='error'`, 30),
)
await ev(`window.__h.cur.A.reload()`)
await until(`window.__h.open().some(x=>x.startsWith('GET'))`)
await answer('GET', [])
check('다시 시도하면 ready', await until(`window.__h.cur.A.status==='ready'`))
const hang = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().some(x=>x.startsWith('PUT'))`)
check('저장 중 표시', (await A()).saving === true)
const hr = await hang
const a3 = await A()
check(
  '응답이 없으면 시간 상한 뒤 failed, 잠금이 풀림',
  hr === 'failed' && !a3.saving && a3.failed && same(a3.ids, []),
  JSON.stringify({ hr, a3 }),
)
await ev(`window.__h.setTimeoutMs(60000)`)
const retry = ev(`window.__h.cur.A.toggle()`)
await until(`window.__h.open().some(x=>x.startsWith('PUT'))`)
await answer('PUT')
check(
  '다시 누르면 등록됨',
  (await retry) === 'added' &&
    same((await A()).ids, ['2']) &&
    !(await A()).failed,
)

const bad = t.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
t.close()
process.exit(fails.length ? 1 : 0)
