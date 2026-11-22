import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// W15·W15-1 화면(ResultView) 렌더링과 표시용 변환. 라우터·저장소 없이 snapshot과 props만으로 그린다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let View
let M
let WR
let V
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  View = (
    await server.ssrLoadModule('/src/components/exercise/result/ResultView.tsx')
  ).default
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  WR = await server.ssrLoadModule('/src/exercise/workoutResult.ts')
  V = await server.ssrLoadModule('/src/exercise/workoutResultView.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })

function makeList(withTime = true) {
  const items = [
    {
      exerciseId: 'e1',
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }],
    },
    {
      exerciseId: '305',
      exerciseNameSnapshot: '덤벨 컬',
      recordType: 'weight',
      sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
    },
    {
      exerciseId: 'e3',
      exerciseNameSnapshot: '플랭크',
      recordType: 'time',
      sets: [{ targetSeconds: 60 }, { targetSeconds: 90 }],
    },
  ]
  return {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'dev-mock-1',
    revision: 1,
    requestId: 'r1',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: withTime ? items : items.slice(0, 2),
  }
}
const ALL = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [2, 0],
  [2, 1],
]
function session({
  done = ALL,
  withTime = true,
  measured = 45_000,
  over,
} = {}) {
  const base = M.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: makeList(withTime),
    now: T0,
  })
  const performed = base.performed.map((sets) => sets.map((s) => ({ ...s })))
  for (const [i, j] of done) {
    const item = base.listSnapshot.items[i]
    if (!item) continue
    const target = item.sets[j]
    performed[i][j] =
      item.recordType === 'time'
        ? measured === null
          ? { completed: true }
          : { completed: true, measuredMs: measured }
        : item.recordType === 'weight'
          ? target.weightKg === undefined
            ? { completed: true, actualReps: target.reps, actualWeightKg: 10 } // A안: 목표 중량이 없어도 실제 중량이 있다
            : {
                completed: true,
                actualReps: target.reps,
                actualWeightKg: target.weightKg,
              }
          : { completed: true, actualReps: target.reps }
  }
  return { ...base, performed, ...over }
}
function ready(s, draftOver, over = {}) {
  const created = WR.createResultDraft(s)
  const draft = draftOver ? draftOver(created.draft) : created.draft
  const summary = WR.summarizeResult(s.listSnapshot, draft.performed)
  return {
    load: { status: 'ready' },
    sessionId: s.id,
    session: s,
    draft,
    summary,
    screenType: summary.screenType,
    hasChanges: WR.hasResultChanges(draft),
    editLocked: false,
    phase: 'idle',
    stage: null,
    progressSaved: false,
    retryable: false,
    failure: null,
    message: null,
    issues: [],
    conflict: null,
    block: null,
    record: null,
    alreadyCompleted: false,
    saved: false,
    canSubmit: !summary.noneCompleted,
    ...over,
  }
}
const empty = (load, over = {}) => ({
  load,
  sessionId: null,
  session: null,
  draft: null,
  summary: null,
  screenType: null,
  hasChanges: false,
  editLocked: false,
  phase: 'idle',
  stage: null,
  progressSaved: false,
  retryable: false,
  failure: null,
  message: null,
  issues: [],
  conflict: null,
  block: null,
  record: null,
  alreadyCompleted: false,
  saved: false,
  canSubmit: false,
  ...over,
})
const actions = new Proxy({}, { get: () => noop })
const render = (snapshot, props = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(View, {
        snapshot,
        editor: null,
        panel: null,
        failureDismissed: false,
        actions,
        ...props,
      }),
    ),
  )
const edit = (s, draft, e) => {
  const r = WR.applyResultEdit(s.listSnapshot, draft, e)
  assert.equal(r.ok, true)
  return r.draft
}

// ── W15 / W15-1 ─────────────────────────────────────────────────────
test('W15: 시간형이 포함되면 W15이고 제목·날짜·요약·측정 시간 줄을 보인다', () => {
  const html = render(ready(session()))
  assert.match(html, /data-result-screen="W15"/)
  assert.match(html, /<h1[^>]*>운동 결과 확인<\/h1>/)
  assert.match(html, /2026년 11월 13일 운동/)
  assert.match(html, /<dt[^>]*>운동<\/dt><dd[^>]*>3<span[^>]*>개/)
  assert.match(html, /<dt[^>]*>완료 세트<\/dt><dd[^>]*>7<span[^>]*>\/7/)
  assert.match(html, /<dt[^>]*>완료율<\/dt><dd[^>]*>100<span[^>]*>%/)
  assert.match(html, /data-result-status="full"[^>]*>전체 완료/)
  assert.match(html, /측정 시간 합계 1:30/)
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="7"/)
})

