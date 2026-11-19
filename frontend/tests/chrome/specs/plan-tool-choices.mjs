// [chrome 회귀] W01-2 도구 선택 카드(S8-UI-1A)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S8-UI-1A Chrome 검증: W01-2 3단계 도구 선택 UI. 개발 서버 5199 + 실제 IndexedDB·sessionStorage. 프로젝트 소스는 수정하지 않는다.
//   node s8ui1a.mjs [A|B|C|D|ALL]
import { start, q } from '../lib/session.mjs'

const only = (process.argv[2] ?? 'ALL').toUpperCase()
const on = (g) => only === 'ALL' || only === g
const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const PLAN = '/records/exercise/plan'
const ORDER = ['덤벨', '맨몸', '밴드', '폼롤러', '마사지볼', '풀업 바']
const UNAVAILABLE = ['덤벨', '폼롤러', '마사지볼', '풀업 바']
const REASON = '초급 자동 추천에 쓸 수 있는 운동이 아직 없어요'

/** 3단계 카드 정보. 카드는 label이고 체크박스는 sr-only다. */
const cardsOf = (h) =>
  h.ev(`(()=>{
    const group=document.querySelector('main [role=group][aria-labelledby]');
    const labels=group?[...group.querySelectorAll('label')]:[];
    const heading=group?document.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim():null;
    return {heading, cards:labels.map(l=>{
      const i=l.querySelector('input[type=checkbox]');
      const cs=getComputedStyle(l);
      const lr=l.getBoundingClientRect();
      const nameEl=l.querySelector('span span');
      const nr=nameEl?nameEl.getBoundingClientRect():null;
      const ir=i.getBoundingClientRect();
      const note=i.getAttribute('aria-describedby')?document.getElementById(i.getAttribute('aria-describedby'))?.textContent.trim():null;
      return {
        name:(nameEl?.firstChild?.textContent||'').trim(),
        checked:i.checked,disabled:i.disabled,
        border:cs.borderTopColor,bg:cs.backgroundColor,bw:cs.borderTopWidth,cursor:cs.cursor,
        nameColor:nameEl?getComputedStyle(nameEl).color:null,
        mark:l.querySelector('[aria-hidden=true]')?.textContent.trim()??'',
        h:Math.round(lr.height),w:Math.round(lr.width),left:Math.round(lr.left),right:Math.round(lr.right),top:Math.round(lr.top),bottom:Math.round(lr.bottom),
        nameOffset:nr?Math.round(nr.left-lr.left):null,
        inputW:Math.round(ir.width),inputH:Math.round(ir.height),inputClass:i.className,
        note,hasLabel:!!(i.labels&&i.labels.length),
        textClipped:l.scrollWidth>l.clientWidth+1,
      }})}})()`)
const card = (info, name) => info.cards.find((c) => c.name === name)
const outline = (h, name) =>
  h.ev(
    `(()=>{const l=[...document.querySelectorAll('main [role=group] label')].find(x=>x.querySelector('span span')?.firstChild?.textContent.trim()===${q(name)});const c=getComputedStyle(l);return {style:c.outlineStyle,width:c.outlineWidth}})()`,
  )
const clickLabel = (h, name) =>
  h.ev(
    `[...document.querySelectorAll('main [role=group] label')].find(x=>x.querySelector('span span')?.firstChild?.textContent.trim()===${q(name)}).click()`,
  )
const resultIds = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>/beginner-plan/.test(k));if(!k)return null;return JSON.parse(sessionStorage.getItem(k)).session.resultIds})()`,
  )
const savedTools = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>/beginner-plan/.test(k));if(!k)return null;return JSON.parse(sessionStorage.getItem(k)).session.inputs.tools})()`,
  )
const equipOf = (h, ids) =>
  h.ev(
    `(async()=>{const m=await import('/src/exercise/seed/seedData.ts');const c=m.getSeedCatalog();return ${JSON.stringify(ids)}.map(id=>c.getExerciseById(id).equipment)})()`,
  )

