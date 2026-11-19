// [chrome 회귀] 조회 실패 후 다시 시도의 포커스 이동(E01·통합검색)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E01·통합검색 "다시 시도" 포커스 수정 검증 (개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const t = await launch(
  'out-retryfix-' + Date.now(),
  9441,
  'http://localhost:5199',
)
const { ev, vp, go, sleep, check, cdp } = t
const q = encodeURIComponent
await vp(390, 844)
const FLAG = 'mealthroutine.dev.mock.flag.failLoad'
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
  await sleep(120)
}
const tab = () => key('Tab', 'Tab', 9)
const shiftTab = () => key('Tab', 'Tab', 9, 8)
const active = () =>
  ev(
    `(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return{tag:e.tagName,label:(e.getAttribute('aria-label')||e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,26),inMain:!!e.closest('main'),frame:e.getAttribute('tabindex')==='-1'&&e!==document.body,role:e.getAttribute('role'),outline:cs.outlineStyle}})()`,
  )
const state = () =>
  ev(
    `(()=>({url:location.pathname+location.search,alert:!!document.querySelector('main [role=alert]'),cards:[...document.querySelectorAll('main a[href^="/exercises/"]')].length,loading:[...document.querySelectorAll('main [role=status]')].map(n=>n.innerText.trim()).filter(x=>/중이에요/.test(x)),input:document.getElementById('search-input')?.value??null,pressed:[...document.querySelectorAll('main button[aria-pressed="true"]')].map(b=>b.innerText),chips:[...document.querySelectorAll('main ul li')].map(l=>l.innerText.trim()).filter(x=>x.startsWith('검색어'))}))()`,
  )
const toRetry = async () => {
  await ev(`document.activeElement&&document.activeElement.blur()`)
  let a
  for (let i = 0; i < 30; i++) {
    await tab()
    a = await active()
    if (a.label.startsWith('다시 시도')) return true
  }
  return false
}

