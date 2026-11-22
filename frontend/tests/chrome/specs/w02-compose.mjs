// [chrome 회귀] W02 직접 운동 목록 구성
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// W02-B 통합 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-w02-' + Date.now()
const t = await launch(OUT, 9881, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const KEY = 'mealthroutine.account.workout-draft'
const NEW = '/records/exercise/new'
const COMPOSE = '/records/exercise/compose'
const SELECT = '/records/exercise/select'
const q = (s) => JSON.stringify(s)
await vp(390, 844)
// 저장소 호출 기록 + (플래그가 켜진 때만) 초안 키 접근 실패 재현
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{const log=[];window.__stor=log;const failKey=(k)=>String(k).includes('workout-draft');const rawGet=Storage.prototype.getItem;for(const m of ['getItem','setItem','removeItem']){const o=Storage.prototype[m];Storage.prototype[m]=function(k,...r){log.push(m+':'+k);const f=rawGet.call(window.localStorage,'__w02fail');if(this===window.sessionStorage&&failKey(k)&&(f==='all'||(f==='set'&&m==='setItem')))throw new DOMException('blocked','SecurityError');return o.call(this,k,...r)}}})()`,
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
const setById = (id, v) =>
  ev(
    `(()=>{const i=document.getElementById(${q(id)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${q(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
const spa = async (path, state) => {
  await ev(
    `(()=>{history.pushState({usr:${JSON.stringify(state ?? null)},key:'k'+Date.now(),idx:(history.state?.idx??0)+1},'',${q(path)});dispatchEvent(new PopStateEvent('popstate',{state:{}}))})()`,
  )
  await until(`location.pathname===${q(path.split('?')[0])}`, 20)
  await sleep(250)
}
const login = async (email, pw) => {
  await go('/login', 900)
  await setVal('input[type=email]', email)
  await setVal('input[type=password]', pw)
  await ev(`document.querySelector('form').requestSubmit()`)
  await sleep(1400)
}
const loginFree = () => login('member.free@example.com', 'Mr-Dev-Free-2026')
const loginFull = () => login('member.full@example.com', 'Mr-Dev-Full-2026')
const open = async (p = COMPOSE) => {
  await go(p, 500)
  await until(`!!document.querySelector('main h1')`, 50)
  await sleep(300)
}
const logout = async () => {
  await spa('/settings')
  await sleep(400)
  for (
    let i = 0;
    i < 80 &&
    !(await ev(
      `!![...document.querySelectorAll('main button')].find(x=>/로그아웃/.test(x.innerText))`,
    ));
    i++
  )
    await sleep(100)
  await ev(
    `[...document.querySelectorAll('main button')].find(x=>/로그아웃/.test(x.innerText))?.click()`,
  )
  await sleep(900)
}
const stored = () => ev(`sessionStorage.getItem(${q(KEY)})`)
const storedDraft = async () => {
  const r = await stored()
  return r ? JSON.parse(r).draft : null
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// 모듈로 초안을 만들어 저장한다(저장 형식 자체는 단위 검증이 따로 본다). specs: [[exerciseId, 수정], ...]
const seed = (userId, ids = ['16', '2', '32'], extra = '') =>
  ev(
    `(async()=>{const m=await import('/src/exercise/workoutDraftStorage.ts');const e=await import('/src/exercise/workoutDraftModel.ts');const ex=(await import('/src/exercise/seed/seedData.ts')).getSeedCatalog().getAllExercises();let d=e.addExercisesToDraft(e.createEmptyDraft(),${q(ids)}.map(id=>ex.find(x=>x.id===id)));${extra};return m.saveWorkoutDraft(${q(userId)},d)})()`,
  )

const snap = () =>
  ev(`(()=>{
  const m=document.querySelector('main');
  const cards=[...m.querySelectorAll('li[id^="compose-item-"]')].map(li=>({
    id:li.id.replace('compose-item-',''),
    name:li.querySelector('h3').textContent.replace(/\\s+/g,' ').trim(),
    type:li.querySelector('select')?.value??({'시간형':'time','횟수형':'reps','중량+횟수형':'weight'}[li.querySelector('[data-record-type-fixed]')?.textContent.replace(/.*기록 방식:\s*/,'').replace(/\s*이 운동은.*/,'').trim()]??null),
    up:li.querySelector('button[aria-label$="순서 위로 이동"]').disabled,
    down:li.querySelector('button[aria-label$="순서 아래로 이동"]').disabled,
    sets:[...li.querySelectorAll('ol > li')].map(s=>({reps:s.querySelector('input[id$="-reps"]')?.value??null,kg:s.querySelector('input[id$="-weightKg"]')?.value??null,sec:s.querySelector('input[id$="-targetSeconds"]')?.value??null,del:[...s.querySelectorAll('button')].find(b=>/세트 삭제/.test(b.getAttribute('aria-label')||'')).disabled})),
    errs:[...li.querySelectorAll('p.text-danger')].map(p=>p.textContent)}))
  return{path:location.pathname+location.search,h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),
    nav:document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"]').length,
    text:m.innerText.replace(/\\s+/g,' ').trim(),cards,
    alert:m.querySelector('[role=alert]')?.innerText.replace(/\\s+/g,' ')??null,
    live:document.getElementById('compose-review-live')?.innerText.replace(/\\s+/g,' ').trim()??'',
    notes:[...(document.getElementById('compose-notices')?.children??[])].map(e=>e.innerText.replace(/\\s+/g,' ').trim())}})()`)
const clickBtn = (label) =>
  ev(
    `(()=>{const norm=(x)=>(x.getAttribute('aria-label')||x.innerText).replace(/\\s+/g,' ').trim();const b=[...document.querySelectorAll('main button,main a')].find(x=>norm(x)===${q(label)}||norm(x).startsWith(${q(label)}+' '));if(!b)throw new Error('없음: '+${q(label)});b.click()})()`,
  )

await go('/login', 800)
await ev(`localStorage.clear();sessionStorage.clear()`)

console.log('\n===== A. 비회원 접근 =====')
await ev(`window.__stor.length=0`)
for (const [path, navCount, title] of [
  [NEW, 1, '운동 목록 구성 방법 선택'],
  [COMPOSE, 0, '직접 운동 목록 구성'],
]) {
  await go(path, 900)
  await sleep(500)
  const g = await ev(
    `({text:document.querySelector('main').innerText.replace(/\\s+/g,' '),h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),nav:document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"]').length,ui:!!document.querySelector('li[id^=compose-item-],[aria-label="운동 목록 구성 방법"]'),path:location.pathname})`,
  )
  check(
    `비회원 ${path}: 기존 승인 로그인 안내만 표시(운동 편집·선택 UI 없음), 주소 유지, h1은 보조기기용 화면 제목 "${title}"`,
    g.text.includes('로그인 후 이용할 수 있어요') &&
      !g.ui &&
      g.path === path &&
      same(g.h1, [title]),
    g.text.slice(0, 70),
  )
  check(
    `비회원 ${path}: 하단 탭 ${navCount ? '표시' : '숨김'}(W12 표시 / W02 숨김)`,
    g.nav === navCount,
    String(g.nav),
  )
}
const guestLog = await ev(`window.__stor.slice()`)
check(
  '비회원: 운동 초안 저장 키를 읽지도 쓰지도 않음',
  !guestLog.some((x) => x.includes('workout-draft')),
  JSON.stringify(guestLog.filter((x) => x.includes('workout'))),
)

console.log('\n===== B. 회원: W12 =====')
await loginFree()
await open(NEW)
let s = await snap()
check(
  'W12: h1 "어떻게 구성할까요?" 1개, 하단 탭 표시, 상위 "이전" 링크 + 하단 "운동 목록으로 돌아가기"',
  same(s.h1, ['어떻게 구성할까요?']) &&
    s.nav === 1 &&
    s.text.includes('운동 목록으로 돌아가기'),
  JSON.stringify([s.h1, s.nav]),
)
check(
  'W12: AI 추천 카드는 "준비 중"이며 누를 수 있는 요소(버튼·링크)가 없음',
  await ev(
    `(()=>{const g=document.querySelector('[aria-label="AI 추천으로 시작하기, 준비 중"]');return !!g&&g.innerText.includes('준비 중')&&g.querySelectorAll('button,a,[tabindex]').length===0})()`,
  ),
)
check(
  'W12: AI 호출·멤버십·체험 횟수 문구가 없음',
  !/무료 체험|멤버십|잔여 횟수/.test(s.text),
  s.text.slice(0, 120),
)
check(
  'W12: 직접 구성 카드(설명·"무료로 이용")',
  s.text.includes('직접 운동 목록 구성하기') &&
    s.text.includes(
      '원하는 운동을 고르고 순서·세트·횟수와 세트별 목표 시간을 직접 정해요.',
    ) &&
    s.text.includes('무료로 이용'),
)
check(
  'W12: 이전·"운동 목록으로 돌아가기"는 임시 상위 화면 W01(/records/exercise)로',
  await ev(
    `[...document.querySelectorAll('main a')].filter(a=>/이전|운동 목록으로 돌아가기/.test(a.getAttribute('aria-label')||a.innerText)).every(a=>a.getAttribute('href')==='/records/exercise')`,
  ),
)
await clickBtn('직접 운동 목록 구성하기')
await sleep(400)
s = await snap()
check(
  '초안이 없으면 안내 없이 바로 W02(/records/exercise/compose)로 이동',
  s.path === COMPOSE && s.h1[0] === '직접 운동 목록 구성',
)

console.log('\n===== C. W02 빈 상태 =====')
check(
  'W02: 하단 탭 숨김, h1·부제, 비어 있는 안내, 편집 카드 없음',
  s.nav === 0 &&
    s.text.includes('아직 등록한 운동이 없어요.') &&
    s.cards.length === 0,
)
check(
  'W02: 오늘 날짜(YYYY-MM-DD)·"오늘 운동 목록" 선택됨(aria-pressed), "내일 운동 목록"은 내일 날짜를 보이는 선택 가능한 버튼(FAST-04C)',
  await ev(
    `(()=>{const t=[...document.querySelectorAll('[aria-label="운동 날짜"] button')];const d=new Date();const ymd=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return t[0].getAttribute('aria-pressed')==='true'&&t[0].innerText.includes(ymd)&&(()=>{const n=new Date();n.setDate(n.getDate()+1);const tmr=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');return t[1].getAttribute('aria-pressed')==='false'&&t[1].getAttribute('aria-disabled')!=='true'&&t[1].innerText.includes('내일 운동 목록')&&t[1].innerText.includes(tmr)})()})()`,
  ),
)
check(
  'W02: 단계 제목 "1 언제 운동할까요?"·"2 운동 목록 구성"',
  s.text.includes('언제 운동할까요?') && s.text.includes('운동 목록 구성'),
)
check(
  '(W13-C 이후) W02: 구 "운동 선택 결과 연결은 준비 중이에요." 안내가 없다',
  !s.text.includes('운동 선택 결과 연결은 준비 중이에요.'),
)
check(
  'W02: 빈 상태에서 저장소에 초안 키가 없음(빈 초안은 저장하지 않음)',
  (await stored()) === null,
)
await clickBtn('운동 목록 등록 · 최종 검토')
await sleep(200)
s = await snap()
check(
  '빈 초안으로 최종 검토: 오류(운동 하나 이상)를 알리고 이동·저장 없음',
  s.alert?.includes('운동을 하나 이상 등록해 주세요.') &&
    s.path === COMPOSE &&
    (await stored()) === null,
  String(s.alert),
)
check(
  '  오류 시 포커스가 "운동 등록하기"로 이동',
  await ev(`document.activeElement?.id==='compose-add-link'`),
)

console.log('\n===== D. W13 왕복(W13-C 연결 전) =====')
await seed('free')
await open()
await sleep(300)
const draftBefore = await stored()
check(
  'W02 → "운동 등록하기" → W13(/records/exercise/select), W13의 이전·취소 링크가 W02를 가리킴(state.from)',
  await (async () => {
    await clickBtn('＋ 운동 등록하기')
    await until(`location.pathname===${q(SELECT)}`, 30)
    await sleep(500)
    return (
      (await ev(`location.pathname`)) === SELECT &&
      (await ev(
        `[...document.querySelectorAll('main a')].filter(a=>/이전|선택 취소/.test(a.getAttribute('aria-label')||a.innerText)).map(a=>a.getAttribute('href')).join()`,
      )) === `${COMPOSE},${COMPOSE}`
    )
  })(),
)
check(
  'W13 취소 → W02 복귀, 초안(화면·저장값) 불변',
  await (async () => {
    await ev(
      `[...document.querySelectorAll('main a')].find(a=>/선택 취소/.test(a.innerText)).click()`,
    )
    await until(`location.pathname===${q(COMPOSE)}`, 30)
    await sleep(500)
    const sn = await snap()
    return (
      sn.path === COMPOSE &&
      sn.cards.length === 3 &&
      (await stored()) === draftBefore
    )
  })(),
)
await spa(SELECT, { from: COMPOSE })
await sleep(600)
check(
  '(W13-C 이후) W13에서 운동을 선택만 하고 등록하지 않으면 초안은 불변',
  await (async () => {
    await ev(
      `[...document.querySelectorAll('[role=group][aria-label="운동 찾는 방법"] button')][1].click()`,
    )
    await sleep(150)
    await ev(`document.querySelector('form[role=search]').requestSubmit()`)
    await sleep(300)
    await ev(
      `(()=>{const b=document.querySelector('main section[aria-label="운동 목록"] ul > li button[aria-pressed]');b?.click()})()`,
    )
    await sleep(200)
    const had = await ev(
      `!!document.querySelector('section[aria-label="선택한 운동"]')`,
    )
    await ev(
      `[...document.querySelectorAll('main section[aria-label="선택한 운동"] button')].find(b=>/개 운동 등록/.test(b.innerText))?.title`,
    )
    await sleep(200)
    return had && (await stored()) === draftBefore
  })(),
)
await spa(COMPOSE)
await until(`!!document.querySelector('li[id^=compose-item-]')`, 30)
s = await snap()
check(
  'W13 왕복 뒤에도 W02 초안 3개 운동이 그대로 보임(Context 유지)',
  s.cards.length === 3 &&
    same(
      s.cards.map((c) => c.name),
      ['1. 맨몸 스쿼트', '2. 원암 덤벨 로우', '3. 폼롤러 등 상부 이완'],
    ),
  JSON.stringify(s.cards.map((c) => c.name)),
)

console.log('\n===== E. W02 편집: 초안 3개(횟수·중량·시간) =====')
await seed('free')
await open()
s = await snap()
check(
  '초안 복구: 기록 방식 횟수·중량·시간, 입력창은 기록 방식에 맞게(횟수형 횟수만 / 중량형 횟수+중량 / 시간형 목표 시간만)',
  same(
    s.cards.map((c) => c.type),
    ['reps', 'weight', 'time'],
  ) &&
    s.cards[0].sets[0].reps === '10' &&
    s.cards[0].sets[0].kg === null &&
    s.cards[1].sets[0].kg === '' &&
    s.cards[2].sets[0].sec === '60' &&
    s.cards[2].sets[0].reps === null,
  JSON.stringify(s.cards),
)
check(
  '순서 이동 버튼: 첫 운동은 위로, 마지막 운동은 아래로 비활성',
  s.cards[0].up &&
    !s.cards[0].down &&
    !s.cards[2].up &&
    s.cards[2].down &&
    !s.cards[1].up &&
    !s.cards[1].down,
)
check(
  '세트가 하나뿐이면 세트 삭제 비활성',
  s.cards.every((c) => c.sets.length === 1 && c.sets[0].del),
)
const id0 = s.cards[0].id,
  id1 = s.cards[1].id,
  id2 = s.cards[2].id
await clickBtn('맨몸 스쿼트 순서 아래로 이동')
await sleep(250)
s = await snap()
check(
  '맨몸 스쿼트를 아래로 이동: 순서 변경, 다른 운동 값 유지, 저장값에도 반영',
  same(
    s.cards.map((c) => c.id),
    [id1, id0, id2],
  ) &&
    same(
      (await storedDraft()).items.map((i) => i.itemId),
      [id1, id0, id2],
    ),
)
await clickBtn('원암 덤벨 로우 순서 아래로 이동')
await sleep(200)
await clickBtn('원암 덤벨 로우 세트 추가')
await sleep(200)
s = await snap()
const row = s.cards.find((c) => c.id === id1)
check(
  '세트 추가: 기본 10회·(중량 비어 있음), 이전 세트 값을 복사하지 않음',
  row.sets.length === 2 &&
    row.sets[1].reps === '10' &&
    row.sets[1].kg === '' &&
    row.sets.every((x) => !x.del),
  JSON.stringify(row.sets),
)
await setById(`compose-${id1}-0-weightKg`, '12.5')
await sleep(200)
await setById(`compose-${id1}-0-reps`, '8')
await sleep(200)
check(
  '값 입력: 횟수 8·중량 12.5가 화면과 저장값에 반영',
  (await snap()).cards.find((c) => c.id === id1).sets[0].kg === '12.5' &&
    (await storedDraft()).items.find((i) => i.itemId === id1).sets[0]
      .weightKg === 12.5,
)
check(
  '(S3 이후) 허용 방식이 하나뿐인 운동(원암 덤벨 로우)은 기록 방식 선택 컨트롤 없이 중량+횟수형으로 고정 표시되고, 입력값은 그대로',
  (await ev(
    `(()=>{const li=document.getElementById(${q(`compose-item-${id1}`)});return !li.querySelector('select')&&!!li.querySelector('[data-record-type-fixed]')})()`,
  )) &&
    (await storedDraft()).items.find((i) => i.itemId === id1).sets[0]
      .weightKg === 12.5,
)
await clickBtn('원암 덤벨 로우 2세트 삭제')
await sleep(200)
check(
  '세트 삭제 후 1세트면 다시 삭제 비활성',
  (await snap()).cards.find((c) => c.id === id1).sets.length === 1 &&
    (await snap()).cards.find((c) => c.id === id1).sets[0].del,
)
await clickBtn('폼롤러 등 상부 이완 삭제')
await sleep(200)
await clickBtn('원암 덤벨 로우 삭제')
await sleep(200)
await clickBtn('맨몸 스쿼트 삭제')
await sleep(250)
s = await snap()
check(
  '운동을 모두 삭제하면(마지막 운동도 삭제 가능) 빈 상태 안내, 저장값 삭제',
  s.cards.length === 0 &&
    s.text.includes('아직 등록한 운동이 없어요.') &&
    (await stored()) === null,
)

console.log('\n===== F. 입력 검증과 오류 안내 =====')
await seed('free', ['16', '2', '32'])
await open()
s = await snap()
const [c0, c1, c2] = s.cards.map((c) => c.id)
await setById(`compose-${c0}-0-reps`, '')
await sleep(250)
s = await snap()
check(
  '횟수를 비우면 해당 입력 아래에 오류가 보이고 aria-invalid·aria-describedby로 연결됨',
  s.cards[0].errs.length === 1 &&
    (await ev(
      `(()=>{const i=document.getElementById(${q(`compose-${c0}-0-reps`)});const e=document.getElementById(i.getAttribute('aria-describedby')||'-');return i.getAttribute('aria-invalid')==='true'&&!!e&&e.textContent.includes('1 이상의 정수')})()`,
    )),
  JSON.stringify(s.cards[0].errs),
)
await setById(`compose-${c0}-0-reps`, '2.5')
await sleep(200)
check('횟수 2.5(정수 아님)도 오류', (await snap()).cards[0].errs.length === 1)
await setById(`compose-${c0}-0-reps`, '0')
await sleep(200)
check('횟수 0도 오류', (await snap()).cards[0].errs.length === 1)
await setById(`compose-${c1}-0-weightKg`, '-3')
await sleep(200)
check(
  '중량 -1 이하는 오류, 비어 있는 중량은 오류 아님',
  (await snap()).cards[1].errs.length === 1 &&
    (await (async () => {
      await setById(`compose-${c1}-0-weightKg`, '')
      await sleep(150)
      return (await snap()).cards[1].errs.length === 0
    })()),
)
await setById(`compose-${c2}-0-targetSeconds`, '3601')
await sleep(200)
check(
  '목표 시간 3601초는 오류, 0·소수도 오류',
  (await snap()).cards[2].errs.length === 1 &&
    (await (async () => {
      await setById(`compose-${c2}-0-targetSeconds`, '0')
      await sleep(120)
      const a = (await snap()).cards[2].errs.length === 1
      await setById(`compose-${c2}-0-targetSeconds`, '30.5')
      await sleep(120)
      return a && (await snap()).cards[2].errs.length === 1
    })()),
)
await clickBtn('운동 목록 등록 · 최종 검토')
await sleep(250)
s = await snap()
check(
  '최종 검토: 오류 요약(role=alert)에 개수·운동 이름·세트·메시지, 이동·저장 정상(초안 유지)',
  s.alert?.includes('고칠 곳이 2개') &&
    s.alert.includes('맨몸 스쿼트') &&
    s.alert.includes('폼롤러 등 상부 이완') &&
    s.path === COMPOSE,
  String(s.alert),
)
check(
  '  첫 오류 입력(맨몸 스쿼트 1세트 횟수)으로 포커스 이동',
  await ev(`document.activeElement?.id===${q(`compose-${c0}-0-reps`)}`),
)
await setById(`compose-${c0}-0-reps`, '12')
await setById(`compose-${c2}-0-targetSeconds`, '45')
await sleep(250)
s = await snap()
check(
  '오류를 고치면 입력 오류가 사라지고 지난 오류 요약도 사라짐(초안이 바뀌었으므로)',
  s.cards.every((c) => c.errs.length === 0) && s.alert === null,
)
const before = await stored()
await clickBtn('운동 목록 등록 · 최종 검토')
await sleep(250)
s = await snap()
check(
  '(W11 연결 이후) 검증 통과: W11(/records/exercise/review)로 이동, 오류 없음',
  s.path === '/records/exercise/review' && s.alert === null,
  s.path,
)
await spa(COMPOSE)
await until(`!!document.querySelector('li[id^=compose-item-]')`, 30)
await sleep(300)
// mealthroutine.recordsTab: 하단 "기록" 탭이 마지막으로 본 기록 대시보드 종류('exercise'|'meal')만 기억하는 키다(목록·기록 데이터가 아니다).
check(
  '  초안 삭제·목록 저장·기록 생성 없음: 저장값 불변, 목록·기록 키 없음',
  (await stored()) === before &&
    (await ev(
      `(()=>{const ok=new Set(['mealthroutine.account.workout-draft','mealthroutine.dev.session','mealthroutine.recordsTab','react-router-scroll-positions','remix-router-transitions']);const ss=Object.keys(sessionStorage).every(k=>ok.has(k));const ls=Object.keys(localStorage).every(k=>k.startsWith('mealthroutine.dev.mock.')||k==='__w02fail');return ss&&ls})()`,
    )),
)
await setById(`compose-${c0}-0-reps`, '13')
await sleep(250)
check('편집하면 지난 "준비 중" 안내는 사라짐', (await snap()).live === '')

console.log('\n===== G. 새로고침 · 로그아웃 · 계정 격리 =====')
await seed('free', ['16', '2'])
await open()
await clickBtn('맨몸 스쿼트 세트 추가')
await sleep(250)
const editedNames = (await snap()).cards.map((c) => c.name)
await ev(`location.reload()`)
await sleep(1300)
await until(`!!document.querySelector('main h1')`, 40)
await sleep(300)
s = await snap()
check(
  '같은 회원 새로고침: 편집 중이던 초안(운동 2개·맨몸 스쿼트 2세트)이 복구됨',
  same(
    s.cards.map((c) => c.name),
    editedNames,
  ) && s.cards[0].sets.length === 2,
  JSON.stringify(s.cards.map((c) => c.name)),
)
await logout()
check(
  '로그아웃: 저장된 초안이 제거됨(계정 정리 규약이 고정 키를 지움)',
  (await stored()) === null,
)
await spa(COMPOSE)
await sleep(300)
check(
  '로그아웃 뒤 W02 접근: 로그인 안내만, 이전 회원의 운동 이름이 보이지 않음',
  await ev(
    `(()=>{const t=document.querySelector('main').innerText;return t.includes('로그인 후 이용할 수 있어요')&&!t.includes('맨몸 스쿼트')})()`,
  ),
)
await loginFull()
await open()
s = await snap()
check(
  '다른 회원(full) 로그인: 이전 회원(free)의 초안이 노출되지 않음(빈 초안)',
  s.cards.length === 0 &&
    !s.text.includes('맨몸 스쿼트') &&
    (await stored()) === null,
)
await seed('full', ['22', '29'])
await open()
s = await snap()
check(
  '회원 B(full)의 초안 작성 후 새로고침: B의 초안만 복구',
  same(
    s.cards.map((c) => c.name),
    ['1. 플랭크', '2. 점핑 잭'],
  ),
)
await logout()
await loginFree()
await open()
s = await snap()
check(
  'B 로그아웃 → A(free) 재로그인: B의 초안이 보이지 않고 A의 지난 초안도 복구되지 않음(로그아웃에서 정리됨)',
  s.cards.length === 0 && !s.text.includes('플랭크'),
)
await logout()
await loginFull()
await seed('free', ['16'])
await open()
s = await snap()
check(
  '방어: 로그아웃이 정리하지 못한 다른 소유자(free)의 초안이 저장소에 남아 있어도 full에게 쓰이지 않음(조용히 폐기·알림 없음)',
  s.cards.length === 0 &&
    !s.text.includes('올바르지 않아') &&
    (await stored()) === null,
)

console.log('\n===== H. 손상·다른 버전 · 저장 실패 =====')
await logout()
await loginFree()
for (const [label, raw] of [
  ['손상된 JSON', '{bad json'],
  ['다른 스키마 버전', JSON.stringify({ wv: 9, owner: 'x', draft: {} })],
  ['잘못된 숫자(문자열 횟수)', '__NUM__'],
  ['잘못된 recordType', '__RT__'],
  ['세트 배열 손상', '__SETS__'],
  ['중복 exerciseId', '__DUP__'],
]) {
  await open()
  await seed('free', ['16', '2'])
  const wrap = await stored()
  const mut = {
    __NUM__: (w) => {
      w.draft.items[0].sets[0].reps = '10'
    },
    __RT__: (w) => {
      w.draft.items[0].recordType = 'zzz'
    },
    __SETS__: (w) => {
      w.draft.items[0].sets = 'x'
    },
    __DUP__: (w) => {
      w.draft.items[1].exerciseId = w.draft.items[0].exerciseId
    },
  }[raw]
  let value = raw
  if (mut) {
    const w = JSON.parse(wrap)
    mut(w)
    value = JSON.stringify(w)
  }
  await ev(`sessionStorage.setItem(${q(KEY)},${q(value)})`)
  await open()
  s = await snap()
  check(
    `${label}: 안전하게 폐기하고 빈 초안으로 시작, 사용자에게 알림, 저장값 제거`,
    s.cards.length === 0 &&
      s.text.includes('저장돼 있던 구성이 올바르지 않아 새로 시작했어요.') &&
      (await stored()) === null,
    s.text.slice(0, 90),
  )
}
await seed('free')
await open()
await ev(`localStorage.setItem('__w02fail','set')`)
await clickBtn('맨몸 스쿼트 세트 추가')
await sleep(400)
s = await snap()
check(
  '저장 실패(쓰기 예외): 편집은 화면에서 계속되고(세트 2개) 승인된 안내 "이 탭에서만 편집을 이어갈 수 있어요…" 표시',
  s.cards[0].sets.length === 2 &&
    s.notes.some((n) => n.includes('이 탭에서만 편집을 이어갈 수 있어요')),
  JSON.stringify(s.notes),
)
await clickBtn('맨몸 스쿼트 2세트 삭제')
await sleep(300)
check(
  '  실패 중에도 이어서 편집 가능(세트 삭제 반영), 입력한 정상 메모리 상태는 삭제되지 않음',
  (await snap()).cards[0].sets.length === 1 &&
    (await snap()).cards.length === 3,
)
await ev(`localStorage.removeItem('__w02fail')`)
await clickBtn('맨몸 스쿼트 세트 추가')
await sleep(400)
s = await snap()
check(
  '  저장소가 다시 쓰이면 안내가 사라지고 최신 상태가 저장됨',
  !s.notes.some((n) => n.includes('이 탭에서만')) &&
    (await storedDraft()).items[0].sets.length === 2,
)
await ev(`localStorage.setItem('__w02fail','all')`)
await open()
s = await snap()
check(
  '저장소 접근 불가(읽기·쓰기 예외): 빈 초안으로 시작하고 화면은 정상, 이 탭에서만 유지된다는 안내',
  s.path === COMPOSE &&
    s.cards.length === 0 &&
    s.notes.some((n) => n.includes('이 탭에서만 편집을 이어갈 수 있어요')),
  JSON.stringify(s.notes),
)
await ev(`localStorage.removeItem('__w02fail')`)

console.log('\n===== I. W12: 기존 초안이 있을 때 =====')
await seed('free', ['16', '2', '22'])
await open(NEW)
const kept = await stored()
await clickBtn('직접 운동 목록 구성하기')
await sleep(300)
s = await snap()
check(
  '기존 초안(3개 운동)이 있으면 바로 이동하지 않고 "이전에 구성하던 운동 목록이 있어요" 안내(3개 운동)와 선택지 표시',
  s.path === NEW &&
    s.text.includes('이전에 구성하던 운동 목록이 있어요') &&
    s.text.includes('3개 운동이 담겨 있어요') &&
    ['기존 구성 이어서 하기', '새로 구성하기', '취소'].every((b) =>
      s.text.includes(b),
    ),
  s.text.slice(0, 160),
)
check(
  '  안내가 열리면 포커스가 안내 상자로 이동(보조기기가 읽음)',
  await ev(
    `document.activeElement?.getAttribute('aria-labelledby')==='method-panel-title'`,
  ),
)
await clickBtn('취소')
await sleep(400)
check(
  '  취소: 안내 닫힘, 포커스가 직접 구성 카드로 복귀, 초안 불변',
  (await ev(
    `!document.querySelector('[aria-labelledby=method-panel-title]')`,
  )) &&
    (await ev(
      `document.activeElement?.innerText?.includes('직접 운동 목록 구성하기')`,
    )) &&
    (await stored()) === kept,
)
await clickBtn('직접 운동 목록 구성하기')
await sleep(200)
await clickBtn('새로 구성하기')
await sleep(250)
s = await snap()
check(
  '"새로 구성하기": 바로 지우지 않고 한 번 더 확인("지워져요")',
  s.text.includes('새로 구성하면 이전에 구성하던 운동 목록이 지워져요') &&
    (await stored()) === kept &&
    s.path === NEW,
)
await clickBtn('취소')
await sleep(250)
check(
  '  확인 단계 취소: 이전 안내로 돌아가고 초안 불변',
  (await snap()).text.includes('이전에 구성하던 운동 목록이 있어요') &&
    (await stored()) === kept,
)
await clickBtn('기존 구성 이어서 하기')
await sleep(500)
s = await snap()
check(
  '"기존 구성 이어서 하기": W02로 이동하고 초안 3개 운동 보존',
  s.path === COMPOSE && s.cards.length === 3 && (await stored()) === kept,
)
await spa(NEW)
await sleep(300)
await clickBtn('직접 운동 목록 구성하기')
await sleep(200)
await clickBtn('새로 구성하기')
await sleep(200)
await clickBtn('지우고 새로 구성하기')
await sleep(500)
s = await snap()
check(
  '"지우고 새로 구성하기"(확인 후): 빈 새 초안으로 W02 이동, 이전 저장값 제거',
  s.path === COMPOSE && s.cards.length === 0 && (await stored()) === null,
)

console.log('\n===== J. 키보드 · 접근성 =====')
await seed('free', ['16', '2'])
await open()
await ev(
  `document.activeElement&&document.activeElement.blur();window.scrollTo(0,0)`,
)
const stops = []
for (let i = 0; i < 12; i++) {
  await press('Tab', 'Tab', 9)
  stops.push(
    await ev(
      `(()=>{const e=document.activeElement;return (e.getAttribute('aria-label')||e.innerText||'').trim().replace(/\\s+/g,' ').slice(0,28)})()`,
    ),
  )
}
console.log('  Tab 순서:', JSON.stringify(stops))
check(
  'Tab 순서: 이전 → 오늘 → 내일(비활성 안내) → 운동 등록하기 → 맨몸 스쿼트(위 이동은 비활성이라 건너뜀): 아래 이동·삭제·횟수·세트 추가(S3: 기록 방식은 고정 표시라 정지점 없음, 세트 삭제는 비활성이라 건너뜀)',
  stops[0] === '이전 화면으로 돌아가기' &&
    stops[1].startsWith('오늘 운동 목록') &&
    stops[2].startsWith('내일 운동 목록') &&
    stops[3].startsWith('＋ 운동 등록하기') &&
    stops[4] === '맨몸 스쿼트 순서 아래로 이동' &&
    stops[5] === '맨몸 스쿼트 삭제' &&
    stops[6].startsWith('맨몸 스쿼트 1세트 횟수') &&
    stops[7] === '맨몸 스쿼트 세트 추가',
  JSON.stringify(stops),
)
check(
  '키보드 포커스 표시(outline)가 보임',
  await ev(`getComputedStyle(document.activeElement).outlineStyle!=='none'`),
)
const a11y = await ev(
  `(()=>{const m=document.querySelector('main');const ctl=[...m.querySelectorAll('input,select,button,a')];const named=ctl.every(e=>(e.getAttribute('aria-label')||e.innerText||'').trim().length>0);const labels=[...m.querySelectorAll('input,select')].every(e=>!!e.getAttribute('aria-label')&&!!m.querySelector('label[for="'+e.id+'"]'));const names=[...m.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label'));const dup=names.length!==new Set(names).size;return{named,labels,dup,h1:document.querySelectorAll('h1').length,h2:[...m.querySelectorAll('h2,h3')].map(h=>h.tagName+':'+h.textContent.replace(/\\s+/g,' ').trim())}})()`,
)
check(
  '모든 조작 요소에 이름, 모든 입력·선택에 보이는 label과 aria-label, 같은 이름의 버튼 중복 없음, h1 1개',
  a11y.named && a11y.labels && !a11y.dup && a11y.h1 === 1,
  JSON.stringify(a11y),
)
check(
  '제목 구조 h1 → h2(단계 제목 2개) → h3(운동 카드 제목)',
  a11y.h2.length === 4 &&
    a11y.h2[0].startsWith('H2:') &&
    a11y.h2[1].startsWith('H2:') &&
    a11y.h2[2].startsWith('H3:1. 맨몸 스쿼트') &&
    a11y.h2[3].startsWith('H3:2. 원암 덤벨 로우'),
  JSON.stringify(a11y.h2),
)
check(
  '시간형·중량형 입력의 단위가 label에 글자로 있음(횟수 (회)·중량 (kg)·목표 시간 (초))',
  await ev(
    `(()=>{const t=document.querySelector('main').innerText;return t.includes('횟수 (회)')&&t.includes('중량 (kg)')})()`,
  ),
)

console.log(
  '\n===== J2. 코드 검토 반영: 포커스 이동 · 알림 영역 · 상한 · 스타일 · 안내 유지 =====',
)
await seed('free', ['16', '2', '32'], `d=e.addSetToItem(d,d.items[0].itemId)`)
await open()
s = await snap()
const [k0, k1, k2] = s.cards.map((c) => c.id)
await clickBtn('맨몸 스쿼트 순서 아래로 이동')
await sleep(300)
check(
  '운동을 아래로 이동한 뒤 포커스가 이동한 운동의 같은 방향 버튼에 남음(문서 처음으로 빠지지 않음)',
  await ev(`document.activeElement?.id===${q(`compose-move-${k0}-down`)}`),
  String(await ev(`document.activeElement?.id`)),
)
await clickBtn('맨몸 스쿼트 순서 아래로 이동')
await sleep(300)
check(
  '끝에 닿아 그 방향 버튼이 비활성이 되면 반대 방향 버튼으로 포커스 이동',
  await ev(`document.activeElement?.id===${q(`compose-move-${k0}-up`)}`),
  String(await ev(`document.activeElement?.id`)),
)
await clickBtn('폼롤러 등 상부 이완 삭제')
await sleep(300)
check(
  '운동 삭제 뒤 포커스가 이웃한 운동 카드로 이동',
  await ev(`document.activeElement?.id?.startsWith('compose-item-')`),
  String(await ev(`document.activeElement?.id`)),
)
await clickBtn('원암 덤벨 로우 삭제')
await sleep(250)
await clickBtn('맨몸 스쿼트 삭제')
await sleep(300)
check(
  '마지막 운동을 삭제하면 포커스가 "운동 등록하기"로 이동',
  await ev(`document.activeElement?.id==='compose-add-link'`),
  String(await ev(`document.activeElement?.id`)),
)
await seed('free', ['16'], `d=e.addSetToItem(d,d.items[0].itemId)`)
await open()
s = await snap()
await clickBtn('맨몸 스쿼트 1세트 삭제')
await sleep(300)
check(
  '세트 삭제 뒤 포커스가 남은 세트의 첫 입력(횟수)으로 이동',
  await ev(`document.activeElement?.id?.endsWith('-0-reps')`),
  String(await ev(`document.activeElement?.id`)),
)
await seed(
  'free',
  ['16'],
  `for(let i=0;i<199;i++)d=e.addSetToItem(d,d.items[0].itemId)`,
)
await open()
s = await snap()
check(
  '세트가 200개에 이르면 "세트 추가"가 비활성이고 이유가 글자로 안내됨',
  s.cards[0].sets.length === 200 &&
    (await ev(
      `document.querySelector('button[aria-label="맨몸 스쿼트 세트 추가"]').disabled`,
    )) &&
    s.text.includes('세트는 한 운동에 200개까지 추가할 수 있어요.'),
)
await seed('free', ['16'])
await open()
check(
  '저장 상태 알림 영역(aria-live=polite)이 항상 있고 비어 있으면 자리를 차지하지 않음',
  await ev(
    `(()=>{const n=document.getElementById('compose-notices');return n&&n.getAttribute('aria-live')==='polite'&&n.children.length===0&&getComputedStyle(n).display==='none'})()`,
  ),
)
await ev(`localStorage.setItem('__w02fail','set')`)
await clickBtn('맨몸 스쿼트 세트 추가')
await sleep(400)
check(
  '저장 실패 안내가 live 영역 안에 나타남(스크린리더가 읽음)',
  await ev(
    `(()=>{const n=document.getElementById('compose-notices');return getComputedStyle(n).display!=='none'&&n.innerText.includes('이 탭에서만 편집을 이어갈 수 있어요')})()`,
  ),
)
await logout()
await ev(`localStorage.removeItem('__w02fail')`)
await loginFull()
await open()
s = await snap()
check(
  '저장 실패 상태가 다른 회원(로그아웃 후 재로그인)에게 남지 않음',
  !s.notes.some((n) => n.includes('이 탭에서만')) && s.cards.length === 0,
)
await logout()
await loginFree()
await open()
await ev(`sessionStorage.setItem(${q(KEY)},'{bad')`)
await open(NEW)
await clickBtn('직접 운동 목록 구성하기')
await sleep(500)
s = await snap()
check(
  '손상된 저장값 → W12 → 직접 구성: 빈 W02에서도 "저장돼 있던 구성이 올바르지 않아 새로 시작했어요." 안내가 보임',
  s.path === COMPOSE &&
    s.notes.some((n) => n.includes('올바르지 않아 새로 시작했어요')) &&
    s.cards.length === 0,
  JSON.stringify(s.notes),
)
check(
  '  손상된 저장값은 지워져 있음(효과가 빈 초안을 저장하며 제거)',
  (await stored()) === null,
)
await seed('free', ['16', '22'])
await open(NEW)
const ai = await ev(
  `getComputedStyle(document.querySelector('[aria-label="AI 추천으로 시작하기, 준비 중"]')).backgroundColor`,
)
check(
  'W12 AI 카드 배경이 의도한 페이지 색(#f6f8fc)으로 적용됨(클래스 충돌 없음)',
  ai === 'rgb(246, 248, 252)',
  ai,
)
check(
  '  W12 직접 구성 카드는 aria-expanded=false이고 aria-controls가 없음',
  await ev(
    `(()=>{const b=[...document.querySelectorAll('main button')].find(x=>x.innerText.startsWith('직접 운동 목록 구성하기'));return b.getAttribute('aria-expanded')==='false'&&!b.hasAttribute('aria-controls')})()`,
  ),
)
await clickBtn('직접 운동 목록 구성하기')
await sleep(300)
check(
  '  안내 상자가 열리면 aria-expanded=true·aria-controls가 존재하는 안내 상자를 가리킴, 테두리가 강조색(#4f46e5)',
  await ev(
    `(()=>{const b=[...document.querySelectorAll('main button')].find(x=>x.innerText.startsWith('직접 운동 목록 구성하기'));const p=document.getElementById(b.getAttribute('aria-controls')||'-');return b.getAttribute('aria-expanded')==='true'&&!!p&&getComputedStyle(p).borderTopColor==='rgb(79, 70, 229)'})()`,
  ),
)

console.log('\n===== K. 반응형 =====')
await seed(
  'free',
  ['16', '2', '32'],
  `d=e.addSetToItem(d,d.items[1].itemId);d=e.updateSetInItem(d,d.items[1].itemId,0,{weightKg:12.5})`,
)
for (const [w, h] of [
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
]) {
  await vp(w, h)
  for (const path of [NEW, COMPOSE]) {
    await open(path)
    await sleep(200)
    const m = await ev(
      `(()=>{const d=document.documentElement;const mn=document.querySelector('main');const small=[...mn.querySelectorAll('a,button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(e=>(e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,16)+':'+Math.round(e.getBoundingClientRect().height));const narrow=[...mn.querySelectorAll('input')].filter(e=>e.getBoundingClientRect().width<54).length;window.scrollTo(0,d.scrollHeight);const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]');const last=[...mn.querySelectorAll('a,button')].at(-1).getBoundingClientRect();return{xo:d.scrollWidth-d.clientWidth,small,narrow,lastBottom:Math.round(last.bottom),navTop:nav?Math.round(nav.getBoundingClientRect().top):null,vh:innerHeight}})()`,
    )
    check(
      `${w}x${h} ${path}: 가로 넘침 없음, 조작 요소 높이 ≥44px, 입력 폭 ≥54px, 마지막 요소가 하단 탭에 가려지지 않음`,
      m.xo <= 0 &&
        m.small.length === 0 &&
        m.narrow === 0 &&
        (m.navTop === null || m.lastBottom <= m.navTop + 1),
      JSON.stringify(m),
    )
  }
}
await vp(390, 844)

console.log('\n===== L. 요청·부수효과 =====')
await open()
await sleep(400)
check(
  'W02는 운동 기록·목록·루틴 API 요청을 하지 않음(네트워크 요청 /api/ 없음)',
  await ev(
    `performance.getEntriesByType('resource').every(r=>!r.name.includes('/api/'))`,
  ),
)

const bad = t.problems.filter((p) => !/Download the React DevTools/.test(p))
check('콘솔 오류·경고 없음', bad.length === 0, JSON.stringify(bad.slice(0, 3)))
const fails = t.res.filter((x) => !x.ok)
console.log(`\n결과: ${t.res.length - fails.length}/${t.res.length} 통과`)
t.close()
process.exit(fails.length ? 1 : 0)
