// I04 사진 음식 분석·I04-1 AI 대화: 사진 검증(형식·용량·실제 내용), 상태별 화면(미선택·선택·거부·연결 전·분석 중·결과·결과 없음·실패),
// 서버가 주지 않은 값을 만들지 않는 구조, 사진·결과를 저장·전송하지 않는 구조, 라우트·AI 허브 연결을 확인한다.
// 실제 AI·서버·파일 업로드는 쓰지 않는다. 사진은 테스트가 만든 가짜 바이트다.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, policy, contract, dev, Upload, Analysis
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  policy = await server.ssrLoadModule(
    '/src/photo-analysis/photoAnalysisPolicy.ts',
  )
  contract = await server.ssrLoadModule(
    '/src/photo-analysis/photoAnalysisContract.ts',
  )
  dev = await server.ssrLoadModule('/src/photo-analysis/devPhotoAnalysis.ts')
  Upload = (
    await server.ssrLoadModule('/src/components/ai/photo/PhotoUploadView.tsx')
  ).default
  Analysis = (
    await server.ssrLoadModule('/src/components/ai/photo/PhotoAnalysisView.tsx')
  ).default
})
after(async () => {
  await server?.close()
})

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const render = (element) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/ai/meal/photo'] },
      element,
    ),
  )

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
const WEBP = [...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP')]
const file = (bytes, name, type) =>
  new File([new Uint8Array(bytes)], name, { type })

test('경로·제한 상수: 10MB, JPG·PNG·WEBP', () => {
  assert.equal(policy.PATH_PHOTO, '/ai/meal/photo')
  assert.equal(policy.PATH_PHOTO_ANALYSIS, '/ai/meal/photo/analysis')
  assert.equal(policy.PHOTO_MAX_BYTES, 10 * 1024 * 1024)
  assert.equal(policy.PHOTO_ACCEPT, 'image/jpeg,image/png,image/webp')
  assert.equal(policy.PHOTO_FORMAT_LABEL, 'JPG · PNG · WEBP')
})

test('사진 검증: 정상 형식과 용량 경계(10MB 허용, 1바이트 초과 거부)', async () => {
  assert.deepEqual(
    await policy.validatePhotoFile(file(JPEG, 'a.jpg', 'image/jpeg')),
    { ok: true, format: 'jpeg' },
  )
  assert.deepEqual(
    await policy.validatePhotoFile(file(PNG, 'a.png', 'image/png')),
    { ok: true, format: 'png' },
  )
  assert.deepEqual(
    await policy.validatePhotoFile(file(WEBP, 'a.webp', 'image/webp')),
    { ok: true, format: 'webp' },
  )
  const exact = new Uint8Array(policy.PHOTO_MAX_BYTES)
  exact.set(PNG)
  assert.equal(
    (
      await policy.validatePhotoFile(
        new File([exact], 'max.png', { type: 'image/png' }),
      )
    ).ok,
    true,
  )
  const over = new Uint8Array(policy.PHOTO_MAX_BYTES + 1)
  over.set(PNG)
  assert.deepEqual(
    await policy.validatePhotoFile(
      new File([over], 'big.png', { type: 'image/png' }),
    ),
    { ok: false, reason: 'size' },
  )
})

test('사진 검증: 빈 파일·허용 밖 형식·거짓 표기·읽기 실패를 거부한다', async () => {
  assert.deepEqual(
    await policy.validatePhotoFile(file([], 'e.png', 'image/png')),
    { ok: false, reason: 'empty' },
  )
  for (const [name, type] of [
    ['a.gif', 'image/gif'],
    ['a.svg', 'image/svg+xml'],
    ['a.heic', 'image/heic'],
    ['a.txt', 'text/plain'],
    ['a.pdf', 'application/pdf'],
    ['noext', ''],
  ]) {
    assert.deepEqual(
      await policy.validatePhotoFile(file(PNG, name, type)),
      { ok: false, reason: 'format' },
      name,
    )
  }
  // 확장자·MIME는 이미지인데 내용이 이미지가 아니거나 다른 형식이다.
  const fake = file(
    [0x3c, 0x73, 0x76, 0x67, 0x3e, 0, 0, 0, 0, 0, 0, 0],
    'x.png',
    'image/png',
  )
  assert.deepEqual(await policy.validatePhotoFile(fake), {
    ok: false,
    reason: 'format',
  })
  assert.deepEqual(
    await policy.validatePhotoFile(file(PNG, 'x.jpg', 'image/jpeg')),
    { ok: false, reason: 'format' },
  )
  // 읽을 수 없는 파일
  const broken = {
    size: 10,
    type: 'image/png',
    slice: () => ({
      arrayBuffer: () => Promise.reject(new Error('읽기 실패')),
    }),
  }
  assert.deepEqual(await policy.validatePhotoFile(broken), {
    ok: false,
    reason: 'unreadable',
  })
})

test('용량 표시와 거부 문구', () => {
  assert.equal(policy.formatPhotoSize(2.5 * 1024 * 1024), '2.5MB')
  assert.equal(policy.formatPhotoSize(340 * 1024), '340KB')
  assert.equal(policy.formatPhotoSize(10), '1KB')
  for (const reason of ['empty', 'size', 'format', 'unreadable']) {
    assert.ok(policy.PHOTO_REJECTION_MESSAGE[reason].length > 0)
  }
  assert.match(policy.PHOTO_REJECTION_MESSAGE.size, /10MB/)
  assert.match(policy.PHOTO_REJECTION_MESSAGE.format, /JPG · PNG · WEBP/)
})

const noop = () => {}
const uploadProps = (over = {}) => ({
  access: 'available',
  photo: null,
  rejection: null,
  connected: false,
  devPreviewOn: false,
  onSelect: noop,
  onClear: noop,
  onStart: noop,
  ...over,
})
const PICKED = { name: 'lunch.jpg', size: 2.5 * 1024 * 1024, url: 'blob:test' }

test('I04 사진 미선택(연결 전): 제목·안내·올리기 버튼, 분석 시작은 aria-disabled이고 이유가 있다', () => {
  const html = render(createElement(Upload, uploadProps()))
  const t = text(html)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.match(t, /사진으로 식단을 기록해요/)
  assert.match(t, /음식 사진 올리기/)
  assert.match(t, /JPG · PNG · WEBP · 10MB 이하/)
  assert.match(t, /사진 사용 안내/)
  assert.match(t, /음식 분석에만 사용해요/)
  for (const tip of [
    '음식 전체가 보이게',
    '밝은 곳에서 선명하게',
    '한 장에 한 끼만',
  ])
    assert.match(t, new RegExp(tip))
  assert.match(t, /분석 서버가 아직 연결되지 않았어요/)
  assert.match(html, /<button[^>]*aria-disabled="true"[^>]*data-photo-start/)
  assert.match(t, /사진을 올리면 분석을 시작할 수 있어요/)
  assert.match(
    html,
    /<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"/,
  )
  assert.match(html, /href="\/records\/meal\/record"/)
  // 사진·분석 성공을 가리키는 표현이 없다.
  assert.doesNotMatch(t, /사진이 첨부되었어요|분석이 완료|분석 결과/)
})

test('I04 사진 선택 완료: 미리보기·파일명·용량·해제 버튼, 연결 전이면 시작은 막히고 이유가 바뀐다', () => {
  const html = render(
    createElement(Upload, uploadProps({ photo: PICKED, connected: false })),
  )
  const t = text(html)
  assert.match(t, /사진이 첨부되었어요/)
  assert.match(t, /lunch\.jpg · 2\.5MB/)
  assert.match(html, /<img[^>]*src="blob:test"[^>]*object-contain/)
  assert.match(html, /alt="선택한 음식 사진 미리보기"/)
  assert.match(t, /다른 사진 선택/)
  assert.match(t, /선택 해제/)
  assert.match(html, /<button[^>]*aria-disabled="true"[^>]*data-photo-start/)
  assert.match(t, /분석 서버가 아직 연결되지 않아 시작할 수 없어요/)
})

test('I04 서버 연결이 있으면 사진 선택 후 분석 시작이 열린다', () => {
  const html = render(
    createElement(Upload, uploadProps({ photo: PICKED, connected: true })),
  )
  assert.match(html, /<button[^>]*aria-disabled="false"[^>]*data-photo-start/)
  assert.doesNotMatch(text(html), /분석 서버가 아직 연결되지 않았어요/)
  assert.doesNotMatch(html, /data-photo-reason/)
})

test('I04 거부 안내(role=alert)와 이용 구분', () => {
  for (const reason of ['size', 'format', 'empty', 'unreadable']) {
    const html = render(
      createElement(Upload, uploadProps({ rejection: reason })),
    )
    assert.match(html, /role="alert"/)
    assert.match(
      text(html),
      new RegExp(policy.PHOTO_REJECTION_MESSAGE[reason].slice(0, 8)),
    )
  }
  // 서버 미연결(unknown): 사용 횟수 규칙 안내만 있고 남은 횟수 숫자를 만들지 않는다. 사진 고르기·미리보기는 열려 있다.
  const unknown = render(
    createElement(Upload, uploadProps({ access: 'unknown' })),
  )
  assert.match(unknown, /data-photo-usage-note/)
  assert.match(text(unknown), /공통 사용 횟수를 함께 써요/)
  assert.match(
    text(unknown),
    /무료 AI 체험은 최초 5회이고 월간 초기화는 없어요/,
  )
  assert.match(unknown, /type="file"/)
  assert.doesNotMatch(text(unknown), /남은 횟수[^.]*\d|\d회 남/)
  // 서버가 확인한 잔여가 있으면(available) 추가 안내 없이 평소 화면이다.
  assert.doesNotMatch(
    render(createElement(Upload, uploadProps())),
    /data-photo-usage-note|data-photo-access/,
  )
  // 잔여 0(exhausted): 신규 AI 요청의 입력 영역(사진 등록·분석 시작)을 보이지 않고 멤버십 안내와 직접 입력만 둔다(명세 I04 error).
  const none = render(
    createElement(Upload, uploadProps({ access: 'exhausted' })),
  )
  assert.match(none, /data-photo-access="exhausted"/)
  assert.match(none, /AI 사용 횟수를 모두 사용했어요/)
  assert.match(none, /href="\/settings\/membership"/)
  assert.match(
    none,
    /data-photo-manual=""[^>]*>|href="\/records\/meal\/record"/,
  )
  assert.match(none, /직접 입력하기/)
  assert.doesNotMatch(none, /type="file"|data-photo-card|data-photo-start/)
  // 연결이 있고 사진이 있어도 소진이면 입력 영역이 없다.
  const picked = render(
    createElement(
      Upload,
      uploadProps({
        access: 'exhausted',
        connected: true,
        photo: { name: 'a.jpg', size: 1024, url: 'blob:x' },
      }),
    ),
  )
  assert.doesNotMatch(picked, /data-photo-start|data-photo-selected/)
})

test('I04 서버가 확인한 잔여 횟수(available)는 버튼 위에 서버 값 그대로 보이고 확인 전에는 숫자를 만들지 않는다', () => {
  const html = render(
    createElement(Upload, uploadProps({ access: 'available', remaining: 3 })),
  )
  assert.match(
    html,
    /data-photo-remaining="3"[^>]*>[\s\S]*?AI 사용 남은 횟수[\s\S]*?3[\s\S]*?회/,
  )
  assert.match(text(html), /운동·식단 AI 공통 사용 횟수예요/)
  // 버튼 바로 위(같은 하단 영역 안, 분석 시작 앞)에 있다.
  assert.ok(
    html.indexOf('data-photo-remaining') < html.indexOf('data-photo-start'),
  )
  for (const access of ['unknown', 'exhausted'])
    assert.doesNotMatch(
      render(createElement(Upload, uploadProps({ access, remaining: null }))),
      /data-photo-remaining|AI 사용 남은 횟수/,
    )
  // 값이 없으면(null) available이어도 숫자를 만들지 않는다.
  assert.doesNotMatch(
    render(createElement(Upload, uploadProps({ access: 'available' }))),
    /data-photo-remaining/,
  )
})

const PHOTO = { name: 'dinner.png', size: 1000, url: 'blob:dinner' }
const today = new Date(2026, 10, 22)
const analysisProps = (analysis) => ({
  photo: PHOTO,
  analysis,
  access: 'unknown',
  today,
  onCancel: noop,
  onRetry: noop,
})

test('I04-1 분석 중: 대화 로그·사진 말풍선·진행 안내·취소, 결과 표현 없음', () => {
  const html = render(
    createElement(Analysis, analysisProps({ status: 'analyzing' })),
  )
  const t = text(html)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.match(html, /role="log"[^>]*aria-live="polite"/)
  assert.match(html, /aria-busy="true"/)
  assert.match(t, /2026년 11월 22일/)
  assert.match(html, /<img[^>]*src="blob:dinner"[^>]*object-contain/)
  assert.match(t, /dinner\.png/)
  assert.match(t, /사진을 받았어요\. 분석하는 중이에요/)
  assert.match(t, /분석 취소/)
  assert.doesNotMatch(t, /kcal|합계|사진 속 음식을 찾았어요/)
})

test('I04-1 결과: 서버가 준 음식·양·열량·합계만 보이고 추정값 안내와 식단 기록 연결이 있다', () => {
  const result = {
    foods: [
      { name: '비빔밥', amountText: '1그릇', kcal: 560 },
      { name: '미역국', amountText: null, kcal: null },
    ],
    totalKcal: null,
    summary: null,
    partial: false,
  }
  const html = render(
    createElement(Analysis, analysisProps({ status: 'ready', result })),
  )
  const t = text(html)
  assert.match(t, /사진 속 음식을 찾았어요/)
  assert.match(t, /비빔밥 1그릇 약 560kcal/)
  // 서버가 주지 않은 값은 만들지 않는다: 양·열량이 null이면 "정보 없음"이고 합계를 더해 만들지 않는다.
  assert.match(t, /미역국 양 정보 없음 열량 정보 없음/)
  assert.match(t, /합계를 확인하지 못했어요/)
  assert.doesNotMatch(t, /약 560kcal 합계|합계 약/)
  assert.match(
    t,
    /추정값이에요\. 실제와 다를 수 있고, 알레르기 확인에는 쓸 수 없어요/,
  )
  assert.match(t, /자동으로 기록되지 않아요/)
  assert.match(html, /href="\/records\/meal\/record"/)
  assert.match(html, /href="\/ai\/meal\/photo"/)
  assert.doesNotMatch(html, /data-photo-dev/)
})

test('I04-1 합계·일부 실패·한 줄 설명은 서버 값 그대로 보인다', () => {
  const result = {
    foods: [{ name: '샐러드', amountText: '1접시', kcal: 120 }],
    totalKcal: 120,
    summary: '가벼운 한 끼예요.',
    partial: true,
  }
  const t = text(
    render(createElement(Analysis, analysisProps({ status: 'ready', result }))),
  )
  assert.match(t, /합계 약 120kcal/)
  assert.match(t, /가벼운 한 끼예요/)
  assert.match(t, /일부 음식은 인식하지 못했어요/)
})

test('I04-1 결과 없음·실패·연결 전·시작 전: 각각 다른 안내이고 영양정보를 채우지 않는다', () => {
  const states = {
    empty: [/사진에서 음식을 찾지 못했어요/, /다른 사진 선택/, /직접 입력하기/],
    error: [/분석하지 못했어요/, /다시 시도/, /사진은 그대로 남아 있어요/],
    unavailable: [
      /분석 서버가 아직 연결되지 않았어요/,
      /서버로 보내지 않았어요/,
      /직접 입력하기/,
    ],
    idle: [/분석을 시작하지 않았어요/, /사진 화면으로 돌아가기/],
  }
  for (const [status, patterns] of Object.entries(states)) {
    const html = render(createElement(Analysis, analysisProps({ status })))
    const t = text(html)
    for (const pattern of patterns) assert.match(t, pattern, status)
    assert.doesNotMatch(t, /kcal|합계|사진 속 음식을 찾았어요/, status)
    assert.match(html, new RegExp(`data-analysis-state="${status}"`))
  }
  // 실패만 role=alert이다.
  assert.match(
    render(createElement(Analysis, analysisProps({ status: 'error' }))),
    /role="alert"/,
  )
})

test('연결 경계: 개발 환경에서는 실제 분석 소스를 만들고 예시 표지도 지원한다', async () => {
  assert.equal(typeof contract.createPhotoAnalysisSource()?.analyze, 'function')
  assert.equal(dev.parseDevAnalysisPreview('?devAnalysis=result'), 'result')
  assert.equal(dev.parseDevAnalysisPreview('?devAnalysis=nope'), null)
  assert.equal(dev.parseDevAnalysisPreview(''), null)
  const controller = new AbortController()
  const source = dev.devAnalysisSource('empty')
  const fakeFile = file(PNG, 'a.png', 'image/png')
  // jsdom 없이 타이머가 있으므로 취소로 즉시 끝낸다.
  const pending = source.analyze(fakeFile, controller.signal)
  controller.abort()
  await assert.rejects(pending, /취소/)
  assert.equal(contract.IDLE_ANALYSIS.status, 'idle')
})

test('개발 예시 결과 표지: DEV에서만 보이고 실제 결과에는 없다', () => {
  const html = render(
    createElement(
      Analysis,
      analysisProps({
        status: 'ready',
        result: {
          foods: [{ name: '예시', amountText: null, kcal: null }],
          totalKcal: null,
          summary: null,
          partial: false,
          example: true,
        },
      }),
    ),
  )
  // 이 테스트는 Vite 개발 모드(import.meta.env.DEV=true)에서 렌더한다.
  assert.match(
    text(html),
    /개발용 예시 결과예요\. 선택한 사진을 분석한 결과가 아니에요/,
  )
})

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
  return out
}

