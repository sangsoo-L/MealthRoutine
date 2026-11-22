// [chrome 회귀] W13 등록 → W02 초안(W13-C)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// W13-C 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { start, q } from '../lib/session-r2.mjs'

const h = await start(9871, 'w13c')
const { ev, vp, go, sleep, check, until } = h
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
await vp(390, 844)
const KEY = 'mealthroutine.account.workout-draft'

const tab = (name) =>
  ev(
    `[...document.querySelectorAll('main [role=group][aria-label="운동 찾는 방법"] button')].find(b=>b.innerText.trim()===${q(name)}).click()`,
  )
const rowSel = `main section[aria-label="운동 목록"] ul > li`
const clickRow = (name) =>
  ev(
    `(()=>{const li=[...document.querySelectorAll('${rowSel}')].find(l=>l.querySelector('button[aria-pressed] span span')?.textContent.trim()===${q(name)});li.querySelector('button[aria-pressed]').click()})()`,
  )
const openPicker = async () => {
  await h.open('', '/records/exercise/select')
  await tab('직접 검색')
  await sleep(150)
  await ev(`document.querySelector('form[role=search]').requestSubmit()`)
  await until(`document.querySelectorAll('${rowSel}').length>=15`, 60)
}
const register = async () => {
  await ev(
    `[...document.querySelectorAll('main button')].find(b=>/개 운동 등록/.test(b.innerText)).click()`,
  )
  await sleep(500)
}
const draftNames = () =>
  ev(
    `(()=>{const r=sessionStorage.getItem(${q(KEY)});return r?JSON.parse(r).draft.items.map(i=>i.name):[]})()`,
  )
const draftItems = () =>
  ev(
    `(()=>{const r=sessionStorage.getItem(${q(KEY)});return r?JSON.parse(r).draft.items:[]})()`,
  )
const state = () =>
  ev(
    `({path:location.pathname,hs:history.state?.usr??null,status:document.querySelector('main p[role=status]')?.textContent.replace(/\\s+/g,' ').trim()??null,notice:(()=>{const n=[...document.querySelectorAll('main [aria-live=polite]')].map(e=>e.innerText.trim()).filter(Boolean);return n})()})`,
  )

await h.login('member.free@example.com', 'Mr-Dev-Free-2026')

console.log('\n===== A. 정상 등록 =====')
await h.open('', '/records/exercise/compose')
await ev(`sessionStorage.removeItem(${q(KEY)})`)
await h.open('', '/records/exercise/compose')
await ev(`document.getElementById('compose-add-link').click()`)
await until(`location.pathname==='/records/exercise/select'`, 30)
await tab('직접 검색')
await sleep(150)
await ev(`document.querySelector('form[role=search]').requestSubmit()`)
await until(`document.querySelectorAll('${rowSel}').length>=15`, 60)
await clickRow('플랭크')
await clickRow('푸시업')
await register()
let s = await state()
check(
  'A1 W02에서 W13 진입 → 플랭크·푸시업 선택 → 등록: W02로 돌아옴',
  s.path === '/records/exercise/compose',
  s,
)
check(
  'A2 초안에 선택한 순서대로 추가(플랭크, 푸시업), 운동 객체의 id·이름이 정확히 연결',
  same(await draftNames(), ['플랭크', '푸시업']) &&
    same(
      (await draftItems()).map((i) => i.exerciseId),
      ['22', '5'],
    ),
  await draftItems(),
)
check(
  'A3 W02에 "운동 2개를 추가했어요." 안내(role=status, aria-live 영역), 구 "준비 중" 문구 없음',
  s.status === '운동 2개를 추가했어요.' &&
    !(await ev(
      `document.querySelector('main').innerText.includes('운동 선택 결과 연결은 준비 중')`,
    )) &&
    (await ev(
      `!!document.querySelector('main [aria-live=polite] p[role=status]')`,
    )),
  s,
)
check(
  'A4 W02 카드에 두 운동 표시(빈 안내 사라짐)',
  same(
    await ev(
      `[...document.querySelectorAll('main ol > li')].map(l=>l.innerText.split('\\n').find(t=>t.includes('플랭크')||t.includes('푸시업'))?.trim()).filter(Boolean).length`,
    ),
    2,
  ) &&
    !(await ev(
      `document.querySelector('main').innerText.includes('아직 등록한 운동이 없어요')`,
    )),
)
check(
  'A5 안내를 읽은 뒤 history state를 비움(뒤로가기·새로고침에서 재출현 방지)',
  (await state()).hs === null,
)
const before = await draftItems()
await ev(`location.reload()`)
await sleep(1200)
await until(`!!document.querySelector('main h1')`, 40)
s = await state()
check(
  'A6 새로고침 후 초안 복구(2개), 등록 안내는 다시 나타나지 않음',
  same(await draftNames(), ['플랭크', '푸시업']) && s.status === null,
  s,
)

