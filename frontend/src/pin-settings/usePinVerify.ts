import { useCallback, useRef } from 'react'
import {
  ExerciseGoalError,
  type GoalAuthorization,
} from '../exercise-goal/exerciseGoalTypes.ts'
import { usePinLock } from './usePinLock.ts'
import { usePinStatus, type PinStatus } from './usePinStatus.ts'

export type PinVerifyResult =
  { ok: true; access: GoalAuthorization } | { ok: false; error: unknown }

/**
 * P05 신체 정보 확인의 상태와 동작. 기존 개발용 PIN 저장소의 `unlock`(P12·W01-1·D01-4와 같은 계정별 실패 횟수·5분 잠금)을 그대로 쓰고
 * 새 저장소를 만들지 않는다. 저장소가 실제로 성공을 돌려줬을 때만 `ok: true`이며, 저장소가 없으면 어떤 입력도 처리하지 않는다.
 * 입력한 번호는 이 훅이 보관하지 않고, 열람 권한은 호출한 화면이 앱 수준 메모리(bodyAccessStore)에 넣는다.
 * F4-D1: 모의 모드에서만 개발용 저장소(`source.mockGoal`)를 쓴다. 서버 모드(개발 기본·운영 빌드)는 조회도 하지 않고 "연결 전"이며,
 * 서버 PIN 확인과 화면 연결은 F5에서 한다(서버 토큰과 개발용 열람 권한을 섞지 않는다).
 */
export function usePinVerify(ownerId: string) {
  const { status, reload, source } = usePinStatus(ownerId, {
    serverStatus: false,
  })
  const repository = source?.mockGoal ?? null
  const lock = usePinLock(status.kind === 'ready' ? status.retryAt : null)
  const markLocked = lock.markLocked
  const submitting = useRef(false)

  const submit = useCallback(
    async (pin: string): Promise<PinVerifyResult | null> => {
      // 처리 중인 요청이 있으면 새 요청을 만들지 않는다(중복 제출 방지).
      if (submitting.current) return null
      if (!repository)
        return { ok: false, error: new ExerciseGoalError('unavailable') }
      submitting.current = true
      try {
        const access = await repository.unlock(pin)
        // 발급 직후에도 유효한지 확인한다(기다리는 동안 다른 곳에서 PIN이 바뀐 경우).
        try {
          repository.verifyAccess(access)
        } catch (error) {
          repository.lock(access)
          throw error
        }
        return { ok: true, access }
      } catch (error) {
        if (error instanceof ExerciseGoalError) {
          if (error.code === 'locked') markLocked(error.retryAt)
          // 다른 탭 등에서 등록 상태가 바뀐 경우 화면의 분기(미등록)를 다시 판단한다.
          if (error.code === 'pinMissing' || error.code === 'contextChanged')
            reload()
        }
        return { ok: false, error }
      } finally {
        submitting.current = false
      }
    },
    [repository, reload, markLocked],
  )

  return { status: status as PinStatus, locked: lock.locked, submit, reload }
}
