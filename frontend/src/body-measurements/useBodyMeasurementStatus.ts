import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import { BodySaveError } from './bodyRepository.ts'
import { createBodySource, type BodySource } from './bodySource.ts'
import type {
  BodyMeasurementInput,
  BodyMeasurementState,
  BodySaveOutcome,
} from './bodyTypes.ts'

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  state: BodyMeasurementState
}

/**
 * 저장 한 번을 화면용 결과로 바꾼다(F5 계획 8.3·8.8.3, 테스트를 위해 React 밖으로 뺐다).
 * - 시작 때 로그인 작업 표식이 없거나 다른 회원이면 보내지 않고 `stale`.
 * - 응답이 왔을 때 이미 무효(`isCurrent()` 거짓)면 결과 종류와 상관없이 `stale`(문구·상태 반영 없음).
 * - 모의 저장소의 계약(등록 여부 반환, `BodySaveError`)은 그대로 두고 여기서 감싼다. 모의 성공은 `onMockSaved`로 등록 여부를 알린다.
 * - 서버 저장은 등록 여부를 돌려주지 않는다(실제 모드는 저장 뒤에도 `protected`).
 */
export async function saveBodyMeasurement(args: {
  source: BodySource | null
  input: BodyMeasurementInput
  userId: string
  guard: { userId: string; isCurrent(): boolean } | null
  /** 이 훅(화면)이 아직 같은 회원으로 살아 있는지 */
  alive: () => boolean
  onMockSaved?: (value: { height: boolean; weight: boolean }) => void
}): Promise<BodySaveOutcome> {
  const { source, input, userId, guard, alive, onMockSaved } = args
  if (
    !source ||
    guard === null ||
    guard.userId !== userId ||
    !guard.isCurrent()
  )
    return { kind: 'stale' }
  const isCurrent = () => guard.isCurrent() && alive()
  if (source.mode === 'server') {
    const result = await source.source.save(input)
    if (!isCurrent()) return { kind: 'stale' }
    return { kind: result, isCurrent }
  }
  try {
    const value = await source.repository.save(input)
    if (!isCurrent()) return { kind: 'stale' }
    onMockSaved?.(value)
    return { kind: 'saved', isCurrent }
  } catch (error) {
    if (!isCurrent()) return { kind: 'stale' }
    return {
      kind:
        error instanceof BodySaveError && error.reason === 'invalid'
          ? 'invalid'
          : 'failed',
      isCurrent,
    }
  }
}

/**
 * 신체 정보 등록 여부 상태와 저장. 계정이 바뀌거나 다시 불러오면 이전 값을 버리고 불러오는 중으로 돌아간다
 * (이전 계정의 상태가 잠깐이라도 보이지 않는다). 수치는 다루지 않는다(등록 여부만).
 *
 * - 모의 모드: 지금처럼 저장소에서 등록 여부를 읽는다. 조회 수단이 없으면 unavailable, 조회가 실패하면 error다. 둘 다 "누락"이 아니다.
 * - 실제 모드(F5-D1): 요청 없이 `protected`. 서버는 PIN 없이 등록 여부를 알려 주지 않는다. 저장한 뒤에도 `protected`를 유지한다.
 * - save는 예외 대신 화면용 결과(`BodySaveOutcome`)를 돌려준다. 받는 쪽은 반영 바로 앞에서 `isCurrent()`를 다시 확인한다.
 */
export function useBodyMeasurementStatus(userId: string): {
  state: BodyMeasurementState
  reload: () => void
  save: (input: BodyMeasurementInput) => Promise<BodySaveOutcome>
} {
  const { beginAccountWork } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${userId}#${attempt}`
  const server = createBodySource(userId)?.mode === 'server'
  // 저장 응답이 왔을 때 이 훅이 아직 같은 회원으로 살아 있는지 본다.
  const life = useRef({ userId, alive: true })
  useEffect(() => {
    const current = { userId, alive: true }
    life.current = current
    return () => {
      current.alive = false
    }
  }, [userId])

  useEffect(() => {
    if (server) return
    let cancelled = false
    const source = createBodySource(userId)
    if (source?.mode !== 'mock') {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    source.repository.getStatus().then(
      (value) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', value } })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, key, server])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const save = useCallback(
    (input: BodyMeasurementInput) => {
      const mine = life.current
      return saveBodyMeasurement({
        source: createBodySource(userId),
        input,
        userId,
        guard: beginAccountWork(),
        alive: () => mine.alive && mine.userId === userId,
        // 모의 저장은 성공한 뒤에만 등록 여부를 바꾼다(저장 전에는 회원 정보에 반영된 것처럼 보이지 않는다).
        onMockSaved: (value) =>
          setLoaded({
            key: `${userId}#${attempt}`,
            state: { status: 'ready', value },
          }),
      })
    },
    [userId, attempt, beginAccountWork],
  )

  let state: BodyMeasurementState
  if (server) state = { status: 'protected' }
  else
    state = loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload, save }
}
