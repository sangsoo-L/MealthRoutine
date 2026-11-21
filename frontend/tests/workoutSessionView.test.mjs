import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// W14 화면(SessionView) 렌더링. 라우터·저장소 없이 snapshot과 props만으로 그린다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let View
let M
let Parts
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  View = (
    await server.ssrLoadModule(
      '/src/components/exercise/session/SessionView.tsx',
    )
  ).default
  Parts = await server.ssrLoadModule(
    '/src/components/exercise/session/SessionParts.tsx',
  )
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const at = (seconds) => new Date(T0.getTime() + seconds * 1000)
const list = () => ({
  id: 'l1',
  ownerId: 'u',
  schemaVersion: 1,
  plannedDate: '2026-11-13',
  catalogVersion: 'x',
  revision: 1,
  requestId: 'r',
  createdAt: T0.toISOString(),
  updatedAt: T0.toISOString(),
  items: [
    {
      exerciseId: 'e1',
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 10 }, { reps: 10 }],
    },
    {
      exerciseId: 'e2',
      exerciseNameSnapshot: '덤벨 컬',
      recordType: 'weight',
      sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
    },
    {
      exerciseId: 'e3',
      exerciseNameSnapshot: '플랭크',
      recordType: 'time',
      sets: [{ targetSeconds: 60 }],
    },
  ],
})
const session = (over = {}) => ({
  ...M.createWorkoutSession({ id: 's1', ownerId: 'u', list: list(), now: T0 }),
  ...over,
})
const snap = (s, over = {}) => ({
  load: { status: 'ready' },
  sessionId: s.id,
  session: s,
  revision: s.revision,
  save: {
    saving: false,
    dirty: false,
    failed: false,
    reason: null,
    fatal: false,
  },
  restorePending: false,
  timerBlocked: false,
  timerRunning: s.timer.runningSince !== null,
  pausedByHide: false,
  conflict: null,
  needsLeavePreparation: false,
  warnBeforeUnload: false,
  leave: { action: 'allow' },
  result: null,
  ...over,
})
const actions = new Proxy({}, { get: () => noop })
const render = (snapshot, props = {}) =>
  renderToStaticMarkup(
    createElement(View, {
      snapshot,
      mode: 'simple',
      levelFailed: false,
      now: T0,
      lastCompleted: null,
      panel: null,
      message: null,
      actions,
      ...props,
    }),
  )
const done = (s, ...positions) => {
  const performed = s.performed.map((sets) => sets.map((set) => ({ ...set })))
  for (const [i, j] of positions) {
    performed[i][j] =
      s.listSnapshot.items[i].recordType === 'time'
        ? { completed: true, measuredMs: 61000 }
        : { completed: true, actualReps: 12 }
  }
  return { ...s, performed }
}
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })

// ── 공통 ────────────────────────────────────────────────────────────
test('공통: 제목·운동 순서·전체 진행률·세트 진행 표시·이동·나가기·그만두기', () => {
  const html = render(snap({ ...done(session(), [0, 0]), cursor: pos(0, 1) }))
  assert.match(html, /<h1[^>]*>운동 진행<\/h1>/)
  assert.match(html, /운동 1 \/ 3/)
  assert.match(html, /완료 1 \/ 5세트/)
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="1"/)
  assert.match(html, /aria-valuetext="5세트 중 1세트 완료, 20%"/)
  assert.match(html, /푸시업/)
  assert.match(html, /횟수형/)
  assert.match(html, /aria-label="세트 진행, 1 \/ 2세트 완료"/)
  assert.match(html, /aria-current="step"/)
  assert.match(html, /1세트<span class="sr-only"> 완료/)
  assert.match(html, /2세트<span class="sr-only"> 진행 중/)
  // 첫 운동에서는 이전 운동이 비활성, 다음 운동은 활성
  assert.match(html, /aria-disabled="true"[^>]*>이전 운동/)
  assert.match(html, /aria-disabled="false"[^>]*>다음 운동/)
  assert.match(html, /나가기/)
  assert.match(html, /그만두기/)
  // 완료 세트가 있으면 결과 확인(W15)으로 이동하는 버튼이 있다. 준비 중 안내는 없다.
  assert.match(html, /aria-disabled="false"[^>]*>운동 결과 확인/)
  assert.match(html, /결과를 확인하고 저장할 수 있어요/)
  assert.doesNotMatch(html, /여기까지 종료|준비 중이에요/)
})

