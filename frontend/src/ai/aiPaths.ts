/** AI 파트 경로. I01 `/ai`, I05 주간 리포트와 I05-1 기록 점수(사용자 승인 URL). */
export const PATH_AI = '/ai'
export const PATH_WEEKLY_REPORT = '/ai/weekly-report'
export const PATH_WEEKLY_SCORE = '/ai/weekly-report/score'

/** 주 오프셋(0 = 이번 주)을 주소에 담는다. 이번 주는 파라미터를 생략한다. */
function withOffset(path: string, offset: number): string {
  return offset === 0 ? path : `${path}?offset=${offset}`
}

export function weeklyReportPath(offset = 0): string {
  return withOffset(PATH_WEEKLY_REPORT, offset)
}

export function weeklyScorePath(offset = 0): string {
  return withOffset(PATH_WEEKLY_SCORE, offset)
}
