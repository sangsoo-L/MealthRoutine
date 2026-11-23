import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createBodyRepository } from '../body-measurements/bodySource.ts'
import type { BodyMeasurementValues } from '../body-measurements/bodyTypes.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import {
  getBodyAccess,
  revokeBodyAccess,
  subscribeBodyAccess,
} from './bodyAccessStore.ts'

/** 다시 가려진 이유 중 사용자에게 알릴 것. 사용자가 직접 숨긴 경우는 알리지 않는다. */
export type BodyRevealNotice = 'expired' | 'hidden' | 'error'

export type BodyRevealState =
  | { status: 'masked' }
  | { status: 'loading' }
  | { status: 'revealed'; values: BodyMeasurementValues }

export interface BodyReveal {
  state: BodyRevealState
  notice: BodyRevealNotice | null
  /** 사용자가 직접 다시 가린다. 권한을 즉시 폐기한다. */
  hide: () => void
}

/** 이 훅을 쓰는 화면(P01)이 몇 개 떠 있는지. 0이 되면 열람 권한을 폐기한다(화면 이탈). */
let mounted = 0

/**
 * P01의 신체 정보 열람 상태. P05가 넣어 둔 열람 권한(앱 수준 메모리)이 있으면 저장소에서 수치를 읽어 보여 주고,
 * 아래 조건에서 즉시 다시 가린다: 숨기기 · 권한 만료 시각 · P01 이탈 · 탭 숨김 · pagehide · 로그아웃·계정 전환 ·
 * 권한이 더 이상 유효하지 않음(PIN 변경, 다른 탭의 변경 포함).
 *
 * - 수치는 이 훅의 상태에만 있고 권한이 없어지는 순간 버린다. 상태는 "지금 권한이 있고 그 권한으로 읽은 값"일 때만 값을 내보낸다.
 * - 만료는 타이머에만 기대지 않는다. 타이머가 늦어도 저장소가 호출 때마다 권한을 다시 확인해 거절하고,
 *   다른 탭의 변경은 `storage` 이벤트와 창 포커스에서 다시 확인한다(이벤트만 믿지 않고 수치를 읽을 때도 저장소가 확인한다).
 */
export function useBodyReveal(userId: string): BodyReveal {
  const grant = useSyncExternalStore(subscribeBodyAccess, getBodyAccess)
  const active = grant && grant.ownerId === userId ? grant : null
  const [loaded, setLoaded] = useState<{
    token: string
    values: BodyMeasurementValues
  } | null>(null)
  const [notice, setNotice] = useState<BodyRevealNotice | null>(null)

  const revoke = useCallback((reason: BodyRevealNotice | null) => {
    revokeBodyAccess()
    setLoaded(null)
    setNotice(reason)
  }, [])

  // P01을 떠나면 권한을 폐기한다. StrictMode의 개발용 재마운트(같은 커밋 안에서 곧바로 다시 붙는다)는 건드리지 않아야 해서
  // 판단을 마이크로태스크로 미룬다. 커밋이 끝난 직후에 돌기 때문에 진짜 이탈은 다음 이동·이벤트보다 먼저 폐기된다(타이머처럼 틈이 없다).
  useEffect(() => {
    mounted += 1
    return () => {
      mounted -= 1
      queueMicrotask(() => {
        if (mounted === 0) revokeBodyAccess()
      })
    }
  }, [])

  // 권한으로 수치를 읽는다. 읽기는 저장소가 권한을 다시 확인한 뒤에만 값을 내준다.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const repository = createBodyRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) revoke('error')
      })
      return () => {
        cancelled = true
      }
    }
    repository.getMeasurements(active.access).then(
      (values) => {
        if (cancelled) return
        setLoaded({ token: active.access.token, values })
        setNotice(null)
      },
      (error: unknown) => {
        if (cancelled) return
        revoke(
          error instanceof ExerciseGoalError && error.code === 'expired'
            ? 'expired'
            : 'error',
        )
      },
    )
    return () => {
      cancelled = true
      setLoaded(null)
    }
  }, [active, userId, revoke])

  // 만료 시각·탭 숨김·pagehide·다른 탭의 변경에 맞춰 다시 가린다.
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(
      () => revoke('expired'),
      Math.max(0, active.access.expiresAt - Date.now()),
    )
    const onVisibility = () => {
      if (document.hidden) revoke('hidden')
    }
    const onPageHide = () => revoke('hidden')
    // 다른 탭에서 PIN이 바뀌었는지 저장소에 다시 확인한다.
    const recheck = () => {
      try {
        createExerciseGoalRepository(userId)?.verifyAccess(active.access)
      } catch {
        revoke('expired')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('storage', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('storage', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [active, userId, revoke])

  const hide = useCallback(() => revoke(null), [revoke])

  let state: BodyRevealState
  if (!active) state = { status: 'masked' }
  else if (loaded && loaded.token === active.access.token)
    state = { status: 'revealed', values: loaded.values }
  else state = { status: 'loading' }
  return { state, notice, hide }
}
