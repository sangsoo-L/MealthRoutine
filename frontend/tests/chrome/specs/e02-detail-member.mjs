// [chrome 회귀] E02 운동 상세(회원)·즐겨찾기
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E02 리디자인 + 즐겨찾기 검증 (Chrome headless + CDP, 개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const OUT = 'out-e02v2-' + Date.now()
const t = await launch(OUT, 9461, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const q = encodeURIComponent
const FAV = (id) => `mealthroutine.dev.mock.exerciseFavorite.${id}`
const FLAG = (n) => `mealthroutine.dev.mock.flag.${n}`
await vp(390, 844)

const key = async (k, code, vk, mod = 0) => {
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
  await sleep(130)
}
const setVal = (sel, v) =>
  ev(
    `(()=>{const i=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${JSON.stringify(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
const login = async (email, pw) => {
  await go('/login', 900)
  if (!(await ev(`!!document.querySelector('input[type=email]')`))) return
  await setVal('input[type=email]', email)
  await setVal('input[type=password]', pw)
  await ev(`document.querySelector('form').requestSubmit()`)
  await sleep(1400)
}
const logout = async () => {
  await ev(`sessionStorage.clear()`)
  await go('/home', 900)
}
const star = `main article header button[aria-label^="즐겨찾기"]`
const starInfo = () =>
  ev(
    `(()=>{const b=document.querySelector(${JSON.stringify(star)});return b?{label:b.getAttribute('aria-label'),disabled:b.getAttribute('aria-disabled'),h:Math.round(b.getBoundingClientRect().height),w:Math.round(b.getBoundingClientRect().width),filled:!!b.querySelector('svg[fill="currentColor"]'),cls:b.className.includes('bg-exercise-soft')}:null})()`,
  )
const readStore = (k) => ev(`localStorage.getItem(${JSON.stringify(k)})`)
const ids = async (k) => {
  const v = await readStore(k)
  try {
    return JSON.parse(v).ids
  } catch {
    return v
  }
}
const settledFav = (x) =>
  x.label.startsWith('즐겨찾기에 추가') || x.label.startsWith('즐겨찾기 해제')
const waitStar = async (pred, n = 25) => {
  for (let i = 0; i < n; i++) {
    const s = await starInfo()
    if (s && pred(s)) return s
    await sleep(150)
  }
  return starInfo()
}
const notices = () =>
  ev(
    `[...document.querySelectorAll('main article header [aria-live=polite] > div')].map(n=>n.innerText.replace(/\\s+/g,' '))`,
  )
const srStatus = () =>
  ev(
    `[...document.querySelectorAll('main article header p[role=status].sr-only')].map(p=>p.textContent).join('|')`,
  )

let s, n // 구간 사이에서 공유하는 임시 값
await go('/exercises', 900)
const EX = await ev(
  `(async()=>(await import('/src/exercise/seed/seedData.ts')).getSeedCatalog().getAllExercises())()`,
)
check('시드 카탈로그 로드(105종)', EX.length >= 15)

await ev(`localStorage.clear()`)
await login('member.free@example.com', 'Mr-Dev-Free-2026')
console.log('\n===== A. 리디자인: 시드 전체 상세 =====')
const bad = []
for (const e of EX) {
  await go('/exercises/' + e.id, 600)
  let r
  for (let i = 0; i < 12; i++) {
    r =
      await ev(`(()=>{const m=document.querySelector('main');if(!m)return null;const a=m.querySelector('article');if(!a)return null;const tx=(s)=>[...a.querySelectorAll(s)].map(n=>n.textContent.trim());return{
      h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),
      diff:a.querySelector('[role=group][aria-label=난이도]')?.textContent.trim(),
      parts:tx('ul[aria-label="운동 부위"] li'),tools:tx('ul[aria-label="운동 도구"] li'),
      cat:tx('ul[aria-label="운동 분류"] li'),dl:a.querySelectorAll('dl').length,intro:!!a.querySelector('#exercise-intro-title'),
      secLens:[...a.querySelectorAll('section')].map(x=>x.innerText.trim().length),
      chipTexts:[...a.querySelectorAll('header ul[aria-label] li')].map(l=>l.textContent.trim()),
      steps:tx('ol > li p'),nums:[...a.querySelectorAll('ol > li > span[aria-hidden]')].map(s=>s.textContent).filter(x=>/^\\d+$/.test(x)),
      cautions:tx('section[aria-labelledby="exercise-cautions-title"] li'),
      h2:tx('h2'),media:!!a.querySelector('figure figcaption'),img:a.querySelectorAll('img,video').length,
      star:a.querySelector('header button[aria-label^="즐겨찾기"]')?.getAttribute('aria-label'),
      back:[...m.querySelectorAll('a')].find(x=>/이전/.test(x.innerText))?.getAttribute('href'),
      backFirst:m.querySelector('a')?.innerText.includes('이전'),
      acts:[...a.querySelectorAll('header button')].map(b=>b.getAttribute('aria-label')).filter(l=>/기록|계획/.test(l))}})()`)
    if (r && r.h1[0] === e.name && r.star && !r.star.includes('확인 중')) break
    await sleep(200)
  }
  const ok =
    r &&
    r.h1.length === 1 &&
    r.h1[0] === e.name &&
    r.diff === e.difficulty &&
    r.parts.join() === e.targetMuscles.join() &&
    r.tools.join() === e.equipment.join() &&
    r.cat.join() === e.category &&
    r.dl === 0 &&
    r.secLens.every((n) => n > 0) &&
    r.chipTexts.join() ===
      [e.category, ...e.targetMuscles, ...e.equipment].join() &&
    new Set(r.chipTexts).size === r.chipTexts.length &&
    r.steps.join('\n') === e.instructions.join('\n') &&
    r.nums.join() === e.instructions.map((_, i) => i + 1).join() &&
    r.cautions.join('\n') === e.precautions.join('\n') &&
    r.h2.join() ===
      [...(e.summary ? ['운동 소개'] : []), '운동 방법', '주의사항'].join() &&
    r.media &&
    r.img === 0 &&
    r.star === `즐겨찾기에 추가: ${e.name}` &&
    r.back === '/exercises' &&
    r.backFirst &&
    r.acts.join() === `오늘 기록에 추가: ${e.name},내일 계획에 추가: ${e.name}`
  if (!ok) bad.push({ id: e.id, r })
}
check(
  '시드 전체: h1=운동명(1개), 난이도 배지, 분류·부위·도구 칩(각 한 번씩, 중복 없음), 운동 소개/dl 없음·빈 섹션 없음, 단계 번호·순서·문장, 주의사항, h2 구조(운동 방법·주의사항), 미디어 플레이스홀더(img 0), 이전 링크가 맨 위, 별·오늘 기록·내일 계획 버튼 이름',
  bad.length === 0,
  bad.length ? JSON.stringify(bad[0]).slice(0, 500) : '',
)

console.log('\n===== C. 즐겨찾기: 회원 등록·해제 =====')
await login('member.free@example.com', 'Mr-Dev-Free-2026')
// 즐겨찾기 목록은 앱 시작과 함께 조회되어 E02가 그려질 때 이미 끝나 있을 수 있다(3단계 구조). 조회 중 표시는 재시도 경로로 확인한다.
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exerciseFavorite')`,
)
await go('/exercises/5', 100)
s = await waitStar((x) => /다시 시도/.test(x.label), 60)
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
s = null
for (
  let i = 0;
  i < 40 && !(s && s.label.startsWith('즐겨찾기 상태 확인 중'));
  i++
) {
  s = await starInfo()
  await sleep(30)
}
check(
  '조회 중(재조회): 별 버튼 "즐겨찾기 상태 확인 중", aria-disabled',
  s && s.label.startsWith('즐겨찾기 상태 확인 중') && s.disabled === 'true',
  JSON.stringify(s),
)
s = await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  '조회 후 미등록: "즐겨찾기에 추가: 푸시업", 윤곽선 별(채움 없음)',
  s.label === '즐겨찾기에 추가: 푸시업' && !s.filled && !s.disabled,
  JSON.stringify(s),
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await sleep(80)
s = await starInfo()
check(
  '저장 중: aria-disabled=true, 이름은 아직 "추가"(저장 전에 등록된 것처럼 보이지 않음), 저장소 아직 비어 있음',
  s.disabled === 'true' &&
    s.label.startsWith('즐겨찾기에 추가') &&
    !s.filled &&
    (await readStore(FAV('free'))) === null,
  JSON.stringify(s),
)
s = await waitStar((x) => x.label.startsWith('즐겨찾기 해제'))
check(
  '저장 후 등록됨: "즐겨찾기 해제: 푸시업", 채운 별, 배경 강조, aria-disabled 해제',
  s.label === '즐겨찾기 해제: 푸시업' && s.filled && s.cls && !s.disabled,
  JSON.stringify(s),
)
check(
  '  저장소에 id만 저장: {ids:["5"]} (운동 객체 복사 없음)',
  JSON.stringify(await ids(FAV('free'))) === '["5"]' &&
    !(await readStore(FAV('free'))).includes('푸시업'),
  await readStore(FAV('free')),
)
check(
  '  보이지 않는 안내(role=status)가 승인 문구 "즐겨찾기에 추가했어요." 낭독',
  (await srStatus()) === '즐겨찾기에 추가했어요.',
  await srStatus(),
)
await ev(`location.reload()`)
await sleep(1500)
s = await waitStar(settledFav)
check(
  '새로고침 후에도 등록 유지',
  s.label === '즐겨찾기 해제: 푸시업' && s.filled,
  JSON.stringify(s),
)
await go('/exercises/16', 1000)
s = await waitStar(settledFav)
check(
  '다른 운동(맨몸 스쿼트)은 미등록으로 구분',
  s.label === '즐겨찾기에 추가: 맨몸 스쿼트' && !s.filled,
  JSON.stringify(s),
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await waitStar((x) => x.label.startsWith('즐겨찾기 해제'))
check(
  '맨몸 스쿼트 등록 → 저장소 ["5","16"], 푸시업 유지',
  JSON.stringify(await ids(FAV('free'))) === '["5","16"]',
  await readStore(FAV('free')),
)

console.log('\n===== D. 중복 방지 · 빠른 연속 클릭 =====')
await go('/exercises/22', 900)
await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
await ev(
  `(()=>{const b=document.querySelector(${JSON.stringify(star)});for(let i=0;i<6;i++)b.click()})()`,
)
s = await waitStar((x) => x.label.startsWith('즐겨찾기 해제'), 30)
await sleep(600)
let after = await ids(FAV('free'))
check(
  '같은 순간 6번 클릭: 한 번만 처리 → plank 정확히 1개, 최종 "해제" 상태(되돌려지지 않음)',
  after.filter((x) => x === '22').length === 1 &&
    (await starInfo()).label.startsWith('즐겨찾기 해제'),
  JSON.stringify(after),
)
await ev(
  `(()=>{const b=document.querySelector(${JSON.stringify(star)});b.click();setTimeout(()=>b.click(),60);setTimeout(()=>b.click(),120)})()`,
)
await sleep(1300)
after = await ids(FAV('free'))
check(
  '해제 중 연속 클릭: 한 번만 처리 → plank 해제, 다른 운동 유지',
  !after.includes('22') &&
    after.includes('5') &&
    after.includes('16') &&
    (await starInfo()).label.startsWith('즐겨찾기에 추가'),
  JSON.stringify(after),
)
check(
  '  해제 성공 낭독: 승인 문구 "즐겨찾기에서 삭제했어요."',
  (await srStatus()) === '즐겨찾기에서 삭제했어요.',
  await srStatus(),
)
// 손상된 저장값: 잘못된 항목·중복은 없는 것으로 보고 한 번만 센다
await ev(
  `localStorage.setItem(${JSON.stringify(FAV('free'))},JSON.stringify({v:1,ids:[1,null,'','5','5',' x ','16']}))`,
)
await go('/exercises/5', 1100)
s = await waitStar(settledFav)
check(
  '손상된 저장값(숫자·null·빈 문자열·중복): 유효한 push-up은 등록으로 읽고 오류 없이 동작',
  s.label.startsWith('즐겨찾기 해제'),
  JSON.stringify(s),
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  '  해제하면 손상 항목이 정리되어 ["16"]만 남음',
  JSON.stringify(await ids(FAV('free'))) === '["16"]',
  await readStore(FAV('free')),
)
await ev(`localStorage.setItem(${JSON.stringify(FAV('free'))},'{not json')`)
await go('/exercises/5', 1100)
s = await waitStar(settledFav)
check(
  '깨진 JSON: 없는 것으로 읽어 "추가" 상태(앱이 죽지 않음)',
  s.label.startsWith('즐겨찾기에 추가') &&
    (await ev(`!!document.querySelector('main article h1')`)),
)
await ev(`localStorage.removeItem(${JSON.stringify(FAV('free'))})`)

console.log('\n===== E. 사용자 분리 =====')
await go('/exercises/5', 900)
await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await waitStar((x) => x.label.startsWith('즐겨찾기 해제'))
await logout()
await login('member.full@example.com', 'Mr-Dev-Full-2026')
await go('/exercises/5', 1000)
s = await waitStar(settledFav)
check(
  '다른 계정(full)은 같은 운동이 미등록(free의 즐겨찾기가 공유되지 않음)',
  s.label.startsWith('즐겨찾기에 추가') && !s.filled,
  JSON.stringify(s),
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await waitStar((x) => x.label.startsWith('즐겨찾기 해제'))
check(
  '저장소 키가 계정별로 분리: free ["5"] / full ["5"] 각각 독립',
  JSON.stringify(await ids(FAV('free'))) === '["5"]' &&
    JSON.stringify(await ids(FAV('full'))) === '["5"]',
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  'full이 해제해도 free는 유지',
  JSON.stringify(await ids(FAV('free'))) === '["5"]' &&
    (await ids(FAV('full'))).length === 0,
)
await logout()
await go('/exercises/5', 900)
await sleep(800)
check(
  '로그아웃(비회원)에서는 즐겨찾기·오늘 기록·내일 계획 버튼이 DOM에 없음(이전 계정 상태도 보이지 않음)',
  await ev(
    `document.querySelector('main article h1')!==null&&document.querySelectorAll('main article button').length===0`,
  ),
)
await login('member.free@example.com', 'Mr-Dev-Free-2026')
await go('/exercises/5', 1000)
s = await waitStar(settledFav)
check(
  '다시 로그인하면 free의 등록이 남아 있음("서버 보관" 재현)',
  s.label.startsWith('즐겨찾기 해제'),
  JSON.stringify(s),
)

console.log('\n===== F. 저장 실패 · 조회 실패 · 미연결 =====')
await ev(
  `localStorage.setItem(${JSON.stringify(FLAG('failSave'))},'exerciseFavorite')`,
)
await ev(`document.querySelector(${JSON.stringify(star)}).focus()`)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await sleep(900)
n = await notices()
s = await starInfo()
check(
  '저장 실패(등록 상태에서 해제 시도): 승인 문구 "즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요." 단 한 번, 상태·저장소 불변(여전히 등록)',
  n.length === 1 &&
    n[0] === '즐겨찾기를 변경하지 못했어요. 다시 시도해 주세요.' &&
    s.label.startsWith('즐겨찾기 해제') &&
    JSON.stringify(await ids(FAV('free'))) === '["5"]',
  JSON.stringify({ n, s }),
)
check(
  '  저장 실패 후에도 포커스가 별 버튼에 남아 있음(그 버튼으로 바로 재시도 가능)',
  await ev(
    `document.activeElement===document.querySelector(${JSON.stringify(star)})`,
  ),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('failSave'))})`)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
s = await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  '같은 별 버튼을 다시 눌러 재시도 → 해제 성공, 오류 안내 사라짐',
  s.label.startsWith('즐겨찾기에 추가') &&
    (await ids(FAV('free'))).length === 0 &&
    (await notices()).length === 0,
  JSON.stringify({ s, n: await notices() }),
)
await ev(
  `localStorage.setItem(${JSON.stringify(FLAG('failSave'))},'exerciseFavorite')`,
)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await sleep(900)
check(
  '저장 실패(미등록에서 등록 시도): 등록되지 않음, 저장소 비어 있음, 성공 낭독 없음',
  (await starInfo()).label.startsWith('즐겨찾기에 추가') &&
    (await ids(FAV('free'))).length === 0 &&
    !(await srStatus()).includes('추가했어요'),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('failSave'))})`)
