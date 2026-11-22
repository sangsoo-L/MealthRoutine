// [chrome 회귀] W01-2 3단계 도구 카드의 접근성 트리(자동화 검증)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only a11y-tool-cards`. 상세: tests/chrome/README.md
//
// 이 스크립트는 Chrome이 계산한 접근성 트리(CDP Accessibility 도메인)로 역할·이름·상태·설명·키보드 포커스 가능 여부를 확인한다.
// 실제 스크린 리더(NVDA·VoiceOver·TalkBack 등)가 무엇을 어떤 순서로 읽는지는 확인하지 못한다(자동화로는 청취할 수 없다). 그 부분은 미검증이다.
// "NOTE"로 시작하는 줄은 검사 결과(PASS/FAIL)가 아니라 관찰한 사실이다.
// 접근성 이름은 도구명만, 설명은 상태 문구(선택 불가 이유·"(항상 가능)")만 가리킨다. ID는 도구명이 아니라 useId와 순번으로 만든다(S8-3C).
import { start } from '../lib/session.mjs'

const REASON = '초급 자동 추천에 쓸 수 있는 운동이 아직 없어요'
const ORDER = ['덤벨', '맨몸', '밴드', '폼롤러', '마사지볼', '풀업 바']
const UNAVAILABLE = ['덤벨', '폼롤러', '마사지볼', '풀업 바']
const PLAN = '/records/exercise/plan'

const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}

const h = await start('a11y-tool-cards')
await h.vp(390, 844)
await h.login('free')
await h.ev(
  `Object.keys(sessionStorage).filter(k=>/beginner-plan/.test(k)).forEach(k=>sessionStorage.removeItem(k))`,
)
await h.go(`${PLAN}?mode=automatic`, 1100)
await h.until(`!!document.querySelector('main h1')`, 60)
await h.sleep(400)
await h.ev(
  `[...document.querySelectorAll('main label')].find(l=>/운동 습관 만들기/.test(l.innerText)).click()`,
)
await h.sleep(250)
await h.click('^다음$')
await h.sleep(450)
await h.ev(
  `[...document.querySelectorAll('main button')].find(b=>/^20분/.test(b.innerText.trim()))?.click()`,
)
await h.sleep(250)
await h.click('^다음$')
await h.until(
  `!!document.querySelector('main [role=group] input[type=checkbox]')`,
  60,
)
await h.sleep(400)

await h.cdp('DOM.enable')
await h.cdp('Accessibility.enable')

/** CSS 선택자로 찾은 요소들의 접근성 노드(역할·이름·설명·상태). */
async function axNodes(selector) {
  const doc = await h.cdp('DOM.getDocument', { depth: -1 })
  const { nodeIds } = await h.cdp('DOM.querySelectorAll', {
    nodeId: doc.root.nodeId,
    selector,
  })
  const out = []
  for (const nodeId of nodeIds) {
    const { nodes } = await h.cdp('Accessibility.getPartialAXTree', {
      nodeId,
      fetchRelatives: false,
    })
    const node = nodes[0]
    const props = Object.fromEntries(
      (node.properties ?? []).map((p) => [p.name, p.value?.value]),
    )
    out.push({
      ignored: !!node.ignored,
      role: node.role?.value,
      name: node.name?.value ?? '',
      description: node.description?.value ?? '',
      checked: props.checked,
      disabled: props.disabled === true || props.disabled === 'true',
      focusable: props.focusable === true || props.focusable === 'true',
    })
  }
  return out
}
const nameOf = (n) => n.name

const boxes = await axNodes('main [role=group] input[type=checkbox]')
console.log(
  'NOTE  접근성 트리(체크박스):',
  JSON.stringify(
    boxes.map((b) => ({
      name: b.name,
      checked: b.checked,
      disabled: b.disabled,
      focusable: b.focusable,
      description: b.description,
    })),
  ),
)

// ── 역할·이름 ──
check(
  '도구 카드 6장이 모두 checkbox 역할이고 접근성 트리에 노출된다(ignored 아님)',
  boxes.length === 6 && boxes.every((b) => b.role === 'checkbox' && !b.ignored),
  boxes.map((b) => b.role).join(),
)
check(
  '접근 가능한 이름이 도구 이름과 정확히 같다(E01 순서: 덤벨·맨몸·밴드·폼롤러·마사지볼·풀업 바) — 이유·상태 문구가 이름에 섞이지 않는다',
  JSON.stringify(boxes.map((b) => b.name)) === JSON.stringify(ORDER),
  JSON.stringify(boxes.map((b) => b.name)),
)

// ── 상태 ──
const byTool = Object.fromEntries(boxes.map((b) => [nameOf(b), b]))
check(
  '맨몸: 선택됨(checked)이고 비활성(disabled)이다 — 항상 포함되어 끌 수 없다',
  byTool['맨몸'].checked === 'true' && byTool['맨몸'].disabled,
  JSON.stringify(byTool['맨몸']),
)
check(
  '밴드: 선택 가능(활성)이고 처음에는 선택되지 않았다(checked=false), 키보드 포커스를 받을 수 있다',
  !byTool['밴드'].disabled &&
    byTool['밴드'].checked === 'false' &&
    byTool['밴드'].focusable,
  JSON.stringify(byTool['밴드']),
)
check(
  '선택 불가 4종: 비활성(disabled)이고 선택되지 않았으며 키보드 포커스를 받지 않는다',
  UNAVAILABLE.every(
    (t) =>
      byTool[t].disabled &&
      byTool[t].checked === 'false' &&
      !byTool[t].focusable,
  ),
  JSON.stringify(
    UNAVAILABLE.map((t) => [t, byTool[t].disabled, byTool[t].focusable]),
  ),
)