test('W15-1: 시간형이 없으면 W15-1이고 측정 시간 줄이 없다', () => {
  const html = render(ready(session({ withTime: false })))
  assert.match(html, /data-result-screen="W15-1"/)
  assert.doesNotMatch(html, /측정 시간/)
  assert.doesNotMatch(html, /플랭크/)
})

test('요약: 부분 완료는 완료 세트·완료율·상태를 보이고 운동은 순서대로 카드가 된다', () => {
  const html = render(
    ready(
      session({
        done: [
          [0, 0],
          [0, 1],
        ],
      }),
    ),
  )
  assert.match(html, /data-result-status="partial"[^>]*>부분 완료/)
  assert.match(html, /<dd[^>]*>2<span[^>]*>\/7/)
  assert.match(html, /<dd[^>]*>29<span[^>]*>%/)
  const first = html.indexOf('푸시업')
  const second = html.indexOf('덤벨 컬')
  const third = html.indexOf('플랭크')
  assert.ok(first > 0 && first < second && second < third)
})

test('운동별 세트: 목표와 실제를 구분하고 미완료 세트에는 실제 값을 만들지 않는다', () => {
  const html = render(
    ready(
      session({
        done: [
          [0, 0],
          [0, 1],
          [1, 0],
        ],
      }),
    ),
  )
  assert.match(html, /목표 3세트 · 합계 28회/)
  assert.match(html, /합계 20회/)
  assert.match(html, /2\/3세트 완료/)
  assert.match(html, /<dt[^>]*>목표<\/dt><dd[^>]*>10회 · 8kg<\/dd>/)
  assert.match(html, /<dt[^>]*>실제<\/dt><dd[^>]*>10회 · 8kg<\/dd>/)
  // 미완료 세트(푸시업 3세트): 목표만 있고 실제는 "기록 없음 (미완료)"
  assert.match(html, /data-set-state="todo"/)
  assert.match(html, /기록 없음 \(미완료\)/)
  assert.match(html, /결과 화면에서는 미완료 세트를 완료할 수 없어요/)
  assert.match(html, /✓ 완료/)
  // 중량 미입력 세트(덤벨 컬 2세트는 미완료) / 완료한 운동 표시
  assert.match(html, /data-exercise-state="partial"/)
})

test('시간형: 측정 값은 분:초로, 없으면 "측정 기록 없음"으로 보이고 목표 시간으로 대체하지 않는다', () => {
  const measured = render(ready(session({ measured: 61_000 })))
  assert.match(measured, /<dt[^>]*>목표<\/dt><dd[^>]*>1분<\/dd>/)
  assert.match(measured, /<dt[^>]*>실제<\/dt><dd[^>]*>1:01<\/dd>/)
  assert.match(measured, /목표 2세트 · 합계 2분 30초/)
  const none = render(ready(session({ measured: null })))
  assert.match(none, /<dd[^>]*>측정 기록 없음<\/dd>/)
  assert.match(none, /측정 시간: 측정 기록 없음/)
  assert.match(
    none,
    /실제 기록이 빠졌어요 \(측정 시간\)\. 저장하려면 입력하거나 완료를 해제해 주세요/,
  )
  assert.doesNotMatch(none, /<dt[^>]*>실제<\/dt><dd[^>]*>1:00<\/dd>/)
  assert.doesNotMatch(none, /0:00/)
})

// ── 편집 UI ─────────────────────────────────────────────────────────
test('편집 UI: 모든 완료 세트에 수정·완료 해제가 있다(시간형도 측정 시간 수정 가능)', () => {
  const html = render(ready(session()))
  assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 7) // 푸시업 3 + 덤벨 2 + 플랭크 2
  assert.match(html, /푸시업 1세트 실제 값 수정/)
  assert.match(html, /플랭크 1세트 완료 해제/)
  assert.match(html, /플랭크 1세트 실제 값 수정/)
  assert.doesNotMatch(html, /측정 시간은 수정할 수 없어요/)
  // 목표·세트·운동 추가/삭제/순서 변경 컨트롤은 없다.
  assert.doesNotMatch(html, /세트 추가|운동 추가|삭제|위로|아래로/)
})

