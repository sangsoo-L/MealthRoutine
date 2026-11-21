import { useCallback, useEffect, useState } from 'react'
import { createBodyRepository } from './bodySource.ts'
import type { BodyMeasurementInput, BodyMeasurementState } from './bodyTypes.ts'

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  state: BodyMeasurementState
}

/**
 * 신체 정보 등록 여부 상태와 저장. 계정이 바뀌거나 다시 불러오면 이전 값을 버리고 불러오는 중으로 돌아간다
 * (이전 계정의 상태가 잠깐이라도 보이지 않는다). 수치는 다루지 않는다(등록 여부만).
 *
 * 조회 수단이 없으면(운영 빌드·API 미연결) unavailable, 조회가 실패하면 error다. 둘 다 "누락"이 아니다.
 * save는 저장하고 상태를 갱신하며, 실패하면 예외를 그대로 던져 호출한 화면이 입력값을 유지한 채 오류를 보여 준다.
 */
export function useBodyMeasurementStatus(userId: string): {
  state: BodyMeasurementState
  reload: () => void
  save: (input: BodyMeasurementInput) => Promise<void>
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${userId}#${attempt}`

  useEffect(() => {
    let cancelled = false
    const repository = createBodyRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.getStatus().then(
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
  }, [userId, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const save = useCallback(
    async (input: BodyMeasurementInput) => {
      const repository = createBodyRepository(userId)
      if (!repository) throw new Error('body repository unavailable')
      const value = await repository.save(input)
      // 저장이 성공한 뒤에만 상태를 바꾼다(저장 전에는 회원 정보에 반영된 것처럼 보이지 않는다).
      setLoaded({
        key: `${userId}#${attempt}`,
        state: { status: 'ready', value },
      })
    },
    [userId, attempt],
  )

  const state: BodyMeasurementState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload, save }
}