// ── 선택할 수 없는 이유(설명) ──
check(
  '선택 불가 4종: 이유("초급 자동 추천에 쓸 수 있는 운동이 아직 없어요")가 접근 가능한 설명(description)으로 연결된다 — 풀업 바 포함 4종 모두',
  UNAVAILABLE.every((t) => byTool[t].description === REASON),
  JSON.stringify(UNAVAILABLE.map((t) => byTool[t].description)),
)
check(
  '맨몸의 설명은 "(항상 가능)"이고, 선택 가능한 밴드에는 설명이 없다',
  byTool['맨몸'].description === '(항상 가능)' &&
    byTool['밴드'].description === '',
  JSON.stringify([byTool['맨몸'].description, byTool['밴드'].description]),
)
check(
  '중복 낭독 없음: 선택 불가 이유는 설명에만 있고 접근 가능한 이름에는 들어 있지 않다(이름 + 설명이 같은 문장을 두 번 말하지 않는다)',
  UNAVAILABLE.every(
    (t) => !byTool[t].name.includes(REASON) && byTool[t].description === REASON,
  ),
  JSON.stringify(
    UNAVAILABLE.map((t) => [byTool[t].name, byTool[t].name.includes(REASON)]),
  ),
)
// 참조 ID 유효성: 이름·설명 참조가 공백 없는 단일 ID이고 실제 요소를 가리킨다(공백이 있으면 참조가 끊긴다)
const refs = await h.ev(
  `[...document.querySelectorAll('main [role=group] input[type=checkbox]')].map(i=>['aria-labelledby','aria-describedby'].filter(a=>i.hasAttribute(a)).map(a=>{const v=i.getAttribute(a);const tokens=v.trim().split(/\s+/);return {a,v,single:tokens.length===1&&!/\s/.test(v),resolves:tokens.every(t=>!!document.getElementById(t))}}))`,
)
check(
  '모든 aria-labelledby·aria-describedby 참조가 공백 없는 단일 ID이고 실제 요소를 가리킨다(6장 · 이름 6 + 설명 5)',
  refs.flat().length === 11 && refs.flat().every((r) => r.single && r.resolves),
  JSON.stringify(refs.flat().filter((r) => !r.single || !r.resolves)),
)
const ids = await h.ev(`[...document.querySelectorAll('[id]')].map(e=>e.id)`)
check(
  '문서 안 ID가 중복되지 않는다(카드 6장의 이름·설명 요소 포함)',
  new Set(ids).size === ids.length,
  String(ids.length),
)
check(
  '이유 문구는 화면에도 그대로 보인다(4장)',
  (await h.text()).split(REASON).length - 1 === 4,
)

// ── 묶음(group) ──
const groups = await axNodes('main [role=group]')
check(
  '도구 묶음은 group 역할이고 이름이 단계 질문("사용할 수 있는 운동 도구가 있나요?")이다',
  groups.length >= 1 &&
    groups[0].role === 'group' &&
    groups[0].name === '사용할 수 있는 운동 도구가 있나요?',
  JSON.stringify(groups[0]),
)

// ── 읽는 순서(DOM 순서) ──
const domOrder = await h.ev(
  `[...document.querySelectorAll('main [role=group] label')].map(l=>l.querySelector('span span')?.firstChild?.textContent.trim())`,
)
check(
  '화면(읽는) 순서가 E01 도구 순서와 같다: 덤벨 → 맨몸 → 밴드 → 폼롤러 → 마사지볼 → 풀업 바',
  JSON.stringify(domOrder) === JSON.stringify(ORDER),
  JSON.stringify(domOrder),
)

// ── 키보드 탐색 순서 ──
const activeLabel = () =>
  h.ev(
    `(()=>{const e=document.activeElement;const l=e.closest('label');return l?l.querySelector('span span')?.firstChild?.textContent.trim():(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,14)})()`,
  )
await h.ev(`window.scrollTo(0,0);document.querySelector('main h1').focus()`)
const stops = []
for (let i = 0; i < 2; i++) {
  await h.press('Tab', 'Tab', 9)
  stops.push(await activeLabel())
}
check(
  '키보드 탐색: 단계 제목 다음 Tab은 선택 가능한 밴드에서 멈추고, 그다음은 "운동 추천받기"다(비활성 카드는 건너뜀)',
  stops[0] === '밴드' && /운동 추천받기/.test(stops[1] ?? ''),
  JSON.stringify(stops),
)
await h.ev(`window.scrollTo(0,0);document.querySelector('main h1').focus()`)
await h.press('Tab', 'Tab', 9)
await h.press(' ', 'Space', 32)
const afterSpace = await axNodes('main [role=group] input[type=checkbox]')
check(
  '키보드(Space)로 밴드를 고르면 접근성 트리의 checked 상태가 true로 바뀐다',
  afterSpace[2].checked === 'true' && nameOf(afterSpace[2]) === '밴드',
  JSON.stringify(afterSpace[2]),
)
await h.press(' ', 'Space', 32)
const afterSecond = await axNodes('main [role=group] input[type=checkbox]')
check(
  'Space를 다시 누르면 checked가 false로 돌아온다',
  afterSecond[2].checked === 'false',
  JSON.stringify(afterSecond[2]),
)

check(
  '콘솔 오류 없음',
  h.problems.length === 0,
  JSON.stringify(h.problems.slice(0, 2)),
)
h.close()
console.log(
  'NOTE  실제 스크린 리더 청취(NVDA·VoiceOver·TalkBack)는 이 스크립트로 검증하지 않았다 — 미검증',
)
