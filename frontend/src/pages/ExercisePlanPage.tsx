import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ExercisePicker, {
  type PickerCopy,
  type PickerCompleteResult,
} from '../components/exercise/picker/ExercisePicker.tsx'
import BackLink from '../components/layout/BackLink.tsx'
import { useBackNavigation } from '../components/layout/useBackTarget.ts'
import PlanConditions, {
  PlanModeChoice,
} from '../components/exercise/plan/PlanConditions.tsx'
import PlanResultView from '../components/exercise/plan/PlanResultView.tsx'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../components/exercise/compose/composeStyles.ts'
import { useExerciseGoalSummary } from '../exercise-goal/useExerciseGoal.ts'
import { loadExerciseLevel } from '../exercise/exerciseLevel.ts'
import type { ExerciseCatalogState } from '../exercise/useExerciseCatalog.ts'
import { useExerciseLevel } from '../exercise/useExerciseLevel.ts'
import {
  clampStep,
  nextStep,
  prevStep,
  restoredStep,
  stepIsValid,
  toggleSelectableTool,
  type ConditionStep,
} from '../exercise/planConditionSteps.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'
import type { WorkoutDraft } from '../exercise/workoutDraftTypes.ts'
import { checkBeginnerPlanAccess } from '../exercise/recommend/access.ts'
import {
  buildBeginnerPlan,
  type PlanSource,
} from '../exercise/recommend/engine.ts'
import {
  PATH_PLAN,
  PATH_REVIEW,
  PLAN_TEXT,
  appendSelected,
  initialInputs,
  isReadyForPlan,
  nextRotation,
  removeSelected,
  replaceSelected,
  toRequest,
  type PlanInputs,
} from '../exercise/recommend/planFlow.ts'
import { createBeginnerPlanSource } from '../exercise/recommend/planSource.ts'
import {
  INITIAL_SESSION,
  clearPlanSession,
  readPlanSession,
  savePlanSession,
  type PlanSession,
} from '../exercise/recommend/planStorage.ts'
import {
  classifyExercise,
  describeExclusion,
  describePlanFailure,
  initialAvailableMinutes,
  listEligibleTools,
} from '../exercise/recommend/rules.ts'
import {
  planToDraft,
  describePlanToDraftFailure,
} from '../exercise/recommend/toDraft.ts'
import type {
  BeginnerPlanResult,
  PlanFailureCode,
  PlanMode,
} from '../exercise/recommend/types.ts'

const PATH_DASHBOARD = '/records/exercise'

/** 직접 선택에서 운동을 고를 때의 문구. W13의 "운동 검색·등록" 문구는 바꾸지 않고 이 화면에서만 다르게 보인다. */
const PICKER_COPY: PickerCopy = {
  title: '운동 찾아보기',
  description:
    '하고 싶은 운동을 골라 주세요. 세트와 목표는 자동으로 정해 드려요.',
  completeLabel: (count) => `선택한 ${count}개 운동으로 설정하기`,
}

/**
 * 화면 공통 틀. 이 라우트는 `bodyBack`이라 AppShell이 "이전"을 그리지 않으므로 여기서 같은 규칙(BackLink)으로 그린다.
 * 조건 설정 단계 화면(자체 이전 버튼과 진행률이 있다)만 `back={false}`로 그리지 않는다.
 */