test('편집 폼: 횟수형은 횟수만, 중량형은 횟수와 중량 입력을 보이고 라벨로 입력과 연결된다', () => {
  const s = session()
  const reps = render(ready(s), {
    editor: {
      itemIndex: 0,
      setIndex: 1,
      reps: '10',
      weightKg: '',
      measuredMs: '',
      errors: {},
    },
  })
  assert.match(reps, /aria-label="푸시업 2세트 실제 값 수정"/)
  assert.match(reps, /<label for="result-reps-0-1"[^>]*>실제 횟수 \(1~999회\)/)
  assert.match(reps, /id="result-reps-0-1"[^>]*value="10"/)
  assert.doesNotMatch(reps, /result-weight-0-1/)
  assert.match(reps, /aria-expanded="true"/)
  const weight = render(ready(s), {
    editor: {
      itemIndex: 1,
      setIndex: 0,
      reps: '10',
      weightKg: '8',
      measuredMs: '',
      errors: {},
    },
  })
  assert.match(
    weight,
    /<label for="result-weight-1-0"[^>]*>실제 중량 \(0~999kg, 소수점 한 자리\)/,
  )
  assert.match(weight, /0kg도 직접 입력하면 저장돼요/)
  assert.match(weight, />적용<\/button>/)
  assert.match(weight, />닫기<\/button>/)
})

test('입력 오류 메시지는 해당 입력과 aria-describedby·aria-invalid로 연결된다', () => {
  const html = render(ready(session()), {
    editor: {
      itemIndex: 1,
      setIndex: 0,
      reps: '0',
      weightKg: '2.55',
      errors: {
        reps: '횟수는 1~999 사이로 입력해 주세요.',
        weightKg: '중량은 소수점 한 자리까지 입력할 수 있어요.',
      },
    },
  })
  assert.match(
    html,
    /id="result-reps-1-0"[^>]*aria-invalid="true"[^>]*aria-describedby="result-reps-error-1-0"/,
  )
  assert.match(
    html,
    /id="result-reps-error-1-0" role="alert"[^>]*>횟수는 1~999/,
  )
  assert.match(
    html,
    /id="result-weight-1-0"[^>]*aria-invalid="true"[^>]*aria-describedby="result-weight-error-1-0"/,
  )
  assert.match(
    html,
    /id="result-weight-error-1-0" role="alert"[^>]*>중량은 소수점 한 자리/,
  )
})

test('입력 검증(validateSetFields): 기존 규칙(횟수 1~999 정수·중량 0~999kg 소수 한 자리)과 항목별 메시지', () => {
  const ok = V.validateSetFields('weight', { reps: '12', weightKg: '10.5' })
  assert.deepEqual(JSON.parse(JSON.stringify(ok)), {
    ok: true,
    reps: 12,
    weightKg: 10.5,
  })
  assert.equal(
    V.validateSetFields('weight', { reps: '12', weightKg: '' }).weightKg,
    undefined,
  )
  assert.equal(
    V.validateSetFields('reps', { reps: '5', weightKg: 'abc' }).ok,
    true,
  ) // 횟수형은 중량을 보지 않는다
  const bad = (type, raw) => V.validateSetFields(type, raw).errors
  assert.match(bad('reps', { reps: '', weightKg: '' }).reps, /입력해 주세요/)
  assert.match(bad('reps', { reps: '1.5', weightKg: '' }).reps, /정수/)
  assert.match(bad('reps', { reps: '1000', weightKg: '' }).reps, /1~999/)
  assert.match(bad('reps', { reps: '0', weightKg: '' }).reps, /1~999/)
  assert.match(bad('weight', { reps: '5', weightKg: '1e2' }).weightKg, /숫자/)
  assert.match(
    bad('weight', { reps: '5', weightKg: '1000' }).weightKg,
    /0~999kg/,
  )
  assert.match(
    bad('weight', { reps: '5', weightKg: '2.55' }).weightKg,
    /소수점 한 자리/,
  )
  const both = bad('weight', { reps: 'x', weightKg: '-1' })
  assert.ok(both.reps && both.weightKg)
})

