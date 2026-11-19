import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import {
  ExerciseGoalError,
  type GoalAuthorization,
} from '../exercise-goal/exerciseGoalTypes.ts'
import { loadKnowledgeLevels } from '../mypage/knowledgeSource.ts'
import type { KnowledgeSource } from '../mypage/mypageTypes.ts'
import { MEAL_GOAL_ADULT_AGE } from './mealGoalPolicy.ts'
import { createMealGoalRepository } from './mealGoalSource.ts'
import {
  MealGoalError,
  type MealGoal,
  type MealGoalInput,
  type MealGoalLevel,
} from './mealGoalTypes.ts'

/** 식단 목표 계산에 쓰는 신체 정보. persisted가 false면 이 화면에만 있는 값이다(성인 신체 정보 저장소에 쓰지 않았다). */
export interface FormProfile {
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
  updatedAt: string
  persisted: boolean
}

export type MealGoalFormState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'unavailable' }
  | {
      status: 'locked'
      level: MealGoalLevel | null
      levelSource: KnowledgeSource | null
      goal: MealGoal | null
      configured: boolean
      retryAt: number | null
    }
  | {
      status: 'unlocked'
      level: MealGoalLevel | null
      levelSource: KnowledgeSource | null
      goal: MealGoal | null
      access: GoalAuthorization
      profile: FormProfile | null
      prefill: { heightCm?: number; weightKg?: number }
    }

/**
 * D01-4 화면의 상태와 동작. 기존 운동 목표의 PIN·신체 정보 저장소(`exercise-goal/`)를 **호출만 하고 바꾸지 않는다**:
 * PIN 등록·확인(오류 5회 → 5분 제한, 확인 후 1분 열람), 키·몸무게·나이·성별 읽기·저장을 그 저장소가 맡는다.
 * 식단 목표 자체(kcal·비율)는 meal-goal 저장소에 있고 신체 수치를 담지 않는다.
 *
 * - 식단 이해도는 이해도 확인 결과(`loadKnowledgeLevels().meal`)다. 값이 없으면 level은 null이고 초급으로 바꾸지 않는다. 조회 실패는 오류 상태다.
 * - 나이가 14~17세면 성인용 신체 정보 저장소(18세부터만 저장)에 쓰지 않고 이 화면의 메모리에만 둔다(자동 계산을 적용하지 않는다).
 * - 열람 시간이 끝나거나 화면이 가려지면 신체 정보를 다시 숨기고 잠금 상태로 돌아간다. 폼의 입력값은 화면(폼 컴포넌트)이 가지고 있어 유지된다.
 */
