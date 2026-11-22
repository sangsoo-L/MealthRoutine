import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AuthContext } from '../auth/authContext.ts'
import {
  TomorrowWorkoutDraftContext,
  WorkoutDraftContext,
} from '../exercise/workoutDraftContext.ts'
import type { DraftDay } from '../exercise/workoutDraftTypes.ts'
import { toLocalDate } from '../exercise/workoutModel.ts'
import { createWorkoutPlanRepository } from '../exercise/workoutPlanSource.ts'
import { createWorkoutListRepository } from '../exercise/workoutSource.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  REGISTER_FAILURE_TEXT,
  REGISTER_TEXT,
  decideRegisterTarget,
  isTargetAllowed,
  lookupRegisterState,
} from './exercisePlanRegister.ts'
import type { PlanResult } from './exercisePlanSelect.ts'
import type { LocalPlanSource } from './exercisePlanSource.ts'
import {
  describePlanDraftFailure,
  planToWorkoutDraft,
} from './exercisePlanToDraft.ts'

/**
 * I02-1 "목록 등록" 동작. 추천 결과를 기존 WorkoutDraft로 바꿔 오늘 또는 내일 초안(기존 WorkoutDraftProvider)에 넣고 W02(운동 목록 편집)로 이동한다.
 * 저장은 하지 않는다: 편집·검토·저장은 W02·W11의 기존 절차가 그대로 맡는다(같은 날짜의 기존 목록·계획은 W11도 확인 없이 덮어쓰지 않는다).
 *
 * 누르는 순간마다 저장소를 새로 읽어 판단하고(오늘·내일 목록·계획), 초안을 바꾸기 직전에 다시 확인한다.
 * - 조회 실패·읽을 수 없는 행·날짜 변경: 비어 있다고 가정하지 않고 등록을 중단한다(안내만, 초안·저장 데이터 그대로).
 * - 오늘만/내일만 비어 있어도 사용자가 한 번 확인한 뒤 등록한다(왜 그 날인지 알린다).
 * - 대상 날짜의 초안에 구성 중인 운동이 있으면 사용자가 확인해야 바꾼다(취소하면 그대로).
 * - 확인 사이에 다른 탭 등으로 목록이 생겼으면 확인 시점에 다시 읽어 등록하지 않고 알린다.
 */

export type RegisterPhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | {
      kind: 'choose'
      options: readonly DraftDay[]
      today: LocalDate
      tomorrow: LocalDate
      /** 한 날짜만 선택할 수 있는 이유(둘 다 가능하면 null) */
      note: string | null
    }
  | { kind: 'confirm'; target: DraftDay }
  | { kind: 'blocked' }
  | { kind: 'moving' }

export interface RegisterMessage {
  tone: 'error' | 'info'
  text: string
}

export interface RegisterController {
  phase: RegisterPhase
  message: RegisterMessage | null
  /** 등록을 시작할 수 있다(등록 가능한 추천이고 저장소·초안 기능을 쓸 수 있다). */
  available: boolean
  start: () => void
  choose: (day: DraftDay) => void
  confirmReplace: () => void
  cancel: () => void
}

/** 등록 UI를 쓰지 않는 상태(미리보기·테스트). */
export const IDLE_REGISTER: RegisterController = {
  phase: { kind: 'idle' },
  message: null,
  available: false,
  start: () => {},
  choose: () => {},
  confirmReplace: () => {},
  cancel: () => {},
}

export const PATH_PLAN = '/ai/exercise/plan'
const PATH_COMPOSE = '/records/exercise/compose'

export function composePathFor(day: DraftDay): string {
  return day === 'tomorrow' ? `${PATH_COMPOSE}?day=tomorrow` : PATH_COMPOSE
}

interface UiState {
  plan: PlanResult | null
  phase: RegisterPhase
  message: RegisterMessage | null
}

const IDLE_PHASE: RegisterPhase = { kind: 'idle' }