/** 1·2단계를 채우고 3단계로 간다. minutes는 직접 입력이 아니라 프리셋(10·20·30)만 쓴다. */
async function toTools(h, mode = 'automatic', minutesLabel = '20분') {
  // 앞선 추천 세션이 남아 있으면 새로고침처럼 그 단계로 복원되므로, 처음부터 시작하려면 저장된 추천 상태를 지운다
  await h.ev(
    `Object.keys(sessionStorage).filter(k=>/beginner-plan/.test(k)).forEach(k=>sessionStorage.removeItem(k))`,
  )
  await h.go(`${PLAN}?mode=${mode}`, 1100)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(400)
  await h.ev(
    `[...document.querySelectorAll('main label')].find(l=>/운동 습관 만들기/.test(l.innerText)).click()`,
  )
  await h.sleep(250)
  await h.click('^다음$')
  await h.sleep(450)
  await h.ev(
    `[...document.querySelectorAll('main button')].find(b=>new RegExp('^'+${q(minutesLabel)}).test(b.innerText.trim()))?.click()`,
  )
  await h.sleep(250)
  await h.click('^다음$')
  await h.until(
    `!!document.querySelector('main [role=group] input[type=checkbox]')`,
    60,
  )
  await h.sleep(300)
}
const mouseClick = async (h, x, y) => {
  await h.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await h.cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  })
  await h.cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  })
  await h.sleep(250)
}

// ─── A. E01과 W01-2 도구 목록 ───────────────────────────────
if (on('A')) {
  const h = await start('s8ui1a-A')
  await h.vp(390, 844)
  console.log('--- A. E01 vs W01-2 도구 목록')
  await h.go('/exercises', 1100)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(400)
  await h.ev(
    `[...document.querySelectorAll('main button')].find(b=>/운동 도구/.test(b.innerText)).click()`,
  )
  await h.sleep(600)
  const e01 = await h.ev(
    `(()=>{const d=document.querySelector('[role=dialog]');return d?[...d.querySelectorAll('button')].map(b=>b.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean):[]})()`,
  )
  console.log('  E01 도구 선택지:', JSON.stringify(e01))
  check(
    'A-1 E01 운동 도구 필터: 전체 + 6종(덤벨·맨몸·밴드·폼롤러·마사지볼·풀업 바)',
    JSON.stringify(e01) === JSON.stringify(['전체', ...ORDER]),
  )
  await h.login('free')
  await toTools(h)
  const w = await cardsOf(h)
  const names = w.cards.map((c) => c.name)
  console.log('  W01-2 도구 카드:', JSON.stringify(names))
  check(
    'A-2 W01-2 도구 카드가 E01 도구 목록과 같은 이름·같은 순서(6장)',
    JSON.stringify(names) === JSON.stringify(e01.filter((x) => x !== '전체')),
    JSON.stringify(names),
  )
  check(
    'A-3 카드 중복 없음, 단계 제목이 도구 묶음의 이름',
    new Set(names).size === names.length &&
      w.heading === '사용할 수 있는 운동 도구가 있나요?',
    String(w.heading),
  )
  check(
    'A-4 선택 가능은 맨몸(항상)·밴드뿐이고 나머지 4종은 선택 불가(이유 표시)',
    w.cards
      .filter((c) => !c.disabled)
      .map((c) => c.name)
      .join() === '밴드' &&
      UNAVAILABLE.every(
        (n) => card(w, n).disabled && card(w, n).note === REASON,
      ) &&
      card(w, '맨몸').disabled &&
      card(w, '맨몸').checked,
  )
  check(
    'A-5 기본 선택은 맨몸뿐(밴드·나머지는 해제)',
    JSON.stringify((await savedTools(h)) ?? ['맨몸']) ===
      JSON.stringify(['맨몸']) && !card(w, '밴드').checked,
  )
  check(
    'A-6 콘솔 오류 없음',
    h.problems.length === 0,
    JSON.stringify(h.problems.slice(0, 2)),
  )
  h.close()
}

