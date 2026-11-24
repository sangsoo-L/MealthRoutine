import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createBodySource } from '../body-measurements/bodySource.ts'
import type {
  BodyMeasurementValues,
  BodyServerMetrics,
} from '../body-measurements/bodyTypes.ts'
import type { ServerBodySource } from '../body-measurements/serverBodySource.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import {
  getPinToken,
  subscribePinToken,
} from '../pin-settings/pinTokenStore.ts'
import {
  getBodyAccess,
  isServerGrantLive,
  revokeBodyAccessIf,
  subscribeBodyAccess,
  type BodyAccessGrant,
  type MockBodyAccessGrant,
  type ServerBodyAccessGrant,
} from './bodyAccessStore.ts'

/** 다시 가려진 이유 중 사용자에게 알릴 것. 사용자가 직접 숨긴 경우는 알리지 않는다. */
export type BodyRevealNotice = 'expired' | 'hidden' | 'error'

export type BodyRevealState =
  | { status: 'masked' }
  | { status: 'loading' }
  | {
      status: 'revealed'
      values: BodyMeasurementValues
      /** 서버 열람일 때만 있다(서버 계산 추정값). 모의 열람은 없다. */
      metrics?: BodyServerMetrics
    }

export interface BodyReveal {
  state: BodyRevealState
  notice: BodyRevealNotice | null
  /** 사용자가 직접 다시 가린다. 권한을 즉시 폐기한다. */
  hide: () => void
}

/**
 * 서버 열람 한 번의 metrics 결과 처리(F5 계획 8.1·8.2, 테스트를 위해 React 밖으로 뺐다).
 * - 보내기 전에 표지가 살아 있는지 본다. 이미 다른 표지로 바뀌었으면 `ignored`(아무것도 건드리지 않음).
 * - 응답이 오면 성공·실패와 상관없이 **먼저** 같은 열람인지 본다. 요청이 취소됐거나 표지가 바뀌었으면 `ignored`.
 *   표지는 그대로인데 기한이 지났거나 토큰이 폐기됐으면 그 표지만 가리고 `expired`.
 * - 현재 열람의 403 `PIN_EXPIRED`·`PIN_REQUIRED` → 그 표지만 폐기하고 `expired`, 그 밖 실패 → 그 표지만 폐기하고 `error`.
 */
export type ServerRevealResult =
  | { kind: 'ignored' }
  | { kind: 'hidden'; notice: BodyRevealNotice }
  | {
      kind: 'shown'
      values: BodyMeasurementValues
      metrics: BodyServerMetrics
    }

function hideIfCurrent(
  grant: ServerBodyAccessGrant,
  notice: BodyRevealNotice,
): ServerRevealResult {
  return revokeBodyAccessIf(grant)
    ? { kind: 'hidden', notice }
    : { kind: 'ignored' }
}

export async function loadServerReveal(
  grant: ServerBodyAccessGrant,
  source: ServerBodySource,
  signal: AbortSignal,
  now: () => number = () => Date.now(),
): Promise<ServerRevealResult> {
  if (getBodyAccess() !== grant) return { kind: 'ignored' }
  const token = isServerGrantLive(grant, now())
    ? getPinToken(grant.ownerId, now())
    : null
  if (token === null) return hideIfCurrent(grant, 'expired')
  const result = await source.metrics(token, signal)
  if (signal.aborted || getBodyAccess() !== grant) return { kind: 'ignored' }
  if (!isServerGrantLive(grant, now())) return hideIfCurrent(grant, 'expired')
  if (result.ok)
    return { kind: 'shown', values: result.values, metrics: result.metrics }
  return hideIfCurrent(
    grant,
    result.reason === 'pinExpired' || result.reason === 'pinRequired'
      ? 'expired'
      : 'error',
  )
}

/** 이 훅을 쓰는 화면(P01)이 몇 개 떠 있는지. 0이 되면 그때의 열람 표지를 폐기한다(화면 이탈). */
let mounted = 0

/**
 * P01의 신체 정보 열람 상태. P05가 넣어 둔 열람 표지(앱 수준 메모리)가 있으면 수치를 읽어 보여 주고,
 * 아래 조건에서 즉시 다시 가린다: 숨기기 · 열람 기한 · P01 이탈 · 탭 숨김 · pagehide · 로그아웃·계정 전환 ·
 * 표지가 더 이상 유효하지 않음(모의: PIN 변경·다른 탭 변경, 서버: 로그인 작업 변경·PIN 토큰 폐기 알림).
 *
 * - 수치는 이 훅의 상태에만 있고 표지가 없어지는 순간 버린다. 상태는 "지금 표지가 있고 그 표지로 읽은 값"일 때만 값을 내보낸다.
 * - 모든 폐기는 이 훅이 잡은 그 표지만 대상으로 한다(`revokeBodyAccessIf`). 늦게 끝난 이전 요청·정리가 새 열람을 지우지 않는다(R2).
 * - 서버 열람은 PIN 토큰 폐기 알림(`subscribePinToken`, F5-D8)으로 사용자 동작 없이 가린다. 예: 설정 화면에서 보낸 PIN 변경 응답이
 *   P01 열람 중에 늦게 도착한 경우.
 */
