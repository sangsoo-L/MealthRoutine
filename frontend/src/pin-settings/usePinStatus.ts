import { useEffect, useMemo, useState } from 'react'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import { createPinSource, type PinSource } from './pinSource.ts'

/**
 * 2차 비밀번호 등록 여부. 확인하지 못한 상태를 "미등록"으로 보지 않는다.
 * - checking: 조회 중
 * - unavailable: 이 빌드·화면에는 연결 수단이 없다(모의 모드인데 개발용 저장소가 없음, 서버 모드의 P05 등)
 * - error: 조회 실패(다시 시도할 수 있음). 서버에 닿지 못한 경우도 여기다(unavailable과 섞지 않는다)
 * - ready.locked: 서버 모드에서 서버가 알려 준 잠금 여부(F4-D4). 모의 모드는 retryAt과 화면 타이머를 쓴다
 */
export type PinStatus =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | {
      kind: 'ready'
      configured: boolean
      retryAt: number | null
      locked?: boolean
    }

type Resolved = Exclude<PinStatus, { kind: 'checking' }>

/**
 * 로그인한 계정의 등록 여부를 읽는다(F4). 연결은 `createPinSource`가 고른다:
 * 모의 모드(개발 서버 + VITE_DEV_AUTH=true)는 기존 개발용 PIN 저장소, 그 밖(개발 기본·운영 빌드)은 서버 API다.
 * 번호나 해시는 읽지 않는다.
 * `serverStatus: false`면 서버 모드에서 조회하지 않고 unavailable이다(P05는 F5에서 서버에 연결한다, F4-D1).
 */
export function usePinStatus(
  ownerId: string | null,
  { serverStatus = true }: { serverStatus?: boolean } = {},
): {
  status: PinStatus
  reload: () => void
  source: PinSource | null
} {
  const source = useMemo(
    () => (ownerId ? createPinSource(ownerId) : null),
    [ownerId],
  )
  const active =
    source !== null && (source.mode === 'mock' || serverStatus !== false)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; value: Resolved } | null>(
    null,
  )
  const key = `${ownerId ?? ''}#${attempt}`
  useEffect(() => {
    if (!source || !active) return
    const controller = new AbortController()
    source.getStatus(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            value: {
              kind: 'ready',
              configured: value.configured,
              retryAt: value.retryAt,
              locked: value.locked,
            },
          })
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
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
      controller.abort()
    }
  }, [source, active, key])

  let status: PinStatus
  if (!source || !active) status = { kind: 'unavailable' }
  else if (loaded?.key === key) status = loaded.value
  else status = { kind: 'checking' }
  return { status, reload: () => setAttempt((n) => n + 1), source }
}
