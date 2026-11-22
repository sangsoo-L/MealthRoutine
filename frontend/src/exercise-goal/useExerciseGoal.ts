import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadExerciseGoalContext } from './exerciseGoalContext.ts'
import { createExerciseGoalRepository } from './exerciseGoalSource.ts'
import {
  ExerciseGoalError,
  type ExerciseGoal,
  type ExerciseGoalContext,
  type ExerciseGoalDraft,
  type ExerciseGoalProfile,
  type ExerciseGoalSummary,
  type GoalAuthorization,
} from './exerciseGoalTypes.ts'

export type GoalScreenState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'unavailable' }
  | { status: 'missingHealthGoal' }
  | {
      status: 'locked'
      context: ExerciseGoalContext
      configured: boolean
      retryAt: number | null
    }
  | {
      status: 'unlocked'
      context: ExerciseGoalContext
      access: GoalAuthorization
      profile: ExerciseGoalProfile | null
      prefill: Partial<ExerciseGoalProfile>
      goal: ExerciseGoal | null
    }

export function useExerciseGoal(ownerId: string) {
  const repository = useMemo(
    () => createExerciseGoalRepository(ownerId),
    [ownerId],
  )
  const [state, setState] = useState<GoalScreenState>({ status: 'loading' })
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const accessRef = useRef<GoalAuthorization | null>(null)

  const revoke = useCallback(() => {
    if (accessRef.current) repository?.lock(accessRef.current)
    accessRef.current = null
  }, [repository])
  const invalidate = useCallback(() => {
    generation.current++
    revoke()
  }, [revoke])
  const reload = useCallback(async () => {
    const current = ++generation.current
    revoke()
    setState({ status: 'loading' })
    if (!repository) {
      setState({ status: 'unavailable' })
      return
    }
    try {
      const [context, pin] = await Promise.all([
        loadExerciseGoalContext(ownerId),
        repository.getPinStatus(),
      ])
      if (generation.current !== current) return
      setState(
        context
          ? {
              status: 'locked',
              context,
              configured: pin.configured,
              retryAt: pin.retryAt,
            }
          : { status: 'missingHealthGoal' },
      )
    } catch (error) {
      if (generation.current === current)
        setState(
          error instanceof ExerciseGoalError && error.code === 'unavailable'
            ? { status: 'unavailable' }
            : { status: 'error', error },
        )
    }
  }, [ownerId, repository, revoke])
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
              context: current.context,
              configured: true,
              retryAt: null,
            }
          : current,
      )
      setNotice(message)
    },
    [revoke],
  )
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
    if (!repository) throw new ExerciseGoalError('unavailable')
    const current = generation.current
    await repository.registerPin(pin, confirmation)
    if (current !== generation.current) return
    setNotice(
      '비밀번호를 등록했어요. 신체 정보를 열려면 한 번 더 확인해 주세요.',
    )
    setState((s) =>
      s.status === 'locked' ? { ...s, configured: true, retryAt: null } : s,
    )
  }
  async function unlock(pin: string) {
    if (!repository) throw new ExerciseGoalError('unavailable')
    const current = generation.current
    const access = await repository.unlock(pin)
    if (current !== generation.current) {
      repository.lock(access)
      return
    }
    accessRef.current = access
    try {
      const [context, profile, goal, prefill] = await Promise.all([
        loadExerciseGoalContext(ownerId),
        repository.getProfile(access),
        repository.getGoal(access),
        repository.getProfilePrefill(access),
      ])
      if (current !== generation.current) {
        repository.lock(access)
        return
      }
      if (!context || access.expiresAt <= Date.now() || document.hidden)
        throw new ExerciseGoalError('expired')
      setNotice('')
      setState({ status: 'unlocked', context, access, profile, goal, prefill })
    } catch (error) {
      repository.lock(access)
      accessRef.current = null
      throw error
    }
  }
  async function saveProfile(profile: Omit<ExerciseGoalProfile, 'updatedAt'>) {
    if (!repository || state.status !== 'unlocked')
      throw new ExerciseGoalError('expired')
    const current = generation.current
    const result = await repository.saveProfile(state.access, profile)
    if (current !== generation.current) throw new ExerciseGoalError('expired')
    setState({ ...state, profile: result })
  }
  async function saveGoal(draft: ExerciseGoalDraft) {
    if (!repository || state.status !== 'unlocked' || !state.profile)
      throw new ExerciseGoalError('expired')
    const current = generation.current
    await repository.saveGoal(state.access, draft, state.context, state.profile)
    if (current !== generation.current) throw new ExerciseGoalError('expired')
    lock('운동 목표를 저장했어요.')
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

export function useExerciseGoalSummary(ownerId: string | null) {
  const repository = useMemo(
    () => (ownerId ? createExerciseGoalRepository(ownerId) : null),
    [ownerId],
  )
  const [loaded, setLoaded] = useState<{
    key: string
    value: ExerciseGoalSummary | null
    failed: boolean
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${ownerId ?? ''}#${attempt}`
  useEffect(() => {
    let cancelled = false
    if (!repository) return
    repository.getSummary().then(
      (value) => {
        if (!cancelled) setLoaded({ key, value, failed: false })
      },
      () => {
        if (!cancelled) setLoaded({ key, value: null, failed: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, key])
  return {
    available: repository !== null,
    loaded: loaded?.key === key ? loaded : null,
    retry: () => setAttempt((n) => n + 1),
  }
}