test('사진·결과를 저장하거나 전송하지 않는다(저장소·전송 API·router state 사용 없음)', () => {
  const dirs = ['src/photo-analysis', 'src/components/ai/photo']
  const files = [
    ...dirs.flatMap((d) => walk(fileURLToPath(new URL(d, root)))),
    fileURLToPath(new URL('src/pages/AiPhotoPage.tsx', root)),
    fileURLToPath(new URL('src/pages/AiPhotoAnalysisPage.tsx', root)),
  ]
  assert.ok(files.length >= 8)
  for (const path of files) {
    const code = readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(
      code,
      /localStorage|sessionStorage|indexedDB|document\.cookie|FormData|fetch\(|XMLHttpRequest|sendBeacon|readAsDataURL|FileReader|WebSocket/,
      relative(fileURLToPath(root), path),
    )
    // 사진은 router state·주소로 넘기지 않는다(state는 from 경로만).
    assert.doesNotMatch(code, /state:\s*\{[^}]*(photo|file|url)/i, path)
  }
  // 미리보기 주소는 만든 쪽이 해제한다.
  const provider = read('src/photo-analysis/PhotoAnalysisFlowProvider.tsx')
  assert.match(provider, /URL\.createObjectURL/)
  assert.match(provider, /URL\.revokeObjectURL/)
})

test('라우트: I04·I04-1은 회원 전용(AuthGate 아래)이고 상위 화면과 제목 규칙이 맞다', () => {
  const router = read('src/app/router.tsx')
  const start = router.indexOf("path: 'ai/meal/photo',")
  assert.ok(start > 0)
  const gate = router.lastIndexOf('element: <AuthGate />', start)
  const open = router.lastIndexOf('element: <AuthOrExperienceGate />', start)
  assert.ok(gate > open)
  const i04 = router.slice(start, start + 600)
  assert.match(i04, /screenId: 'I04'/)
  assert.match(i04, /parent: '\/ai'/)
  assert.match(i04, /ownH1: true/)
  const i041 = router.slice(
    router.indexOf("path: 'ai/meal/photo/analysis'"),
    router.indexOf("path: 'ai/meal/photo/analysis'") + 600,
  )
  assert.match(i041, /screenId: 'I04-1'/)
  assert.match(i041, /parent: '\/ai\/meal\/photo'/)
  assert.match(read('src/App.tsx'), /<PhotoAnalysisFlowProvider>/)
})

test('I04-1 사용 횟수 소진: 서버가 거절하면(exhausted 상태) 멤버십 안내와 직접 입력만 있고 다시 시도는 없다', () => {
  const html = render(
    createElement(Analysis, analysisProps({ status: 'exhausted' })),
  )
  assert.match(html, /data-analysis-state="exhausted"/)
  assert.match(html, /AI 사용 횟수를 모두 사용했어요/)
  assert.match(html, /href="\/settings\/membership"/)
  assert.match(html, /직접 입력하기/)
  assert.doesNotMatch(html, /data-analysis-retry|다시 시도|분석 취소|다른 사진/)
  assert.doesNotMatch(text(html), /\d+\s*kcal/)
})

test('I04-1 서버가 확인한 잔여가 0(access exhausted)이면 새 요청(다시 시도·다시 분석·다른 사진)을 숨기고 받은 결과는 그대로 보인다', () => {
  const props = (analysis, access) => ({ ...analysisProps(analysis), access })
  const result = {
    foods: [{ name: '예시', amountText: '1공기', kcal: 100 }],
    totalKcal: 100,
    summary: null,
    partial: false,
  }
  const ready = (access) =>
    render(createElement(Analysis, props({ status: 'ready', result }, access)))
  // 소진 전: 다시 분석 링크가 있다. 소진 후: 결과·식단 기록 연결은 그대로, 다시 분석은 없다.
  assert.match(ready('available'), /data-analysis-again/)
  const done = ready('exhausted')
  assert.doesNotMatch(done, /data-analysis-again|다시 분석/)
  assert.match(done, /data-analysis-result/)
  assert.match(done, /식단 기록하러 가기/)
  const error = (access) =>
    render(createElement(Analysis, props({ status: 'error' }, access)))
  assert.match(error('available'), /data-analysis-retry/)
  assert.doesNotMatch(error('exhausted'), /data-analysis-retry|다시 시도/)
  assert.match(error('exhausted'), /직접 입력하기/)
  const empty = render(
    createElement(Analysis, props({ status: 'empty' }, 'exhausted')),
  )
  assert.doesNotMatch(empty, /다른 사진 선택/)
  assert.match(empty, /직접 입력하기/)
})

test('I04-1 날짜 구분에 시간이 있고 결과는 한 번만 페이드 인하며 모션 줄이기에서는 없다', () => {
  const html = render(
    createElement(
      Analysis,
      analysisProps({
        status: 'ready',
        result: {
          foods: [{ name: '예시', amountText: null, kcal: null }],
          totalKcal: null,
          summary: null,
          partial: false,
        },
      }),
    ),
  )
  assert.match(text(html), /2026년 11월 22일[^]*?(오전|오후) \d{1,2}:\d{2}/)
  assert.match(
    html,
    /data-analysis-state="ready"[^>]*animate-route-fade[^>]*motion-reduce:animate-none|animate-route-fade motion-reduce:animate-none[^>]*data-analysis-state="ready"/,
  )
  // 분석 중·실패 같은 다른 상태에는 등장 애니메이션을 붙이지 않는다.
  assert.doesNotMatch(
    render(createElement(Analysis, analysisProps({ status: 'error' }))),
    /animate-route-fade/,
  )
})

test('연결 경계: 서버 소진 거절은 PhotoAnalysisQuotaError로 알리고 Provider가 일반 실패와 구분한다(사용량은 화면이 판정하지 않는다)', async () => {
  const error = new contract.PhotoAnalysisQuotaError()
  assert.ok(error instanceof Error)
  assert.equal(error.name, 'PhotoAnalysisQuotaError')
  // 개발 검증 상태 exhausted는 이 오류로 거절한다.
  assert.equal(
    dev.parseDevAnalysisPreview('?devAnalysis=exhausted'),
    'exhausted',
  )
  await assert.rejects(
    dev
      .devAnalysisSource('exhausted')
      .analyze(file(PNG, 'a.png', 'image/png'), new AbortController().signal),
    (e) => e instanceof contract.PhotoAnalysisQuotaError,
  )
  const provider = read(
    'src/photo-analysis/PhotoAnalysisFlowProvider.tsx',
  ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.match(provider, /instanceof PhotoAnalysisQuotaError/)
  assert.match(provider, /status: 'exhausted'/)
  // 화면·Provider 어디에도 사용량을 계산·차감·저장하는 코드가 없다.
  for (const path of [
    'src/photo-analysis/PhotoAnalysisFlowProvider.tsx',
    'src/components/ai/photo/PhotoAnalysisView.tsx',
    'src/components/ai/photo/PhotoUploadView.tsx',
    'src/pages/AiPhotoAnalysisPage.tsx',
    'src/pages/AiPhotoPage.tsx',
  ])
    assert.doesNotMatch(
      read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''),
      /remaining\s*(-=|--|\+=)|decrement|deductUsage|consumeUsage|setRemaining|localStorage|sessionStorage|indexedDB/i,
      path,
    )
})

test('I04 사진 입력 영역은 AI 요청 권한이 소진되면 보이지 않고 I04-1 재요청은 소진 상태에서 시작되지 않는다(페이지 연결)', () => {
  const page = read('src/pages/AiPhotoAnalysisPage.tsx')
  assert.match(page, /useAiAccess\(\)/)
  assert.match(page, /access !== 'exhausted'/)
  assert.match(read('src/pages/AiPhotoPage.tsx'), /useAiAccessInfo\(\)/)
})

test('D02 식단 기록에서 I04로 가는 진입 링크가 오늘 기록(record)에만 있고 내일 계획(plan)에는 없다', () => {
  const view = read('src/components/food/MealRecordView.tsx')
  assert.match(view, /variant === 'record' \? \(/)
  assert.match(view, /to=\{PATH_PHOTO\}/)
  assert.match(view, /state=\{\{ from: PATH_MEAL_RECORD \}\}/)
  assert.match(view, /data-photo-entry/)
  assert.match(view, /사진으로 식단 기록하기/)
})
