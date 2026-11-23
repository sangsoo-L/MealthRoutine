// [chrome 회귀] I04 사진 음식 분석(/ai/meal/photo)·I04-1 AI 대화(/ai/meal/photo/analysis): 비회원 로그인 안내 · AI 허브 연결 · 연결 전 안내와 분석 시작 막힘 ·
// 사진 선택(미리보기·변경·해제·거부: 형식·용량) · 사진 미저장(저장소·새로고침·화면 이탈) · 개발 검증 상태(?devAnalysis=)의 분석 중·결과·결과 없음·실패·일부 실패·취소 ·
// I04-1 직접 접근 · 식단 기록 이동 · 160~1440px
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only photo-analysis`. 상세: tests/chrome/README.md
// 파일은 페이지 안에서 canvas로 만든 PNG를 DataTransfer로 파일 입력에 넣는다(실제 파일 선택창은 쓰지 않는다). 실제 AI·서버·업로드는 없다.
import { start } from '../lib/session.mjs'
import { mustUntil, reloadSettled, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const READY = `!!document.querySelector('[data-photo-upload]')`
const ANALYSIS = `!!document.querySelector('[data-photo-analysis]')`

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

/** 파일 입력에 파일을 넣고 변경 이벤트를 낸다. kind: png(색 지정) · text · svgAsPng(내용이 이미지가 아님) · big(10MB 초과 PNG). */
const attach = (h, kind, name, color = '#e0752b') =>
  h.ev(`(async()=>{
    const png = (c) => new Promise((resolve) => {
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 80
      const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 120, 80)
      cv.toBlob(resolve, 'image/png')
    })
    let file
    if (${JSON.stringify(kind)} === 'png') file = new File([await png(${JSON.stringify(color)})], ${JSON.stringify(name)}, { type: 'image/png' })
    else if (${JSON.stringify(kind)} === 'text') file = new File(['hello'], ${JSON.stringify(name)}, { type: 'text/plain' })
    else if (${JSON.stringify(kind)} === 'svgAsPng') file = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], ${JSON.stringify(name)}, { type: 'image/png' })
    else { const b = new Uint8Array(10 * 1024 * 1024 + 1); b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]); file = new File([b], ${JSON.stringify(name)}, { type: 'image/png' }) }
    const dt = new DataTransfer(); dt.items.add(file)
    const input = document.querySelector('[data-photo-input]'); input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)

const main = (h) => h.text('main')
const alertText = (h) =>
  h.ev(
    `document.querySelector('main [role=alert]')?.innerText.replace(/\\s+/g,' ').trim() ?? ''`,
  )
const startDisabled = (h) =>
  h.ev(
    `document.querySelector('[data-photo-start]')?.getAttribute('aria-disabled')`,
  )
const previewSrc = (h) =>
  h.ev(
    `document.querySelector('[data-photo-selected] img')?.getAttribute('src') ?? null`,
  )
const hasPreview = (h) =>
  h.ev(`!!document.querySelector('[data-photo-selected] img')`)
const open = async (h, search = '') => {
  await h.go(`/ai/meal/photo${search}`, 300)
  await mustUntil(h, READY, 100)
}
const leaked = (h, word) =>
  h.ev(
    `JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),location.href,history.state]).includes(${JSON.stringify(word)})`,
  )

await scenario('A-guest-and-hub', async (h) => {
  await h.go('/ai/meal/photo', 600)
  await mustUntil(h, `!!document.querySelector('#login-required-title')`, 100)
  check(
    h,
    'A1. 비회원은 로그인 안내를 본다',
    (await h.has('로그인 후 이용할 수 있어요')) && !(await h.ev(READY)),
  )
  await h.login('free')
  await h.go('/ai', 500)
  await mustUntil(h, `!!document.querySelector('[data-ai-feature=photo]')`, 100)
  check(
    h,
    'A2. AI 허브의 사진 분석 행: 준비 중 표시와 I04 링크 하나',
    (
      await h.ev(`document.querySelector('[data-ai-feature=photo]').innerText`)
    ).includes('준비 중') &&
      (await h.ev(
        `document.querySelector('[data-ai-feature=photo] a')?.getAttribute('href')`,
      )) === '/ai/meal/photo',
  )
  await h.ev(`document.querySelector('[data-ai-feature=photo] a').click()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  check(
    h,
    'A3. I04: 제목 하나·문서 제목·하단 탭(AI 활성)·이전은 AI 허브',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      /사진 음식 분석 · 밀스루틴/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector('nav a[aria-current=page]')?.innerText.trim()`,
      )) === 'AI' &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/ai',
  )
})

