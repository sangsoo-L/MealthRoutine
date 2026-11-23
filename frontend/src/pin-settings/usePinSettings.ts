import { useCallback, useRef, useState } from 'react'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import type { PinFormValues, PinSettingsMode } from './pinSettingsPolicy.ts'
import { usePinLock } from './usePinLock.ts'
import { usePinStatus, type PinStatus } from './usePinStatus.ts'

export type PinSubmitResult = { ok: true } | { ok: false; error: unknown }

/**
 * P11(등록)·P12(변경)의 상태와 동작. 등록·변경은 저장소(개발용 PIN 저장소)가 실제로 성공을 돌려줬을 때만 `done`이 된다.
 * 저장소가 없으면(운영 빌드) 어떤 입력도 처리하지 않고, 입력한 번호는 이 훅이 보관하지 않는다.
 * 등록 완료·변경 완료는 신체 정보 열람 권한을 만들지 않는다(저장소가 변경 시 이전 권한을 지운다).
 */
export function usePinSettings(ownerId: string, mode: PinSettingsMode) {
  const { status, reload, repository } = usePinStatus(ownerId)
  const [done, setDone] = useState(false)
  const submitting = useRef(false)
  // 현재 번호 확인 5회 실패로 생긴 잠금(변경에서만 의미가 있다). 잠금 상태 관리는 P05와 같은 훅을 쓴다.
  const lock = usePinLock(status.kind === 'ready' ? status.retryAt : null)
  const locked = mode === 'change' && lock.locked
  const markLocked = lock.markLocked

  const submit = useCallback(
    async (values: PinFormValues): Promise<PinSubmitResult | null> => {
      // 처리 중인 요청이 있으면 새 요청을 만들지 않는다(중복 제출 방지).
      if (submitting.current) return null
      if (!repository)
        return { ok: false, error: new ExerciseGoalError('unavailable') }
      submitting.current = true
      try {
        if (mode === 'register')
          await repository.registerPin(values.next, values.confirm)
        else
          await repository.changePin(
            values.current,
            values.next,
            values.confirm,
          )
        setDone(true)
        return { ok: true }
      } catch (error) {
        if (error instanceof ExerciseGoalError) {
          if (error.code === 'locked') markLocked(error.retryAt)
          // 다른 탭 등에서 등록 상태가 바뀐 경우 화면의 분기(이미 등록됨·미등록)를 다시 판단한다.
          if (error.code === 'pinExists' || error.code === 'pinMissing')
            reload()
        }
        return { ok: false, error }
      } finally {
        submitting.current = false
      }
    },
    [repository, mode, reload, markLocked],
  )

  return { status: status as PinStatus, done, locked, submit, reload }
}
