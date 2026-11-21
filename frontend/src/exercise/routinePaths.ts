/** 운동 루틴(W06~W08)과 운동 기록 통계의 경로. 모두 사용자 지시로 정한 임시 확정 URL이다(화면명세 v5.0은 URL을 정의하지 않는다). */
export const PATH_ROUTINES = '/records/exercise/routines'
export const PATH_ROUTINE_NEW = `${PATH_ROUTINES}/new`
export const PATH_EXERCISE_STATS = '/records/exercise/stats'

export function routineDetailPath(routineId: string): string {
  return `${PATH_ROUTINES}/${encodeURIComponent(routineId)}`
}

export function routineEditPath(routineId: string): string {
  return `${routineDetailPath(routineId)}/edit`
}