test('수정됨 표시와 수정 취소 버튼: 값을 고치거나 완료를 해제하면 보이고, 취소하면 사라진다', () => {
  const s = session()
  const unchanged = render(ready(s))
  assert.doesNotMatch(unchanged, /수정됨|수정 취소/)
  const edited = render(
    ready(s, (draft) => {
      const a = edit(s, draft, { kind: 'reps', position: pos(0, 0), value: 12 })
      return edit(s, a, { kind: 'uncomplete', position: pos(1, 1) })
    }),
  )
  assert.equal((edited.match(/>수정됨</g) ?? []).length, 2)
  assert.match(edited, />수정 취소<\/button>/)
  assert.match(edited, /<dd[^>]*>12회<\/dd>/)
  assert.match(edited, /<dd[^>]*>완료 6\/7|<dd[^>]*>6<span[^>]*>\/7/)
  const draft0 = WR.createResultDraft(s).draft
  assert.equal(
    render(ready(s, () => WR.cancelResultEdits(draft0))).includes('수정 취소'),
    false,
  )
})

test('저장 요청이 시작되면 수정 컨트롤이 비활성이고 안내가 보인다', () => {
  const s = session()
  const html = render(
    ready(
      s,
      (draft) =>
        edit(s, draft, { kind: 'reps', position: pos(0, 0), value: 12 }),
      {
        editLocked: true,
        phase: 'retryableError',
        stage: 'completing',
        failure: 'error',
        retryable: true,
      },
    ),
  )
  assert.match(html, /aria-disabled="true"[^>]*aria-expanded="false"/)
  assert.match(html, /저장 요청이 시작되어 지금은 수정할 수 없어요/)
  assert.doesNotMatch(html, />수정 취소</)
})

// ── 저장 상태 ───────────────────────────────────────────────────────
test('저장 버튼: 기본·검증 중·진행값 저장 중·최종 완료 처리 중·성공 문구와 중복 실행 방지', () => {
  const s = session()
  const idle = render(ready(s))
  assert.match(
    idle,
    /aria-disabled="false"[^>]*aria-busy="false"[^>]*>운동 결과 저장하기/,
  )
  const label = (phase, over = {}) =>
    render(ready(s, null, { phase, canSubmit: false, ...over }))
  const validating = label('validating')
  assert.match(
    validating,
    /aria-disabled="true"[^>]*aria-busy="true"[^>]*>검증 중…/,
  )
  assert.match(
    label('savingProgress'),
    /aria-busy="true"[^>]*>수정한 값 저장 중…/,
  )
  assert.match(label('completing'), /aria-busy="true"[^>]*>최종 완료 처리 중…/)
  assert.match(
    label('savingProgress'),
    /aria-live="polite"[^>]*>수정한 값 저장 중…/,
  )
  const success = label('success')
  assert.match(success, />저장했어요<\/button>/)
  assert.match(success, /운동 기록을 저장했어요\. 오늘의 운동으로 이동해요/)
  // 저장 중에는 수정 취소 버튼도 없다
  const busyEdited = render(
    ready(
      s,
      (draft) =>
        edit(s, draft, { kind: 'reps', position: pos(0, 0), value: 12 }),
      { phase: 'savingProgress', canSubmit: false, editLocked: true },
    ),
  )
  assert.doesNotMatch(busyEdited, />수정 취소</)
})

test('완료 세트가 0개면 저장 버튼이 비활성이고 이유를 안내한다', () => {
  const html = render(ready(session({ done: [] })))
  assert.match(html, /data-result-status="none"[^>]*>완료한 세트 없음/)
  assert.match(html, /aria-disabled="true"[^>]*>운동 결과 저장하기/)
  assert.match(html, /완료한 세트가 없어 저장할 수 없어요/)
})

test('저장을 막는 이유(타이머·W14 저장 상태)와 검증 사유를 안내한다', () => {
  const s = session()
  const timer = render(
    ready(s, null, { block: 'timerRunning', canSubmit: false }),
  )
  assert.match(timer, /타이머가 아직 측정 중이에요/)
  assert.match(timer, /운동 진행\(W14\)으로 돌아가기/)
  const w14 = render(ready(s, null, { block: 'w14Saving', canSubmit: false }))
  assert.match(w14, /운동 진행 내용을 저장하는 중이에요/)
  const issue = render(
    ready(s, null, {
      issues: [
        {
          reason: 'invalidValue',
          message: '실제 횟수는 1~999회 정수여야 해요.',
        },
      ],
    }),
  )
  assert.match(issue, /role="alert"[^>]*>.*실제 횟수는 1~999회 정수여야 해요/)
})

