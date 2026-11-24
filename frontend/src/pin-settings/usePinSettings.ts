import { useCallback, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import { submitPinSettings } from './pinSource.ts'
import type { PinFormValues, PinSettingsMode } from './pinSettingsPolicy.ts'
import { usePinLock } from './usePinLock.ts'
import { usePinStatus, type PinStatus } from './usePinStatus.ts'

export type PinSubmitResult = { ok: true } | { ok: false; error: unknown }

/**
 * P11(등록)·P12(변경)의 상태와 동작. 등록·변경은 연결(모의 저장소 또는 서버)이 실제로 성공을 돌려줬을 때만 `done`이 된다.
 * 연결이 없으면 어떤 입력도 처리하지 않고, 입력한 번호는 이 훅이 보관하지 않는다.
 * 등록 완료·변경 완료는 신체 정보 열람 권한을 만들지 않는다(모의 저장소는 변경 시 이전 권한을, 서버 모드는 이 탭의 PIN 토큰을 지운다).
 *
 * 잠금(변경만 의미가 있다):
 * - 모의 모드: 기존처럼 `retryAt`과 화면 타이머(`usePinLock`, 5분). 잠금 동안 제출을 막는다.
 * - 서버 모드(F4-D4): 해제 시각을 계산하지 않는다. 조회의 `locked` 또는 최근 제출의 403 `PIN_LOCKED`로 안내만 하고
 *   제출은 막지 않는다(서버가 판정). 제출이 잠금 아닌 결과(성공·번호 틀림 등)를 받으면 안내를 거두고,
 *   "잠금 상태 다시 확인"(`reload`)은 최근 제출 결과를 잊고 조회 결과로 다시 판단한다.
 * - 서버 모드 응답은 시작 때의 로그인 작업이 지금도 유효할 때만 반영한다(그 사이 로그아웃·다른 로그인이면 아무것도 바꾸지 않는다).
 */
export function usePinSettings(ownerId: string, mode: PinSettingsMode) {
  const { status, reload: reloadStatus, source } = usePinStatus(ownerId)
  const { beginAccountWork } = useAuth()
  const server = source?.mode === 'server'
  const [done, setDone] = useState(false)
  const submitting = useRef(false)
  // 모의 모드: 현재 번호 확인 5회 실패로 생긴 잠금. 잠금 상태 관리는 P05와 같은 훅을 쓴다.
  const lock = usePinLock(
    !server && status.kind === 'ready' ? status.retryAt : null,
  )
  const markLocked = lock.markLocked
  // 서버 모드: 최근 제출이 알려 준 잠금 여부(null이면 조회 결과를 따른다).
  const [submitLock, setSubmitLock] = useState<boolean | null>(null)
  const serverLocked =
    submitLock ?? (status.kind === 'ready' && status.locked === true)
  const locked = mode === 'change' && (server ? serverLocked : lock.locked)

  const reload = useCallback(() => {
    setSubmitLock(null)
    reloadStatus()
  }, [reloadStatus])

  const submit = useCallback(
    async (values: PinFormValues): Promise<PinSubmitResult | null> => {
      // 처리 중인 요청이 있으면 새 요청을 만들지 않는다(중복 제출 방지).
      if (submitting.current) return null
      if (!source)
        return { ok: false, error: new ExerciseGoalError('unavailable') }
      submitting.current = true
      try {
        const guard = source.mode === 'server' ? beginAccountWork() : null
        const outcome = await submitPinSettings(source, mode, values, guard)
        // 그 사이 로그인 작업이 바뀌었다: 성공 표시·문구·잠금 상태 모두 반영하지 않는다.
        if (outcome.kind === 'stale') return null
        if (outcome.kind === 'done') {
          setSubmitLock(false)
          setDone(true)
          return { ok: true }
        }
        const { error } = outcome
        if (error instanceof ExerciseGoalError) {
          if (error.code === 'locked') {
            if (source.mode === 'server') setSubmitLock(true)
            else markLocked(error.retryAt)
          } else if (source.mode === 'server') {
            // 서버가 잠금이 아닌 업무 판정을 했다(번호 틀림 등) → 잠금은 풀려 있다.
            setSubmitLock(false)
          }
          // 다른 탭 등에서 등록 상태가 바뀐 경우 화면의 분기(이미 등록됨·미등록)를 다시 판단한다.
          if (error.code === 'pinExists' || error.code === 'pinMissing')
            reload()
        }
        return { ok: false, error }
      } finally {
        submitting.current = false
      }
    },
    [source, mode, reload, markLocked, beginAccountWork],
  )

  return {
    status: status as PinStatus,
    done,
    locked,
    submit,
    reload,
    connection: server ? ('server' as const) : ('mock' as const),
  }
}
