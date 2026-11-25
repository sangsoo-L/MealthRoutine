import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  createWorkoutSessionController,
  type SessionSnapshot,
  type WorkoutSessionController,
} from './workoutSessionController.ts'
import { createWorkoutSessionRepository } from './workoutSource.ts'

/**
 * 진행 중인 운동 세션(W14)의 저장·복구 훅. 로직은 workoutSessionController가 맡고, 이 훅은 React 구독과 브라우저 이벤트만 연결한다.
 *
 * - userId마다 컨트롤러를 따로 만든다. 계정이 바뀌면 이전 컨트롤러를 비활성화하므로 이전 계정의 비동기 응답은 모두 버려진다.
 *   (effect를 다시 실행해도 안전하다: 비활성화한 컨트롤러는 다시 활성화할 수 있다.)
 * - 저장소가 없으면(계정 없음) 컨트롤러가 unavailable 상태가 된다.
 * - 탭 숨김(visibilitychange hidden)과 pagehide: 측정 중이면 일시정지하고 저장을 시도한다. 돌아오면(visible) 저장소의 최신 상태를 확인하되
 *   미저장 변경이 없을 때만 반영하고 자동으로 재개하지 않는다.
 *   pagehide·탭 닫기에서는 저장 성공을 보장할 수 없다. 마지막 성공 저장 이후의 측정 시간은 사라질 수 있다.
 * - beforeunload: 저장되지 않은 변경이 있거나 저장 중일 때만 브라우저 경고를 띄운다. 브라우저 강제 종료·크래시는 막을 수 없다.
 * - 화면 이동 보호: snapshot.needsLeavePreparation이 true이면 화면이 라우터 이동을 막고(useBlocker) prepareLeave()로 저장을 마친 뒤 이동한다.
 *   결과가 confirmLoss이면 사용자의 선택(다시 시도 / 그래도 나가기 / 머무르기)을 받는다. 이 훅은 라우터에 의존하지 않는다.
 */
export function useWorkoutSession(userId: string | null): {
  snapshot: SessionSnapshot
  controller: WorkoutSessionController
} {
  const controller = useMemo(
    () =>
      createWorkoutSessionController({
        repository: userId ? createWorkoutSessionRepository(userId) : null,
      }),
    [userId],
  )

  useEffect(() => {
    controller.activate()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.onHidden()
      // 돌아오면 최신 상태를 확인한다(미저장 변경이 없을 때만 반영하고, 타이머는 자동 재개하지 않는다).
      else void controller.syncOnReturn()
    }
    const onPageHide = () => controller.onPageHide()
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.getSnapshot().warnBeforeUnload) {
        event.preventDefault()
        // 일부 브라우저는 returnValue가 설정돼야 경고를 띄운다(문구는 브라우저가 정한다).
        event.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      controller.deactivate()
    }
  }, [controller])

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  return { snapshot, controller }
}