export function useMealGoalForm(ownerId: string) {
  const exerciseRepository = useMemo(
    () => createExerciseGoalRepository(ownerId),
    [ownerId],
  )
  const goalRepository = useMemo(
    () => createMealGoalRepository(ownerId),
    [ownerId],
  )
  const [state, setState] = useState<MealGoalFormState>({ status: 'loading' })
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const accessRef = useRef<GoalAuthorization | null>(null)

  const revoke = useCallback(() => {
    if (accessRef.current) exerciseRepository?.lock(accessRef.current)
    accessRef.current = null
  }, [exerciseRepository])
  const invalidate = useCallback(() => {
    generation.current++
    revoke()
  }, [revoke])

  const reload = useCallback(async () => {
    const current = ++generation.current
    revoke()
    setState({ status: 'loading' })
    if (!exerciseRepository || !goalRepository) {
      setState({ status: 'unavailable' })
      return
    }
    try {
      const [levels, pin, goal] = await Promise.all([
        loadKnowledgeLevels(ownerId),
        exerciseRepository.getPinStatus(),
        goalRepository.getGoal(),
      ])
      if (generation.current !== current) return
      setState({
        status: 'locked',
        level: levels?.meal?.tier ?? null,
        levelSource: levels?.meal?.source ?? null,
        goal,
        configured: pin.configured,
        retryAt: pin.retryAt,
      })
    } catch (error) {
      if (generation.current !== current) return
      const unavailable =
        (error instanceof ExerciseGoalError && error.code === 'unavailable') ||
        (error instanceof MealGoalError && error.code === 'unavailable')
      setState(
        unavailable ? { status: 'unavailable' } : { status: 'error', error },
      )
    }
  }, [ownerId, exerciseRepository, goalRepository, revoke])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) void reload()
    })
    return () => {
      active = false
      invalidate()
    }
  }, [reload, invalidate])

  const lock = useCallback(
    (message = '신체 정보를 다시 숨겼어요.') => {
      generation.current++
      revoke()
      setState((current) =>
        current.status === 'unlocked'
          ? {
              status: 'locked',
              level: current.level,
              levelSource: current.levelSource,
              goal: current.goal,
              configured: true,
              retryAt: null,
            }
          : current,
      )
      setNotice(message)
    },
    [revoke],
  )

  // 열람 시간이 끝나거나 화면이 가려지면 다시 숨긴다.
  useEffect(() => {
    if (state.status !== 'unlocked') return
    const timer = window.setTimeout(
      () => lock('열람 시간이 끝났어요. 2차 비밀번호를 다시 확인해 주세요.'),
      Math.max(0, state.access.expiresAt - Date.now()),
    )
    const hidden = () => {
      if (document.hidden) lock()
    }
    const pageHide = () => lock()
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [state, lock])

  async function registerPin(pin: string, confirmation: string) {
    if (!exerciseRepository) throw new ExerciseGoalError('unavailable')
    const current = generation.current
    await exerciseRepository.registerPin(pin, confirmation)
    if (current !== generation.current) return
    setNotice(
      '비밀번호를 등록했어요. 신체 정보를 열려면 한 번 더 확인해 주세요.',
    )
    setState((s) =>
      s.status === 'locked' ? { ...s, configured: true, retryAt: null } : s,
    )
  }

  async function unlock(pin: string) {
    if (!exerciseRepository || state.status !== 'locked')
      throw new ExerciseGoalError('unavailable')
    const current = generation.current
    const access = await exerciseRepository.unlock(pin)
    if (current !== generation.current) {
      exerciseRepository.lock(access)
      return
    }
    accessRef.current = access
    try {
      const [profile, prefill] = await Promise.all([
        exerciseRepository.getProfile(access),
        exerciseRepository.getProfilePrefill(access),
      ])
      if (current !== generation.current) {
        exerciseRepository.lock(access)
        return
      }
      if (access.expiresAt <= Date.now() || document.hidden)
        throw new ExerciseGoalError('expired')
      setNotice('')
      setState({
        status: 'unlocked',
        level: state.level,
        levelSource: state.levelSource,
        goal: state.goal,
        access,
        profile: profile ? { ...profile, persisted: true } : null,
        prefill: {
          heightCm: prefill.heightCm,
          weightKg: prefill.weightKg,
        },
      })
    } catch (error) {
      exerciseRepository.lock(access)
      accessRef.current = null
      throw error
    }
  }

  /**
   * 신체 정보를 저장한다. 18세 이상은 기존 PIN 보호 프로필에 저장하고(키·몸무게는 신체 정보에도 반영된다),
   * 14~17세는 그 저장소가 성인 정보만 허용하므로 저장하지 않고 이 화면에서만 쓴다.
   */
  async function saveProfile(value: {
    age: number
    sex: 'male' | 'female'
    heightCm: number
    weightKg: number
  }) {
    if (!exerciseRepository || state.status !== 'unlocked')
      throw new ExerciseGoalError('expired')
    const current = generation.current
    if (value.age < MEAL_GOAL_ADULT_AGE) {
      setState({
        ...state,
        profile: {
          ...value,
          updatedAt: new Date().toISOString(),
          persisted: false,
        },
      })
      return
    }
    const result = await exerciseRepository.saveProfile(state.access, value)
    if (current !== generation.current) throw new ExerciseGoalError('expired')
    setState({ ...state, profile: { ...result, persisted: true } })
  }

  /** 목표를 저장한다. 계산 정책이 검증되지 않았으면 저장소가 policyPending으로 거부한다. */
  async function saveGoal(goal: MealGoalInput) {
    if (!goalRepository || state.status !== 'unlocked')
      throw new ExerciseGoalError('expired')
    const current = generation.current
    await goalRepository.saveGoal({
      goal,
      expectedRevision: state.goal?.revision ?? null,
    })
    if (current !== generation.current) throw new ExerciseGoalError('expired')
    lock('식단 목표를 저장했어요.')
  }

  return {
    state,
    notice,
    reload,
    lock,
    registerPin,
    unlock,
    saveProfile,
    saveGoal,
  }
}