await ev(
  `localStorage.setItem(${JSON.stringify(FLAG('failLoad'))},'exerciseFavorite')`,
)
await go('/exercises/5', 1200)
// 새 프로필의 첫 로드가 고정 대기보다 오래 걸릴 수 있어 별 버튼이 "다시 시도" 상태가 될 때까지 기다린다.
s = await waitStar((x) => x.label.includes('다시 시도'))
n = await notices()
check(
  '조회 실패: 별 이름 "…다시 시도", 승인 문구 "즐겨찾기 상태를 확인하지 못했어요."(운동 정보는 정상 표시)',
  s.label.includes('다시 시도') &&
    n.length === 1 &&
    n[0] === '즐겨찾기 상태를 확인하지 못했어요.' &&
    (await ev(`document.querySelector('main article h1')?.textContent`)) ===
      '푸시업',
  JSON.stringify({ s, n }),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('failLoad'))})`)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
s = await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  '별 버튼으로 재시도 → 정상 상태, 오류 안내 사라짐',
  s.label.startsWith('즐겨찾기에 추가') && (await notices()).length === 0,
)
await ev(
  `localStorage.setItem(${JSON.stringify(FLAG('unavailable'))},'exerciseFavorite')`,
)
await go('/exercises/5', 1100)
const snapBefore = await readStore(FAV('free'))
// 화면이 그려질 때까지(별 버튼이 나타날 때까지) 기다린 뒤 누른다. 고정 대기만으로는 부하가 큰 환경에서 버튼이 아직 없을 수 있다.
await waitStar(() => true, 60)
await ev(`document.querySelector(${JSON.stringify(star)}).click()`)
await sleep(300)
n = await notices()
check(
  '즐겨찾기 미연결: 승인 문구 "즐겨찾기 기능을 준비하고 있어요.", 저장 안 됨(운동 정보는 정상)',
  n.length === 1 &&
    n[0] === '즐겨찾기 기능을 준비하고 있어요.' &&
    (await readStore(FAV('free'))) === snapBefore &&
    (await starInfo()).label.startsWith('즐겨찾기에 추가'),
  JSON.stringify(n),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('unavailable'))})`)

