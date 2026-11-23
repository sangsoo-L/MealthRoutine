// [chrome 회귀] 비회원 AI 서비스 화면(/ai) 리디자인: 구성 순서 · 운동·식단 카드(식단은 준비 중) · 진입 통합(/ai/exercise·로그인 각 한 번) · 공통 글자·모서리 토큰의 실제 계산값(/explore와 비교) ·
// 삽화 크기·접근성 · 접이식 이용 안내(키보드) · 로그인 후 주간 리포트 복귀 · 390/320/195/160px·글자 200%의 가로 스크롤·겹침·하단 메뉴 가림
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only ai-landing`. 상세: tests/chrome/README.md
// 비회원 화면만 다룬다(회원 허브는 ai-hub 스펙). 개발용 모의 계정은 로그인 복귀 확인에만 쓴다.
import { ACCOUNTS, start } from '../lib/session.mjs'
import { mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const q = JSON.stringify

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(h, `${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

const open = async (h) => {
  await h.go('/ai', 300)
  await mustUntil(h, `!!document.querySelector('[data-ai-preview]')`, 80)
}

await scenario('A-structure', async (h) => {
  await open(h)
  const info = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const t = main.innerText
    const at = (s) => t.indexOf(s)
    const card = (sel) => main.querySelector(sel)
    return {
      h1: [...main.querySelectorAll('h1')].map((e) => e.innerText.trim()),
      lead: main.querySelector('h1').nextElementSibling.innerText.trim(),
      text: t,
      order: ['AI 코칭', 'AI 운동 플랜', 'AI 식단 추천', '기록을 더 쉽게', '주간 기록 리포트', '음식 사진 분석', '이용 방법과 체험 안내', '의료적 진단', '회원가입'].map(at),
      links: [...main.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      exercise: card('[data-ai-preview]').innerText.replace(/\\s+/g, ' '),
      exerciseInner: card('[data-ai-preview]').querySelectorAll('a,button').length,
      meal: card('[data-ai-feature="meal"]').innerText.replace(/\\s+/g, ' '),
      mealControls: card('[data-ai-feature="meal"]').querySelectorAll('a,button').length,
      mealCursor: getComputedStyle(card('[data-ai-feature="meal"]')).cursor,
      weekly: card('[data-ai-feature="weekly"]').innerText.replace(/\\s+/g, ' '),
      weeklyName: card('[data-ai-feature="weekly"]').textContent.replace(/\\s+/g, ' '),
      photo: card('[data-ai-feature="photo"]').innerText.replace(/\\s+/g, ' '),
      photoControls: card('[data-ai-feature="photo"]').querySelectorAll('a,button').length,
      photoCursor: getComputedStyle(card('[data-ai-feature="photo"]')).cursor,
      oldItems: /제공 예정|준비 중인 AI 기능|월 푸시업|글루트|플랭크|고정 예시 보기/.test(t),
    }
  })()`)
  check(
    h,
    'A1. 제목은 "AI 코칭" 하나이고 한 줄 설명이 있다(큰 소개 카드·"제공 예정"·운동명 목록 없음)',
    JSON.stringify(info.h1) === q(['AI 코칭']) &&
      info.lead === '운동 플랜을 미리 보고, 한 주의 기록을 확인해요.' &&
      !info.oldItems,
  )
  check(
    h,
    'A2. 구성 순서: 제목 → 운동 → 식단 → 기록을 더 쉽게(리포트·사진) → 이용 안내 → 의료 안내 → 가입',
    info.order.every((i) => i >= 0) &&
      info.order.every((v, i, a) => i === 0 || v > a[i - 1]),
    JSON.stringify(info.order),
  )
  check(
    h,
    'A3. 이동은 고정 예시·로그인·회원가입 각 한 번뿐이다(회원 전용 화면 링크 없음)',
    JSON.stringify(info.links) === q(['/ai/exercise', '/login', '/signup']),
    JSON.stringify(info.links),
  )
  check(
    h,
    'A4. 운동 카드: 고정 예시 배지·맨몸 · 10분 · 초급·예시 보기, 카드 안에 링크·버튼 중첩 없음',
    /AI 운동 플랜/.test(info.exercise) &&
      /고정 예시/.test(info.exercise) &&
      /맨몸 · 10분 · 초급/.test(info.exercise) &&
      /예시 보기/.test(info.exercise) &&
      info.exerciseInner === 0,
    JSON.stringify(info),
  )
  check(
    h,
    'A5. 식단 카드: 준비 중·목표에 맞춘 내일 식단, 링크·버튼·클릭 커서 없음',
    /AI 식단 추천/.test(info.meal) &&
      /준비 중/.test(info.meal) &&
      /목표에 맞춘 내일 식단/.test(info.meal) &&
      info.mealControls === 0 &&
      info.mealCursor !== 'pointer',
  )
  check(
    h,
    'A6. 카드 아래 안내: 운동 플랜은 고정 예시, 실제 AI 추천은 준비 중',
    /운동 플랜은 고정 예시예요\. 실제 AI 추천은 준비 중이에요\./.test(
      info.text,
    ),
  )
  check(
    h,
    'A7. 주간 리포트 행: 기본 무료·AI 없이 제공 · 로그인 후 이용, 접근성 이름에 로그인하고 리포트 보기',
    /기본 무료/.test(info.weekly) &&
      /AI 없이 제공 · 로그인 후 이용/.test(info.weekly) &&
      /로그인하고 리포트 보기/.test(info.weeklyName) &&
      !/\d+\s*점|\d+\s*일/.test(info.weekly),
  )
  check(
    h,
    'A8. 음식 사진 분석 행: 사진을 식단 입력 초안으로·준비 중, 링크·버튼·클릭 커서 없음',
    /사진을 식단 입력 초안으로/.test(info.photo) &&
      /준비 중/.test(info.photo) &&
      info.photoControls === 0 &&
      info.photoCursor !== 'pointer',
  )
  check(
    h,
    'A9. 의료 안내가 페이지 하단에 있다',
    /의료적 진단을 대신하지 않아요/.test(info.text),
  )
})

await scenario('B-design-tokens', async (h) => {
  await open(h)
  const ai = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const px = (e) => parseFloat(getComputedStyle(e).fontSize)
    const w = (e) => getComputedStyle(e).fontWeight
    const rad = (e) => parseFloat(getComputedStyle(e).borderTopLeftRadius)
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    const find = (root, text) => [...root.querySelectorAll('*')].find((e) => own(e) === text)
    const exercise = main.querySelector('[data-ai-preview]')
    const meal = main.querySelector('[data-ai-feature="meal"]')
    const weekly = main.querySelector('[data-ai-feature="weekly"]')
    const list = weekly.closest('ul')
    const summary = main.querySelector('[data-ai-guide] summary span')
    const rowTitle = find(weekly, '주간 기록 리포트')
    return {
      h1: [px(main.querySelector('h1')), w(main.querySelector('h1'))],
      lead: [px(main.querySelector('h1').nextElementSibling), w(main.querySelector('h1').nextElementSibling)],
      section: [px(main.querySelector('#ai-records-title')), w(main.querySelector('#ai-records-title'))],
      cardTitle: [px(find(exercise, 'AI 운동 플랜')), px(find(meal, 'AI 식단 추천'))],
      rowTitle: [px(rowTitle), w(rowTitle)],
      note: px([...main.querySelectorAll('p')].find((p) => /고정 예시예요/.test(p.innerText))),
      badges: [px(find(exercise, '고정 예시')), px(find(meal, '준비 중')), px(find(weekly, '기본 무료'))],
      sub: px(find(weekly, 'AI 없이 제공 · 로그인 후 이용')),
      cta: px(find(exercise, '예시 보기')),
      summary: px(summary),
      radius: [rad(exercise), rad(meal), rad(list), rad(main.querySelector('[data-ai-guide]'))],
      fontFamily: getComputedStyle(main).fontFamily.slice(0, 40),
    }
  })()`)
  await h.go('/explore', 400)
  await mustUntil(h, `!!document.querySelector('main')`, 60)
  const explore = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const els = [...main.querySelectorAll('*')].filter((e) => e.children.length === 0)
    // 보조기기용 숨김 제목(h1)과 눈에 보이는 제목이 모두 '탐색'이라, 눈에 보이는 가장 큰 글자를 제목으로 본다.
    const titles = els.filter((e) => e.textContent.trim() === '탐색' && e.getBoundingClientRect().width > 1)
    const title = titles.sort((x, y) => parseFloat(getComputedStyle(y).fontSize) - parseFloat(getComputedStyle(x).fontSize))[0]
    const section = els.find((e) => /무엇부터 찾아볼지/.test(e.textContent))
    const px = (e) => parseFloat(getComputedStyle(e).fontSize)
    return { title: title ? px(title) : null, section: section ? px(section) : null, family: getComputedStyle(main).fontFamily.slice(0, 40) }
  })()`)
  check(
    h,
    'B1. 페이지 제목 22px·600이고 /explore 제목과 같은 크기다',
    ai.h1[0] === 22 && ai.h1[1] === '600' && ai.h1[0] === explore.title,
    JSON.stringify({ ai: ai.h1, explore: explore.title }),
  )
  check(
    h,
    'B2. 섹션 제목 15px·600이고 /explore 섹션 제목과 같은 크기다',
    ai.section[0] === 15 &&
      ai.section[1] === '600' &&
      ai.section[0] === explore.section,
    JSON.stringify({ ai: ai.section, explore: explore.section }),
  )
  check(
    h,
    'B3. 카드 제목 15px',
    ai.cardTitle[0] === 15 && ai.cardTitle[1] === 15,
    JSON.stringify(ai.cardTitle),
  )
  check(
    h,
    'B4. 설명·행 제목·행동 문구·접기 제목 14px(행 제목 600, 설명 400), 안내 14px',
    ai.lead[0] === 14 &&
      ai.lead[1] === '400' &&
      ai.rowTitle[0] === 14 &&
      ai.rowTitle[1] === '600' &&
      ai.cta === 14 &&
      ai.summary === 14 &&
      ai.note === 14,
    JSON.stringify(ai),
  )
  check(
    h,
    'B5. 배지·짧은 보조 정보 12px',
    ai.badges.every((v) => v === 12) && ai.sub === 12,
    JSON.stringify({ badges: ai.badges, sub: ai.sub }),
  )
  check(
    h,
    'B6. 카드·목록·접기 모서리가 공통 12px다',
    ai.radius.every((v) => v === 12),
    JSON.stringify(ai.radius),
  )
  check(
    h,
    'B7. 글꼴이 /explore와 같다(Paperlogy)',
    ai.fontFamily === explore.family && /Paperlogy/i.test(ai.fontFamily),
    JSON.stringify({ ai: ai.fontFamily, explore: explore.family }),
  )
})

await scenario('C-illustration-and-colors', async (h) => {
  await open(h)
  await h.sleep(500)
  const r = await h.ev(`(()=>{
    const img = document.querySelector('[data-ai-hero]')
    const b = img.getBoundingClientRect()
    const meal = document.querySelector('[data-ai-feature="meal"]')
    const exercise = document.querySelector('[data-ai-preview]')
    const bg = (e) => getComputedStyle(e).backgroundColor
    const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ') + ')' }
    return { w: Math.round(b.width), h: Math.round(b.height), ratio: +(b.width / b.height).toFixed(3), natural: +(img.naturalWidth / img.naturalHeight).toFixed(3), loaded: img.complete && img.naturalWidth > 0, alt: img.getAttribute('alt'), hidden: img.getAttribute('aria-hidden'),
      exBg: bg(exercise), mealBg: bg(meal), expectEx: rgb('#EEF2FF'), expectMeal: rgb('#FFF7ED'),
      exIcon: getComputedStyle(exercise.querySelector('svg')).color, mealIcon: getComputedStyle(meal.querySelector('svg')).color }
  })()`)
  check(
    h,
    'C1. 390px: 삽화 약 88px·원본 비율 유지·장식(alt 빈 값, aria-hidden)',
    r.loaded &&
      r.w === 88 &&
      Math.abs(r.ratio - r.natural) < 0.02 &&
      r.alt === '' &&
      r.hidden === 'true',
    JSON.stringify(r),
  )
  check(
    h,
    'C2. 운동 카드는 연한 인디고, 식단 카드는 연한 앰버 배경이고 아이콘은 영역색이다',
    r.exBg === r.expectEx &&
      r.mealBg === r.expectMeal &&
      r.exIcon === 'rgb(79, 70, 229)' &&
      r.mealIcon === 'rgb(180, 83, 9)',
    JSON.stringify(r),
  )
  const cols = await h.ev(
    `(()=>{ const a = document.querySelector('[data-ai-preview]').getBoundingClientRect(); const b = document.querySelector('[data-ai-feature="meal"]').getBoundingClientRect(); return { sameRow: Math.abs(a.top - b.top) < 1, gap: Math.round(b.left - a.right), sameHeight: Math.abs(a.height - b.height) < 1 } })()`,
  )
  check(
    h,
    'C3. 390px: 두 카드가 나란히(간격 12px)이고 높이가 같다',
    cols.sameRow && cols.gap === 12 && cols.sameHeight,
    JSON.stringify(cols),
  )
  await h.vp(320, 640)
  await h.sleep(300)
  const small = await h.ev(`(()=>{
    const a = document.querySelector('[data-ai-preview]').getBoundingClientRect(); const b = document.querySelector('[data-ai-feature="meal"]').getBoundingClientRect()
    const img = document.querySelector('[data-ai-hero]').getBoundingClientRect()
    const row = document.querySelector('[data-ai-preview]')
    const icon = row.querySelector('svg').getBoundingClientRect(); const title = [...row.querySelectorAll('span')].find((e) => e.textContent.trim() === 'AI 운동 플랜').getBoundingClientRect()
    return { stacked: b.top > a.bottom, w: Math.round(img.width), iconLeftOfTitle: icon.right <= title.left + 1, cardH: Math.round(a.height) }
  })()`)
  check(
    h,
    'C4. 320px: 삽화 약 72px, 카드는 세로로 쌓이고 아이콘이 내용 왼쪽에 놓인다(가로 배치, 큰 빈 공간 없음)',
    small.stacked &&
      small.w === 72 &&
      small.iconLeftOfTitle &&
      small.cardH < 140,
    JSON.stringify(small),
  )
})

await scenario('D-first-screen', async (h) => {
  for (const [w, hgt] of [
    [390, 844],
    [320, 640],
  ]) {
    await h.vp(w, hgt)
    await open(h)
    const r = await h.ev(`(()=>{
      const nav = document.querySelector('nav').getBoundingClientRect()
      const rect = (s) => document.querySelector(s).getBoundingClientRect()
      return { navTop: nav.top, exercise: rect('[data-ai-preview]').bottom, meal: rect('[data-ai-feature="meal"]').bottom, weeklyTop: rect('[data-ai-login-note]').top, weeklyBottom: rect('[data-ai-login-note]').bottom }
    })()`)
    if (w === 390)
      check(
        h,
        'D1. 390×844: 운동·식단 카드와 주간 리포트 행이 첫 화면(하단 메뉴 위)에 보인다',
        r.exercise <= r.navTop &&
          r.meal <= r.navTop &&
          r.weeklyBottom <= r.navTop,
        JSON.stringify(r),
      )
    else
      check(
        h,
        'D2. 320px: 운동 카드가 첫 화면에 보이고 주간 리포트 행은 스크롤로 이어진다(내용을 자르지 않음)',
        r.exercise <= r.navTop,
        JSON.stringify(r),
      )
  }
})

await scenario('E-guide-keyboard', async (h) => {
  await open(h)
  check(
    h,
    'E1. 이용 방법과 체험 안내는 처음에 접혀 있다',
    (await h.ev(`document.querySelector('[data-ai-guide]').open`)) === false,
  )
  await h.ev(`document.querySelector('[data-ai-guide] summary').focus()`)
  check(
    h,
    'E2. summary가 키보드 포커스를 받는다',
    await h.ev(
      `document.activeElement === document.querySelector('[data-ai-guide] summary')`,
    ),
  )
  await h.press('Enter', 'Enter', 13)
  await h.sleep(200)
  const opened = await h.ev(
    `(()=>{ const d = document.querySelector('[data-ai-guide]'); return { open: d.open, text: d.innerText, body: parseFloat(getComputedStyle(d.querySelector('ul li')).fontSize) } })()`,
  )
  check(
    h,
    'E3. Enter로 펼치면 이용 흐름·무료 범위·최초 5회·식단 목표 조건·사진 로그인 조건·준비 중 안내가 14px로 보인다',
    opened.open &&
      ['로그인', '조건 선택', '초안 수정', '기록·회고'].every((t) =>
        opened.text.includes(t),
      ) &&
      /기본 기록과 기본 주간 리포트는 무료예요/.test(opened.text) &&
      /무료 AI 체험은 가입 후 최초 5회이고 월간 초기화는 없어요/.test(
        opened.text,
      ) &&
      /식단 목표가 있어야 이용할 수 있고/.test(opened.text) &&
      /로그인한 회원만 이용할 수 있어요/.test(opened.text) &&
      /준비 중이에요/.test(opened.text) &&
      opened.body === 14,
    JSON.stringify(opened.body),
  )
  await h.press(' ', 'Space', 32)
  await h.sleep(200)
  check(
    h,
    'E4. Space로 다시 접힌다',
    (await h.ev(`document.querySelector('[data-ai-guide]').open`)) === false,
  )
  check(
    h,
    'E5. 접기 영역의 클릭 높이는 44px 이상이다',
    (await h.ev(
      `Math.round(document.querySelector('[data-ai-guide] summary').getBoundingClientRect().height)`,
    )) >= 44,
  )
})

await scenario('F-navigation', async (h) => {
  await open(h)
  await h.ev(`document.querySelector('[data-ai-example-link]').click()`)
  await waitPath(h, '^/ai/exercise$')
  await mustUntil(
    h,
    `[...document.querySelectorAll('main a')].some((a)=>/^이전/.test(a.innerText.trim()))`,
    100,
  )
  const back = await h.ev(
    `[...document.querySelectorAll('main a')].find((a)=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
  )
  check(
    h,
    'F1. 운동 카드 → /ai/exercise, "이전"은 /ai',
    back === '/ai',
    String(back),
  )
  await open(h)
  await h.ev(`document.querySelector('a[href="/signup"]').click()`)
  await waitPath(h, '^/signup$')
  check(h, 'F2. 회원가입 링크가 /signup으로 이동한다', true)
  await open(h)
  await h.ev(`document.querySelector('[data-ai-login-note]').click()`)
  await waitPath(h, '^/login$')
  await mustUntil(h, `!!document.querySelector('input[type=email]')`, 80)
  const [email, password] = ACCOUNTS.free
  await h.setVal('input[type=email]', email)
  await h.setVal('input[type=password]', password)
  await h.ev(`document.querySelector('form').requestSubmit()`)
  await waitPath(h, '^/ai/weekly-report$')
  check(
    h,
    'F3. 주간 리포트 행 → 로그인 → 로그인 후 주간 리포트(I05)로 복귀한다',
    true,
  )
  await h.go('/ai', 300)
  await mustUntil(h, `!!document.querySelector('[data-ai-feature]')`, 80)
  check(
    h,
    'F4. 로그인한 회원의 /ai는 회원 허브다(권한 분기 유지)',
    await h.ev(
      `!!document.querySelector('[data-ai-cta=member]') && !document.querySelector('[data-ai-preview]')`,
    ),
  )
})

