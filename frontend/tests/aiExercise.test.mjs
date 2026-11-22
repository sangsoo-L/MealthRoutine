import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// I02 AI 운동 플랜 안내(/ai/exercise) 테스트: 예시 데이터가 실제 카탈로그와 맞는지, 재생 프레임, 화면, 범위 준수. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Example
let Catalog
let RecordMode
let View

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Example = await server.ssrLoadModule('/src/ai/exercisePlanExample.ts')
  Catalog = (
    await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  ).getSeedCatalog()
  RecordMode = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  View = (
    await server.ssrLoadModule(
      '/src/components/ai/exercise/ExercisePlanGuideView.tsx',
    )
  ).default
})
after(async () => {
  await server.close()
})

const html = () =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(View)))

test('예시 데이터: 모든 운동이 카탈로그(105개)에 실제로 있고 이름·기록 방식·난이도·부위·도구가 조건과 맞는다', () => {
  const all = Catalog.getAllExercises()
  assert.equal(all.length, 105)
  assert.equal(Example.PLAN_EXAMPLES.length, 2)
  assert.deepEqual(
    Example.PLAN_EXAMPLES.map((e) => e.tabLabel),
    ['맨몸 · 10분', '덤벨 · 20분'],
  )
  for (const example of Example.PLAN_EXAMPLES) {
    const c = example.conditions
    assert.ok(example.rows.length >= 3, example.key)
    assert.equal(
      new Set(example.rows.map((r) => r.exerciseId)).size,
      example.rows.length,
    )
    for (const row of example.rows) {
      const exercise = all.find((item) => item.id === row.exerciseId)
      assert.ok(exercise, `${example.key}: ${row.exerciseId}가 카탈로그에 없다`)
      assert.equal(exercise.name, row.name)
      // 카탈로그가 허용하는 기록 방식과 호환된다(저장 코드 기준).
      const allowed = (exercise.recordModes?.allowed ?? []).map(
        RecordMode.toStoredRecordType,
      )
      assert.ok(
        allowed.includes(row.recordType),
        `${row.name} 방식 ${row.recordType}`,
      )
      // 조건과 일치: 난이도·부위·도구
      assert.equal(exercise.difficulty, c.difficulty, row.name)
      assert.ok(c.parts.includes(exercise.category), `${row.name} 부위`)
      assert.ok(
        exercise.equipment.every((tool) => c.tools.includes(tool)),
        `${row.name} 도구`,
      )
      // 세트 값은 양의 정수이고 방식에 맞는 필드만 있다. 중량 값은 만들지 않는다.
      assert.ok(Number.isInteger(row.sets) && row.sets >= 1 && row.sets <= 5)
      if (row.recordType === 'time') {
        assert.ok(Number.isInteger(row.seconds) && row.seconds > 0)
        assert.equal(row.reps, undefined)
      } else {
        assert.ok(Number.isInteger(row.reps) && row.reps > 0)
        assert.equal(row.seconds, undefined)
      }
      assert.equal('weightKg' in row, false)
    }
    assert.ok([10, 20].includes(c.minutes))
  }
  // 첫 예시는 맨몸만, 둘째는 덤벨 도구를 쓰는 예시다.
  assert.deepEqual(Example.PLAN_EXAMPLES[0].conditions.tools, ['맨몸'])
  assert.ok(Example.PLAN_EXAMPLES[1].conditions.tools.includes('덤벨'))
})

test('표시 글자: 횟수·시간은 값 그대로이고 중량은 값을 만들지 않고 직접 입력으로 안내한다', () => {
  const [bodyweight, dumbbell] = Example.PLAN_EXAMPLES
  assert.equal(
    Example.rowDetail(bodyweight.rows[0]),
    '2세트 × 8회 · 세트 사이 휴식 60초',
  )
  assert.equal(
    Example.rowDetail(bodyweight.rows[2]),
    '2세트 × 20초 · 세트 사이 휴식 60초',
  )
  assert.equal(
    Example.rowDetail(dumbbell.rows[0]),
    '3세트 × 10회 · 세트 사이 휴식 75초 · 중량 직접 입력',
  )
  for (const row of dumbbell.rows.filter((r) => r.recordType === 'weight')) {
    assert.doesNotMatch(Example.rowDetail(row), /\d+\s*kg/i)
  }
  assert.equal(
    Example.conditionValue(dumbbell.conditions, '시간'),
    '휴식 포함 20분',
  )
  assert.equal(Example.conditionValue(bodyweight.conditions, '도구'), '맨몸')
})

test('재생 프레임: 조건 입력 4단계 → 구성 중 → 추천 행 → 날짜 선택 → 완료 순서이고 모션 줄이기 정지 장면은 목록이 모두 나온 장면이다', () => {
  for (const example of Example.PLAN_EXAMPLES) {
    const frames = Example.buildFrames(example)
    assert.deepEqual(
      frames.slice(0, 5).map((f) => f.phase),
      ['input', 'input', 'input', 'input', 'loading'],
    )
    assert.deepEqual(
      frames.slice(0, 4).map((f) => f.filled),
      [1, 2, 3, 4],
    )
    const rows = frames.filter((f) => f.phase === 'rows')
    assert.deepEqual(
      rows.map((f) => f.shown),
      example.rows.map((_, index) => index + 1),
    )
    assert.deepEqual(
      frames.slice(-3).map((f) => f.phase),
      ['register', 'register', 'done'],
    )
    assert.equal(frames.at(-3).date, null)
    assert.equal(frames.at(-2).date, Example.registerDateOf(example.key))
    assert.equal(frames.length, 5 + example.rows.length + 3)
    const still = frames[Example.staticFrameIndex(example)]
    assert.equal(still.phase, 'rows')
    assert.equal(still.shown, example.rows.length)
  }
  assert.equal(Example.registerDateOf('bodyweight'), 'today')
  assert.equal(Example.registerDateOf('dumbbell'), 'tomorrow')
  assert.ok(Example.LAST_FRAME_MS > Example.FRAME_MS)
})