test('재시도 가능한 오류: 안내 문구와 다시 시도·머무르기, 접으면 요약 배너가 남는다', () => {
  const s = session()
  const retry = ready(s, null, {
    phase: 'retryableError',
    stage: 'savingProgress',
    failure: 'quota',
    retryable: true,
  })
  const html = render(retry)
  assert.match(html, /운동 결과를 저장하지 못했어요\. 다시 시도할 수 있어요\./)
  assert.match(html, /저장 공간이 부족해요/)
  assert.match(html, />다시 시도<\/button>/)
  assert.match(html, />운동 결과 화면에 머무르기<\/button>/)
  const dismissed = render(retry, { failureDismissed: true })
  assert.doesNotMatch(dismissed, /운동 결과 화면에 머무르기/)
  assert.match(dismissed, /운동 결과를 저장하지 못했어요\./)
  assert.match(dismissed, />다시 시도<\/button>/)
})

test('진행값 저장 후 완료 실패: 편집값은 저장됐음을 알린다', () => {
  const html = render(
    ready(session(), null, {
      phase: 'retryableError',
      stage: 'completing',
      failure: 'unavailable',
      retryable: true,
      progressSaved: true,
    }),
  )
  assert.match(
    html,
    /수정한 운동 기록은 저장됐지만 최종 완료 처리가 끝나지 않았어요\./,
  )
  assert.match(html, /저장한 값은 그대로 두고 완료 처리만 이어서 해요/)
  assert.match(html, /이 브라우저에서는 저장할 수 없어요/)
})

test('복구 불가능한 오류(fatalError)는 다시 시도 없이 최신 상태 불러오기만 권한다', () => {
  const html = render(
    ready(session(), null, {
      phase: 'fatalError',
      stage: 'savingProgress',
      failure: 'invalidProgress',
      canSubmit: false,
    }),
  )
  assert.match(html, /운동 결과를 저장할 수 없어요/)
  assert.match(html, /다시 시도해도 같은 결과예요/)
  assert.match(html, />최신 상태 불러오기<\/button>/)
  assert.doesNotMatch(html, />다시 시도</)
})

test('충돌: 유형별 메시지와 최신 상태 불러오기·W14로 돌아가기·머무르기, 자동 병합하지 않았음을 안내한다', () => {
  const s = session()
  const conflict = (kind, recordMismatch = false) =>
    render(
      ready(s, null, {
        phase: 'conflict',
        conflict: { kind, recordMismatch },
        canSubmit: false,
      }),
    )
  const changed = conflict('changed')
  assert.match(changed, /다른 곳에서 운동 내용이 변경됐어요\./)
  assert.match(changed, /자동으로 합치거나 덮어쓰지 않고 저장을 멈췄어요/)
  assert.match(changed, />최신 상태 불러오기<\/button>/)
  assert.match(changed, /운동 진행\(W14\)으로 돌아가기/)
  assert.match(changed, />머무르기<\/button>/)
  const ended = conflict('ended')
  assert.match(ended, /운동이 이미 종료됐어요\./)
  const mismatch = conflict('ended', true)
  assert.match(mismatch, /이미 저장된 운동 기록이 지금 보는 결과와 달라요/)
  const gone = conflict('gone')
  assert.match(gone, /운동을 찾을 수 없어요\./)
  // 접으면 요약 배너가 남아 충돌 상태를 숨기지 않는다
  const dismissed = render(
    ready(s, null, {
      phase: 'conflict',
      conflict: { kind: 'changed', recordMismatch: false },
      canSubmit: false,
    }),
    { failureDismissed: true },
  )
  assert.match(
    dismissed,
    /다른 곳에서 운동 내용이 변경됐어요\. 저장은 멈춘 상태예요/,
  )
})

test('확인 패널: 최신 불러오기(수정 내용 삭제 확인)와 화면 이탈(계속 수정·버리고 이동)', () => {
  const s = session()
  const reload = render(ready(s), { panel: { kind: 'reload' } })
  assert.match(
    reload,
    /최신 운동 기록을 불러오면 저장하지 않은 수정 내용이 사라질 수 있어요/,
  )
  assert.match(reload, />최신 기록 불러오기<\/button>/)
  assert.match(reload, />취소<\/button>/)
  const leave = render(ready(s), { panel: { kind: 'leave' } })
  assert.match(leave, /저장하지 않은 수정 내용이 있어요/)
  assert.match(leave, />계속 수정하기<\/button>/)
  assert.match(leave, />수정 내용 버리고 이동<\/button>/)
})

