import type { ExerciseDashboardSlots } from './exerciseDashboardTypes.ts'

/**
 * 운동 대시보드(W01)의 데이터 출처. 지금은 연결된 운동 목록·수행 기록·루틴·운동 목표가 없어서 모든 영역이 "준비 중(unavailable)"이다.
 * 기록이 없는 것(empty)과 기록 기능이 연결되지 않은 것(unavailable)은 다른 상태이며, 여기서는 후자만 돌려준다. 가짜 기록이나 0 같은 값으로 채우지 않는다.
 * 저장소·API를 부르지 않으므로 loading·error도 만들지 않는다.
 *
 * 개발 서버에서만 주소의 `?sample=<이름>`으로 상태별 예시를 쓴다(디자인·상태 확인용, mypage/mypageSource.ts와 같은 방식).
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 예시 청크가 제거된다.
 *
 * 실제 데이터가 연결되면 영역별 조회 결과를 ExerciseDashboardSlots로 바꿔 getExerciseDashboard에서 돌려준다.
 * 운동 목표 모델·날짜 기준·수행 기록 계약이 확정되지 않았으므로 지금은 그 모양을 정하지 않는다.
 */
const sampleModule = import.meta.env.DEV
  ? await import('./dev/dashboardSample.ts')
  : null

const UNAVAILABLE: ExerciseDashboardSlots = {
  weekly: { status: 'unavailable' },
  recent: { status: 'unavailable' },
  goal: { status: 'unavailable' },
  today: { status: 'unavailable' },
  routines: { status: 'unavailable' },
  statistics: { status: 'unavailable' },
  next: { status: 'unavailable' },
}

export interface ExerciseDashboardData {
  slots: ExerciseDashboardSlots
  /** 개발용 예시를 쓰는 중일 때만 있는 안내 문장. 운영 빌드에서는 항상 null이다. */
  sampleNotice: string | null
}

export function getExerciseDashboard(
  sampleParam: string | null,
  today: string,
): ExerciseDashboardData {
  if (sampleModule && sampleParam) {
    const sample = sampleModule.getSample(sampleParam, today)
    if (sample)
      return { slots: sample, sampleNotice: sampleModule.SAMPLE_NOTICE }
  }
  return { slots: UNAVAILABLE, sampleNotice: null }
}