function Shell({
  children,
  back = true,
}: {
  children: React.ReactNode
  back?: boolean
}) {
  return (
    <>
      {back ? (
        <div className="mb-1">
          <BackLink parent={PATH_DASHBOARD} />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </>
  )
}

function Title({ text, hint }: { text: string; hint?: string }) {
  return (
    <header>
      <h1 className="text-app-title leading-snug font-semibold text-content">
        {text}
      </h1>
      {hint ? (
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {hint}
        </p>
      ) : null}
    </header>
  )
}

/** 권한을 확인하지 못했거나 초급이 아닐 때의 안내(기존 운동 기록 화면으로 돌아갈 수 있다). */
function Blocked({
  title,
  body,
  retry,
}: {
  title: string
  body: string
  retry?: boolean
}) {
  return (
    <Shell>
      <Title text="오늘의 운동 추천" />
      <section role="alert" className={composeCard}>
        <h2 className={composeSectionTitle}>{title}</h2>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {body}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {retry ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={composePrimaryButton}
            >
              다시 시도
            </button>
          ) : null}
          <Link to={PATH_DASHBOARD} className={composeSecondaryButton}>
            운동 기록으로 돌아가기
          </Link>
        </div>
      </section>
    </Shell>
  )
}

/**
 * 초급 운동 추천(전체 자동 추천 / 직접 운동 선택 후 자동 설정). 회원 전용이며 운동 이해도가 beginner일 때만 쓸 수 있다.
 * 이해도를 불러오는 동안은 권한이 확인된 것처럼 그리지 않고, 조회 실패·초급 아님·미확인이면 추천을 막고 기존 운동 기록으로 안내한다.
 * 이 기능은 규칙 기반 무료 기능이며 v5.0 AI 운동 플랜(W12·I02)과 별개다(AI 이용 권한·체험 횟수와 연결하지 않는다).
 */
export default function ExercisePlanPage() {
  const { user } = useAuth()
  return user ? <PlanGate key={user.id} userId={user.id} /> : null
}

function PlanGate({ userId }: { userId: string }) {
  const level = useExerciseLevel(userId)
  const source = useMemo(() => createBeginnerPlanSource(), [])
  if (level.status === 'loading') {
    return (
      <Shell>
        <Title text="오늘의 운동 추천" />
        <p role="status" className={`${composeCard} text-body text-muted`}>
          운동 이해도를 확인하는 중이에요…
        </p>
      </Shell>
    )
  }
  if (level.failed) {
    return (
      <Blocked
        title="운동 이해도를 확인하지 못했어요"
        body="잠시 후 다시 시도해 주세요. 지금은 운동 기록에서 운동 목록을 직접 구성할 수 있어요."
        retry
      />
    )
  }
  const access = checkBeginnerPlanAccess(level.level)
  if (!access.ok) {
    const code: PlanFailureCode =
      access.reason === 'unknown'
        ? 'tierUnknown'
        : access.reason === 'notBeginner'
          ? 'tierNotBeginner'
          : 'tierInvalid'
    return (
      <Blocked
        title="이 기능을 쓸 수 없어요"
        body={describePlanFailure(code)}
      />
    )
  }
  if (!source) {
    return (
      <Shell>
        <Title text="오늘의 운동 추천" />
        <p role="status" className={`${composeCard} text-body text-muted`}>
          운동 추천 기능을 준비 중이에요.
        </p>
        <Link to={PATH_DASHBOARD} className={composeSecondaryButton}>
          운동 기록으로 돌아가기
        </Link>
      </Shell>
    )
  }
  return <PlanBody userId={userId} source={source} />
}

function isMode(value: string | null): value is PlanMode {
  return value === 'automatic' || value === 'selected'
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** 이 화면에서 보이는 추천 결과의 운동 id 목록(복원 때 달라졌는지 확인하는 용도). 결과가 없으면 null */
function idsOf(
  outcome: ReturnType<typeof buildBeginnerPlan> | null,
): string[] | null {
  return outcome && outcome.ok
    ? outcome.plan.items.map((i) => i.exerciseId)
    : null
}

function PlanBody({ userId, source }: { userId: string; source: PlanSource }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const summary = useExerciseGoalSummary(userId)
  const toolChoices = useMemo(
    () => listEligibleTools(source.exercises, source.evidence),
    [source],
  )
  const byId = useMemo(
    () => new Map(source.exercises.map((e) => [e.id, e])),
    [source],
  )

  // 처음 상태: W01 진입(fresh)이면 새로 시작하고, 새로고침이면 계정별 임시 저장에서 복원한다.
  const fresh = useMemo(() => {
    const state = location.state as { fresh?: unknown } | null
    return state?.fresh === true
  }, [location.state])
  const [freshAtEntry] = useState(fresh)
  const [session, setSession] = useState<PlanSession>(() => {
    const modeParam = params.get('mode')
    if (fresh) clearPlanSession()
    const stored = fresh ? null : readPlanSession(userId)
    if (stored) return stored
    return isMode(modeParam)
      ? {
          ...INITIAL_SESSION,
          step: 'conditions',
          inputs: initialInputs(modeParam),
        }
      : INITIAL_SESSION
  })
  const [minutesTouched, setMinutesTouched] = useState(false)
  // 조건 설정의 현재 질문(1 목표 → 2 시간 → 3 도구 → 직접 선택만 4 운동 고르기)과 마지막 이동 방향(전환 효과용).
  // 위치는 따로 저장하지 않고, 새로고침하면 입력한 값에서 이어 간다(restoredStep). 값(inputs)은 기존 임시 저장이 그대로 복원한다.
  const [condStep, setCondStep] = useState<ConditionStep>(() =>
    restoredStep(session.inputs, session.step),
  )
  const [direction, setDirection] = useState<'next' | 'back'>('next')
  // 구성 방법 선택 화면에서 들어왔는지(그때는 1단계의 이전이 그 화면으로 돌아간다). 새로고침하면 W01로 돌아간다.
  const [cameFromMode, setCameFromMode] = useState(false)
  const backNav = useBackNavigation(PATH_DASHBOARD)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // 구성 중이던 초안을 바꿀지 묻는 확인. 만든 때의 화면 상태(base)와 같을 때만 보인다(입력·단계가 바뀌면 낡은 확인은 사라진다).
  const [pending, setPending] = useState<{
    draft: WorkoutDraft
    base: PlanSession
  } | null>(null)
  const pendingDraft =
    pending && pending.base === session ? pending.draft : null
  const busy = useRef(false)
  // 확정은 비동기(이해도 재조회)라서, 끝났을 때 아직 유효한 요청인지 확인할 값들을 둔다.
  // - confirmSeq: 확정 요청 번호. 화면을 떠나면 올려서 진행 중인 요청을 무효로 만든다.
  // - mounted: 이 화면이 아직 화면에 있는지
  // - live: 렌더 때마다 갱신되는 최신 계정·화면 상태·초안 함수(요청 시작 때의 낡은 값을 쓰지 않는다)
  const confirmSeq = useRef(0)
  const mounted = useRef(false)
  const { user: authUser } = useAuth()
  const draftApi = useWorkoutDraft()
  const live = useRef({
    userId: authUser?.id ?? null,
    session,
    hasContent: draftApi.hasContent,
    replaceDraft: draftApi.replaceDraft,
  })
  useEffect(() => {
    live.current = {
      userId: authUser?.id ?? null,
      session,
      hasContent: draftApi.hasContent,
      replaceDraft: draftApi.replaceDraft,
    }
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      confirmSeq.current += 1
    }
  }, [])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)

  // 진입용 state(fresh)는 한 번 읽은 뒤 비운다(새로고침하면 저장된 상태를 복원한다).
  useEffect(() => {
    if (freshAtEntry) {
      void navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      })
    }
  }, [freshAtEntry, navigate, location.pathname, location.search])

  // 임시 저장(계정별 sessionStorage). 추천 결과는 저장하지 않는다.
  useEffect(() => {
    savePlanSession(userId, session)
  }, [userId, session])

  // 운동 가능 시간의 초기값: 아직 고르지 않았고 사용자가 건드리지 않았다면 운동 목표 요약의 값(유효할 때만)을 쓴다.
  const goalMinutes = initialAvailableMinutes(
    summary.loaded?.value?.minutesPerSession,
  )
  const inputs: PlanInputs = useMemo(
    () =>
      session.inputs.minutes === null && !minutesTouched && goalMinutes !== null
        ? { ...session.inputs, minutes: goalMinutes }
        : session.inputs,
    [session.inputs, minutesTouched, goalMinutes],
  )

  // 추천 결과는 입력에서 항상 다시 계산한다(결과 객체를 고치지 않는다).
  const outcome = useMemo(
    () =>
      session.step === 'result'
        ? buildBeginnerPlan(toRequest(inputs, 'beginner'), source)
        : null,
    [session.step, inputs, source],
  )
  // 복원했을 때 결과가 이전과 달라졌으면 알린다(처음 한 번만 계산).
  const [restoredChanged] = useState(() => {
    if (session.step !== 'result' || session.resultIds === null) return false
    const now = idsOf(
      buildBeginnerPlan(toRequest(session.inputs, 'beginner'), source),
    )
    return now === null || !sameIds(now, session.resultIds)
  })

  // 단계가 바뀌면 그 단계의 제목으로 포커스를 옮긴다.
  useEffect(() => {
    if (session.step === 'result') headingRef.current?.focus()
    else stepHeadingRef.current?.focus()
  }, [session.step, condStep])

  const update = (patch: Partial<PlanSession>) =>
    setSession((prev) => ({ ...prev, ...patch }))
  const updateInputs = (patch: Partial<PlanInputs>) =>
    setSession((prev) => ({ ...prev, inputs: { ...prev.inputs, ...patch } }))

  /** 결과 단계로 가면서 마지막으로 본 결과의 운동 id를 함께 저장한다. */
  function showResult(next: PlanInputs, replacingId: string | null = null) {
    setConfirmError(null)
    setSession({
      step: 'result',
      inputs: next,
      replacingId,
      resultIds: idsOf(buildBeginnerPlan(toRequest(next, 'beginner'), source)),
    })
  }

  const selectedRows = inputs.selectedIds.map((id) => {
    const exercise = byId.get(id)
    if (!exercise) {
      return {
        id,
        name: '알 수 없는 운동',
        meta: null,
        status: '운동 정보를 찾을 수 없어요.',
        usable: false,
      }
    }
    const result = classifyExercise(exercise, {
      tools: inputs.tools,
      evidence: source.evidence,
    })
    return {
      id,
      name: exercise.name,
      meta: `${exercise.targetMuscles.join('·')} · ${exercise.difficulty} · ${exercise.equipment.join('·')}`,
      status: result.eligible
        ? '자동으로 구성할 수 있어요'
        : describeExclusion(result.reason),
      usable: result.eligible,
    }
  })

  const plan: BeginnerPlanResult | null =
    outcome && outcome.ok ? outcome.plan : null

  function handlePick(
    ids: readonly string[],
    catalog: ExerciseCatalogState,
  ): PickerCompleteResult {
    if (catalog.status !== 'ready') {
      return {
        ok: false,
        message: '운동 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      }
    }
    if (session.replacingId !== null) {
      if (ids.length !== 1) {
        return { ok: false, message: '바꿀 운동을 하나만 골라 주세요.' }
      }
      const replaced = replaceSelected(
        inputs.selectedIds,
        session.replacingId,
        ids[0],
      )
      if (!replaced) {
        return {
          ok: false,
          message: '이미 목록에 있는 운동이에요. 다른 운동을 골라 주세요.',
        }
      }
      // 자동 추천에서 넘어온 교체라면 직접 선택 목록으로 바뀐 사실도 함께 알린다.
      setNotice(
        notice === PLAN_TEXT.switchedToSelected
          ? `운동을 바꿨어요. ${PLAN_TEXT.switchedToSelected}`
          : '운동을 바꿨어요. 고른 운동은 순서 그대로예요.',
      )
      showResult({ ...inputs, selectedIds: replaced })
      return { ok: true }
    }
    const added = appendSelected(inputs.selectedIds, ids)
    if (added.ids.length === inputs.selectedIds.length) {
      return { ok: false, message: '이미 고른 운동이에요.' }
    }
    setSession((prev) => ({
      ...prev,
      step: 'conditions',
      inputs: { ...inputs, selectedIds: added.ids },
    }))
    return { ok: true }
  }

  function replaceExercise(exerciseId: string) {
    setNotice(null)
    if (inputs.mode === 'automatic' && plan) {
      // 자동 추천에서 운동을 바꾸면 지금 추천된 운동 목록을 직접 고른 목록으로 가져와 그 자리의 운동만 바꾼다(직접 선택 모드로 바뀐다).
      setNotice(PLAN_TEXT.switchedToSelected)
      setSession({
        step: 'pick',
        inputs: {
          ...inputs,
          mode: 'selected',
          selectedIds: plan.items.map((i) => i.exerciseId),
        },
        replacingId: exerciseId,
        resultIds: session.resultIds,
      })
      return
    }
    update({ step: 'pick', replacingId: exerciseId })
  }

  function removeExercise(exerciseId: string) {
    const next = removeSelected(inputs.selectedIds, exerciseId)
    setNotice('운동을 목록에서 뺐어요.')
    if (next.length === 0) {
      setDirection('back')
      setCondStep(clampStep(4, inputs.mode))
      setSession({
        step: 'conditions',
        inputs: { ...inputs, selectedIds: next },
        replacingId: null,
        resultIds: null,
      })
      return
    }
    showResult({ ...inputs, selectedIds: next })
  }

  function retry() {
    setNotice(null)
    showResult({ ...inputs, rotation: nextRotation(inputs.rotation) })
  }

  /** 결과를 보다가 조건을 고치러 돌아갈 때: 고른 값은 그대로 두고 1단계부터 다시 보여 준다. */
  function editConditions() {
    setNotice(null)
    setDirection('back')
    setCondStep(1)
    update({ step: 'conditions' })
  }

  /** 조건 설정의 "다음". 마지막 단계면 지금까지 고른 값 그대로 추천(자동 설정)을 만든다(값을 바꾸거나 보정하지 않는다). */
  function goNext() {
    if (!stepIsValid(condStep, inputs)) return
    const next = nextStep(condStep, inputs.mode)
    if (next === null) {
      if (!isReadyForPlan(inputs)) return
      setNotice(null)
      showResult(inputs)
      return
    }
    setDirection('next')
    setCondStep(next)
  }

  /** 조건 설정의 "이전". 앞 단계가 있으면 거기로(고른 값 유지), 1단계면 구성 방법 선택 또는 이전 화면으로 간다. */
  function goBack() {
    const prev = prevStep(condStep)
    if (prev !== null) {
      setDirection('back')
      setCondStep(prev)
      return
    }
    if (cameFromMode) {
      setCameFromMode(false)
      setSession(INITIAL_SESSION)
      return
    }
    void navigate(backNav?.to ?? PATH_DASHBOARD, { state: backNav?.state })
  }

  /**
   * 확정: 현재 운동 이해도를 다시 조회해 권한을 확인하고, 같은 입력으로 추천을 새로 만들어 planToDraft(권한·무결성·재계산 대조)로
   * 변환한 뒤 초안을 W11 검토 화면으로 넘긴다. 연속 클릭은 한 번만 처리한다. 구성 중이던 초안이 있으면 먼저 확인을 받는다.
   */
  async function confirm() {
    if (busy.current) return
    busy.current = true
    const token = (confirmSeq.current += 1)
    const startSession = session
    // 요청이 아직 유효한가: 이 화면이 그대로 있고, 같은 계정이며, 요청한 때와 같은 입력·단계이고, 더 새로운 요청이 없다.
    const isCurrent = () =>
      mounted.current &&
      token === confirmSeq.current &&
      live.current.userId === userId &&
      live.current.session === startSession
    setConfirming(true)
    setConfirmError(null)
    let keepBusy = false
    try {
      const fresh = await loadExerciseLevel(userId)
      // 조회하는 동안 화면을 떠났거나 계정·입력이 바뀌었으면 아무것도 바꾸지 않고 끝낸다(안내·이동·초안 교체 없음).
      if (!isCurrent()) return
      const tier = fresh.failed ? null : fresh.level
      const access = checkBeginnerPlanAccess(tier)
      if (!access.ok) {
        setConfirmError(
          fresh.failed
            ? '운동 이해도를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
            : describePlanFailure(
                access.reason === 'unknown'
                  ? 'tierUnknown'
                  : access.reason === 'notBeginner'
                    ? 'tierNotBeginner'
                    : 'tierInvalid',
              ),
        )
        return
      }
      const request = toRequest(inputs, tier)
      const built = buildBeginnerPlan(request, source)
      if (!built.ok) {
        setConfirmError(describePlanFailure(built.failures[0].code))
        return
      }
      const converted = planToDraft(built.plan, {
        exerciseTier: tier,
        request,
        source,
        now: () => new Date().toISOString(),
      })
      if (!converted.ok) {
        setConfirmError(describePlanToDraftFailure(converted.failures[0].code))
        return
      }
      // 초안을 건드리기 직전에 다시 확인하고, 초안 함수는 그 시점의 최신 값을 쓴다.
      if (!isCurrent()) return
      const { hasContent, replaceDraft } = live.current
      if (hasContent) {
        // 구성 중이던 초안은 사용자가 확인해야 바꾼다(확인 상자에서 이어서 처리).
        setPending({ draft: converted.draft, base: startSession })
        return
      }
      if (!replaceDraft(converted.draft)) {
        setConfirmError(
          '운동 목록을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
        )
        return
      }
      keepBusy = true // 이동이 끝날 때까지 연속 확정을 막는다.
      void navigate(PATH_REVIEW, { state: { from: PATH_PLAN } })
    } finally {
      if (!keepBusy) {
        busy.current = false
        if (mounted.current) setConfirming(false)
      }
    }
  }

  function applyPending() {
    if (pendingDraft === null || busy.current) return
    // 계정이 바뀐 뒤의 확인은 처리하지 않는다.
    if (!mounted.current || live.current.userId !== userId) {
      setPending(null)
      return
    }
    busy.current = true
    if (!live.current.replaceDraft(pendingDraft)) {
      busy.current = false
      setPending(null)
      setConfirmError(
        '운동 목록을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
      return
    }
    void navigate(PATH_REVIEW, { state: { from: PATH_PLAN } })
  }

  const automatic = inputs.mode === 'automatic'
  const title =
    session.step === 'mode'
      ? '운동 추천'
      : automatic
        ? '오늘의 운동 추천'
        : '운동 고르고 자동으로 설정'

  // ── 단계별 화면 ─────────────────────────────────────────
  if (session.step === 'pick') {
    return (
      <>
        <div className="mb-1">
          <BackLink parent={PATH_DASHBOARD} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 pt-5">
          <div className="flex flex-col gap-2">
            <p className="text-support leading-relaxed font-normal text-muted">
              {session.replacingId !== null
                ? '바꿀 운동을 하나 골라 주세요.'
                : '하고 싶은 운동을 고르면 세트와 목표를 자동으로 정해 드려요.'}
            </p>
            <button
              type="button"
              onClick={() =>
                update({
                  step:
                    session.resultIds !== null && session.replacingId !== null
                      ? 'result'
                      : 'conditions',
                  replacingId: null,
                })
              }
              className={composeSecondaryButton}
            >
              돌아가기
            </button>
          </div>
          <ExercisePicker
            backTo={null}
            onComplete={handlePick}
            copy={PICKER_COPY}
          />
        </div>
      </>
    )
  }

  if (session.step === 'conditions') {
    const step = clampStep(condStep, inputs.mode)
    return (
      <PlanConditions
        step={step}
        direction={direction}
        headingRef={stepHeadingRef}
        inputs={inputs}
        toolChoices={toolChoices}
        minutesFromGoal={goalMinutes}
        selectedRows={selectedRows}
        backLabel={
          step > 1
            ? '이전 단계로 돌아가기'
            : cameFromMode
              ? '이전 구성 방법 선택으로 돌아가기'
              : '이전 화면으로 돌아가기'
        }
        onBack={goBack}
        onPurpose={(purpose) => updateInputs({ purpose })}
        onMinutes={(minutes) => {
          setMinutesTouched(true)
          updateInputs({ minutes })
        }}
        onToggleTool={(tool) =>
          updateInputs({
            tools: toggleSelectableTool(inputs.tools, tool, toolChoices),
          })
        }
        onPick={() => update({ step: 'pick', replacingId: null })}
        onRemoveSelected={(id) =>
          updateInputs({
            selectedIds: removeSelected(inputs.selectedIds, id),
          })
        }
        onNext={goNext}
      />
    )
  }

  return (
    <Shell>
      <header>
        <h1
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-app-title leading-snug font-semibold text-content outline-none"
        >
          {title}
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {session.step === 'result' && !automatic
            ? '고른 운동의 세트와 목표를 정해 드렸어요.'
            : '목표와 시간을 고르면 쉽게 시작할 수 있게 구성해 드려요.'}
        </p>
      </header>

      {restoredChanged && session.step === 'result' ? (
        <p
          role="status"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          이전에 본 추천과 달라졌어요. 지금 조건으로 다시 계산한 결과예요.
        </p>
      ) : null}

      {session.step === 'mode' ? (
        <PlanModeChoice
          onChoose={(mode) => {
            setNotice(null)
            setCondStep(1)
            setDirection('next')
            setCameFromMode(true)
            setSession({
              ...INITIAL_SESSION,
              step: 'conditions',
              inputs: initialInputs(mode),
            })
          }}
        />
      ) : null}

      {session.step === 'result' && outcome && !outcome.ok ? (
        <section role="alert" className={composeCard}>
          <h2
            id="plan-result-heading"
            ref={headingRef}
            tabIndex={-1}
            className={`${composeSectionTitle} outline-none`}
          >
            추천을 만들 수 없어요
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-body leading-relaxed font-normal text-muted">
            {outcome.failures.map((failure, index) => (
              <li key={index}>{describePlanFailure(failure.code)}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={editConditions}
            className={`${composeSecondaryButton} mt-4 w-full`}
          >
            조건 바꾸기
          </button>
        </section>
      ) : null}

      {session.step === 'result' && plan ? (
        <PlanResultView
          plan={plan}
          headingRef={headingRef}
          confirming={confirming}
          error={confirmError}
          notice={notice}
          onConfirm={() => void confirm()}
          onRetry={automatic ? retry : null}
          onEditConditions={editConditions}
          onReplace={replaceExercise}
          onRemove={automatic ? null : removeExercise}
        />
      ) : null}

      {pendingDraft ? (
        <section
          role="alertdialog"
          aria-labelledby="plan-replace-title"
          className={composeCardActive}
        >
          <h2 id="plan-replace-title" className={composeSectionTitle}>
            구성 중이던 운동 목록이 있어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            추천 운동으로 바꾸면 구성 중이던 운동 목록은 사라져요. 저장해 둔
            목록과 운동 기록은 그대로예요.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={applyPending}
              className={composePrimaryButton}
            >
              추천 운동으로 바꾸기
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null)
                busy.current = false
                setConfirming(false)
              }}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </section>
      ) : null}
    </Shell>
  )
}