// ── 완료된 세션(읽기 전용) ──────────────────────────────────────────
test('완료된 세션: 저장된 기록을 읽기 전용으로 보이고 편집·저장 버튼이 없다', () => {
  const s = session({
    done: [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ],
    measured: null,
  })
  const record = M.buildWorkoutRecord({
    id: 'rec1',
    session: s,
    now: new Date('2026-11-13T04:00:00.000Z'),
  })
  const html = render(
    empty(
      { status: 'completed' },
      { record, alreadyCompleted: true, saved: true, session: s },
    ),
  )
  assert.match(html, /<h1[^>]*>운동 결과 확인<\/h1>/)
  assert.match(html, /2026년 11월 13일 운동 · 저장된 기록/)
  assert.match(html, /data-result-status="partial"[^>]*>부분 완료/)
  assert.match(
    html,
    /이미 저장된 운동 기록이에요\. 수정하거나 다시 저장할 수 없어요/,
  )
  assert.match(html, /<dd[^>]*>4<span[^>]*>\/7/)
  assert.match(html, /측정 시간: 측정 기록 없음/)
  assert.match(html, /data-set-state="todo"/)
  assert.doesNotMatch(
    html,
    /운동 결과 저장하기|수정 취소|aria-expanded|완료 해제|>적용</,
  )
  assert.match(
    html,
    /<a[^>]*href="\/records\/exercise"[^>]*>오늘의 운동으로 돌아가기/,
  )
  // 카드 모델: 기록에는 완료한 세트만 있어 미완료 세트는 목표를 모른다
  const cards = V.cardsFromRecord(record)
  assert.equal(cards[0].sets[2].completed, false)
  assert.equal(cards[0].sets[2].targetText, null)
  assert.equal(cards[0].sets[2].actualText, null)
  assert.equal(cards[2].sets[0].timeStatus, 'unmeasured')
})

test('완료된 전체 기록은 전체 완료로 표시한다', () => {
  const record = M.buildWorkoutRecord({
    id: 'rec1',
    session: session(),
    now: T0,
  })
  const html = render(
    empty(
      { status: 'completed' },
      { record, alreadyCompleted: true, saved: true },
    ),
  )
  assert.match(html, /data-result-status="full"[^>]*>전체 완료/)
  assert.match(html, /측정 시간 합계 1:30/)
})

// ── 직접 접근·예외 상태 ─────────────────────────────────────────────
test('직접 접근 오류 상태: 안내와 W01 이동만 보이고 다른 세션·계정 정보를 보이지 않는다', () => {
  const link = /<a[^>]*href="\/records\/exercise"[^>]*>오늘의 운동으로 돌아가기/
  const cases = [
    [{ status: 'loading' }, /결과를 불러오는 중이에요/, false],
    [{ status: 'unavailable' }, /운동 결과 기능을 준비 중이에요/, true],
    [{ status: 'invalidSessionId' }, /올바르지 않은 운동 주소예요/, true],
    [{ status: 'notFound' }, /운동을 찾을 수 없어요/, true],
    [{ status: 'none' }, /진행 중인 운동이 없어요/, true],
    [{ status: 'corrupt' }, /운동 데이터를 읽을 수 없어요/, true],
    [
      { status: 'error', reason: 'error' },
      /운동 결과를 불러오지 못했어요/,
      true,
    ],
    [{ status: 'ended' }, /기록 없이 끝난 운동이에요/, true],
  ]
  for (const [load, text, hasLink] of cases) {
    const html = render(empty(load))
    assert.match(html, /<h1[^>]*>운동 결과 확인<\/h1>/, load.status)
    assert.match(html, text, load.status)
    assert.equal(link.test(html), hasLink, load.status)
    assert.doesNotMatch(
      html,
      /운동 결과 저장하기|푸시업|data-result-screen/,
      load.status,
    )
  }
  assert.match(
    render(empty({ status: 'invalidSessionId' })),
    /다른 운동으로 바꿔서 보여 주지 않아요/,
  )
  assert.match(
    render(empty({ status: 'error', reason: 'error' })),
    />다시 시도<\/button>/,
  )
  // 저장소가 없으면 임의의 완료 기록을 만들지 않는다
  assert.doesNotMatch(
    render(empty({ status: 'unavailable' })),
    /저장된 기록|전체 완료|부분 완료/,
  )
})
