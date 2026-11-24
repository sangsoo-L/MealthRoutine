import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../auth/authContext.ts'
import {
  grantBodyAccess,
  issueServerBodyAccess,
} from '../body-access/bodyAccessStore.ts'
import type { AccountWorkGuard } from '../auth/authContext.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import type { PinSource } from './pinSource.ts'
import { usePinLock } from './usePinLock.ts'
import { usePinStatus, type PinStatus } from './usePinStatus.ts'

/**
 * 확인 결과. 성공이면 열람 표지를 **바로 만들지 않고** `commit`을 돌려준다(F5 계획 8.8.2).
 * 화면은 이동하기 바로 앞에서 `commit()`을 부르고, true일 때만 같은 동기 구간에서 P01로 이동한다.
 * `commit`은 그 순간 화면이 살아 있는지·요청이 취소되지 않았는지·로그인 작업과 PIN 토큰이 그대로인지 다시 확인한다.
 */
export type PinVerifyResult =
  | { ok: true; commit: () => boolean }
  | {
      ok: false
      error: unknown
      /**
       * 실패도 반영하기 바로 앞에서 다시 부른다(F5-C1). 훅이 결과를 돌려준 뒤 폼이 받기까지 await가 있어 그 사이 로그인·화면이 바뀔 수 있다.
       * 거짓이면 문구·포커스·입력 비우기·잠금 이동을 하지 않는다.
       */
      isCurrent: () => boolean
    }

/** 화면 수명(마운트 동안 하나). 떠나면 alive=false, controller는 abort된다. */
export interface VerifyLife {
  alive: boolean
  controller: AbortController
}

const always = () => true

/**
 * 서버 모드 확인 한 번(테스트를 위해 React 밖으로 뺐다). 성공은 `commit` 후보, 실패는 `isCurrent`를 함께 돌려준다.
 * 응답이 왔을 때 이미 무효(화면 이탈·취소·로그인 작업 변경)면 null(아무것도 반영하지 않음).
 * `onPinMissing`은 다른 곳에서 등록 상태가 바뀐 경우 화면 분기를 다시 판단하게 한다.
 */
export async function verifyOnServer(args: {
  source: PinSource
  pin: string
  ownerId: string
  guard: AccountWorkGuard
  life: VerifyLife
  onPinMissing?: () => void
}): Promise<PinVerifyResult | null> {
  const { source, pin, ownerId, guard, life, onPinMissing } = args
  const { signal } = life.controller
  const isCurrent = () => life.alive && !signal.aborted && guard.isCurrent()
  if (!source.verify)
    return {
      ok: false,
      error: new ExerciseGoalError('unavailable'),
      isCurrent: always,
    }
  try {
    const outcome = await source.verify(pin, guard, signal)
    if (!outcome.ok) {
      // 취소·로그인 변경·PIN 폐기 뒤의 응답: 아무것도 반영하지 않는다.
      if (outcome.reason === 'stale' || !isCurrent()) return null
      return { ok: false, error: new ExerciseGoalError('expired'), isCurrent }
    }
    return {
      ok: true,
      commit: () =>
        issueServerBodyAccess({
          ownerId,
          guard,
          signal,
          alive: () => life.alive,
        }) !== null,
    }
  } catch (error) {
    if (!isCurrent()) return null
    if (error instanceof ExerciseGoalError && error.code === 'pinMissing')
      onPinMissing?.()
    return { ok: false, error, isCurrent }
  }
}

/**
 * P05 신체 정보 확인의 상태와 동작. 연결은 `usePinStatus`가 고른다(F1-D3 기준).
 * - 모의 모드: 기존 개발용 PIN 저장소의 `unlock`(계정별 실패 횟수·5분 잠금)과 열람 권한(`GoalAuthorization`)을 그대로 쓴다.
 * - 서버 모드(F5): `GET /users/me/pin/status`로 등록·잠금을 읽고, 확인은 F4 `verify`(토큰은 pinTokenStore에만)를 쓴다.
 *   잠금은 해제 시각을 계산하지 않고(F4-D4) 안내만 하며 제출은 막지 않는다(판정은 서버 403 `PIN_LOCKED`).
 *   서버 토큰과 모의 열람 권한을 섞지 않는다(F4-D1).
 * 입력한 번호는 이 훅이 보관하지 않는다. 화면을 떠나면 진행 중인 확인을 취소하고 그 결과는 반영하지 않는다.
 */
export function usePinVerify(ownerId: string) {
  const { status, reload, source } = usePinStatus(ownerId)
  const { beginAccountWork } = useAuth()
  const server = source?.mode === 'server'
  const repository = source?.mockGoal ?? null
  const lock = usePinLock(
    !server && status.kind === 'ready' ? status.retryAt : null,
  )
  const markLocked = lock.markLocked
  const submitting = useRef(false)
  // 화면 수명: 떠나면 진행 중인 확인을 취소하고, 늦게 도착한 성공도 표지를 만들지 않는다.
  const life = useRef<VerifyLife | null>(null)
  useEffect(() => {
    const current = { alive: true, controller: new AbortController() }
    life.current = current
    return () => {
      current.alive = false
      current.controller.abort()
    }
  }, [])

  const submit = useCallback(
    async (pin: string): Promise<PinVerifyResult | null> => {
      // 처리 중인 요청이 있으면 새 요청을 만들지 않는다(중복 제출 방지).
      if (submitting.current) return null
      const mine = life.current
      const guard = beginAccountWork()
      if (server) {
        if (!source || !mine || guard === null)
          return {
            ok: false,
            error: new ExerciseGoalError('unavailable'),
            isCurrent: always,
          }
        submitting.current = true
        try {
          return await verifyOnServer({
            source,
            pin,
            ownerId,
            guard,
            life: mine,
            onPinMissing: reload,
          })
        } finally {
          submitting.current = false
        }
      }
      if (!repository)
        return {
          ok: false,
          error: new ExerciseGoalError('unavailable'),
          isCurrent: always,
        }
      // 모의 모드도 실패 결과는 화면·로그인 작업이 그대로일 때만 반영한다(F5-C1).
      const isCurrent = () =>
        mine?.alive === true && (guard === null || guard.isCurrent())
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
        return {
          ok: true,
          commit: () => {
            if (!mine?.alive) {
              repository.lock(access)
              return false
            }
            grantBodyAccess(ownerId, access)
            return true
          },
        }
      } catch (error) {
        if (error instanceof ExerciseGoalError) {
          if (error.code === 'locked') markLocked(error.retryAt)
          // 다른 탭 등에서 등록 상태가 바뀐 경우 화면의 분기(미등록)를 다시 판단한다.
          if (error.code === 'pinMissing' || error.code === 'contextChanged')
            reload()
        }
        return { ok: false, error, isCurrent }
      } finally {
        submitting.current = false
      }
    },
    [server, source, repository, ownerId, reload, markLocked, beginAccountWork],
  )

  // 서버 모드는 화면 잠금(제출 차단)을 쓰지 않고 조회가 알려 준 잠금을 안내로만 보인다(F4-D4).
  const locked = server ? false : lock.locked
  const serverLocked =
    server && status.kind === 'ready' && status.locked === true
  return {
    status: status as PinStatus,
    locked,
    serverLocked,
    connection: server ? ('server' as const) : ('mock' as const),
    submit,
    reload,
  }
}