test('완료 세트가 없으면 "운동 결과 확인"을 보이지 않는다', () => {
  assert.doesNotMatch(render(snap(session())), /운동 결과 확인/)
})

test('충돌·저장 불가 상태에서는 "운동 결과 확인"이 비활성이고 이유를 안내한다', () => {
  const html = render(
    snap(done(session(), [0, 0]), { conflict: { kind: 'changed' } }),
  )
  assert.match(html, /aria-disabled="true"[^>]*>운동 결과 확인/)
  assert.match(html, /충돌 상태라 결과를 확인할 수 없어요/)
})

test('결과 이동 패널: 확인(측정 시간 미기록 안내)·이동 중·실패', () => {
  const base = snap(done(session(), [0, 0]))
  const confirm = render(base, {
    panel: { kind: 'result', step: 'confirm', reason: null },
  })
  assert.match(confirm, /측정 중인 시간은 기록되지 않아요/)
  assert.match(confirm, /결과 확인으로 이동/)
  const busy = render(base, {
    panel: { kind: 'result', step: 'busy', reason: null },
  })
  assert.match(busy, /결과로 이동하는 중이에요/)
  assert.match(busy, /aria-disabled="true"[^>]*>취소/)
  assert.doesNotMatch(busy, /결과 확인으로 이동/)
  const failed = render(base, {
    panel: {
      kind: 'result',
      step: 'failed',
      reason: '진행 상태를 저장하지 못했어요.',
    },
  })
  assert.match(failed, /결과 화면으로 이동하지 못했어요/)
  assert.match(failed, /role="alert"[^>]*>진행 상태를 저장하지 못했어요/)
  assert.match(failed, /다시 시도/)
  assert.match(failed, /머무르기/)
})

// ── 횟수형 ──────────────────────────────────────────────────────────
test('횟수형 간단 입력: 목표 횟수와 세트 완료 버튼, 접힌 실제 횟수 고치기, 목표 값이 저장된다는 안내', () => {
  const html = render(snap(session()), { mode: 'simple' })
  assert.match(html, /목표 10회/)
  assert.match(html, /<summary[^>]*>실제 횟수 고치기/)
  assert.match(html, /세트 완료/)
  assert.match(html, /목표 횟수가 기록으로 저장돼요/)
  assert.doesNotMatch(html, /inputMode="numeric"|inputmode="numeric"/)
})

test('횟수형 상세 입력: 실제 횟수가 목표로 채워져 있고 − / ＋ 버튼이 있다', () => {
  const html = render(snap(session()), { mode: 'detailed' })
  assert.match(html, /실제 횟수/)
  assert.match(html, /inputMode="numeric"|inputmode="numeric"/)
  assert.match(html, /value="10"/)
  assert.match(html, /aria-label="횟수 1 줄이기"/)
  assert.match(html, /aria-label="횟수 1 늘리기"/)
  assert.doesNotMatch(html, /<summary/)
  assert.doesNotMatch(html, /목표 횟수가 기록으로 저장돼요/)
})

// ── 중량형 ──────────────────────────────────────────────────────────
test('중량형: 목표 횟수·중량을 구분해 보이고 상세 모드는 횟수와 중량을 입력한다', () => {
  const s = done(session(), [0, 0], [0, 1])
  const sim = render(snap({ ...s, cursor: pos(1, 0) }), { mode: 'simple' })
  assert.match(sim, /덤벨 컬/)
  assert.match(sim, /중량\+횟수형/)
  assert.match(sim, /목표 10회 · 8kg/)
  assert.match(sim, /<summary[^>]*>실제 값 고치기/)
  assert.match(sim, /목표 횟수와 중량이 기록으로 저장돼요/)
  const det = render(snap({ ...s, cursor: pos(1, 0) }), { mode: 'detailed' })
  assert.match(det, /실제 횟수/)
  assert.match(det, /실제 중량\(kg\)/)
  assert.match(det, /inputMode="decimal"|inputmode="decimal"/)
  assert.match(det, /value="8"/)
  // 목표 중량이 없는 세트
  const noWeight = render(snap({ ...s, cursor: pos(1, 1) }), {
    mode: 'detailed',
  })
  assert.match(noWeight, /목표 12회</)
  assert.match(noWeight, /id="[^"]*-weight"[^>]*value=""/)
})