// ─── B. 카드 UI·접근성 ─────────────────────────────────────
if (on('B')) {
  const h = await start('s8ui1a-B')
  await h.vp(390, 844)
  await h.login('free')
  await toTools(h)
  console.log('--- B. 선택 카드 UI·접근성')
  let w = await cardsOf(h)
  const all = w.cards
  check(
    'B-1 왼쪽 체크박스가 보이지 않는다: 체크박스는 sr-only(1px)이고 도구명이 카드 왼쪽 안쪽 여백에서 시작한다',
    all.every(
      (c) =>
        c.inputW <= 1 &&
        c.inputH <= 1 &&
        /sr-only/.test(c.inputClass) &&
        c.nameOffset >= 14 &&
        c.nameOffset <= 24,
    ),
    JSON.stringify(all.map((c) => [c.name, c.inputW, c.nameOffset])),
  )
  check(
    'B-2 모든 카드의 터치 영역 높이 ≥ 44px, 폭은 같은 카드 폭',
    all.every((c) => c.h >= 44) && new Set(all.map((c) => c.w)).size === 1,
    JSON.stringify(all.map((c) => c.h)),
  )
  const bandBefore = card(w, '밴드')
  check(
    'B-3 선택 전: 기본 테두리·배경, ✓ 없음',
    bandBefore.mark === '' && bandBefore.bw === '2px' && !bandBefore.checked,
    JSON.stringify([bandBefore.border, bandBefore.bg]),
  )
  await clickLabel(h, '밴드')
  await h.sleep(250)
  w = await cardsOf(h)
  const bandAfter = card(w, '밴드')
  check(
    'B-4 선택 후: 브랜드 색 테두리·연한 배경·도구명 강조·오른쪽 ✓, 체크 상태 true',
    bandAfter.checked &&
      bandAfter.mark === '✓' &&
      bandAfter.border !== bandBefore.border &&
      bandAfter.bg !== bandBefore.bg &&
      bandAfter.nameColor !== bandBefore.nameColor &&
      bandAfter.border === 'rgb(79, 70, 229)',
    JSON.stringify([bandAfter.border, bandAfter.bg, bandAfter.nameColor]),
  )
  check(
    'B-5 선택 상태는 색만이 아니다: 테두리 굵기 유지 + ✓ 글자 + 체크박스 상태(보조기기)',
    bandAfter.bw === '2px' && bandAfter.mark === '✓',
  )
  await clickLabel(h, '밴드')
  await h.sleep(250)
  w = await cardsOf(h)
  check(
    'B-6 다시 누르면 해제되고 처음 모양으로 돌아온다',
    !card(w, '밴드').checked &&
      card(w, '밴드').border === bandBefore.border &&
      card(w, '밴드').mark === '',
  )
  // 카드 전체가 선택 영역: 카드 오른쪽 끝 근처를 마우스로 누른다
  const b0 = card(w, '밴드')
  await mouseClick(h, b0.right - 8, Math.round((b0.top + b0.bottom) / 2))
  w = await cardsOf(h)
  check(
    'B-7 카드 가장자리(오른쪽 끝)를 눌러도 선택된다(전체 영역이 선택 영역)',
    card(w, '밴드').checked,
  )
  const ringAfterMouse = await outline(h, '밴드')
  check(
    'B-8 마우스로 누른 뒤에는 키보드용 포커스 바깥선이 보이지 않는다(:focus-visible만)',
    ringAfterMouse.style === 'none' || ringAfterMouse.width === '0px',
    JSON.stringify(ringAfterMouse),
  )
  await mouseClick(h, b0.right - 8, Math.round((b0.top + b0.bottom) / 2))
  // 선택 불가 카드를 눌러도 아무 일이 없다
  const sel0 = JSON.stringify(
    (await cardsOf(h)).cards.map((c) => [c.name, c.checked]),
  )
  for (const n of UNAVAILABLE) await clickLabel(h, n)
  await h.sleep(250)
  const sel1 = JSON.stringify(
    (await cardsOf(h)).cards.map((c) => [c.name, c.checked]),
  )
  check(
    'B-9 선택 불가 4종을 눌러도 상태가 바뀌지 않고, 저장된 도구도 맨몸뿐이다',
    sel0 === sel1 &&
      JSON.stringify(await savedTools(h)) === JSON.stringify(['맨몸']),
    sel1,
  )
  // 키보드: 단계 제목(h1)에 포커스를 둔 곳에서 시작해 순차 이동한다(마우스로 누른 위치의 영향을 받지 않게 한다)
  const stopLabel = () =>
    h.ev(
      `(()=>{const e=document.activeElement;const l=e.closest('label');return (l?l.querySelector('span span')?.firstChild?.textContent.trim():(e.getAttribute('aria-label')||e.innerText||e.tagName).trim().slice(0,14))})()`,
    )
  await h.ev(`window.scrollTo(0,0);document.querySelector('main h1').focus()`)
  const stops = []
  for (let i = 0; i < 3; i++) {
    await h.press('Tab', 'Tab', 9)
    stops.push(await stopLabel())
  }
  console.log('  Tab 순서(제목 다음):', JSON.stringify(stops))
  check(
    'B-10 Tab 순서: 제목 → 밴드(선택 가능한 카드) → 운동 추천받기 — 덤벨·맨몸·선택 불가 카드는 건너뛴다',
    stops[0] === '밴드' && /운동 추천받기/.test(stops[1] ?? ''),
    JSON.stringify(stops),
  )
  await h.ev(`window.scrollTo(0,0);document.querySelector('main h1').focus()`)
  await h.press('Tab', 'Tab', 9)
  const ring = await outline(h, '밴드')
  check(
    'B-11 키보드 포커스: 밴드 카드에 바깥선(2px)이 보인다',
    ring.style !== 'none' && ring.width === '2px',
    JSON.stringify(ring),
  )
  await h.press(' ', 'Space', 32)
  check(
    'B-12 Space로 선택된다',
    card(await cardsOf(h), '밴드').checked &&
      JSON.stringify(await savedTools(h)) === JSON.stringify(['맨몸', '밴드']),
  )
  await h.press(' ', 'Space', 32)
  check(
    'B-13 Space로 다시 누르면 해제된다',
    !card(await cardsOf(h), '밴드').checked,
  )
  // 보조기기용 정보
  w = await cardsOf(h)
  check(
    'B-14 보조기기: 모든 체크박스에 label(이름)이 연결되고, 선택 불가는 disabled + 이유 설명이 연결, 맨몸은 checked+disabled',
    w.cards.every((c) => c.hasLabel) &&
      UNAVAILABLE.every(
        (n) => card(w, n).disabled && card(w, n).note === REASON,
      ) &&
      card(w, '맨몸').checked &&
      card(w, '맨몸').disabled,
  )
  check(
    'B-15 도구 묶음은 role=group이고 단계 제목(h1)이 이름이다',
    w.heading === '사용할 수 있는 운동 도구가 있나요?',
  )
  check(
    'B-16 콘솔 오류 없음',
    h.problems.length === 0,
    JSON.stringify(h.problems.slice(0, 2)),
  )
  h.close()
}