console.log('\n===== B. 중복·일부 건너뜀 =====')
await ev(`document.getElementById('compose-add-link').click()`)
await until(`location.pathname==='/records/exercise/select'`, 30)
await tab('직접 검색')
await sleep(150)
await ev(`document.querySelector('form[role=search]').requestSubmit()`)
await until(`document.querySelectorAll('${rowSel}').length>=15`, 60)
await clickRow('푸시업')
await clickRow('맨몸 스쿼트')
await register()
s = await state()
const after = await draftItems()
check(
  'B1 일부 중복: 스쿼트만 추가, W02에서 "운동 1개를 추가했어요. 이미 있는 운동 1개는 건너뛰었어요."',
  same(await draftNames(), ['플랭크', '푸시업', '맨몸 스쿼트']) &&
    s.status === '운동 1개를 추가했어요. 이미 있는 운동 1개는 건너뛰었어요.',
  s,
)
check(
  'B2 기존 초안 항목(운동 id·항목 id·기록 방식·세트)은 그대로 보존',
  same(after.slice(0, 2), before),
)
await openPicker()
await clickRow('푸시업')
await register()
s = await state()
const stay = await ev(
  `({picker:!!document.querySelector('main form[role=search]'),selected:[...document.querySelectorAll('main [aria-label="선택한 운동 목록, 선택한 순서"] li')].length,note:document.querySelector('main [aria-live=polite]')?.innerText??'',foot:[...document.querySelectorAll('main [aria-live=polite]')].map(e=>e.innerText).join('|')})`,
)
check(
  'B3 선택한 운동이 모두 이미 있음 → 이동하지 않고 W13에 머무름, "모두 이미 목록에 있어요" 안내, 선택 유지, 초안 변화 없음',
  s.path === '/records/exercise/select' &&
    stay.picker &&
    stay.foot.includes('선택한 운동이 모두 이미 목록에 있어요.') &&
    same(await draftNames(), ['플랭크', '푸시업', '맨몸 스쿼트']),
  { s, stay },
)

console.log('\n===== C. 500개 상한 =====')
const seed = (n) =>
  ev(
    `(async()=>{const S=await import('/src/exercise/workoutDraftStorage.ts');const items=Array.from({length:${n}},(_,i)=>({itemId:'seed'+i,exerciseId:'seed-ex-'+i,name:'기존 '+i,recordType:'reps',sets:[{reps:i===0?33:10}]}));const d={v:1,day:'today',items,updatedAt:new Date().toISOString()};return S.saveWorkoutDraft('free',d)})()`,
  )
await h.open('', '/records/exercise/compose')
check('C0 테스트용 초안 499개 저장', (await seed(499)) === true)
await openPicker()
await clickRow('푸시업')
await clickRow('맨몸 스쿼트')
await register()
// 500개 카드를 그리는 W02가 안내를 그릴 때까지 기다린다(고정 대기만 쓰면 렌더 전에 읽는다).
await until(
  `/추가했어요/.test(document.querySelector('main p[role=status]')?.textContent??'')`,
  100,
)
s = await state()
const names499 = await draftNames()
const items500 = await draftItems()
check(
  'C1 499개 + 2개 선택 → 1개만 추가(500개), "운동 1개를 추가했어요. 이미 있는 운동 1개는 건너뛰었어요."(상한 초과분 안내), 첫 운동 세트값(33) 보존',
  names499.length === 500 &&
    names499[499] === '푸시업' &&
    s.status === '운동 1개를 추가했어요. 이미 있는 운동 1개는 건너뛰었어요.' &&
    items500[0].sets[0].reps === 33,
  JSON.stringify({ n: names499.length, s }),
)
await openPicker()
await clickRow('플랭크')
await register()
s = await state()
const foot = await ev(
  `[...document.querySelectorAll('main [aria-live=polite]')].map(e=>e.innerText).join('|')`,
)
check(
  'C2 이미 500개 → 이동하지 않고 W13에서 "운동은 최대 500개까지 담을 수 있어요." 안내, 초안 500개 유지',
  s.path === '/records/exercise/select' &&
    foot.includes('운동은 최대 500개까지 담을 수 있어요.') &&
    (await draftNames()).length === 500,
  { s, foot },
)

console.log('\n===== D. 카탈로그 미준비 · 회귀 보조 =====')
await ev(`sessionStorage.removeItem(${q(KEY)})`)
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exercise')`,
)
await h.open('', '/records/exercise/select')
await sleep(800)
const un = await ev(
  `({picker:!!document.querySelector('main form[role=search]'),text:document.querySelector('main').innerText.replace(/\\s+/g,' ').slice(0,160),regDisabled:[...document.querySelectorAll('main button')].find(b=>/개 운동 등록/.test(b.innerText))?.getAttribute('aria-disabled')??[...document.querySelectorAll('main button')].find(b=>/개 운동 등록/.test(b.innerText))?.disabled})`,
)
check(
  'D1 운동 데이터 연결 전(unavailable): 선택할 운동이 없고 등록 버튼 비활성 — 등록 경로로 초안이 바뀌지 않음',
  (await draftNames()).length === 0 &&
    (un.regDisabled === true || un.regDisabled === 'true'),
  un,
)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`)

console.log('\n===== E. 취소·뒤로가기 =====')
await h.open('', '/records/exercise/compose')
await ev(`document.getElementById('compose-add-link').click()`)
await until(`location.pathname==='/records/exercise/select'`, 30)
const cancel = await ev(
  `!![...document.querySelectorAll('main a')].find(a=>/취소|이전/.test(a.innerText))`,
)
check('E1 W13의 취소·이전 링크 유지', cancel)

const bad = h.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
const fails = h.res.filter((x) => !x.ok)
console.log(`\n결과: ${h.res.length - fails.length}/${h.res.length} 통과`)
for (const f of fails) console.log('  실패:', f.n)
await ev(`sessionStorage.removeItem(${q(KEY)})`)
h.close()
process.exit(fails.length ? 1 : 0)