// ── 시간형 ──────────────────────────────────────────────────────────
const timeSession = (timer, over = {}) =>
  session({ cursor: pos(2, 0), timer, ...over })

test('시간형 대기: 목표 시간 카운트다운과 시작 버튼, 타이머로 측정해야 완료할 수 있다는 안내', () => {
  const html = render(
    snap(timeSession({ accumulatedMs: 0, runningSince: null })),
  )
  assert.match(html, /플랭크/)
  assert.match(html, /시간형/)
  assert.match(html, /role="timer"[^>]*aria-live="off"/)
  assert.match(html, /남은 시간 1:00, 대기 중/)
  assert.match(html, />1:00</)
  assert.match(html, /목표 1분/)
  assert.match(html, />시작</)
  assert.match(html, /타이머로 시간을 측정해야 세트를 완료할 수 있어요/)
  assert.match(html, /세트 완료/)
})

test('시간형 측정 중·일시정지·목표 도달·초과 표시', () => {
  const running = { accumulatedMs: 0, runningSince: T0.toISOString() }
  const mid = render(snap(timeSession(running)), { now: at(45) })
  assert.match(mid, /남은 시간 0:15, 측정 중/)
  assert.match(mid, />일시정지</)
  assert.doesNotMatch(mid, />시작</)
  assert.match(mid, /자동으로 완료하지 않아요/)
  const reached = render(snap(timeSession(running)), { now: at(60) })
  assert.match(reached, /목표에 도달했어요/)
  assert.match(reached, /세트 완료/)
  const over = render(snap(timeSession(running)), { now: at(72) })
  assert.match(over, /목표 시간 초과 \+0:12/)
  assert.match(over, /목표를 넘겼어요/)
  assert.match(over, /stroke-warning/)
  const paused = render(
    snap(timeSession({ accumulatedMs: 20000, runningSince: null })),
  )
  assert.match(paused, /남은 시간 0:40, 일시정지됨/)
  assert.match(paused, />재개</)
})

test('시간형: 복원 저장 전·충돌·치명적 실패에서는 시작할 수 없고 이유를 알린다', () => {
  const idle = timeSession({ accumulatedMs: 0, runningSince: null })
  const restoring = render(
    snap(idle, { restorePending: true, timerBlocked: true }),
  )
  assert.match(restoring, /aria-disabled="true"[^>]*>시작/)
  assert.match(restoring, /저장된 타이머를 정지 상태로 불러오고 있어요/)
  const conflict = render(
    snap(idle, { conflict: { kind: 'changed' }, timerBlocked: true }),
  )
  assert.match(conflict, /충돌 상태라 타이머를 시작할 수 없어요/)
  const fatal = render(
    snap(idle, {
      save: {
        saving: false,
        dirty: true,
        failed: true,
        reason: 'invalidProgress',
        fatal: true,
      },
      timerBlocked: true,
    }),
  )
  assert.match(fatal, /저장할 수 없는 값이 있어 타이머를 시작할 수 없어요/)
})

// ── 완료한 세트·되돌리기·완료 안내 ──────────────────────────────────
test('완료한 세트는 읽기 전용으로 실제 값을 보이고 방금 완료한 세트만 되돌릴 수 있다', () => {
  const s = done(session(), [0, 0])
  const html = render(snap({ ...s, cursor: pos(0, 0) }), {
    lastCompleted: pos(0, 0),
  })
  assert.match(html, /1세트를 완료했어요/)
  assert.match(html, /실제 12회/)
  assert.match(html, /방금 완료한 세트 되돌리기/)
  assert.doesNotMatch(html, /목표 10회/)
  // 되돌릴 대상이 없거나 충돌이면 버튼이 없다
  assert.doesNotMatch(render(snap(s), { lastCompleted: null }), /되돌리기/)
  assert.doesNotMatch(
    render(
      snap({ ...s, cursor: pos(0, 0) }, { conflict: { kind: 'changed' } }),
      { lastCompleted: pos(0, 0) },
    ),
    /방금 완료한 세트 되돌리기/,
  )
  const timeDone = done(
    timeSession({ accumulatedMs: 0, runningSince: null }),
    [2, 0],
  )
  assert.match(render(snap(timeDone)), /측정 1:01/)
})