console.log('\n===== G. 키보드 · 접근성 =====')
await go('/exercises/5', 1000)
await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
await ev(`document.activeElement&&document.activeElement.blur()`)
const order = []
for (let i = 0; i < 6; i++) {
  await key('Tab', 'Tab', 9)
  order.push(
    await ev(
      `(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return (e.getAttribute('aria-label')||e.innerText||'').trim().slice(0,16)+'|'+cs.outlineStyle+'|'+cs.outlineWidth})()`,
    ),
  )
  if (order.at(-1).startsWith('내일 계획')) break
}
console.log('  Tab 순서:', JSON.stringify(order))
check(
  'Tab 순서: 이전 → 즐겨찾기 → 오늘 기록 → 내일 계획',
  order.map((x) => x.split('|')[0]).join(',') ===
    '이전 화면으로 돌아가기,즐겨찾기에 추가: 푸시업,오늘 기록에 추가: 푸시업,내일 계획에 추가: 푸시업',
  JSON.stringify(order),
)
check(
  '키보드 포커스 표시: 모든 버튼 2px 실선 outline',
  order.every((x) => x.endsWith('solid|2px')),
  JSON.stringify(order),
)
await ev(`document.querySelector(${JSON.stringify(star)}).focus()`)
await key('Enter', 'Enter', 13)
s = await waitStar((x) => x.label.startsWith('즐겨찾기 해제'))
check(
  'Enter로 즐겨찾기 등록, 포커스는 별 버튼에 유지',
  s.label.startsWith('즐겨찾기 해제') &&
    (await ev(
      `document.activeElement.getAttribute('aria-label')?.startsWith('즐겨찾기 해제')`,
    )),
)
await key(' ', 'Space', 32)
await sleep(100)
s = await waitStar((x) => x.label.startsWith('즐겨찾기에 추가'))
check(
  'Space로 즐겨찾기 해제',
  s.label.startsWith('즐겨찾기에 추가'),
  JSON.stringify(s),
)
check(
  '버튼은 button 요소, 별 아이콘은 장식(aria-hidden), 이름이 상태를 글자로 전달',
  await ev(
    `(()=>{const b=document.querySelector(${JSON.stringify(star)});return b.tagName==='BUTTON'&&b.querySelector('svg').getAttribute('aria-hidden')==='true'&&!b.hasAttribute('aria-pressed')})()`,
  ),
)
const routine = await ev(
  `(()=>{const [a,b]=[...document.querySelectorAll('main article header button')].filter(x=>/기록|계획/.test(x.getAttribute('aria-label')));const ca=getComputedStyle(a),cb=getComputedStyle(b);return{ha:Math.round(a.getBoundingClientRect().height),hb:Math.round(b.getBoundingClientRect().height),wa:Math.round(a.getBoundingClientRect().width),wb:Math.round(b.getBoundingClientRect().width),bgA:ca.backgroundColor,bgB:cb.backgroundColor,fwA:ca.fontWeight,fwB:cb.fontWeight}})()`,
)
check(
  '오늘 기록(주 버튼): 채운 배경·더 큰 높이/너비, 내일 계획(보조): 윤곽선, 둘 다 굵기 600·높이 ≥44',
  routine.ha >= 48 &&
    routine.hb >= 44 &&
    routine.wa > routine.wb &&
    routine.bgA !== routine.bgB &&
    routine.fwA === '600' &&
    routine.fwB === '600',
  JSON.stringify(routine),
)
await ev(`document.querySelectorAll('main article header button')[2].click()`)
const rt = await ev(
  `(()=>{const [a,b]=[...document.querySelectorAll('main article header button')].filter(x=>/기록|계획/.test(x.getAttribute('aria-label')));b.click();return document.getElementById('exercise-routine-notice')?.innerText.replace(/\\s+/g,' ')})()`,
)
check(
  '내일 계획 클릭(회원): "아직 준비 중"·"저장되지 않았어요" 안내, 아무것도 저장하지 않음(S8-3 이후 오늘 기록은 W02로 연결)',
  rt.includes('아직 준비 중') &&
    rt.includes('저장되지 않았어요') &&
    !(await readStore('mealthroutine.dev.mock.routine.free')),
  rt,
)