async function scenario(name, url, label) {
  console.log(`\n=== ${name} ===`)
  for (const mode of ['실패', '성공']) {
    await go(url, 900)
    await ev(`localStorage.setItem('${FLAG}','exercise')`)
    await go(url, 1400)
    const before = await state()
    const onRetry = await toRetry()
    check(
      `[${name}/재시도 ${mode}] 실패 화면에서 Tab으로 "다시 시도"에 도달`,
      before.alert && onRetry,
    )
    if (mode === '성공') await ev(`localStorage.removeItem('${FLAG}')`)
    await key('Enter', 'Enter', 13)
    // 조회 중(Mock 지연 300ms) 상태: 포커스는 body가 아니라 결과 영역
    await sleep(60)
    const mid = await active()
    const midState = await state()
    check(
      `[${name}/재시도 ${mode}] Enter 직후(조회 중) 포커스가 body로 빠지지 않고 결과 영역에 있음 + "…중이에요" 안내(role=status)`,
      mid.tag !== 'BODY' &&
        mid.frame &&
        mid.inMain &&
        midState.loading.length === 1,
      JSON.stringify({ mid, loading: midState.loading }),
    )
    await sleep(1300)
    const after = await active()
    const afterState = await state()
    check(
      `[${name}/재시도 ${mode}] 조회 후에도 포커스가 결과 영역에 유지(body 아님), 보이는 윤곽선 없음`,
      after.frame && after.inMain && after.outline === 'none',
      JSON.stringify(after),
    )
    check(
      `[${name}/재시도 ${mode}] 검색어·조건·URL 유지`,
      afterState.url === before.url &&
        (label === 'e01'
          ? afterState.chips.join() === before.chips.join() &&
            afterState.chips.length === 1
          : afterState.input === before.input &&
            afterState.pressed.join() === before.pressed.join()),
      JSON.stringify({
        before: before.url,
        after: afterState.url,
        chips: afterState.chips,
        input: afterState.input,
        pressed: afterState.pressed,
      }),
    )
    await tab()
    const next = await active()
    if (mode === '실패')
      check(
        `[${name}/재시도 실패] 이어서 Tab → 새 "다시 시도" 버튼`,
        afterState.alert &&
          next.tag === 'BUTTON' &&
          next.label.startsWith('다시 시도'),
        JSON.stringify({ afterState: afterState.alert, next }),
      )
    else
      check(
        `[${name}/재시도 성공] 이어서 Tab → 첫 결과 카드(링크)`,
        afterState.cards >= 1 && next.tag === 'A' && /푸시업/.test(next.label),
        JSON.stringify({ cards: afterState.cards, next }),
      )
    await shiftTab() // 다음 항목 → 결과 영역(tabindex=-1)은 건너뛰고 그 앞의 조작 요소
    const prev1 = await active()
    check(
      `[${name}/재시도 ${mode}] Shift+Tab 1회: 결과 영역을 건너뛰고 바로 앞 조작 요소(버튼)로 이동 (${label === 'e01' ? '조건 수정' : '범위 탭'})`,
      prev1.tag === 'BUTTON' &&
        prev1.inMain &&
        !prev1.frame &&
        (label !== 'e01' || prev1.label.startsWith('조건 수정')),
      JSON.stringify(prev1),
    )
    await shiftTab()
    const prev2 = await active()
    check(
      `[${name}/재시도 ${mode}] Shift+Tab 2회: 계속 화면 안의 이전 요소로 이동(body·문서 처음으로 가지 않음)`,
      prev2.tag !== 'BODY' && !prev2.frame,
      JSON.stringify(prev2),
    )
    await ev(`localStorage.removeItem('${FLAG}')`)
  }
  // 결과 영역이 Tab 순서에 끼어들지 않음(tabindex=-1): 정상 화면에서 처음부터 끝까지 Tab
  await go(url, 1500)
  await ev(`document.activeElement&&document.activeElement.blur()`)
  const stops = []
  for (let i = 0; i < 40; i++) {
    await tab()
    const a = await active()
    stops.push(a)
    if (a.tag === 'BODY') break
  }
  check(
    `[${name}] 정상 화면에서 Tab 순서에 결과 영역(tabindex=-1)이 정지점으로 끼지 않음`,
    !stops.some((s) => s.frame),
    JSON.stringify(stops.filter((s) => s.frame)),
  )
}
await scenario('E01 결과', `/exercises?q=${q('푸시업')}&view=results`, 'e01')
await scenario('통합검색', `/search?q=${q('푸시업')}`, 'search')

console.log('\n=== 재시도가 아닌 동작에서 포커스를 가로채지 않음 ===')
// E01: 같은 조건으로 재검색(조건 수정 시트 → 변경 없이 재검색) → attempt만 오름
await ev(`localStorage.removeItem('${FLAG}')`)
await go(`/exercises?q=${q('푸시업')}&view=results`, 1500)
await ev(
  `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('조건 수정')).click()`,
)
await sleep(700)
await ev(
  `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.includes('재검색')).click()`,
)
await sleep(1800)
let a = await active()
check(
  'E01: 같은 조건 재검색(시트)은 결과 영역으로 포커스를 가로채지 않음',
  !a.frame || !a.inMain || a.label !== '검색 결과',
  JSON.stringify(a),
)
// 통합검색: 새 검색·범위 전환은 attempt를 올리지 않으므로 포커스 불변
await go('/search', 800)
await ev(
  `(()=>{const i=document.getElementById('search-input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,'스쿼트');i.dispatchEvent(new Event('input',{bubbles:true}));i.form.requestSubmit()})()`,
)
await sleep(1500)
a = await active()
check(
  '통합검색: 일반 검색 제출 후 포커스는 입력창(재시도 포커스 이동 없음)',
  a.tag === 'INPUT',
  JSON.stringify(a),
)
await ev(`document.getElementById('search-cat-exercise').click()`)
await sleep(1000)
a = await active()
check(
  '통합검색: 범위 전환 후 포커스는 범위 탭(기존 동작 유지)',
  a.tag === 'BUTTON' && a.label === '운동',
  JSON.stringify(a),
)

console.log('\nconsole problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length}  PASS ${t.res.length - f.length}  FAIL ${f.length}`,
)
f.forEach((x) => console.log('  FAIL: ' + x.n))
t.close()
process.exit(0)
