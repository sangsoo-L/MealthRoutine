// [chrome 회귀] 즐겨찾기 공유 상태(컴포넌트 하네스)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 3단계: 공유 즐겨찾기(FavoritesProvider) 격리 하네스 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
// 앱의 실제 모듈(FavoritesProvider·useExerciseFavorite·Mock 저장소)을 그대로 불러오고 인증 Context 값만 바꿔 가며 여러 소비자를 동시에 렌더한다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-fav3h-' + Date.now()
const t = await launch(OUT, 9611, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const FK = (id) => `mealthroutine.dev.mock.exerciseFavorite.${id}`
await vp(390, 844)

// Storage 호출 기록(문서가 새로 열릴 때마다 새 기록)
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{const log=[];window.__stor=log;for(const m of ['getItem','setItem','removeItem']){const o=Storage.prototype[m];Storage.prototype[m]=function(k,...r){log.push(m+':'+k);return o.call(this,k,...r)}}})()`,
})

await go('/exercises', 900)
await ev(`localStorage.clear();sessionStorage.clear()`)
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
const URLS = { dom: dep('react-dom_client'), react: dep('react') }

await ev(`(async(URLS)=>{
  const [React,RD,Auth,Prov,Ctx,Hook]=await Promise.all([import(URLS.react),import(URLS.dom),import('/src/auth/authContext.ts'),import('/src/exercise/FavoritesProvider.tsx'),import('/src/exercise/favoritesContext.ts'),import('/src/exercise/useExerciseFavorite.ts')])
  const h=React.createElement??React.default.createElement, createRoot=RD.createRoot??RD.default.createRoot, log=[], cur={}
  const base=(extra)=>({login:async()=>({ok:false,reason:'invalid'}),logout(){},...extra})
  const mk=(id)=>base({status:'authenticated',user:{id,email:id+'@example.com',nickname:id,entitlement:'free'}})
  const guest=base({status:'unauthenticated',user:null})
  function Consumer({name,exerciseId}){
    const f=Hook.useExerciseFavorite(exerciseId), c=Ctx.useFavorites()
    cur[name]={...f,userId:c.userId,ids:[...c.ids],savingIds:[...c.savingIds],failedIds:[...c.failedIds]}
    log.push({name,user:c.userId,status:f.state.status,fav:f.state.favorite,saving:f.saving,failed:f.saveFailed,ids:[...c.ids]})
    return null
  }
  const host=document.createElement('div');document.body.appendChild(host)
  const root=createRoot(host)
  const render=(uid,consumers)=>root.render(h(Auth.AuthContext,{value:uid?mk(uid):guest},h(Prov.default,null,...consumers.map(([n,e])=>h(Consumer,{key:n,name:n,exerciseId:e})))))
  window.__h={render,cur,log,clear:()=>{log.length=0;window.__stor.length=0},unmount:()=>root.unmount()}
})(${JSON.stringify(URLS)})`)

const until = async (expr, n = 60) => {
  for (let i = 0; i < n; i++) {
    if (await ev(expr)) return true
    await sleep(100)
  }
  return false
}
const R = (uid, cons) =>
  ev(`window.__h.render(${JSON.stringify(uid)},${JSON.stringify(cons)})`)
const C = (n) =>
  ev(
    `(()=>{const c=window.__h.cur[${JSON.stringify(n)}];return c?{status:c.state.status,fav:c.state.favorite,saving:c.saving,failed:c.saveFailed,user:c.userId,ids:c.ids,sIds:c.savingIds,fIds:c.failedIds}:null})()`,
  )
const stor = () => ev(`window.__stor.slice()`)
const favReads = async (uid) =>
  (await stor()).filter((x) => x === `getItem:${FK(uid)}`).length
const seed = (uid, ids) =>
  ev(
    `localStorage.setItem(${JSON.stringify(FK(uid))},JSON.stringify({v:1,ids:${JSON.stringify(ids)}}))`,
  )
const stored = (uid) =>
  ev(
    `JSON.parse(localStorage.getItem(${JSON.stringify(FK(uid))})||'{"ids":[]}').ids`,
  )
const flag = (name, v) =>
  ev(
    v
      ? `localStorage.setItem('mealthroutine.dev.mock.flag.${name}',${JSON.stringify(v)})`
      : `localStorage.removeItem('mealthroutine.dev.mock.flag.${name}')`,
  )
const allReady = (names) =>
  until(
    `(()=>{const c=window.__h.cur;return ${JSON.stringify(names)}.every(n=>c[n]&&c[n].state.status==='ready')})()`,
  )
const clear = () => ev(`window.__h.clear()`)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

console.log(
  '\n===== H1. 비회원: Provider가 있어도 아무것도 조회하지 않음 =====',
)
await seed('free', ['push-up'])
await clear()
await R(null, [
  ['A', 'push-up'],
  ['B', 'push-up'],
  ['C', 'squat'],
])
await sleep(900)
const g1 = await Promise.all(['A', 'B', 'C'].map(C))
check(
  '3개 소비자 모두 guest, 등록 모음 비어 있음, saving·saveFailed 없음',
  g1.every(
    (c) =>
      c.status === 'guest' &&
      c.user === null &&
      c.ids.length === 0 &&
      !c.saving &&
      !c.failed &&
      c.sIds.length === 0 &&
      c.fIds.length === 0,
  ),
  JSON.stringify(g1[0]),
)
const s1 = await stor()
check(
  'Storage 접근 기록 0건(즐겨찾기 키는 물론 개발용 스위치 키도 읽지 않음 = 저장소 객체를 만들지 않음)',
  s1.length === 0,
  JSON.stringify(s1),
)
const tg = await ev(`window.__h.cur.A.toggle()`)
check(
  '비회원 toggle은 ignored이고 저장소 접근 없음',
  tg === 'ignored' && (await stor()).length === 0,
)

console.log('\n===== H2. 회원: 여러 소비자가 목록 1회 조회를 공유 =====')
await ev(`window.__h.clear()`)
await seed('free', ['push-up'])
await clear()
await R('free', [
  ['A', 'push-up'],
  ['B', 'push-up'],
  ['C', 'squat'],
])
const sawLoading = await C('A')
check(
  '조회 중: 모든 소비자가 loading(기본 비등록처럼 보이지 않음)',
  sawLoading.status === 'loading' && (await C('C')).status === 'loading',
)
check('조회 완료: 모두 ready', await allReady(['A', 'B', 'C']))
const g2 = await Promise.all(['A', 'B', 'C'].map(C))
check(
  'A·B(push-up)=등록됨, C(squat)=등록 안 됨',
  g2[0].fav === true && g2[1].fav === true && g2[2].fav === false,
  JSON.stringify(g2.map((c) => c.fav)),
)
check(
  '즐겨찾기 키 읽기 = 1회(소비자 3개여도 list 1회)',
  (await favReads('free')) === 1,
  String(await favReads('free')),
)

// 소비자 1개일 때와 같은 횟수인지 비교
await ev(`window.__h.render(null,[])`)
await sleep(100)
await clear()
await R('free', [['Solo', 'push-up']])
await allReady(['Solo'])
check(
  '소비자 1개일 때도 키 읽기 1회(소비자 수와 무관)',
  (await favReads('free')) === 1,
  String(await favReads('free')),
)
await R('free', [
  ['A', 'push-up'],
  ['B', 'push-up'],
  ['C', 'squat'],
])
await sleep(900)
check(
  '소비자를 3개로 늘려 다시 그려도 추가 조회 없음(키 읽기 그대로 1회)',
  (await favReads('free')) === 1 && (await allReady(['A', 'B', 'C'])),
  String(await favReads('free')),
)

console.log('\n===== H3. 같은 운동의 두 소비자 동기화 =====')
await clear()
const p3 = ev(`window.__h.cur.A.toggle()`)
await sleep(120)
const mid = await Promise.all(['A', 'B', 'C'].map(C))
check(
  '저장 중: A·B(같은 운동) saving=true, 아직 등록 표시 유지(저장 전 변경 없음), C(다른 운동)는 영향 없음',
  mid[0].saving &&
    mid[1].saving &&
    mid[0].fav === true &&
    mid[1].fav === true &&
    !mid[2].saving,
  JSON.stringify(mid.map((c) => [c.saving, c.fav])),
)
const r3 = await p3
await sleep(150)
const e3 = await Promise.all(['A', 'B', 'C'].map(C))
check(
  "A에서 해제 → 결과 'removed', A·B가 동시에 해제 표시, saving 해제, C는 그대로",
  r3 === 'removed' &&
    e3[0].fav === false &&
    e3[1].fav === false &&
    e3[2].fav === false &&
    !e3[0].saving &&
    !e3[1].saving,
  JSON.stringify([r3, e3.map((c) => c.fav)]),
)
const reads3 = await favReads('free') // 테스트 자신의 stored() 읽기가 섞이지 않도록 먼저 센다
check(
  '저장소에 push-up 없음, 추가 list 조회 없음(키 읽기 = list 0 + remove 1)',
  reads3 === 1 && same(await stored('free'), []),
  String(reads3),
)
const r3b = await ev(`window.__h.cur.B.toggle()`)
await sleep(150)
const e3b = await Promise.all(['A', 'B'].map(C))
check(
  "B에서 다시 등록 → 'added', A·B 동시에 등록 표시, 저장소 반영",
  r3b === 'added' &&
    e3b[0].fav === true &&
    e3b[1].fav === true &&
    same(await stored('free'), ['push-up']),
)

console.log('\n===== H4. 저장 중 이중 클릭 =====')
await ev(`window.__h.cur.A.toggle()`)
await sleep(400) // push-up 해제해 둔다
await clear()
const dbl = await ev(
  `(async()=>{const c=window.__h.cur;return Promise.all([c.A.toggle(),c.B.toggle(),c.A.toggle()])})()`,
)
await sleep(200)
const writes = (await stor()).filter(
  (x) => x === `setItem:${FK('free')}`,
).length
check(
  "같은 운동을 같은 틱에 3번 누름(두 소비자) → ['added','ignored','ignored'], 저장 1회, 최종 등록 1건",
  same(dbl, ['added', 'ignored', 'ignored']) &&
    writes === 1 &&
    same(await stored('free'), ['push-up']),
  JSON.stringify([dbl, writes, await stored('free')]),
)
check(
  '저장 완료 후 saving 해제, 모든 소비자 등록 표시',
  (await C('A')).fav === true &&
    (await C('B')).fav === true &&
    !(await C('A')).saving,
)

console.log('\n===== H5. 서로 다른 운동은 독립 =====')
await clear()
const ind = await ev(
  `(async()=>{const c=window.__h.cur;return Promise.all([c.A.toggle(),c.C.toggle()])})()`,
)
await sleep(250)
const e5 = await Promise.all(['A', 'B', 'C'].map(C))
check(
  "A(push-up 해제)와 C(squat 등록)를 동시에 → ['removed','added'], A·B 해제 / C 등록, 서로 막지 않음",
  same(ind, ['removed', 'added']) &&
    e5[0].fav === false &&
    e5[1].fav === false &&
    e5[2].fav === true,
  JSON.stringify([ind, e5.map((c) => c.fav)]),
)
check(
  '저장소에는 squat만 남음(한쪽 저장이 다른 쪽 결과를 지우지 않음), 모든 소비자의 ids가 같은 모음',
  same(await stored('free'), ['squat']) &&
    same(e5[0].ids, ['squat']) &&
    same(e5[2].ids, ['squat']),
  JSON.stringify([await stored('free'), e5[0].ids]),
)

console.log('\n===== H6. 저장 실패: 상태 유지, 그 운동에만 실패 표시 =====')
await flag('failSave', 'exerciseFavorite')
await clear()
const f6 = await ev(`window.__h.cur.C.toggle()`)
await sleep(200)
const e6 = await Promise.all(['A', 'B', 'C'].map(C))
check(
  "squat 해제 실패 → 'failed', C는 등록 유지, C만 saveFailed, saving 해제, 저장소 그대로",
  f6 === 'failed' &&
    e6[2].fav === true &&
    e6[2].failed &&
    !e6[2].saving &&
    !e6[0].failed &&
    !e6[1].failed &&
    same(await stored('free'), ['squat']),
  JSON.stringify([f6, e6.map((c) => [c.fav, c.failed, c.saving])]),
)
const f6b = await ev(`window.__h.cur.C.toggle()`)
await sleep(200)
check(
  "실패 상태에서 다시 시도해도 같은 동작(해제)을 시도 → 또 'failed', 상태 유지",
  f6b === 'failed' && (await C('C')).fav === true && (await C('C')).failed,
)
await flag('failSave', null)
const f6c = await ev(`window.__h.cur.C.toggle()`)
await sleep(200)
const e6c = await C('C')
check(
  "스위치를 끄고 다시 시도 → 'removed', saveFailed 해제, 저장소 반영",
  f6c === 'removed' &&
    e6c.fav === false &&
    !e6c.failed &&
    same(await stored('free'), []),
  JSON.stringify([f6c, e6c]),
)

console.log('\n===== H7. 조회 실패 + 재시도: 모든 소비자가 함께 =====')
await seed('full', ['squat'])
await flag('failLoad', 'exerciseFavorite')
await clear()
await R('full', [
  ['A', 'push-up'],
  ['B', 'push-up'],
  ['C', 'squat'],
])
check(
  '조회 실패: 3개 소비자 모두 error',
  await until(
    `['A','B','C'].every(n=>window.__h.cur[n]?.state.status==='error')`,
  ),
)
await flag('failLoad', null)
await ev(`window.__h.cur.B.reload()`)
await sleep(60)
check(
  '다시 시도(reload) 직후: 모든 소비자 loading',
  (await Promise.all(['A', 'B', 'C'].map(C))).every(
    (c) => c.status === 'loading',
  ),
)
check(
  '재조회 성공: 모두 ready, C(squat)=등록됨',
  (await allReady(['A', 'B', 'C'])) &&
    (await C('C')).fav === true &&
    (await C('A')).fav === false,
)
check(
  '조회 실패 뒤에는 toggle이 ignored(상태를 모를 때 저장하지 않음)',
  await (async () => {
    await flag('failLoad', 'exerciseFavorite')
    await R('full2', [['A', 'push-up']])
    await until(`window.__h.cur.A?.state.status==='error'`)
    const r = await ev(`window.__h.cur.A.toggle()`)
    await flag('failLoad', null)
    return r === 'ignored'
  })(),
)

console.log('\n===== H8. 데이터 소스 미연결 =====')
await flag('unavailable', 'exerciseFavorite')
await clear()
await R('un1', [
  ['A', 'push-up'],
  ['B', 'squat'],
])
check(
  '모든 소비자 unavailable("해제됨"이 아님), toggle은 ignored, 즐겨찾기 키 접근 없음',
  (await until(
    `['A','B'].every(n=>window.__h.cur[n]?.state.status==='unavailable')`,
  )) &&
    (await ev(`window.__h.cur.A.toggle()`)) === 'ignored' &&
    !(await stor()).some((x) => x.includes('exerciseFavorite.')),
  JSON.stringify(await stor()),
)
await flag('unavailable', null)

console.log(
  '\n===== H9. 계정 전환: 이전 계정 값 즉시 격리 + 늦은 조회 응답 무시 =====',
)
await seed('acctA', ['push-up', 'squat'])
await seed('acctB', [])
await ev(`window.__h.clear()`)
await R('acctA', [
  ['A', 'push-up'],
  ['C', 'squat'],
])
await allReady(['A', 'C'])
check(
  '계정 A: push-up·squat 등록 표시',
  (await C('A')).fav === true && (await C('C')).fav === true,
)
await ev(`window.__h.log.length=0`)
await R('acctB', [
  ['A', 'push-up'],
  ['C', 'squat'],
])
const firstB = await ev(`window.__h.log.filter(e=>e.user==='acctB').slice(0,2)`)
check(
  'B로 전환한 첫 렌더부터 loading이고 A의 등록 정보가 보이지 않음',
  firstB.length >= 1 &&
    firstB.every(
      (e) =>
        e.status === 'loading' && e.ids.length === 0 && e.fav === undefined,
    ),
  JSON.stringify(firstB),
)
await allReady(['A', 'C'])
const leak = await ev(
  `window.__h.log.filter(e=>e.user==='acctB'&&(e.ids.length>0||e.fav===true))`,
)
check(
  'B 조회 완료: 등록 없음, 전환 이후 B 이름으로 기록된 렌더에 A의 값이 한 번도 나타나지 않음',
  (await C('A')).fav === false &&
    (await C('C')).fav === false &&
    leak.length === 0,
  JSON.stringify(leak.slice(0, 2)),
)

// 늦은 응답: A 조회 중(300ms)에 B로 전환
await ev(`window.__h.render(null,[])`)
await sleep(100)
await ev(`window.__h.log.length=0`)
await R('acctA', [['A', 'push-up']])
await sleep(60)
await R('acctB', [['A', 'push-up']])
await sleep(900)
const lateLog = await ev(`window.__h.log.slice()`)
const bFinal = await C('A')
check(
  'A 조회가 끝나기 전에 B로 전환 → 늦게 도착한 A의 응답을 무시: B는 ready·등록 없음, B 이름 렌더 중 A의 값 노출 0',
  bFinal.status === 'ready' &&
    bFinal.user === 'acctB' &&
    bFinal.fav === false &&
    !lateLog.some(
      (e) => e.user === 'acctB' && (e.fav === true || e.ids.length > 0),
    ),
  JSON.stringify(lateLog.filter((e) => e.user === 'acctB').slice(-2)),
)
check(
  '  A 이름 렌더가 B 상태로 바뀐 뒤 다시 나타나지도 않음(A→B 이후 user=acctA 렌더 없음)',
  await (async () => {
    const idx = lateLog.findIndex((e) => e.user === 'acctB')
    return idx >= 0 && !lateLog.slice(idx).some((e) => e.user === 'acctA')
  })(),
)

console.log(
  '\n===== H10. 저장 도중 계정 전환: 늦은 저장 결과가 새 계정에 섞이지 않음 =====',
)
await seed('acctA', ['push-up'])
await seed('acctB', ['squat'])
await ev(`window.__h.render(null,[])`)
await sleep(100)
await R('acctA', [['A', 'bench-press']])
await allReady(['A'])
const pending = ev(`window.__h.cur.A.toggle()`)
await sleep(60)
check('A가 저장 중', (await C('A')).saving === true)
await ev(`window.__h.log.length=0`)
await R('acctB', [['A', 'bench-press']])
const bMid = await C('A')
check(
  '저장 중 B로 전환: B에는 saving 표시가 없고(계정별 분리) loading',
  bMid.user === 'acctB' &&
    bMid.saving === false &&
    bMid.sIds.length === 0 &&
    bMid.status === 'loading',
  JSON.stringify(bMid),
)
await allReady(['A'])
await sleep(500)
const res10 = await pending
const bEnd = await C('A')
check(
  "A의 저장은 끝까지 수행되어 A 저장소에 반영('added')되었지만 B의 목록·표시는 바뀌지 않음",
  res10 === 'added' &&
    (await stored('acctA')).includes('bench-press') &&
    bEnd.fav === false &&
    same(bEnd.ids, ['squat']) &&
    !bEnd.saving &&
    !bEnd.failed,
  JSON.stringify([res10, await stored('acctA'), bEnd]),
)
check(
  'B 이름 렌더 중 A의 저장 결과(bench-press)가 한 번도 보이지 않음',
  !(await ev(
    `window.__h.log.some(e=>e.user==='acctB'&&(e.fav===true||e.ids.includes('bench-press')))`,
  )),
)
await R('acctA', [['A', 'bench-press']])
await allReady(['A'])
check(
  'A로 돌아오면 새로 조회해 저장된 bench-press가 등록 표시',
  (await C('A')).fav === true &&
    same((await C('A')).ids.sort(), ['bench-press', 'push-up']),
)

console.log('\n===== H11. 로그아웃: 회원 데이터 즉시 사라짐 =====')
await ev(`window.__h.log.length=0`)
await R(null, [
  ['A', 'bench-press'],
  ['C', 'push-up'],
])
const lo = await ev(`window.__h.log.filter(e=>e.user===null)`)
check(
  '로그아웃 첫 렌더부터 guest·등록 없음·saving 없음(회원 데이터 노출 0)',
  lo.length >= 1 &&
    lo.every(
      (e) =>
        e.status === 'guest' &&
        e.ids.length === 0 &&
        e.fav === undefined &&
        !e.saving &&
        !e.failed,
    ),
  JSON.stringify(lo.slice(0, 2)),
)
await ev(`window.__stor.length=0`)
await sleep(700)
check(
  '로그아웃 상태에서 저장소 접근 없음',
  (await stor()).length === 0,
  JSON.stringify(await stor()),
)
const tgo = await ev(`window.__h.cur.A.toggle()`)
check(
  '로그아웃 후 toggle은 ignored',
  tgo === 'ignored' && (await stor()).length === 0,
)
await clear()
await R('acctA', [['A', 'bench-press']])
check(
  '다시 로그인: loading을 거쳐 새로 조회해 ready',
  (await C('A')).status === 'loading' &&
    (await allReady(['A'])) &&
    (await C('A')).fav === true,
)

console.log('\n===== H12. Provider 밖 사용 =====')
const outside = await ev(
  `(async(URLS)=>{const [React,RD,Hook]=await Promise.all([import(URLS.react),import(URLS.dom),import('/src/exercise/useExerciseFavorite.ts')]);let msg=null;const CE=React.createElement??React.default.createElement,Cmp=React.Component??React.default.Component,cr=RD.createRoot??RD.default.createRoot;class B extends Cmp{state={e:null};static getDerivedStateFromError(e){return{e}}render(){if(this.state.e){msg=String(this.state.e.message);return null}return this.props.children}};function X(){Hook.useExerciseFavorite('a');return null};const el=document.createElement('div');document.body.appendChild(el);const r=cr(el);const orig=console.error;console.error=()=>{};r.render(CE(B,null,CE(X)));await new Promise(r=>setTimeout(r,200));console.error=orig;r.unmount();return msg})(${JSON.stringify(URLS)})`,
)
check(
  'Provider 밖에서 쓰면 명확한 오류(조용히 비회원처럼 동작하지 않음)',
  /FavoritesProvider/.test(outside || ''),
  String(outside),
)

const bad = t.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
t.close()
process.exit(fails.length ? 1 : 0)