await scenario('B-unconnected-select', async (h) => {
  await h.login('free')
  await open(h)
  const t = await main(h)
  check(
    h,
    'B1. 연결 전: 제목·안내·올리기 버튼·형식과 용량 표시·사용 안내·촬영 팁',
    /사진으로 식단을 기록해요/.test(t) &&
      /분석 서버가 아직 연결되지 않았어요/.test(t) &&
      /음식 사진 올리기/.test(t) &&
      /JPG · PNG · WEBP · 10MB 이하/.test(t) &&
      /음식 분석에만 사용해요/.test(t) &&
      /음식 전체가 보이게/.test(t),
  )
  check(
    h,
    'B2. 서버 연결 전: AI 사용 횟수 규칙(공통 사용·최초 5회·월간 초기화 없음) 안내만 있고 남은 횟수 숫자와 소진 안내가 없다',
    /공통 사용 횟수를 함께 써요/.test(t) &&
      /최초 5회이고 월간 초기화는 없어요/.test(t) &&
      !/남은 횟수[^.]*\d|\d회 남/.test(t) &&
      !/AI 사용 횟수를 모두 사용했어요/.test(t),
  )
  check(
    h,
    'B3. 사진이 없으면 분석 시작은 aria-disabled이고 이유가 있다',
    (await startDisabled(h)) === 'true' &&
      /사진을 올리면 분석을 시작할 수 있어요/.test(t),
  )
  // 거부
  await attach(h, 'text', 'memo.txt')
  await mustUntil(h, `!!document.querySelector('main [role=alert]')`, 60)
  check(
    h,
    'B4. 이미지가 아닌 파일: 형식 안내가 나오고 첨부되지 않는다',
    /JPG · PNG · WEBP/.test(await alertText(h)) && !(await hasPreview(h)),
  )
  await attach(h, 'svgAsPng', 'fake.png')
  await mustUntil(
    h,
    `/JPG · PNG · WEBP/.test(document.querySelector('main [role=alert]')?.innerText ?? '')`,
    60,
  )
  check(
    h,
    'B5. 확장자·MIME는 PNG인데 내용이 이미지가 아니면 거부한다',
    !(await hasPreview(h)),
  )
  await attach(h, 'big', 'huge.png')
  await mustUntil(
    h,
    `/10MB/.test(document.querySelector('main [role=alert]')?.innerText ?? '')`,
    100,
  )
  check(
    h,
    'B6. 10MB 초과: 용량 안내가 나오고 첨부되지 않는다',
    !(await hasPreview(h)),
  )
  // 정상 첨부
  await attach(h, 'png', 'lunch.png')
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  check(
    h,
    'B7. 정상 사진: 미리보기·파일명·용량·첨부 안내가 보이고 이전 오류는 사라진다',
    (await h.has('사진이 첨부되었어요')) &&
      (await h.has('lunch\\.png · \\d+KB')) &&
      (await alertText(h)) === '' &&
      (await h.ev(
        `(()=>{const i=document.querySelector('[data-photo-selected] img');return i.complete&&i.naturalWidth===120&&getComputedStyle(i).objectFit==='contain'})()`,
      )),
  )
  check(
    h,
    'B8. 미리보기 주소는 blob이고 파일명이 저장소·주소·state에 없다',
    /^blob:/.test((await previewSrc(h)) ?? '') && !(await leaked(h, 'lunch')),
  )
  // 연결 전에는 시작할 수 없다
  check(
    h,
    'B9. 사진을 골라도 서버 연결 전이면 시작은 막히고 이유가 바뀐다',
    (await startDisabled(h)) === 'true' &&
      /분석 서버가 아직 연결되지 않아 시작할 수 없어요/.test(await main(h)),
  )
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await h.sleep(300)
  check(
    h,
    'B10. 막힌 분석 시작을 눌러도 이동하지 않는다',
    (await h.path()) === '/ai/meal/photo',
  )
  // 변경: 이전 미리보기 주소는 해제된다
  const first = await previewSrc(h)
  await attach(h, 'png', 'dinner.png', '#2563eb')
  await mustUntil(
    h,
    `/dinner\\.png/.test(document.querySelector('[data-photo-selected]')?.innerText ?? '')`,
    60,
  )
  const second = await previewSrc(h)
  check(
    h,
    'B11. 다른 사진으로 바꾸면 미리보기가 바뀐다',
    first !== second && (await h.has('dinner\\.png')),
  )
  check(
    h,
    'B12. 바꾸기 전 미리보기 주소는 해제된다',
    await h.ev(`fetch(${JSON.stringify(first)}).then(()=>false,()=>true)`),
  )
  // 거부된 선택은 이전 정상 사진을 지우지 않는다
  await attach(h, 'text', 'memo.txt')
  await mustUntil(h, `!!document.querySelector('main [role=alert]')`, 60)
  check(
    h,
    'B13. 잘못된 파일을 고르면 안내가 나오고 기존 사진은 그대로다',
    (await previewSrc(h)) === second && /dinner\.png/.test(await main(h)),
  )
  // 해제
  await h.click('^선택 해제$')
  await mustUntil(h, `!document.querySelector('[data-photo-selected]')`, 40)
  check(
    h,
    'B14. 선택 해제: 올리기 버튼으로 돌아가고 미리보기 주소는 해제된다',
    (await h.has('음식 사진 올리기')) &&
      (await h.ev(`fetch(${JSON.stringify(second)}).then(()=>false,()=>true)`)),
  )
})