// ─── C. 선택값 유지·복원·추천 반영 ──────────────────────────
if (on('C')) {
  const h = await start('s8ui1a-C')
  await h.vp(390, 844)
  await h.login('free')
  console.log('--- C. 선택값 유지·복원')
  await toTools(h)
  await clickLabel(h, '밴드')
  await h.sleep(250)
  check(
    'C-1 밴드 선택이 저장 상태(도구)에 반영된다',
    JSON.stringify(await savedTools(h)) === JSON.stringify(['맨몸', '밴드']),
  )
  await h.click('^이전')
  await h.sleep(500)
  check(
    'C-2 이전 단계(2단계: 시간)로 이동하고 20분이 그대로다',
    /2\/3단계/.test(await h.text()) &&
      (await h.ev(
        `[...document.querySelectorAll('main button')].find(b=>/20분/.test(b.innerText.trim()))?.getAttribute('aria-pressed')`,
      )) === 'true',
  )
  await h.click('^다음$')
  await h.until(
    `!!document.querySelector('main [role=group] input[type=checkbox]')`,
    40,
  )
  await h.sleep(300)
  check(
    'C-3 다시 3단계로 오면 밴드 선택이 유지된다',
    card(await cardsOf(h), '밴드').checked,
  )
  await h.ev(`location.reload()`)
  await h.sleep(1500)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(500)
  const restored = await cardsOf(h)
  check(
    'C-4 새로고침 후 3단계로 복원되고 밴드 선택이 유지된다',
    restored.cards.length === 6 &&
      card(restored, '밴드')?.checked &&
      card(restored, '맨몸')?.checked,
    JSON.stringify(restored.cards.map((c) => [c.name, c.checked])),
  )
  check(
    'C-5 하단 고정 버튼 "운동 추천받기"가 활성이다(도구는 필수가 아니다)',
    (await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/운동 추천받기/.test(b.innerText))?.getAttribute('aria-disabled')`,
    )) === 'false',
  )

  console.log('--- C. 추천 반영(전체 자동 추천, 180분이 아니라 30분 프리셋)')
  // 밴드 선택 상태에서 추천 → 결과 → 다시 추천받기를 반복해 밴드 운동이 들어오는지 확인한다
  await h.click('운동 추천받기')
  await h.until(
    `!!document.querySelector('main [data-plan-result], main h1') && /이 운동으로 목록 확인하기/.test(document.querySelector('main').innerText)`,
    80,
  )
  await h.sleep(400)
  let withBandSeen = false
  let ids = await resultIds(h)
  let seen = []
  for (let i = 0; i < 8 && !withBandSeen; i++) {
    ids = await resultIds(h)
    const eq = await equipOf(h, ids ?? [])
    seen.push(eq.map((e) => e.join('+')))
    if (eq.some((e) => e.includes('밴드'))) withBandSeen = true
    else {
      await h.click('다시 추천받기')
      await h.sleep(600)
    }
  }
  check(
    'C-6 밴드를 고른 추천 결과에 밴드 운동이 들어온다(선택이 실제 추천에 반영)',
    withBandSeen,
    JSON.stringify(seen.slice(0, 3)),
  )
  check(
    'C-7 추천된 운동의 도구는 모두 선택한 도구(맨몸·밴드) 안에 있다',
    (await equipOf(h, ids ?? [])).every((e) =>
      e.every((t) => t === '맨몸' || t === '밴드'),
    ),
  )
  // 확정 → W11 → 저장 → W01
  await h.click('이 운동으로 목록 확인하기')
  await h.until(`location.pathname==='/records/exercise/review'`, 80)
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/오늘의 운동으로 저장/.test(b.innerText)&&b.getAttribute('aria-disabled')!=='true')`,
    120,
  )
  check(
    'C-8 결과 → W11(최종 검토)로 이동하고 저장 버튼이 활성이다',
    (await h.path()) === '/records/exercise/review',
  )
  await h.click('오늘의 운동으로 저장')
  await h.until(`location.pathname==='/records/exercise'`, 80)
  await h.sleep(700)
  check(
    'C-9 저장 → W01(운동 기록)로 이동한다',
    (await h.path()) === '/records/exercise' &&
      /운동 기록/.test(await h.text()),
  )

  // 맨몸만: 도구를 고르지 않고 추천(새 세션) — 결과는 모두 맨몸
  await toTools(h)
  await h.click('운동 추천받기')
  await h.until(
    `/이 운동으로 목록 확인하기/.test(document.querySelector('main').innerText)`,
    80,
  )
  await h.sleep(300)
  let bodyOnly = true
  const seenBody = []
  for (let i = 0; i < 6; i++) {
    const eq = await equipOf(h, (await resultIds(h)) ?? [])
    seenBody.push(eq.length)
    if (!eq.length || eq.some((e) => e.some((t) => t !== '맨몸')))
      bodyOnly = false
    await h.click('다시 추천받기')
    await h.sleep(500)
  }
  check(
    'C-10 도구를 고르지 않으면(맨몸만) 6번 다시 추천받아도 맨몸 운동만 나온다',
    bodyOnly,
    JSON.stringify(seenBody),
  )

  // 직접 선택 자동 설정: 선택한 도구가 4단계의 "자동 구성 가능 여부"에 반영된다
  console.log('--- C. 직접 선택 자동 설정')
  await h.ev(
    `(async()=>{const S=await import('/src/exercise/recommend/planStorage.ts');const F=await import('/src/exercise/recommend/planFlow.ts');return S.savePlanSession('free',{step:'conditions',inputs:{...F.initialInputs('selected'),purpose:'learn',minutes:20,selectedIds:['1','4'],tools:['맨몸']},replacingId:null,resultIds:null})})()`,
  )
  await h.go(`${PLAN}?mode=selected`, 1200)
  await h.until(`!!document.querySelector('main h1')`, 60)
  await h.sleep(600)
  let txt = await h.text()
  check(
    'C-11 직접 선택 4단계(도구 없이): 밴드 로우는 "선택하지 않은 운동 도구가 필요"로 구성 불가, 월 푸시업은 구성 가능',
    /밴드 로우/.test(txt) &&
      /선택하지 않은 운동 도구가 필요한 운동이에요/.test(txt) &&
      /월 푸시업/.test(txt) &&
      /자동으로 구성할 수 있어요/.test(txt),
    txt.replace(/\n+/g, ' ').slice(0, 260),
  )
  await h.click('^이전')
  await h.sleep(500)
  await h.until(
    `!!document.querySelector('main [role=group] input[type=checkbox]')`,
    40,
  )
  await clickLabel(h, '밴드')
  await h.sleep(250)
  await h.click('^다음$')
  await h.sleep(600)
  txt = await h.text()
  check(
    'C-12 3단계에서 밴드를 고르고 4단계로 오면 밴드 로우도 "자동으로 구성할 수 있어요"로 바뀐다(선택이 반영)',
    !/선택하지 않은 운동 도구가 필요한 운동이에요/.test(txt) &&
      (txt.match(/자동으로 구성할 수 있어요/g) ?? []).length >= 2,
    txt.replace(/\n+/g, ' ').slice(0, 260),
  )
  await h.click('세트와 목표 자동으로 정하기')
  await h.until(
    `/이 운동으로 목록 확인하기/.test(document.querySelector('main').innerText)`,
    80,
  )
  const ids2 = (await resultIds(h)) ?? []
  check(
    'C-13 직접 선택 자동 설정 결과에 고른 두 운동(밴드 로우·월 푸시업)이 모두 들어간다',
    JSON.stringify([...ids2].sort()) === JSON.stringify(['1', '4']),
    JSON.stringify(ids2),
  )
  check(
    'C-14 콘솔 오류 없음',
    h.problems.length === 0,
    JSON.stringify(h.problems.slice(0, 2)),
  )
  h.close()
}

