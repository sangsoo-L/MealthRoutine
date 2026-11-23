// [chrome 회귀] 회원용 AI 코칭 허브(/ai, 로그인): 구성 순서(대표 운동 플랜 → 주간 리포트 → 식단 → 준비 중 → 접이식 안내) · 상태 표시(로컬 예시·이용 가능·준비 중) ·
// CTA 이동과 "이전" · 준비 중 행의 비클릭 · 접이식 이용 안내(키보드) · 하단 메뉴 AI 탭 · 비회원 /ai 분기 유지 · 390/320/195/160px·글자 200%
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only ai-hub`. 상세: tests/chrome/README.md
// 개발용 모의 계정만 쓴다. AI 운동·식단 세부 흐름은 ai-meal-plan 등 기존 스펙이 맡고 여기서는 허브의 구성·연결만 확인한다.
import { start } from '../lib/session.mjs'
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
  await mustUntil(h, `!!document.querySelector('[data-ai-main]')`, 80)
}
const backHref = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].find((a)=>/^이전/.test(a.innerText.trim()))?.getAttribute('href') ?? null`,
  )

await scenario('A-structure', async (h) => {
  await h.login('free')
  await open(h)
  const info = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const block = (key) => main.querySelector('[data-ai-feature="' + key + '"]')
    return {
      h1: [...main.querySelectorAll('h1')].map((e) => e.innerText.trim()),
      lead: main.querySelector('h1').nextElementSibling.innerText.trim(),
      h2: [...main.querySelectorAll('h2')].map((e) => e.innerText.trim()),
      text: main.innerText,
      main: block('exercise').innerText.replace(/\\s+/g, ' '),
      weekly: block('weekly').innerText.replace(/\\s+/g, ' '),
      meal: block('meal').innerText.replace(/\\s+/g, ' '),
      photo: block('photo').innerText.replace(/\\s+/g, ' '),
      photoControls: block('photo').querySelectorAll('a,button').length,
      photoHref: block('photo').querySelector('a')?.getAttribute('href') ?? null,
      photoCursor: getComputedStyle(block('photo')).cursor,
      status: ['exercise', 'weekly', 'meal', 'photo'].map((k) => block(k).getAttribute('data-ai-status')),
      links: [...main.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      fills: [...main.querySelectorAll('a')].filter((a) => /(^| )bg-brand( |$)/.test(a.className)).length,
    }
  })()`)
  check(
    h,
    'A1. 제목 "AI 코칭"과 짧은 안내 하나뿐이다(긴 설명 문단 없음)',
    JSON.stringify(info.h1) === q(['AI 코칭']) &&
      info.lead === '나에게 필요한 기능을 선택해 보세요.',
  )
  check(
    h,
    'A2. 구성 순서: AI 운동 플랜 → 주간 기록 리포트 → AI 식단 추천 → 준비 중인 기능 → 이용 범위와 체험 안내',
    info.h2.slice(0, 4).join('|') ===
      'AI 운동 플랜|주간 기록 리포트|AI 식단 추천|준비 중인 기능' &&
      info.text.indexOf('이용 범위와 체험 안내') >
        info.text.indexOf('준비 중인 기능'),
    JSON.stringify(info.h2),
  )
  check(
    h,
    'A3. 상태: 운동 local, 리포트 available, 식단 guide, 사진 pending',
    JSON.stringify(info.status) ===
      q(['local', 'available', 'guide', 'pending']),
    JSON.stringify(info.status),
  )
  check(
    h,
    'A4. 대표 카드: 로컬 예시 배지·"실제 AI 추천이 아닌 로컬 예시예요."·이용 가능 아님',
    /로컬 예시/.test(info.main) &&
      /실제 AI 추천이 아닌 로컬 예시예요/.test(info.main) &&
      !/이용 가능/.test(info.main),
  )
  check(
    h,
    'A5. 주간 리포트: 이용 가능·AI 없이 제공되는 기본 주간 리포트',
    /이용 가능/.test(info.weekly) &&
      /AI 없이 제공되는 기본 주간 리포트예요/.test(info.weekly),
  )
  check(
    h,
    'A6. 식단: 준비 중·목표 필요·추천 결과 준비 중(이용 가능 아님)',
    /준비 중/.test(info.meal) &&
      /식단 목표가 있어야 이용할 수 있고, 추천 결과는 준비 중이에요/.test(
        info.meal,
      ) &&
      !/이용 가능/.test(info.meal),
  )
  check(
    h,
    'A7. 사진 분석: 준비 중 행이고 행 자체는 클릭 커서가 없으며, 사진을 골라 보는 I04 링크 하나만 있다',
    /준비 중/.test(info.photo) &&
      /분석은 준비 중이에요/.test(info.photo) &&
      info.photoControls === 1 &&
      info.photoHref === '/ai/meal/photo' &&
      info.photoCursor !== 'pointer',
  )
  check(
    h,
    'A8. 이동 링크(사진 고르기 I04 포함)와 채움 버튼(하나)',
    JSON.stringify(info.links) ===
      q([
        '/ai/exercise/plan',
        '/ai/exercise',
        '/ai/weekly-report',
        '/ai/meal',
        '/ai/meal/photo',
        '/records/exercise',
        '/records/meal',
      ]) && info.fills === 1,
    JSON.stringify(info),
  )
  check(
    h,
    'A9. 의료 안내와 기록 바로가기가 하단에 있다',
    /의료적 진단을 대신하지 않아요/.test(info.text) &&
      /기록은 지금 바로 시작해요/.test(info.text),
  )
  check(
    h,
    'A10. 하단 메뉴의 AI 탭이 선택 상태다',
    await h.ev(
      `!!document.querySelector('nav [aria-current="page"]') && /AI/.test(document.querySelector('nav [aria-current="page"]').innerText)`,
    ),
  )
})

await scenario('B-navigation', async (h) => {
  await h.login('free')
  const go = async (selector, re, label) => {
    await open(h)
    await h.ev(`document.querySelector(${q(selector)}).click()`)
    await waitPath(h, re)
    // 도착 화면의 "이전" 링크가 그려질 때까지 기다린 뒤 읽는다(식단 플랜은 목표 없음이면 다른 화면으로 바뀔 수 있다).
    await mustUntil(
      h,
      `[...document.querySelectorAll('main a')].some((a)=>/^이전/.test(a.innerText.trim()))`,
      100,
    )
    check(
      h,
      label,
      (await backHref(h)) === '/ai' || /\/ai\/meal/.test(await h.path()),
      String(await backHref(h)),
    )
  }
  await go(
    '[data-ai-main] a[href="/ai/exercise/plan"]',
    '^/ai/exercise/plan$',
    'B1. 운동 조건 선택 CTA → I02-1, "이전"은 /ai',
  )
  await go(
    '[data-ai-main] a[href="/ai/exercise"]',
    '^/ai/exercise$',
    'B2. 운동 플랜 안내 보기 → I02, "이전"은 /ai',
  )
  await go(
    '[data-ai-feature="weekly"] a[href="/ai/weekly-report"]',
    '^/ai/weekly-report$',
    'B3. 주간 리포트 보기 → I05, "이전"은 /ai',
  )
  await go(
    '[data-ai-feature="meal"] a[href="/ai/meal"]',
    '^/ai/meal(/goal-required)?$',
    'B4. 식단 조건 선택하기 → I03(목표 없음이면 I07)',
  )
  await open(h)
  await h.ev(
    `document.querySelector('[data-ai-cta=member] a[href="/records/exercise"]').click()`,
  )
  await waitPath(h, '^/records/exercise$')
  check(h, 'B5. 하단 운동 기록 링크 → 운동 기록', true)
  await open(h)
  await h.ev(
    `document.querySelector('[data-ai-cta=member] a[href="/records/meal"]').click()`,
  )
  await waitPath(h, '^/records/meal$')
  check(h, 'B6. 하단 식단 기록 링크 → 식단 기록', true)
  await open(h)
  await h.ev(
    `document.querySelector('[data-ai-main] a[href="/ai/exercise/plan"]').click()`,
  )
  await waitPath(h, '^/ai/exercise/plan$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/ai$')
  check(h, 'B7. 브라우저 뒤로 가기로 /ai에 돌아온다', true)
})

await scenario('C-guide', async (h) => {
  await h.login('free')
  await open(h)
  check(
    h,
    'C1. 이용 범위와 체험 안내는 처음에 접혀 있다',
    (await h.ev(`document.querySelector('[data-ai-guide]').open`)) === false,
  )
  await h.ev(`document.querySelector('[data-ai-guide] summary').focus()`)
  await h.press('Enter', 'Enter', 13)
  await h.sleep(200)
  const text = await h.ev(
    `(()=>{ const d = document.querySelector('[data-ai-guide]'); return d.open ? d.innerText : '' })()`,
  )
  check(
    h,
    'C2. Enter로 펼치면 상태 안내·이용 흐름·무료 범위·최초 5회·결제 안내·기능별 사용 횟수가 보인다',
    /상태 안내/.test(text) &&
      /지금 바로 이용할 수 있어요/.test(text) &&
      /로컬 예시로 체험할 수 있어요/.test(text) &&
      /아직 제공 전이에요/.test(text) &&
      /이용 흐름/.test(text) &&
      /기본 기록과 기본 주간 리포트는 무료예요/.test(text) &&
      /무료 AI 체험은 가입 후 최초 5회이고 월간 초기화는 없어요/.test(text) &&
      /자동으로 결제되지 않아요/.test(text) &&
      /운동·식단 AI 공통 사용 횟수/.test(text) &&
      !/유료 운동·종합 권한/.test(text),
  )
  await h.press(' ', 'Space', 32)
  await h.sleep(200)
  check(
    h,
    'C3. Space로 다시 접힌다',
    (await h.ev(`document.querySelector('[data-ai-guide]').open`)) === false,
  )
  check(
    h,
    'C4. 접기 영역 높이 44px 이상',
    (await h.ev(
      `Math.round(document.querySelector('[data-ai-guide] summary').getBoundingClientRect().height)`,
    )) >= 44,
  )
})

await scenario('D-first-screen-and-branch', async (h) => {
  await h.login('free')
  await open(h)
  const r = await h.ev(`(()=>{
    const nav = document.querySelector('nav').getBoundingClientRect()
    const cta = document.querySelector('[data-ai-main] a[href="/ai/exercise/plan"]').getBoundingClientRect()
    const weekly = document.querySelector('[data-ai-feature="weekly"]').getBoundingClientRect()
    return { navTop: nav.top, ctaBottom: cta.bottom, weeklyTop: weekly.top }
  })()`)
  check(
    h,
    'D1. 390×844: 대표 CTA가 첫 화면(하단 메뉴 위)에 보이고 리포트 카드가 이어서 시작한다',
    r.ctaBottom <= r.navTop && r.weeklyTop < r.navTop,
    JSON.stringify(r),
  )
  // 비회원 /ai는 그대로 랜딩이다.
  await h.go('/home', 300)
  await h.ev(`sessionStorage.clear()`)
  await h.go('/ai', 400)
  await mustUntil(h, `!!document.querySelector('[data-ai-preview]')`, 80)
  check(
    h,
    'D2. 로그아웃 상태의 /ai는 비회원 랜딩이다(분기 유지)',
    (await h.ev(`!document.querySelector('[data-ai-main]')`)) &&
      (await h.has('기록을 더 쉽게')),
  )
})

await scenario('E-responsive', async (h) => {
  await h.login('free')
  await open(h)
  await h.ev(`document.querySelector('[data-ai-guide]').open = true`)
  const probe = `(()=>{
    const W = window.innerWidth
    const main = document.querySelector('main')
    const bad = [...main.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
    const tap = [...main.querySelectorAll('a, summary')].filter((e) => e.getBoundingClientRect().height < 43.5).length
    // 한 글자씩 세로로 쌓인 제목·기능명이 없다: 제목 높이가 줄 높이의 4배를 넘지 않는다.
    const stackedEls = [...main.querySelectorAll('h2, h3, [data-ai-feature] span.block')].filter((e) => { const cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4; return e.getBoundingClientRect().height > lh * 4.5 })
    const stacked = stackedEls.length
    const stackedInfo = stackedEls.map((e) => e.innerText.trim().slice(0, 24) + '/' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))
    window.scrollTo(0, document.documentElement.scrollHeight)
    const nav = document.querySelector('nav')?.getBoundingClientRect()
    const last = main.querySelector('[data-ai-cta=member] a[href="/records/meal"]').getBoundingClientRect()
    return { ov: document.documentElement.scrollWidth - W, bad, tap, stacked, stackedInfo, navTop: nav?.top ?? 0, lastBottom: last.bottom }
  })()`
  for (const [w, label, pct] of [
    [390, '390px', 100],
    [320, '320px', 100],
    [195, '195px', 100],
    [160, '160px', 100],
    [320, '320px·글자 200%', 200],
  ]) {
    await h.vp(w, 844)
    await h.ev(`document.documentElement.style.fontSize = '${pct}%'`)
    await h.sleep(300)
    const r = await h.ev(probe)
    check(
      h,
      `E1. ${label}: 가로 스크롤·잘림·글자 단위 줄바꿈 없음, 링크·접기 44px 이상, 마지막 링크가 하단 메뉴에 가려지지 않음`,
      r.ov <= 0 &&
        r.bad === 0 &&
        r.tap === 0 &&
        r.stacked === 0 &&
        r.lastBottom <= r.navTop,
      JSON.stringify(r),
    )
    await h.shot(`aihub-${w}-${pct}.png`)
  }
})

await scenario('F-design-tokens', async (h) => {
  await h.login('free')
  await open(h)
  const r = await h.ev(`(()=>{
    const main = document.querySelector('main')
    const px = (e) => parseFloat(getComputedStyle(e).fontSize)
    const w = (e) => getComputedStyle(e).fontWeight
    const rad = (e) => parseFloat(getComputedStyle(e).borderTopLeftRadius)
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    const find = (root, text) => [...root.querySelectorAll('*')].find((e) => own(e) === text)
    const feat = (k) => main.querySelector('[data-ai-feature="' + k + '"]')
    const ex = feat('exercise')
    return {
      h1: [px(main.querySelector('h1')), w(main.querySelector('h1'))],
      lead: [px(main.querySelector('h1').nextElementSibling), w(main.querySelector('h1').nextElementSibling)],
      titles: ['exercise', 'weekly', 'meal'].map((k) => [px(feat(k).querySelector('h2')), w(feat(k).querySelector('h2'))]),
      pendingTitle: px(main.querySelector('#ai-pending-title')),
      body: px(find(ex, '조건을 고르면 운동 구성을 예시로 살펴볼 수 있어요.')),
      note: px(find(ex, '실제 AI 추천이 아닌 로컬 예시예요.')),
      badge: [px(find(ex, '로컬 예시')), px(find(feat('weekly'), '이용 가능')), px(find(feat('meal'), '준비 중'))],
      cta: [px(find(ex, '운동 조건 선택하고 예시 받기')), w(find(ex, '운동 조건 선택하고 예시 받기')), Math.round(find(ex, '운동 조건 선택하고 예시 받기').getBoundingClientRect().height)],
      guide: px(main.querySelector('[data-ai-guide] summary span')),
      radius: [ex, feat('weekly'), feat('meal'), feat('photo').closest('ul'), main.querySelector('[data-ai-guide]')].map(rad),
      heights: ['exercise', 'weekly', 'meal'].map((k) => Math.round(feat(k).getBoundingClientRect().height)),
      pageH: document.documentElement.scrollHeight,
      noExtra: !/text-metric|text-xl|text-base/.test(main.innerHTML),
    }
  })()`)
  check(
    h,
    'F1. 제목 22px·600, 설명 14px·400',
    r.h1[0] === 22 &&
      r.h1[1] === '600' &&
      r.lead[0] === 14 &&
      r.lead[1] === '400',
    JSON.stringify(r.h1) + JSON.stringify(r.lead),
  )
  check(
    h,
    'F2. 카드 제목·섹션 제목 15px·600',
    r.titles.every(([a, b]) => a === 15 && b === '600') &&
      r.pendingTitle === 15,
    JSON.stringify(r.titles),
  )
  check(
    h,
    'F3. 기본 설명 14px, 로컬 예시 안내 12px, 배지 12px',
    r.body === 14 && r.note === 12 && r.badge.every((v) => v === 12),
    JSON.stringify({ body: r.body, note: r.note, badge: r.badge }),
  )
  check(
    h,
    'F4. 대표 CTA 14px·600이고 높이 44~48px',
    r.cta[0] === 14 && r.cta[1] === '600' && r.cta[2] >= 44 && r.cta[2] <= 48,
    JSON.stringify(r.cta),
  )
  check(
    h,
    'F5. 접기 제목 14px, 카드·목록·접기 모서리 12px, 예외 글자 크기 클래스 없음',
    r.guide === 14 && r.radius.every((v) => v === 12) && r.noExtra,
    JSON.stringify({ guide: r.guide, radius: r.radius }),
  )
  check(
    h,
    // 이전(대표 318·리포트 179·식단 200px, 전체 1359px) 대비: 대표·식단 카드와 전체 페이지는 줄었고, 리포트 카드는 아이콘 열이 생겨 +10px 이내다.
    'F6. 대표·식단 카드와 전체 페이지 높이가 이전보다 줄었고 리포트 카드는 +10px 이내다',
    r.heights[0] < 318 &&
      r.heights[2] < 200 &&
      r.heights[1] <= 189 &&
      r.pageH < 1359,
    JSON.stringify({ heights: r.heights, pageH: r.pageH }),
  )
  console.log(
    'NOTE  카드 높이',
    JSON.stringify(r.heights),
    '페이지 높이',
    r.pageH,
  )
})
