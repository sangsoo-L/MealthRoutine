import { isPolicyVerified } from '../mealGoalPolicy.ts'
import { parseMealGoal, validGoalInput } from '../mealGoalValidation.ts'
import {
  MealGoalError,
  type MealGoal,
  type MealGoalRepository,
} from '../mealGoalTypes.ts'

/**
 * [개발 전용] 식단 목표 로컬 저장소. 서버가 맡을 보관을 개발 환경에서 흉내 낸다(개발 서버에서만 불러온다: mealGoalSource.ts).
 * 운영 빌드에는 포함되지 않고, 운영에서는 저장소가 없어 localStorage를 운영 저장소처럼 쓰지 않는다.
 *
 * - 저장 위치: localStorage `mealthroutine.dev.meal-goal.value.<ownerId>` = `{ ownerId, goal }`. 로그아웃에도 남아 "다음 로그인에도 저장돼 있음"을 흉내 낸다
 *   (운동 목표 저장소와 같은 방식). 계정 분리는 키와 값 안의 ownerId로 한다.
 * - 읽을 때 값을 외부 입력으로 본다: JSON이 아니거나 구조가 어긋나거나 ownerId가 다르면 `corrupt`다. 다른 회원의 값을 돌려주지 않는다.
 *   키가 없으면 목표가 없는 것(null)이며, 읽기 오류(`load`)·저장소 없음(`unavailable`)·손상(`corrupt`)과 구분한다.
 * - 쓸 때: 입력 구조 검증 → 계산 정책 검증 여부 확인(검증 전이면 `policyPending`) → 기존 값 확인(손상이면 덮어쓰지 않는다) → revision 비교(`conflict`)
 *   → 한 번의 setItem으로 교체한다. 어느 단계에서 실패해도 기존 목표는 바뀌지 않는다.
 * - 개발·검수용 스위치(`mealthroutine.dev.mock.flag.unavailable|failLoad|failSave`)가 `all` 또는 `mealGoal`이면 저장소 없음·읽기 실패·쓰기 실패를 재현한다.
 */

export const MEAL_GOAL_KEY_PREFIX = 'mealthroutine.dev.meal-goal.value.'

export interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LocalMealGoalOptions {
  storage?: LocalStorageLike
  now?: () => Date
  /** 계산 정책 버전의 검증 여부. 기본은 정책 표(mealGoalPolicy). 테스트가 대체한다. */
  isVerified?: (version: number) => boolean
}

const DOMAIN = 'mealGoal'

export function createLocalMealGoalRepository(
  ownerId: string,
  options: LocalMealGoalOptions = {},
): MealGoalRepository {
  if (typeof ownerId !== 'string' || ownerId === '' || ownerId.length > 200)
    throw new MealGoalError('validation')
  const now = options.now ?? (() => new Date())
  const isVerified = options.isVerified ?? isPolicyVerified
  const key = MEAL_GOAL_KEY_PREFIX + ownerId

  function storage(): LocalStorageLike {
    return options.storage ?? window.localStorage
  }
  function flag(name: 'failLoad' | 'failSave' | 'unavailable'): boolean {
    try {
      return (storage().getItem(`mealthroutine.dev.mock.flag.${name}`) ?? '')
        .split(',')
        .some((value) => value.trim() === 'all' || value.trim() === DOMAIN)
    } catch {
      return false
    }
  }
  function checkRead() {
    if (flag('unavailable')) throw new MealGoalError('unavailable')
    if (flag('failLoad')) throw new MealGoalError('load')
  }
  function checkWrite() {
    if (flag('unavailable')) throw new MealGoalError('unavailable')
    if (flag('failSave')) throw new MealGoalError('save')
  }

  /** 저장된 목표. 키가 없으면 null이고, 읽지 못하거나 손상됐으면 오류를 던진다. */
  function stored(): MealGoal | null {
    checkRead()
    let raw: string | null
    try {
      raw = storage().getItem(key)
    } catch {
      throw new MealGoalError('load')
    }
    if (raw === null) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new MealGoalError('corrupt')
    }
    if (typeof parsed !== 'object' || parsed === null)
      throw new MealGoalError('corrupt')
    const entry = parsed as Record<string, unknown>
    const goal = entry.ownerId === ownerId ? parseMealGoal(entry.goal) : null
    if (!goal) throw new MealGoalError('corrupt')
    return goal
  }

  return {
    kind: 'local',
    async getGoal() {
      return stored()
    },
    async saveGoal(request) {
      if (
        typeof request !== 'object' ||
        request === null ||
        !validGoalInput(request.goal)
      )
        throw new MealGoalError('validation')
      const { expectedRevision } = request
      if (
        expectedRevision !== null &&
        !(Number.isSafeInteger(expectedRevision) && expectedRevision >= 1)
      )
        throw new MealGoalError('validation')
      // 계산 정책이 전문가 검증을 마치지 않았으면 어떤 값도 저장하지 않는다.
      if (!isVerified(request.goal.calculationVersion))
        throw new MealGoalError('policyPending')
      checkWrite()
      // 손상된 기존 목표를 숨긴 채 덮어쓰지 않는다. 읽기 오류도 그대로 알린다.
      const current = stored()
      if ((current?.revision ?? null) !== expectedRevision)
        throw new MealGoalError('conflict')
      const goal: MealGoal = {
        ...request.goal,
        ratio: { ...request.goal.ratio },
        basis: { ...request.goal.basis },
        revision: (current?.revision ?? 0) + 1,
        updatedAt: now().toISOString(),
      }
      try {
        storage().setItem(key, JSON.stringify({ ownerId, goal }))
      } catch {
        throw new MealGoalError('save')
      }
      return goal
    },
  }
}
