import { useCallback, useEffect, useState } from 'react'
import { createGoalRepository } from './goalSource.ts'
import type {
  HealthGoalInput,
  HealthGoalState,
  HealthManagementGoal,
} from './goalTypes.ts'

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  state: HealthGoalState
}

/**
 * 건강 목표 상태와 저장. 계정이 바뀌거나 다시 불러오면 이전 값을 버리고 불러오는 중으로 돌아간다
 * (이전 계정의 목표가 잠깐이라도 보이지 않는다).
 *
 * 조회 수단이 없으면(운영 빌드·API 미연결) unavailable, 조회가 실패하면 error다. 둘 다 "목표 없음"이 아니다.
 * save는 저장이 성공한 뒤에만 상태를 바꾼다. 실패하면 예외를 던지고 기존 목표는 그대로 남는다.
 */
export function useHealthGoal(userId: string): {
  state: HealthGoalState
  reload: () => void
  save: (input: HealthGoalInput) => Promise<HealthManagementGoal>
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${userId}#${attempt}`

  useEffect(() => {
    let cancelled = false
    const repository = createGoalRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.getGoal().then(
      (goal) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', goal } })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const save = useCallback(
    async (input: HealthGoalInput) => {
      const repository = createGoalRepository(userId)
      if (!repository) throw new Error('goal repository unavailable')
      const goal = await repository.saveGoal(input)
      setLoaded({
        key: `${userId}#${attempt}`,
        state: { status: 'ready', goal },
      })
      return goal
    },
    [userId, attempt],
  )

  const state: HealthGoalState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload, save }
}