console.log('\n===== H. 이동 회귀 =====')
const e01 = `/exercises?q=${q('덤벨')}&difficulty=${q('중급')}&view=results`
await go(e01, 1400)
globalThis.__n = await ev(
  `document.querySelectorAll('main a[href^="/exercises/"]').length`,
)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(1100)
let r = await ev(
  `(()=>({p:location.pathname,back:[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))?.getAttribute('href'),h1:document.querySelector('h1')?.textContent}))()`,
)
check(
  'E01 결과 → E02, "이전" = 검색 조건이 담긴 E01 결과 주소',
  /^\/exercises\/[^/]+$/.test(r.p) && !!r.h1 && r.back === e01,
  JSON.stringify(r),
)
await ev(
  `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText)).click()`,
)
await sleep(1500)
check(
  '"이전" → 검색어·난이도 조건과 결과 복원',
  (await ev(`location.pathname+location.search`)) === e01 &&
    (await ev(
      `document.querySelectorAll('main a[href^="/exercises/"]').length`,
    )) === globalThis.__n,
)
await ev(`document.querySelector('main a[href="/exercises/7"]').click()`)
await sleep(900)
await ev(`history.back()`)
await sleep(1300)
check(
  '브라우저 뒤로가기 → E01 결과 복원',
  (await ev(`location.pathname+location.search`)) === e01,
)
await ev(`history.forward()`)
await sleep(1200)
check(
  '브라우저 앞으로가기 → E02',
  (await ev(`document.querySelector('h1')?.textContent`)) ===
    '덤벨 숄더 프레스',
)
const sr = `/search?q=${q('맨몸 스쿼트')}&c=exercise`
await go(sr, 1300)
await ev(`document.querySelector('main a[href^="/exercises/"]').click()`)
await sleep(1000)
r = await ev(
  `(()=>({h1:document.querySelector('h1')?.textContent,back:[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))?.getAttribute('href')}))()`,
)
check(
  '통합검색 → E02, "이전" = 통합검색 주소',
  !!r.h1 && r.back === sr,
  JSON.stringify(r),
)
await ev(
  `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText)).click()`,
)
await sleep(1300)
check(
  '"이전" → 통합검색 결과 복원',
  (await ev(`location.pathname+location.search`)) === sr,
)
await go('/exercises/5', 900)
check(
  'URL 직접 접근: "이전" = /exercises',
  (await ev(
    `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))?.getAttribute('href')`,
  )) === '/exercises',
)