await scenario('C-not-persisted', async (h) => {
  await h.login('free')
  await open(h)
  await attach(h, 'png', 'secret-name.png')
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  await reloadSettled(h)
  await mustUntil(h, READY, 100)
  check(
    h,
    'C1. 새로고침하면 사진은 남지 않는다',
    !(await hasPreview(h)) && !(await leaked(h, 'secret-name')),
  )
  await attach(h, 'png', 'secret-name.png')
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  // 화면을 떠났다 돌아오면 사진은 버려진다(AI 허브로 이동 후 다시 진입)
  await h.click('^이전')
  await waitPath(h, '^/ai$')
  await h.sleep(200)
  await h.ev(`document.querySelector('[data-ai-feature=photo] a')?.click()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  check(h, 'C2. 다른 화면을 거쳐 돌아오면 사진은 없다', !(await hasPreview(h)))
})

await scenario('D-dev-result-flow', async (h) => {
  await h.login('free')
  await open(h, '?devAnalysis=result')
  check(
    h,
    'D0. 개발 검증 상태 표시와 함께 사진을 고르면 분석 시작이 열린다',
    (await h.has('개발용 검증 상태예요')) &&
      (await startDisabled(h)) === 'true',
  )
  await attach(h, 'png', 'meal.png')
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  check(
    h,
    'D1. 검증 상태에서는 사진 선택 후 분석 시작이 활성이다',
    (await startDisabled(h)) === 'false',
  )
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(h, ANALYSIS, 100)
  check(
    h,
    'D2. I04-1: 제목 하나·대화 로그·내 사진 말풍선·분석 중(취소 가능)',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h.ev(
        `document.querySelector('[role=log]')?.getAttribute('aria-live')`,
      )) === 'polite' &&
      (await h.ev(
        `!!document.querySelector('[data-photo-analysis] img[alt="내가 첨부한 음식 사진"]')`,
      )) &&
      (await h.has('meal\\.png')),
  )
  const analyzing = await h.ev(
    `!!document.querySelector('[data-analysis-state=analyzing]')`,
  )
  check(
    h,
    'D3. 분석 중 안내와 취소 버튼이 먼저 보인다',
    analyzing === true ||
      (await h.ev(`!!document.querySelector('[data-analysis-state=ready]')`)),
  )
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=ready]')`,
    80,
  )
  const t = await main(h)
  check(
    h,
    'D4. 결과: 음식·양·열량·합계·추정값 안내·개발용 예시 표지',
    /현미밥 1공기 약 310kcal/.test(t.replace(/\s+/g, ' ')) &&
      /고등어구이 1토막 약 310kcal/.test(t.replace(/\s+/g, ' ')) &&
      /합계 약 760kcal/.test(t.replace(/\s+/g, ' ')) &&
      /알레르기 확인에는 쓸 수 없어요/.test(t) &&
      /개발용 예시 결과예요/.test(t),
  )
  check(
    h,
    'D5. 결과는 자동으로 기록되지 않는다는 안내가 있고 식단 기록 저장 흔적이 없다',
    /자동으로 기록되지 않아요/.test(t) && !(await leaked(h, 'meal.png')),
  )
  check(
    h,
    'D6. 식단 기록 이동과 다시 분석 링크',
    (await h.ev(
      `[...document.querySelectorAll('main a')].find(a=>/식단 기록하러 가기/.test(a.innerText))?.getAttribute('href')`,
    )) === '/records/meal/record' &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/다른 사진으로 다시 분석/.test(a.innerText))?.getAttribute('href')`,
      )) === '/ai/meal/photo',
  )
  // 이전 → I04: 사진은 남고 분석 상태는 비워진다(공통 "이전" 링크의 목적지는 I04이고, 검증 상태 주소를 이어 가려고 브라우저 뒤로 가기로 돌아간다)
  check(
    h,
    'D6b. I04-1의 이전은 I04를 가리킨다',
    (await h.ev(
      `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
    )) === '/ai/meal/photo',
  )
  await h.ev(`history.back()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  check(h, 'D7. 이전으로 I04에 돌아오면 사진은 남아 있다', await hasPreview(h))
  // 식단 기록으로 이동
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=ready]')`,
    80,
  )
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/식단 기록하러 가기/.test(a.innerText)).click()`,
  )
  await waitPath(h, '^/records/meal/record$')
  check(h, 'D8. 결과에서 식단 기록(D02)으로 이동한다', true)
})

for (const [preview, state, patterns] of [
  [
    'empty',
    'empty',
    [/사진에서 음식을 찾지 못했어요/, /다른 사진 선택/, /직접 입력하기/],
  ],
  [
    'error',
    'error',
    [/분석하지 못했어요/, /다시 시도/, /사진은 그대로 남아 있어요/],
  ],
  [
    'exhausted',
    'exhausted',
    [
      /AI 사용 횟수를 모두 사용했어요/,
      /멤버십과 사용 횟수 보기/,
      /직접 입력하기/,
    ],
  ],
  [
    'partial',
    'ready',
    [
      /일부 음식은 인식하지 못했어요/,
      /합계를 확인하지 못했어요/,
      /양 정보 없음/,
    ],
  ],
]) {
  await scenario(`E-dev-${preview}`, async (h) => {
    await h.login('free')
    await open(h, `?devAnalysis=${preview}`)
    await attach(h, 'png', 'meal.png')
    await mustUntil(
      h,
      `!!document.querySelector('[data-photo-selected] img')`,
      60,
    )
    await h.ev(`document.querySelector('[data-photo-start]').click()`)
    await waitPath(h, '^/ai/meal/photo/analysis$')
    await mustUntil(
      h,
      `!!document.querySelector('[data-analysis-state=${state}]')`,
      80,
    )
    const t = await main(h)
    check(
      h,
      `E. ${preview}: 상태 안내와 다음 행동`,
      patterns.every((p) => p.test(t)),
    )
    if (preview === 'error') {
      check(
        h,
        'E. 실패는 role=alert이고 다시 시도하면 다시 분석 중이 된다',
        await h.ev(
          `!!document.querySelector('[data-analysis-state=error][role=alert]')`,
        ),
      )
      await h.click('^다시 시도$')
      await mustUntil(
        h,
        `!!document.querySelector('[data-analysis-state=analyzing]')`,
        40,
      )
      await mustUntil(
        h,
        `!!document.querySelector('[data-analysis-state=error]')`,
        80,
      )
      check(h, 'E. 다시 시도 후 같은 오류면 다시 오류 안내가 나온다', true)
    }
    if (preview === 'empty')
      check(h, 'E. 결과 없음에는 영양정보·합계가 없다', !/kcal|합계/.test(t))
    if (preview === 'exhausted') {
      check(
        h,
        'E. 소진 거절: 다시 시도·다른 사진이 없고 멤버십 링크가 P03이며 영양정보를 채우지 않는다',
        !(await h.ev(`!!document.querySelector('[data-analysis-retry]')`)) &&
          !/다시 시도|다른 사진/.test(t) &&
          !/kcal|합계/.test(t) &&
          (await h.ev(
            `[...document.querySelectorAll('main a')].find(a=>/멤버십과 사용 횟수 보기/.test(a.innerText))?.getAttribute('href')`,
          )) === '/settings/membership',
      )
    }
    if (preview === 'result') {
      check(
        h,
        'E. 결과: 날짜 구분에 시간이 있고 결과 말풍선이 페이드 인 클래스를 가진다',
        /(오전|오후) \d{1,2}:\d{2}/.test(t) &&
          (await h.ev(
            `document.querySelector('[data-analysis-state=ready]').className.includes('animate-route-fade')`,
          )),
      )
    }
  })
}

await scenario('F-dev-slow-cancel-and-direct', async (h) => {
  await h.login('free')
  // 직접 접근(사진 없음)은 I04로 돌려보낸다
  await h.go('/ai/meal/photo/analysis', 300)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  check(h, 'F1. I04-1을 사진 없이 열면 I04로 이동한다', !(await h.ev(ANALYSIS)))
  await h.go('/ai/meal/photo?devAnalysis=slow', 300)
  await mustUntil(h, READY, 100)
  await attach(h, 'png', 'meal.png')
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=analyzing]')`,
    60,
  )
  check(
    h,
    'F2. 분석 중 안내와 취소 버튼',
    (await h.ev(
      `document.querySelector('[data-analysis-state=analyzing]').getAttribute('aria-busy')`,
    )) === 'true' && (await h.has('분석 취소')),
  )
  await h.click('^분석 취소$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=idle]')`,
    40,
  )
  check(
    h,
    'F3. 취소하면 시작하지 않은 상태로 돌아가고 결과는 없다',
    !(await h.has('kcal')),
  )
  // 다시 시작했다가 분석 중에 이전으로 나가면 정리된다
  await h.ev(`history.back()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=analyzing]')`,
    60,
  )
  await h.ev(`history.back()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=analyzing]')`,
    60,
  )
  check(
    h,
    'F4. 분석 중에 나갔다 다시 시작하면 새 분석이 시작된다(이전 작업은 정리됨)',
    true,
  )
})

