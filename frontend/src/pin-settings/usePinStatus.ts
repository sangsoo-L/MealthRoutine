import { useEffect, useMemo, useState } from 'react'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import {
  ExerciseGoalError,
  type ExerciseGoalRepository,
} from '../exercise-goal/exerciseGoalTypes.ts'

/**
 * 2차 비밀번호 등록 여부. 확인하지 못한 상태를 "미등록"으로 보지 않는다.
 * - checking: 조회 중
 * - unavailable: 이 빌드에는 등록·변경 수단이 없다(운영 빌드, 서버 연결 전) 또는 저장소가 연결되지 않음
 * - error: 조회 실패(다시 시도할 수 있음)
 */
export type PinStatus =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'ready'; configured: boolean; retryAt: number | null }

type Resolved = Exclude<PinStatus, { kind: 'checking' }>

/**
 * 로그인한 계정의 등록 여부를 읽는다. 저장소는 기존 W01-1·D01-4와 같은 개발용 PIN 저장소(개발 서버 한정)이며,
 * 운영 빌드에는 저장소가 없어 항상 unavailable이다(서버 API 연결 전). 번호나 해시는 읽지 않는다.
 */
export function usePinStatus(ownerId: string | null): {
  status: PinStatus
  reload: () => void
  repository: ExerciseGoalRepository | null
} {
  const repository = useMemo(
    () => (ownerId ? createExerciseGoalRepository(ownerId) : null),
    [ownerId],
  )
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; value: Resolved } | null>(
    null,
  )
  const key = `${ownerId ?? ''}#${attempt}`
  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.getPinStatus().then(
      (value) => {
        if (!cancelled)
          setLoaded({
            key,
            value: {
              kind: 'ready',
              configured: value.configured,
              retryAt: value.retryAt,
            },
          })
      },
      (error: unknown) => {
        if (!cancelled)
          setLoaded({
            key,
            value:
              error instanceof ExerciseGoalError && error.code === 'unavailable'
                ? { kind: 'unavailable' }
                : { kind: 'error' },
          })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, key])

  let status: PinStatus
  if (!repository) status = { kind: 'unavailable' }
  else if (loaded?.key === key) status = loaded.value
  else status = { kind: 'checking' }
  return { status, reload: () => setAttempt((n) => n + 1), repository }
}
