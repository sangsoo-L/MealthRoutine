import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  createWorkoutResultController,
  type ResultSnapshot,
  type WorkoutResultController,
} from './workoutResultController.ts'
import {
  createWorkoutRecordRepository,
  createWorkoutSessionRepository,
} from './workoutSource.ts'

/** W15(운동 결과) 경로. 세션 id는 `session` 검색 파라미터로 넘긴다. */
export const PATH_RESULT = '/records/exercise/result'

/** W15로 가는 경로(W14에서 이동할 때 쓴다). */
export function resultPathFor(sessionId: string): string {
  return `${PATH_RESULT}?session=${encodeURIComponent(sessionId)}`
}

/** 저장되지 않은 수정 내용이 있거나 저장 중이라 화면을 떠나면 값이 사라질 수 있는지. */
export function hasLeaveRisk(snapshot: ResultSnapshot): boolean {
  if (snapshot.phase === 'success' || snapshot.load.status !== 'ready') {
    return false
  }
  const busy =
    snapshot.phase === 'validating' ||
    snapshot.phase === 'savingProgress' ||
    snapshot.phase === 'completing'
  return busy || (snapshot.hasChanges && !snapshot.progressSaved)
}

/**
 * 운동 결과(W15)의 최종 저장 훅. 로직은 workoutResultController가 맡고, 이 훅은 React 구독과 브라우저 이벤트(beforeunload)만 연결한다.
 *
 * - userId·sessionId마다 컨트롤러를 따로 만든다. 계정이나 세션이 바뀌면 이전 컨트롤러를 비활성화하므로 이전 응답은 모두 버려진다.
 *   (StrictMode처럼 effect를 다시 실행해도 안전하다: 비활성화한 컨트롤러는 다시 활성화할 수 있다.)
 * - 저장소가 없으면(계정 없음) 컨트롤러가 unavailable 상태가 된다. 가짜 기록을 만들지 않는다.
 * - beforeunload: 저장되지 않은 수정이 있거나 저장 중일 때만 브라우저 경고를 띄운다. 브라우저 종료·새로고침에서 저장을 보장하지 않으며
 *   미저장 수정은 새로고침 뒤 자동으로 복원하지 않는다.
 */
export function useWorkoutResult(
  userId: string | null,
  sessionId: string | null,
): { snapshot: ResultSnapshot; controller: WorkoutResultController } {
  const controller = useMemo(
    () =>
      createWorkoutResultController({
        repository: userId ? createWorkoutSessionRepository(userId) : null,
        records: userId ? createWorkoutRecordRepository(userId) : null,
        sessionId,
        ownerId: userId ?? undefined,
      }),
    [userId, sessionId],
  )

  useEffect(() => {
    controller.activate()
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasLeaveRisk(controller.getSnapshot())) {
        event.preventDefault()
        // 일부 브라우저는 returnValue가 설정돼야 경고를 띄운다(문구는 브라우저가 정한다).
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
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