export function useBodyReveal(userId: string): BodyReveal {
  const grant = useSyncExternalStore(subscribeBodyAccess, getBodyAccess)
  const active = grant && grant.ownerId === userId ? grant : null
  const [loaded, setLoaded] = useState<{
    grant: BodyAccessGrant
    values: BodyMeasurementValues
    metrics?: BodyServerMetrics
  } | null>(null)
  const [notice, setNotice] = useState<BodyRevealNotice | null>(null)

  /** 그 표지가 아직 현재일 때만 가리고 안내를 바꾼다. */
  const revoke = useCallback(
    (target: BodyAccessGrant, reason: BodyRevealNotice | null) => {
      if (!revokeBodyAccessIf(target)) return
      setLoaded(null)
      setNotice(reason)
    },
    [],
  )

  // P01을 떠나면 그때의 표지를 폐기한다. StrictMode의 개발용 재마운트(같은 커밋 안에서 곧바로 다시 붙는다)는 건드리지 않아야 해서
  // 판단을 마이크로태스크로 미룬다. 정리 시점의 표지만 대상으로 하므로 그 뒤 P05가 만든 새 표지는 지우지 않는다.
  useEffect(() => {
    mounted += 1
    return () => {
      mounted -= 1
      const leaving = getBodyAccess()
      queueMicrotask(() => {
        if (mounted === 0 && leaving) revokeBodyAccessIf(leaving)
      })
    }
  }, [])

  // 표지로 수치를 읽는다.
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const source = createBodySource(userId)
    if (active.kind === 'server') {
      if (source?.mode !== 'server') {
        queueMicrotask(() => {
          if (!controller.signal.aborted) revoke(active, 'error')
        })
        return () => controller.abort()
      }
      void loadServerReveal(active, source.source, controller.signal).then(
        (result) => {
          if (controller.signal.aborted || result.kind === 'ignored') return
          if (result.kind === 'shown') {
            setLoaded({
              grant: active,
              values: result.values,
              metrics: result.metrics,
            })
            setNotice(null)
          } else {
            setLoaded(null)
            setNotice(result.notice)
          }
        },
      )
      return () => {
        controller.abort()
        setLoaded(null)
      }
    }
    // 모의 열람: 저장소가 읽을 때마다 권한을 다시 확인한다(기존 동작).
    if (source?.mode !== 'mock') {
      queueMicrotask(() => {
        if (!controller.signal.aborted) revoke(active, 'error')
      })
      return () => controller.abort()
    }
    source.repository.getMeasurements(active.access).then(
      (values) => {
        if (controller.signal.aborted) return
        setLoaded({ grant: active, values })
        setNotice(null)
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        revoke(
          active,
          error instanceof ExerciseGoalError && error.code === 'expired'
            ? 'expired'
            : 'error',
        )
      },
    )
    return () => {
      controller.abort()
      setLoaded(null)
    }
  }, [active, userId, revoke])

  // 열람 기한·탭 숨김·pagehide·표지 무효화(다른 탭 변경·토큰 폐기 알림)에 맞춰 다시 가린다.
  useEffect(() => {
    if (!active) return
    const expiresAt =
      active.kind === 'server' ? active.revealUntil : active.access.expiresAt
    const timer = window.setTimeout(
      () => revoke(active, 'expired'),
      Math.max(0, expiresAt - Date.now()),
    )
    const onVisibility = () => {
      if (document.hidden) revoke(active, 'hidden')
    }
    const onPageHide = () => revoke(active, 'hidden')
    const recheck =
      active.kind === 'server'
        ? () => {
            if (!isServerGrantLive(active)) revoke(active, 'expired')
          }
        : () => recheckMock(active, () => revoke(active, 'expired'))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('focus', recheck)
    // 모의: 다른 탭의 PIN 변경은 storage 이벤트로, 서버: 이 탭의 토큰 폐기·교체는 알림으로 다시 확인한다.
    let unsubscribe = () => {}
    if (active.kind === 'server') unsubscribe = subscribePinToken(recheck)
    else window.addEventListener('storage', recheck)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', recheck)
      window.removeEventListener('storage', recheck)
      unsubscribe()
    }
  }, [active, revoke])

  const hide = useCallback(() => {
    if (active) revoke(active, null)
  }, [active, revoke])

  let state: BodyRevealState
  if (!active) state = { status: 'masked' }
  else if (active.kind === 'server' && !isServerGrantLive(active))
    // 기한·토큰 폐기는 타이머·알림이 곧 가린다. 그 전 렌더에서도 값을 내보내지 않는다.
    state = { status: 'masked' }
  else if (loaded && loaded.grant === active)
    state = {
      status: 'revealed',
      values: loaded.values,
      ...(loaded.metrics ? { metrics: loaded.metrics } : {}),
    }
  else state = { status: 'loading' }
  return { state, notice, hide }
}

/** 모의 표지: 다른 탭에서 PIN이 바뀌었는지 저장소에 다시 확인한다. */
function recheckMock(grant: MockBodyAccessGrant, onInvalid: () => void): void {
  try {
    createExerciseGoalRepository(grant.ownerId)?.verifyAccess(grant.access)
  } catch {
    onInvalid()
  }
}