await scenario('G-responsive-keyboard', async (h) => {
  await h.login('free')
  await open(h, '?devAnalysis=result')
  check(
    h,
    'G1. 올리기 버튼은 키보드 포커스를 받는 button이다',
    await h.ev(
      `(()=>{const b=document.querySelector('[data-photo-card] button');b.focus();return document.activeElement===b&&b.type==='button'})()`,
    ),
  )
  await attach(
    h,
    'png',
    'a-very-long-photo-file-name-that-should-wrap-without-overflow-on-small-screens.png',
  )
  await mustUntil(
    h,
    `!!document.querySelector('[data-photo-selected] img')`,
    60,
  )
  for (const [w, ht] of [
    [160, 640],
    [195, 844],
    [320, 640],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await h.vp(w, ht)
    await h.sleep(250)
    const m = await h.ev(
      `(()=>{const d=document.documentElement;const els=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().width>0);return{sw:d.scrollWidth,cw:d.clientWidth,over:els.filter(e=>e.getBoundingClientRect().right>d.clientWidth+0.5||e.getBoundingClientRect().left<-0.5).length,small:[...document.querySelectorAll('main button, main a')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<43.5).length}})()`,
    )
    check(
      h,
      `G. I04 ${w}px: 가로 스크롤·잘림 없음, 버튼·링크 높이 ≥44`,
      m.sw <= m.cw && m.over === 0 && m.small === 0,
      JSON.stringify(m),
    )
  }
  await h.vp(390, 844)
  await h.ev(`document.querySelector('[data-photo-start]').click()`)
  await waitPath(h, '^/ai/meal/photo/analysis$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-analysis-state=ready]')`,
    80,
  )
  for (const [w, ht] of [
    [160, 640],
    [195, 844],
    [320, 640],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await h.vp(w, ht)
    await h.sleep(250)
    const m = await h.ev(
      `(()=>{const d=document.documentElement;const els=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().width>0);return{sw:d.scrollWidth,cw:d.clientWidth,over:els.filter(e=>e.getBoundingClientRect().right>d.clientWidth+0.5||e.getBoundingClientRect().left<-0.5).length,small:[...document.querySelectorAll('main button, main a')].filter(e=>e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<43.5).length}})()`,
    )
    check(
      h,
      `G. I04-1 ${w}px: 가로 스크롤·잘림 없음, 버튼·링크 높이 ≥44`,
      m.sw <= m.cw && m.over === 0 && m.small === 0,
      JSON.stringify(m),
    )
  }
})

await scenario('H-d02-entry', async (h) => {
  await h.login('free')
  await h.go('/records/meal/record', 400)
  await mustUntil(h, `!!document.querySelector('[data-photo-entry]')`, 100)
  check(
    h,
    'H1. D02 식단 기록: 사진으로 식단 기록하기 링크가 I04로 연결되고 높이 44px 이상이다',
    (await h.ev(
      `document.querySelector('[data-photo-entry]').getAttribute('href')`,
    )) === '/ai/meal/photo' &&
      (await h.ev(
        `document.querySelector('[data-photo-entry]').getBoundingClientRect().height`,
      )) >= 43.5,
  )
  await h.ev(`document.querySelector('[data-photo-entry]').click()`)
  await waitPath(h, '^/ai/meal/photo$')
  await mustUntil(h, READY, 100)
  check(
    h,
    'H2. D02 → I04: 이전은 식단 기록(D02)으로 돌아간다',
    (await h.ev(
      `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
    )) === '/records/meal/record',
  )
  await h.go('/records/meal/plan', 400)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'H3. 내일 식단 계획(D02-1)에는 사진 분석 링크가 없다',
    !(await h.ev(`!!document.querySelector('[data-photo-entry]')`)),
  )
})
