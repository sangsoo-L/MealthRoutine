import { ACCOUNT_SCOPE_PREFIX } from '../../auth/accountScope.ts'
import { MAX_ITEMS } from '../workoutDraftModel.ts'
import { ownerFingerprint } from '../workoutDraftStorage.ts'
import {
  INITIAL_INPUTS,
  validTools,
  type PlanInputs,
  type PlanStep,
} from './planFlow.ts'
import { PLAN_MODES, PLAN_PURPOSES, isValidPlanMinutes } from './rules.ts'
import type { PlanMode, PlanPurpose } from './types.ts'

/**
 * 초급 운동 추천 화면의 임시 저장(계정별 sessionStorage). 새로고침해도 입력과 단계를 되살리려는 화면 쪽 저장이며 영구 저장소가 아니다.
 * - 추천 **결과는 저장하지 않는다.** 입력(요청)과 마지막으로 본 결과의 운동 id 목록(resultIds)만 둔다. 복원할 때 현재 권한을 다시 확인하고
 *   엔진으로 다시 계산한 뒤, resultIds와 달라졌으면 알려 준다(바뀐 결과를 이전 결과처럼 보이지 않게 한다).
 * - 키는 고정이며 계정 정리 접두어로 시작해 로그인·로그아웃에서 지워진다. 값에는 소유자 지문을 함께 두어 다른 계정의 값은 쓰지 않고 지운다.
 * - WorkoutList·IndexedDB·운동 초안(WorkoutDraft)과 별개다. 확정 전에는 운동 목록으로 저장하지 않는다.
 * - 읽은 값은 외부 입력이다. 모양이 하나라도 맞지 않으면 일부만 살리지 않고 전체를 버린다.
 */

export const PLAN_STATE_KEY = `${ACCOUNT_SCOPE_PREFIX}beginner-plan`
const STORAGE_VERSION = 1

export interface PlanSession {
  step: PlanStep
  inputs: PlanInputs
  /** 운동 교체 중인 운동 id(교체할 운동을 고르는 pick 단계에서만 값이 있다). */
  replacingId: string | null
  /** 마지막으로 본 추천 결과의 운동 id 목록(복원 때 달라졌는지 확인하는 용도). 결과가 없으면 null */
  resultIds: readonly string[] | null
}

export interface PlanStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): PlanStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const STEPS: readonly PlanStep[] = ['mode', 'conditions', 'pick', 'result']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_ITEMS &&
  value.every((id) => typeof id === 'string' && id.trim() !== '')

/** 저장된 세션의 형식을 확인한다. 하나라도 어긋나면 null(전체 폐기). */
export function parsePlanSession(raw: unknown): PlanSession | null {
  if (!isRecord(raw) || !isRecord(raw.inputs)) return null
  const inputs = raw.inputs
  const step = raw.step
  if (typeof step !== 'string' || !STEPS.includes(step as PlanStep)) {
    return null
  }
  if (
    typeof inputs.mode !== 'string' ||
    !(PLAN_MODES as readonly string[]).includes(inputs.mode)
  ) {
    return null
  }
  const purpose = inputs.purpose
  if (
    purpose !== null &&
    !(
      typeof purpose === 'string' &&
      (PLAN_PURPOSES as readonly string[]).includes(purpose)
    )
  ) {
    return null
  }
  if (inputs.minutes !== null && !isValidPlanMinutes(inputs.minutes)) {
    return null
  }
  const tools = validTools(inputs.tools)
  if (!tools || !isIdList(inputs.selectedIds)) return null
  if (
    typeof inputs.rotation !== 'number' ||
    !Number.isInteger(inputs.rotation) ||
    inputs.rotation < 0
  ) {
    return null
  }
  const replacingId = raw.replacingId
  if (replacingId !== null && typeof replacingId !== 'string') return null
  const resultIds = raw.resultIds
  if (resultIds !== null && !isIdList(resultIds)) return null
  return {
    step: step as PlanStep,
    inputs: {
      mode: inputs.mode as PlanMode,
      purpose: purpose as PlanPurpose | null,
      minutes: inputs.minutes as number | null,
      tools,
      selectedIds: inputs.selectedIds,
      rotation: inputs.rotation,
    },
    replacingId,
    resultIds,
  }
}

/** 저장된 세션을 읽는다. 없거나 손상되었거나 다른 계정의 것이면 null이고, 쓸 수 없는 값은 지운다. */
export function readPlanSession(
  userId: string,
  storage: PlanStorage | null = defaultStorage(),
): PlanSession | null {
  if (!storage) return null
  try {
    const text = storage.getItem(PLAN_STATE_KEY)
    if (text === null) return null
    const parsed: unknown = JSON.parse(text)
    if (
      !isRecord(parsed) ||
      parsed.v !== STORAGE_VERSION ||
      parsed.owner !== ownerFingerprint(userId)
    ) {
      storage.removeItem(PLAN_STATE_KEY)
      return null
    }
    const session = parsePlanSession(parsed.session)
    if (!session) storage.removeItem(PLAN_STATE_KEY)
    return session
  } catch {
    try {
      storage.removeItem(PLAN_STATE_KEY)
    } catch {
      // 저장소를 쓸 수 없어도 화면은 메모리 상태로 동작한다.
    }
    return null
  }
}

/** 저장한다. 실패해도 화면은 계속 동작하며 false를 돌려준다. */
export function savePlanSession(
  userId: string,
  session: PlanSession,
  storage: PlanStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(
      PLAN_STATE_KEY,
      JSON.stringify({
        v: STORAGE_VERSION,
        owner: ownerFingerprint(userId),
        session,
      }),
    )
    return true
  } catch {
    return false
  }
}

export function clearPlanSession(
  storage: PlanStorage | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(PLAN_STATE_KEY)
  } catch {
    // 무시
  }
}

export const INITIAL_SESSION: PlanSession = {
  step: 'mode',
  inputs: INITIAL_INPUTS,
  replacingId: null,
  resultIds: null,
}