test('모든 세트를 마치면 W14는 저장 완료로 표시하지 않고 결과 확인으로 안내한다', () => {
  const all = done(session(), [0, 0], [0, 1], [1, 0], [1, 1], [2, 0])
  const html = render(snap({ ...all, cursor: pos(2, 0) }))
  assert.match(html, /모든 세트를 마쳤어요/)
  assert.match(html, /운동 결과를 확인하고 저장하면/)
  assert.match(html, /aria-disabled="false"[^>]*>운동 결과 확인/)
  assert.match(html, /운동 기록으로 돌아가기/)
  assert.doesNotMatch(html, /결과를 저장했어요|저장 완료|기록이 저장됐어요/)
  assert.doesNotMatch(html, /준비 중이에요/)
})

// ── 저장·충돌·복귀 안내 ─────────────────────────────────────────────
const failed = (reason, over = {}) => ({
  saving: false,
  dirty: true,
  failed: true,
  reason,
  fatal: reason === 'invalidProgress',
  ...over,
})

test('저장 실패 안내: 원인별 문구, 입력 유지, 다시 시도 / 치명적이면 최신 상태 불러오기', () => {
  for (const [reason, re] of [
    ['quota', /저장 공간이 부족/],
    ['unavailable', /이 브라우저에서는 저장할 수 없어요/],
    ['blocked', /다른 탭에서 운동 기록을 사용 중/],
    ['error', /진행 상태를 저장하지 못했어요/],
  ]) {
    const html = render(snap(session(), { save: failed(reason) }))
    assert.match(html, re, reason)
    assert.match(html, /입력한 내용은 이 화면에 남아 있어요/)
    assert.match(html, /저장 다시 시도/)
    assert.match(html, /role="alert"/)
  }
  const fatal = render(snap(session(), { save: failed('invalidProgress') }))
  assert.match(fatal, /저장할 수 없는 값이 있어요/)
  assert.match(fatal, /최신 상태 불러오기/)
  assert.doesNotMatch(fatal, /저장 다시 시도/)
  const restore = render(
    snap(session(), { save: failed('quota'), restorePending: true }),
  )
  assert.match(restore, /타이머를 정지 상태로 불러왔지만 저장하지 못했어요/)
  assert.match(
    render(
      snap(session(), {
        save: {
          saving: true,
          dirty: true,
          failed: false,
          reason: null,
          fatal: false,
        },
      }),
    ),
    /저장 중…/,
  )
})

test('충돌 안내: changed·ended·gone, 자동으로 합치지 않고 최신 상태 불러오기를 제공한다', () => {
  const changed = render(
    snap(session(), {
      conflict: { kind: 'changed' },
      save: {
        saving: false,
        dirty: true,
        failed: false,
        reason: null,
        fatal: false,
      },
    }),
  )
  assert.match(changed, /다른 탭에서 이 운동이 바뀌었어요/)
  assert.match(changed, /자동으로 합치지 않고 저장을 멈췄어요/)
  assert.match(changed, /이 화면에서 입력한 값은 아직 저장되지 않았어요/)
  assert.match(changed, /최신 상태 불러오기/)
  assert.match(
    render(snap(session(), { conflict: { kind: 'ended' } })),
    /다른 곳에서 이미 끝났어요/,
  )
  assert.match(
    render(snap(session(), { conflict: { kind: 'gone' } })),
    /찾을 수 없어요/,
  )
  // 충돌 중에는 세트 완료·이동이 막힌다
  const blocked = render(snap(session(), { conflict: { kind: 'changed' } }))
  assert.match(blocked, /aria-disabled="true"[^>]*>세트 완료/)
  assert.match(blocked, /aria-disabled="true"[^>]*>다음 운동/)
})