export function useExercisePlanRegister(
  plan: PlanResult | null,
  source: LocalPlanSource | null,
): RegisterController {
  const navigate = useNavigate()
  const userId = useContext(AuthContext)?.user?.id ?? null
  const todayDraft = useContext(WorkoutDraftContext)
  const tomorrowDraft = useContext(TomorrowWorkoutDraftContext)
  const [state, setState] = useState<UiState>({
    plan: null,
    phase: IDLE_PHASE,
    message: null,
  })
  const listRepository = useMemo(
    () => (userId ? createWorkoutListRepository(userId) : null),
    [userId],
  )
  const planRepository = useMemo(
    () => (userId ? createWorkoutPlanRepository(userId) : null),
    [userId],
  )
  const busy = useRef(false)
  const mounted = useRef(false)
  // 렌더 때마다 갱신하는 최신 값(비동기 처리가 끝났을 때 시작 때의 낡은 값을 쓰지 않는다).
  const live = useRef({ userId, plan, todayDraft, tomorrowDraft })
  useEffect(() => {
    live.current = { userId, plan, todayDraft, tomorrowDraft }
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // 추천이 바뀌면(다시 추천·조건 수정) 지난 확인·안내는 더 이상 맞지 않는다.
  const current: UiState =
    state.plan === plan ? state : { plan, phase: IDLE_PHASE, message: null }

  const available =
    plan !== null &&
    plan.status === 'ok' &&
    plan.items.length > 0 &&
    source !== null &&
    userId !== null &&
    listRepository !== null &&
    planRepository !== null &&
    todayDraft !== null &&
    tomorrowDraft !== null

  async function run(requested: DraftDay | null, confirmed: boolean) {
    if (busy.current || !available || !plan || !source) return
    busy.current = true
    const startPlan = plan
    const startUser = userId
    const isCurrent = () =>
      mounted.current &&
      live.current.userId === startUser &&
      live.current.plan === startPlan
    const show = (phase: RegisterPhase, message: RegisterMessage | null) =>
      setState({ plan: startPlan, phase, message })
    let keepBusy = false
    show({ kind: 'checking' }, null)
    try {
      // 1) 최신 저장 데이터를 읽어 등록할 수 있는 날짜를 판단한다.
      const found = await lookupRegisterState({
        listRepository,
        planRepository,
        now: () => new Date(),
      })
      if (!isCurrent()) return
      if (!found.ok) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: REGISTER_FAILURE_TEXT[found.reason],
        })
        return
      }
      const { lookup } = found
      const decision = decideRegisterTarget(lookup)
      if (decision.kind === 'blocked') {
        show({ kind: 'blocked' }, null)
        return
      }

      // 2) 날짜 선택. 아직 고르지 않았으면 선택지를 보여 준다(한 날짜뿐이면 이유와 함께).
      if (requested === null) {
        show(
          {
            kind: 'choose',
            options:
              decision.kind === 'choose'
                ? ['today', 'tomorrow']
                : [decision.kind],
            today: lookup.today,
            tomorrow: lookup.tomorrow,
            note:
              decision.kind === 'tomorrow'
                ? REGISTER_TEXT.todayOnlyNote
                : decision.kind === 'today'
                  ? REGISTER_TEXT.tomorrowOnlyNote
                  : null,
          },
          null,
        )
        return
      }
      // 고른 뒤 그사이 목록이 생겨 그 날짜가 막혔다면 등록하지 않는다(기존 목록을 보호한다).
      if (!isTargetAllowed(decision, requested)) {
        show(IDLE_PHASE, { tone: 'error', text: REGISTER_TEXT.changed })
        return
      }

      // 3) 추천 → 초안 변환(근거 재확인·기존 검증 포함). 초안은 아직 바꾸지 않는다.
      const converted = planToWorkoutDraft(startPlan, {
        day: requested,
        exercises: source.exercises,
        evidence: source.evidence,
        now: () => new Date().toISOString(),
      })
      if (!converted.ok) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: describePlanDraftFailure(converted.failure.code),
        })
        return
      }

      // 4) 초안을 건드리기 직전에 다시 확인한다. 대상 날짜의 구성 중인 초안은 사용자가 확인해야 바꾼다.
      if (!isCurrent()) return
      const drafts =
        requested === 'tomorrow'
          ? live.current.tomorrowDraft
          : live.current.todayDraft
      if (!drafts) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: '운동 목록을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
      if (drafts.hasContent && !confirmed) {
        show({ kind: 'confirm', target: requested }, null)
        return
      }
      // 자정을 넘겼다면 조회한 날짜가 낡았다. 확인 없이 이어가지 않는다.
      if (toLocalDate(new Date()) !== lookup.today) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: REGISTER_FAILURE_TEXT.dateChanged,
        })
        return
      }
      if (!drafts.replaceDraft(converted.draft)) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: '운동 목록을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
      keepBusy = true // 이동이 끝날 때까지 연속 등록을 막는다.
      show({ kind: 'moving' }, null)
      void navigate(composePathFor(requested), { state: { from: PATH_PLAN } })
    } catch {
      if (isCurrent()) {
        show(IDLE_PHASE, {
          tone: 'error',
          text: '등록하지 못했어요. 잠시 후 다시 시도해 주세요.',
        })
      }
    } finally {
      if (!keepBusy) busy.current = false
    }
  }

  return {
    phase: current.phase,
    message: current.message,
    available,
    start: () => void run(null, false),
    choose: (day) => void run(day, false),
    confirmReplace: () => {
      const phase = current.phase
      if (phase.kind === 'confirm') void run(phase.target, true)
    },
    cancel: () => {
      if (busy.current && current.phase.kind === 'checking') return
      setState({ plan, phase: IDLE_PHASE, message: null })
    },
  }
}