// ─── D. 반응형 ─────────────────────────────────────────────
if (on('D')) {
  const h = await start('s8ui1a-D')
  await h.login('free')
  console.log('--- D. 반응형')
  for (const [w, hgt] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [768, 1024],
    [1280, 900],
  ]) {
    await h.vp(w, hgt)
    await toTools(h)
    const info = await cardsOf(h)
    const m = await h.ev(
      `(()=>{const d=document.documentElement;return {over:d.scrollWidth-d.clientWidth,vw:d.clientWidth}})()`,
    )
    check(
      `D-1 ${w}px: 가로 스크롤 없음, 카드 6장이 모두 화면 폭 안, 텍스트 잘림 없음`,
      m.over <= 0 &&
        info.cards.length === 6 &&
        info.cards.every(
          (c) => c.left >= 0 && c.right <= m.vw && !c.textClipped,
        ),
      JSON.stringify({
        over: m.over,
        vw: m.vw,
        lr: info.cards.map((c) => [c.left, c.right]).slice(0, 2),
      }),
    )
    const gaps = info.cards.slice(1).map((c, i) => c.top - info.cards[i].bottom)
    check(
      `D-2 ${w}px: 카드 사이 간격이 일정하다(12px)`,
      gaps.every((g) => g === gaps[0]) && gaps[0] === 12,
      JSON.stringify(gaps),
    )
    // 맨 아래까지 스크롤: 마지막 카드와 고정 CTA가 겹치지 않는다
    await h.ev(`window.scrollTo(0,document.documentElement.scrollHeight)`)
    await h.sleep(300)
    const ov = await h.ev(
      `(()=>{const labels=[...document.querySelectorAll('main [role=group] label')];const last=labels[labels.length-1].getBoundingClientRect();const note=[...document.querySelectorAll('main p')].find(p=>/도구 없이 하는 운동/.test(p.innerText))?.getBoundingClientRect();const cta=[...document.querySelectorAll('main button')].find(b=>/운동 추천받기/.test(b.innerText)).closest('div.sticky').getBoundingClientRect();return {lastBottom:Math.round(last.bottom),noteBottom:Math.round(note?.bottom??0),ctaTop:Math.round(cta.top)}})()`,
    )
    check(
      `D-3 ${w}px: 맨 아래로 스크롤하면 마지막 카드(풀업 바)와 안내 문구가 고정 버튼 위에 있다(겹침 없음)`,
      ov.noteBottom <= ov.ctaTop && ov.lastBottom <= ov.ctaTop,
      JSON.stringify(ov),
    )
    // 작은 화면에서도 선택 가능한 도구를 고를 수 있다
    await h.ev(`window.scrollTo(0,0)`)
    await clickLabel(h, '밴드')
    await h.sleep(250)
    check(
      `D-4 ${w}px: 밴드를 선택할 수 있다`,
      card(await cardsOf(h), '밴드').checked,
    )
    await h.shot(`tools-${w}.png`, false)
  }
  check(
    'D-5 콘솔 오류 없음',
    h.problems.length === 0,
    JSON.stringify(h.problems.slice(0, 2)),
  )
  h.close()
}

const fails = results.filter((r) => !r.ok)
console.log(
  `\n=== S8-UI-1A Chrome(${only}): ${results.length - fails.length}/${results.length} 통과, 실패 ${fails.length} ===`,
)
process.exit(fails.length ? 1 : 0)