test('탭 복귀 안내: 자동 재개하지 않고 시간형이면 재개 버튼을 준다. 수준 조회 실패는 간단 입력 안내', () => {
  const idle = timeSession({ accumulatedMs: 5000, runningSince: null })
  const html = render(snap(idle, { pausedByHide: true }))
  assert.match(html, /타이머를 일시정지했어요\. 자동으로 재개하지 않아요/)
  assert.match(html, /타이머 재개/)
  const other = render(snap(session(), { pausedByHide: true }))
  assert.match(other, /자동으로 재개하지 않아요/)
  assert.doesNotMatch(other, /타이머 재개/)
  assert.match(
    render(snap(session()), { levelFailed: true }),
    /운동 수준을 확인하지 못해 간단 입력으로 진행해요/,
  )
  assert.doesNotMatch(render(snap(session())), /운동 수준을 확인하지 못해/)
})

// ── 패널 ────────────────────────────────────────────────────────────
test('이탈 차단 패널: 다시 시도 / 머무르기 / 그래도 나가기와 데이터 손실 안내', () => {
  const html = render(snap(session()), {
    panel: { kind: 'leave', unsavedCompletedSets: 2, retrying: false },
  })
  assert.match(html, /저장하지 못했어요/)
  assert.match(html, /완료 2세트와 입력, 측정 시간이 사라질 수 있어요/)
  assert.match(html, />다시 시도</)
  assert.match(html, /머무르기/)
  assert.match(html, /그래도 나가기 \(저장되지 않은 내용이 사라질 수 있어요\)/)
  assert.match(
    render(snap(session()), {
      panel: { kind: 'leave', unsavedCompletedSets: 0, retrying: true },
    }),
    /저장 중…/,
  )
})

test('그만두기 2단계·5배 초과·이동 시 타이머 버림·최신 상태 불러오기 패널', () => {
  const s = done(session(), [0, 0], [0, 1])
  const step1 = render(snap(s), {
    panel: { kind: 'abandon', step: 1, busy: false, failed: false },
  })
  assert.match(step1, /운동을 그만둘까요\?/)
  assert.match(step1, /완료한 2세트는 기록으로 저장되지 않아요/)
  assert.match(
    step1,
    /나가기를 누르면 진행 상태를 남겨 두고 이어서 할 수 있어요/,
  )
  assert.match(step1, /그만두기 계속/)
  const step2 = render(snap(s), {
    panel: { kind: 'abandon', step: 2, busy: false, failed: true },
  })
  assert.match(step2, /기록 없이 그만둘까요\?/)
  assert.match(step2, /그만두지 못했어요/)
  assert.match(step2, />기록 없이 그만두기</)
  assert.match(
    render(snap(s), {
      panel: { kind: 'abandon', step: 2, busy: true, failed: false },
    }),
    /처리 중…/,
  )

  const overrun = render(snap(session()), {
    panel: { kind: 'overrun', measuredMs: 301000, targetSeconds: 60 },
  })
  assert.match(overrun, /측정 시간이 5:01로 목표\(1분\)의 5배를 넘었어요/)
  assert.match(overrun, /이 시간으로 세트 완료/)

  const discard = render(snap(session()), {
    panel: { kind: 'discard', direction: 'next' },
  })
  assert.match(discard, /측정 중인 시간이 사라져요/)
  assert.match(discard, /다음 운동으로 이동하면/)

  const reload = render(snap(session()), {
    panel: { kind: 'reload', unsavedCompletedSets: 2 },
  })
  assert.match(reload, /최신 상태를 불러올까요\?/)
  assert.match(reload, /완료한 2세트를 포함해 저장되지 않은 입력이 사라져요/)
  assert.match(reload, /입력을 버리고 최신 상태 불러오기/)
})

test('진행 안내(message)는 보조기기용 live 영역에 담긴다', () => {
  const html = render(snap(session()), { message: '1세트를 완료했어요.' })
  assert.match(html, /aria-live="polite" class="sr-only">1세트를 완료했어요/)
  assert.ok(Parts.CompletionNotice)
})