await scenario('G-responsive', async (h) => {
  await open(h)
  await h.ev(`document.querySelector('[data-ai-guide]').open = true`)
  const probe = `(()=>{
    const W = window.innerWidth
    const main = document.querySelector('main')
    const bad = [...main.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
    const tap = [...main.querySelectorAll('a, summary')].filter((e) => e.getBoundingClientRect().height < 43.5).length
    // 글자 단위로 세로로 쌓인 제목·행 제목이 없다.
    const stacked = [...main.querySelectorAll('h1, h2, h3, [data-ai-feature] span.block, [data-ai-feature] span.text-section-title')].filter((e) => { const cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4; return e.getBoundingClientRect().height > lh * 4.5 }).map((e) => e.innerText.trim().slice(0, 16) + '/' + Math.round(e.getBoundingClientRect().width))
    // 삽화와 제목·설명이 겹치지 않는다.
    const img = main.querySelector('[data-ai-hero]').getBoundingClientRect()
    const head = main.querySelector('h1').parentElement.getBoundingClientRect()
    const overlap = !(img.left >= head.right - 0.5 || img.top >= head.bottom - 0.5 || img.bottom <= head.top + 0.5)
    window.scrollTo(0, document.documentElement.scrollHeight)
    const nav = document.querySelector('nav')?.getBoundingClientRect()
    const last = main.querySelector('a[href="/signup"]').getBoundingClientRect()
    return { ov: document.documentElement.scrollWidth - W, bad, tap, stacked, overlap, navTop: nav?.top ?? 0, lastBottom: last.bottom }
  })()`
  for (const [w, label, pct] of [
    [390, '390px', 100],
    [320, '320px', 100],
    [195, '195px', 100],
    [160, '160px', 100],
    [390, '390px·글자 200%', 200],
    [320, '320px·글자 200%', 200],
  ]) {
    await h.vp(w, 844)
    await h.ev(`document.documentElement.style.fontSize = '${pct}%'`)
    await h.sleep(300)
    const r = await h.ev(probe)
    check(
      h,
      `G1. ${label}: 가로 스크롤·잘림·글자 단위 줄바꿈·삽화 겹침 없음, 링크·접기 44px 이상, 마지막 링크가 하단 메뉴에 가려지지 않음`,
      r.ov <= 0 &&
        r.bad === 0 &&
        r.tap === 0 &&
        r.stacked.length === 0 &&
        !r.overlap &&
        r.lastBottom <= r.navTop,
      JSON.stringify(r),
    )
    await h.shot(`ai-${w}-${pct}.png`)
  }
})