test('화면: 고정 예시임을 분명히 표시하고 예시 탭 2개·재생 버튼·등록 뒤 흐름·조건 선택 CTA(I02-1 링크)가 있다', () => {
  const out = html()
  assert.match(out, /<h1[^>]*>AI 운동 플랜<\/h1>/)
  assert.equal((out.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(out, /고정 예시/)
  assert.match(out, /data-fixed-example-note/)
  assert.match(out, /실제 AI 추천 결과가 아니에요/)
  assert.match(out, /aria-pressed="true"[^>]*>맨몸 · 10분/)
  assert.match(out, /aria-pressed="false"[^>]*>덤벨 · 20분/)
  // 서버 렌더링(모션 줄이기 판별 불가)에서는 재생 중으로 시작한다.
  assert.match(out, /예시 일시정지/)
  assert.match(out, /data-frame-phase="input"/)
  assert.match(out, /등록한 뒤에는/)
  assert.match(out, /운동 목록 확인/)
  assert.match(out, /기본 운동·식단 기록은 무료예요/)
  // 조건 선택 CTA는 I02-1(회원 전용, 비회원은 로그인 안내 뒤 돌아옴)로 가는 링크다.
  assert.match(out, /data-plan-cta=""[^>]*>운동 조건 선택하기/)
  assert.doesNotMatch(out, /조건 선택 화면은 준비 중이에요/)
  // 이동 링크는 조건 선택(I02-1)과 이미 있는 운동 기록뿐이다.
  const links = [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(links, ['/ai/exercise/plan', '/records/exercise'])
  // 보조기기에는 움직이는 무대 대신 정적 목록을 알린다.
  assert.match(out, /aria-hidden="true"[^>]*class="h-full"/)
  assert.match(out, /sr-only[\s\S]*월 푸시업, 2세트 × 8회/)
})

test('화면: 체험 횟수 안내를 넣지 않고 실제 AI·저장·결과처럼 쓰지 않는다', () => {
  const out = html()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  assert.doesNotMatch(out, /체험|5회|남은 횟수|차감/)
  assert.doesNotMatch(
    out,
    /AI가 분석|분석 완료|맞춤 추천 결과|저장했어요|등록했어요/,
  )
  assert.match(
    out,
    /예시 화면이라 실제로 등록되지 않아요|예시 화면이라 실제 목록은 만들어지지 않아요|미리 정해 둔 고정 예시/,
  )
})

test('재생 제어 구현: 정지·백그라운드·모션 줄이기·언마운트 정리가 있다', () => {
  const hook = code('../src/ai/useExamplePlayback.ts')
  assert.match(hook, /prefers-reduced-motion: reduce/)
  assert.match(hook, /useState\(!reduced\)/) // 모션 줄이기면 정지로 시작
  assert.match(hook, /document\.hidden/)
  assert.match(hook, /visibilitychange/)
  assert.match(hook, /clearTimeout\(timer\)/)
  assert.match(hook, /removeEventListener\('visibilitychange'/)
  assert.match(hook, /removeEventListener\('change'/)
  // 로더 애니메이션도 모션 줄이기에서 멈춘다.
  const view = read('../src/components/ai/exercise/ExercisePlanGuideView.tsx')
  assert.match(view, /motion-reduce:animate-none/)
  assert.match(view, /motion-reduce:transition-none/)
})

test('범위 준수: 저장소·초안·API·체험 처리·I02-1 구현이 없고 라우트는 I02 공개 화면이다', () => {
  for (const file of [
    '../src/ai/exercisePlanExample.ts',
    '../src/ai/useExamplePlayback.ts',
    '../src/components/ai/exercise/ExercisePlanGuideView.tsx',
    '../src/pages/AiExercisePage.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|useWorkoutDraft|replaceDraft|saveFromDraft|getExercisePlanAccess|recommend\//,
      file,
    )
  }
  const router = read('../src/app/router.tsx')
  const route = router.slice(router.indexOf("path: 'ai/exercise',"))
  assert.match(route.slice(0, 500), /element: <AiExercisePage \/>/)
  assert.match(route.slice(0, 600), /screenId: 'I02'/)
  assert.match(route.slice(0, 600), /tab: 'ai'/)
  assert.match(route.slice(0, 600), /parent: '\/ai'/)
  assert.doesNotMatch(route.slice(0, 600), /AuthGate/)
  // W12의 AI 추천 카드는 I02-1 로컬 예시로 연결되고 "로컬 예시"로 표시한다(실제 AI 아님).
  const w12 = read('../src/pages/ExerciseMethodPage.tsx')
  assert.match(w12, /PATH_AI_PLAN = '\/ai\/exercise\/plan'/)
  assert.match(w12, /로컬 예시/)
  assert.doesNotMatch(w12, /AI 추천으로 시작하기, 준비 중/)
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})