console.log('\n===== I. 상태 화면 (로딩·없는 ID·실패·미연결) =====')
await go('/exercises/no-such-exercise', 1200)
let st = await ev(
  `(()=>({back:!!([...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))),h1:[...document.querySelectorAll('h1')].map(h=>h.textContent),t:[...document.querySelectorAll('main [role=status]')].map(n=>n.innerText.replace(/\\s+/g,' '))}))()`,
)
check(
  '없는 ID: 이전 링크 + h1 1개 + "찾을 수 없는 운동이에요"',
  st.back &&
    st.h1.length === 1 &&
    st.t.some((x) => x.includes('찾을 수 없는 운동')),
  JSON.stringify(st),
)
await ev(`localStorage.setItem(${JSON.stringify(FLAG('failLoad'))},'exercise')`)
await go('/exercises/5', 1200)
st = await ev(
  `(()=>({back:!!([...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))),alert:!!document.querySelector('main [role=alert]')}))()`,
)
check(
  '운동 조회 실패: 이전 링크 + role=alert',
  st.back && st.alert,
  JSON.stringify(st),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('failLoad'))})`)
await ev(
  `localStorage.setItem(${JSON.stringify(FLAG('unavailable'))},'exercise')`,
)
await go('/exercises/5', 1200)
st = await ev(
  `(()=>({back:!!([...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))),t:[...document.querySelectorAll('main [role=status]')].map(n=>n.innerText.replace(/\\s+/g,' ')),star:!!document.querySelector('main button[aria-label^="즐겨찾기"]')}))()`,
)
check(
  '운동 데이터 미연결: 이전 링크 + "준비하고 있어요", 즐겨찾기 버튼 없음',
  st.back && st.t.some((x) => x.includes('준비하고 있어요')) && !st.star,
  JSON.stringify(st),
)
await ev(`localStorage.removeItem(${JSON.stringify(FLAG('unavailable'))})`)

console.log(
  '\n===== J. 빈 데이터 · 이미지 · 긴 텍스트 (조작한 운동 객체로 컴포넌트만 렌더) =====',
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
const LONG =
  '아주 긴 이름의 운동으로 줄바꿈과 별 버튼 배치를 확인하는 덤벨 사이드 레터럴 레이즈 변형 동작 스무 글자를 넘는 이름'
const render = (ex, w) =>
  ev(`(async()=>{
  const U=${JSON.stringify(URLS)};
  const [dom,{MemoryRouter},react,{default:View},{default:AuthProvider},{default:FavProvider}] = await Promise.all([import(U.dom),import(U.router),import(U.react),import('/src/components/exercise/ExerciseDetailView.tsx'),import('/src/auth/AuthProvider.tsx'),import('/src/exercise/FavoritesProvider.tsx')]); const {default:DraftProvider}=await import('/src/exercise/WorkoutDraftProvider.tsx');
  document.getElementById('host')?.remove();
  const host=document.createElement('div'); host.id='host'; host.style.cssText='padding:0 20px;width:100%;box-sizing:border-box;overflow:hidden'; document.body.appendChild(host);
  const createRoot = dom.createRoot ?? dom.default.createRoot; const h = react.createElement ?? react.default.createElement;
  createRoot(host).render(h(MemoryRouter,null,h(AuthProvider,null,h(FavProvider,null,h(DraftProvider,null,h(View,{exercise:${JSON.stringify(ex)}}))))));
  await new Promise(r=>setTimeout(r,700));
  const a=host.querySelector('article'); const over=[...a.querySelectorAll('*')].filter(e=>{if(e.closest('figure')&&e.getAttribute('aria-hidden')==='true')return false;const r=e.getBoundingClientRect();return r.width>0&&(r.right>host.getBoundingClientRect().right+1.5)}).length;
  return {text:a.innerText.replace(/\\s+/g,' '),ol:a.querySelectorAll('ol').length,ul:a.querySelectorAll('ul[aria-label]').length,facts:a.querySelectorAll('section[aria-labelledby="exercise-intro-title"] dl > div').length,img:a.querySelectorAll('img').length,fig:a.querySelector('figure figcaption')?.textContent??null,over,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,h1h:Math.round(a.querySelector('h1').getBoundingClientRect().height)}
})()`)
const EMPTY = {
  id: 'x',
  name: '테스트 운동',
  category: '상체',
  targetMuscles: [],
  difficulty: '초급',
  equipment: [],
  instructions: [],
  precautions: [],
}
let e = await render(EMPTY, 390)
check(
  '빈 데이터: 부위·도구 칩 생략(분류 칩만), 운동 소개 영역 없음, 방법·주의사항은 안내 문장, 빈 목록 없음, 미디어 플레이스홀더',
  e.ul === 1 &&
    e.ol === 0 &&
    e.facts === 0 &&
    !e.text.includes('운동 소개') &&
    e.text.includes('이 운동의 방법 안내가 아직 없어요') &&
    e.text.includes('등록된 주의사항이 없어요') &&
    e.fig,
  JSON.stringify(e),
)
const SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#cbd5e1"/></svg>',
  )
e = await render({ ...EMPTY, imageUrl: SVG }, 390)
check(
  '대표 이미지가 있으면 img로 표시(플레이스홀더 대신)',
  e.img === 1 && !e.fig,
  JSON.stringify({ img: e.img, fig: e.fig }),
)
e = await render({ ...EMPTY, imageUrl: 'data:image/png;base64,AAAA' }, 390)
check(
  '이미지를 불러오지 못하면 플레이스홀더로 복귀',
  e.img === 0 && !!e.fig,
  JSON.stringify({ img: e.img, fig: e.fig }),
)
const BIG = {
  id: 'y',
  name: LONG,
  category: '하체',
  targetMuscles: ['엉덩이', '허벅지', '종아리', '복부', '허리', '어깨', '가슴'],
  difficulty: '고급',
  equipment: ['덤벨', '밴드', '풀업 바'],
  instructions: Array.from(
    { length: 9 },
    (_, i) =>
      `${i + 1}번째 동작: 숨을 들이마시며 천천히 내려가고 올라올 때 내쉬며 균형을 유지한 채 끝까지 움직이세요. 반동을 쓰지 말고 같은 속도를 유지합니다.`,
  ),
  precautions: Array.from(
    { length: 6 },
    (_, i) =>
      `주의사항 ${i + 1}: 통증이 느껴지면 즉시 멈추고 무리하지 마세요. 자세가 무너지면 횟수를 줄이세요.`,
  ),
}
for (const w of [195, 320, 390, 768]) {
  await vp(w, 900)
  e = await render(BIG, w)
  check(
    `긴 이름·긴 방법 9단계·주의사항 6개·부위 7개 (${w}px): 가로 넘침·잘림 없음, 단계 9개`,
    e.over === 0 &&
      e.sw <= e.cw &&
      e.ol === 1 &&
      (e.text.match(/번째 동작/g) ?? []).length === 9,
    JSON.stringify({ over: e.over, sw: e.sw, cw: e.cw, h1h: e.h1h }),
  )
}

console.log('\n===== K. 반응형 (실제 운동 상세) =====')
for (const [w, h, note] of [
  [160, 640, '200%(320 기준)'],
  [195, 844, '200%(390 기준)'],
  [320, 640, ''],
  [390, 844, ''],
  [768, 1024, ''],
  [1440, 900, ''],
]) {
  await vp(w, h)
  await go('/exercises/27', 1000)
  // 상세 화면(별 버튼)이 그려질 때까지 기다린 뒤 측정한다. 고정 대기만으로는 부하가 큰 환경에서 아직 없을 수 있다.
  await waitStar(() => true, 60)
  const m = await ev(
    `(()=>{const d=document.documentElement;const els=[...document.querySelectorAll('main article *')].filter(e=>e.getBoundingClientRect().width>0&&!(e.closest('figure')&&e.getAttribute('aria-hidden')==='true'));return{sw:d.scrollWidth,cw:d.clientWidth,over:els.filter(e=>e.getBoundingClientRect().right>d.clientWidth+0.5||e.getBoundingClientRect().left<-0.5).length,btn:Math.min(...[...document.querySelectorAll('main article header button')].map(b=>b.getBoundingClientRect().height)),starW:Math.round(document.querySelector('main article header button').getBoundingClientRect().width)}})()`,
  )
  check(
    `${w}px ${note}: 가로 스크롤·잘림 없음, 버튼 높이 ≥44`,
    m.sw <= m.cw && m.over === 0 && m.btn >= 44,
    JSON.stringify(m),
  )
}

console.log('\nconsole problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `\nTOTAL ${t.res.length}  PASS ${t.res.length - f.length}  FAIL ${f.length}`,
)
f.forEach((x) => console.log('  FAIL: ' + x.n))
t.close()
process.exit(0)
