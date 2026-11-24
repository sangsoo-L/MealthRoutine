import { toLocalDate } from '../exercise/workoutModel.ts'
import { tomorrowOf } from '../exercise/workoutPlanModel.ts'
import type { WorkoutPlanRepository } from '../exercise/workoutPlanRepository.ts'
import {
  isWorkoutStoreError,
  type WorkoutListRepository,
} from '../exercise/workoutRepositories.ts'
import type { DraftDay } from '../exercise/workoutDraftTypes.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'

/**
 * I02-1 "목록 등록"의 날짜 판단(오늘/내일 중 어디에 등록할 수 있는가)과 최신 데이터 조회.
 * 저장하지 않는다(읽기만 한다). 실제 저장은 W02 편집 → W11 검토의 기존 절차가 맡고, 거기서도 같은 날짜의 기존 목록·계획은 확인 없이 덮어쓰지 않는다.
 *
 * 판단 규칙(사용자 확정)
 * - 오늘 목록이 있다: 저장된 오늘 운동 목록이 하나라도 있으면(완료·진행 중 목록 포함) 있는 것이다. 계획 날짜가 오늘인 운동 계획도 오늘 목록과 같게 본다.
 * - 내일 계획이 있다: 계획 날짜가 내일인 운동 계획이 있다.
 * - 둘 다 없음 → 오늘/내일 선택, 오늘만 있음 → 내일, 내일만 있음 → 오늘, 둘 다 있음 → 등록 차단.
 * - 조회가 실패했거나 읽을 수 없는 행이 있어 없다고 단정할 수 없으면 비어 있다고 가정하지 않고 등록을 중단한다.
 */

export interface RegisterLookup {
  /** 조회한 기준 날짜(기기 로컬 날짜) */
  today: LocalDate
  tomorrow: LocalDate
  /** 오늘 날짜의 운동 목록(완료·진행 중 포함)이 있다. */
  todayListExists: boolean
  /** 계획 날짜가 오늘인 운동 계획이 있다(오늘이 된 계획). */
  todayPlanExists: boolean
  /** 계획 날짜가 내일인 운동 계획이 있다. */
  tomorrowPlanExists: boolean
}

export type RegisterDecision =
  | { kind: 'choose' }
  | { kind: 'today' }
  | { kind: 'tomorrow' }
  | { kind: 'blocked' }

/** 오늘에 이미 운동 목록이 있는가(저장된 목록 또는 오늘이 된 계획). */
export function todayOccupied(lookup: RegisterLookup): boolean {
  return lookup.todayListExists || lookup.todayPlanExists
}

export function decideRegisterTarget(lookup: RegisterLookup): RegisterDecision {
  const today = todayOccupied(lookup)
  const tomorrow = lookup.tomorrowPlanExists
  if (today && tomorrow) return { kind: 'blocked' }
  if (today) return { kind: 'tomorrow' }
  if (tomorrow) return { kind: 'today' }
  return { kind: 'choose' }
}

/** 사용자가 고른 날짜가 지금 판단으로 등록할 수 있는 날짜인가. */
export function isTargetAllowed(
  decision: RegisterDecision,
  target: DraftDay,
): boolean {
  return (
    decision.kind === 'choose' ||
    (decision.kind === 'today' && target === 'today') ||
    (decision.kind === 'tomorrow' && target === 'tomorrow')
  )
}

export type RegisterLookupFailure =
  /** 저장소를 쓸 수 없다(계정 없음·IndexedDB 사용 불가). */
  | 'unavailable'
  /** 조회 중 오류가 났거나 읽을 수 없는 행이 있어 목록·계획이 없다고 단정할 수 없다. */
  | 'unreadable'
  /** 조회하는 사이 날짜가 바뀌었다(자정). 사용자 확인 없이 이어가지 않는다. */
  | 'dateChanged'

export type RegisterLookupResult =
  | { ok: true; lookup: RegisterLookup }
  | { ok: false; reason: RegisterLookupFailure }

