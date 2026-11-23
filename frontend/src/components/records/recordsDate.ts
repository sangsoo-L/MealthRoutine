const headerDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

/** 운동·식단 기록 대시보드의 "11월 19일 목요일" 형식 날짜 글자. 기기 시간대와 무관하게 그 날짜로 보이도록 정오로 만든다. */
export function formatRecordsDate(localDate: string): string {
  return headerDate.format(new Date(`${localDate}T12:00:00`))
}