export interface RegisterLookupDeps {
  listRepository: Pick<WorkoutListRepository, 'listByDate'> | null
  planRepository: Pick<WorkoutPlanRepository, 'listByDate'> | null
  /** 날짜 판단에 쓰는 시계(W11과 같은 기기 시계) */
  now: () => Date
}

function failureOf(error: unknown): RegisterLookupFailure {
  return isWorkoutStoreError(error) && error.reason === 'unavailable'
    ? 'unavailable'
    : 'unreadable'
}

/**
 * 지금 저장된 최신 데이터를 읽어 등록 판단의 재료를 만든다. 캐시를 쓰지 않고 호출할 때마다 저장소를 다시 읽는다.
 * 조회 전후의 날짜가 다르면(자정을 넘김) 낡은 날짜의 결과이므로 실패(dateChanged)로 돌려준다.
 */
export async function lookupRegisterState(
  deps: RegisterLookupDeps,
): Promise<RegisterLookupResult> {
  if (!deps.listRepository || !deps.planRepository) {
    return { ok: false, reason: 'unavailable' }
  }
  const today = toLocalDate(deps.now())
  const tomorrow = tomorrowOf(today)
  try {
    const [lists, todayPlans, tomorrowPlans] = await Promise.all([
      deps.listRepository.listByDate(today),
      deps.planRepository.listByDate(today),
      deps.planRepository.listByDate(tomorrow),
    ])
    // 읽을 수 없는 행이 있는데 읽은 항목이 없으면 "없다"고 단정할 수 없다.
    for (const found of [lists, todayPlans, tomorrowPlans]) {
      if (found.items.length === 0 && found.skippedCount > 0) {
        return { ok: false, reason: 'unreadable' }
      }
    }
    if (toLocalDate(deps.now()) !== today) {
      return { ok: false, reason: 'dateChanged' }
    }
    return {
      ok: true,
      lookup: {
        today,
        tomorrow,
        todayListExists: lists.items.length > 0,
        todayPlanExists: todayPlans.items.length > 0,
        tomorrowPlanExists: tomorrowPlans.items.length > 0,
      },
    }
  } catch (error) {
    return { ok: false, reason: failureOf(error) }
  }
}

export const REGISTER_FAILURE_TEXT: Record<RegisterLookupFailure, string> = {
  unavailable:
    '이 환경에서는 저장된 운동 목록을 확인할 수 없어 등록할 수 없어요.',
  unreadable:
    '저장된 운동 목록을 확인하지 못해 등록하지 않았어요. 잠시 후 다시 시도해 주세요.',
  dateChanged:
    '날짜가 바뀌어 등록하지 않았어요. 다시 눌러 오늘 기준으로 확인해 주세요.',
}

export const REGISTER_TEXT = {
  blockedTitle: '오늘과 내일 모두 운동 목록이 있어요',
  blockedBody:
    '이미 저장된 목록은 바꾸지 않아요. 추천은 등록하지 않았어요. 기존 목록을 확인하거나 직접 고치려면 운동 기록에서 해 주세요.',
  chooseTitle: '어느 날의 운동 목록으로 등록할까요?',
  chooseBody: '오늘과 내일 모두 아직 저장된 목록이 없어요.',
  todayOnlyNote: '오늘은 이미 운동 목록이 있어 내일 목록으로 등록해요.',
  tomorrowOnlyNote: '내일은 이미 운동 계획이 있어 오늘 목록으로 등록해요.',
  changed:
    '그사이 저장된 목록이 바뀌었어요. 아무것도 등록하지 않았어요. 다시 눌러 확인해 주세요.',
  restNote:
    '등록하면 운동 목록 편집 화면으로 이동해 세트·횟수·시간을 고칠 수 있어요. 세트 사이 휴식 시간은 운동 목록에 저장되지 않으니 참고만 해 주세요. 중량은 비어 있어요.',
} as const
