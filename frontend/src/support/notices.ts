/**
 * 공지사항(S01·S01-1)의 데이터 타입과 순수 함수.
 *
 * 운영 공지 API가 연결되어 있지 않고 확정된 공지 내용도 없다. 그래서 목록은 비어 있고(`NOTICES`), 공지를 임의로 만들어 채우지 않는다.
 * 화면은 목록이 비어 있으면 "등록된 공지가 없어요"를 보여 준다. 공지 API가 정해지면 `getNotices`만 바꾼다(화면·검색·이전/다음 이동은 그대로).
 * 분류는 화면명세 v5.0(S01)의 멤버십·기록·계정·음식이다.
 */

export const NOTICE_CATEGORIES = ['멤버십', '기록', '계정', '음식'] as const
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number]

export interface Notice {
  id: string
  category: NoticeCategory
  title: string
  /** 본문(문단은 줄바꿈으로 나눈다) */
  body: string
  /** 작성자 표시 이름 */
  author: string
  /** 게시일(YYYY-MM-DD, 기기 로컬 날짜 기준 표시) */
  publishedAt: string
}

/** 등록된 공지. 운영 공지 API 연결 전이라 비어 있다(임의 작성 금지). */
const NOTICES: readonly Notice[] = []

/** 공지 목록. 최신 게시일이 먼저이고 같은 날짜는 id 내림차순이다. */
export function getNotices(): readonly Notice[] {
  return sortNotices(NOTICES)
}

export function sortNotices(notices: readonly Notice[]): readonly Notice[] {
  return notices.toSorted((a, b) =>
    a.publishedAt !== b.publishedAt
      ? a.publishedAt < b.publishedAt
        ? 1
        : -1
      : a.id < b.id
        ? 1
        : a.id > b.id
          ? -1
          : 0,
  )
}

/** 검색어를 정리한다(앞뒤 공백 제거, 소문자). 빈 값이면 조건 없음. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/** 공지 제목·본문에서 검색어를 찾는다(대소문자·앞뒤 공백 무시). 검색어가 비어 있으면 전체를 돌려준다. */
export function filterNotices(
  notices: readonly Notice[],
  query: string,
): readonly Notice[] {
  const q = normalizeQuery(query)
  if (q === '') return notices
  return notices.filter(
    (notice) =>
      notice.title.toLowerCase().includes(q) ||
      notice.body.toLowerCase().includes(q),
  )
}

export interface NoticeNeighbors {
  notice: Notice | null
  /** 목록에서 바로 위(더 최근) 공지 = "이전 글" */
  previous: Notice | null
  /** 목록에서 바로 아래(더 오래된) 공지 = "다음 글" */
  next: Notice | null
}

/**
 * 한 공지와 그 앞뒤 공지. 검색어가 있고 그 결과에 이 공지가 들어 있으면 검색 결과 안에서 앞뒤를 찾고, 아니면 전체 목록에서 찾는다.
 * 없는 id이면 세 값 모두 null이다(없는 공지를 만들지 않는다).
 */
export function findNoticeNeighbors(
  sorted: readonly Notice[],
  id: string,
  query = '',
): NoticeNeighbors {
  const filtered = filterNotices(sorted, query)
  const scope = filtered.some((notice) => notice.id === id) ? filtered : sorted
  const index = scope.findIndex((notice) => notice.id === id)
  if (index < 0) return { notice: null, previous: null, next: null }
  return {
    notice: scope[index],
    previous: index > 0 ? scope[index - 1] : null,
    next: index < scope.length - 1 ? scope[index + 1] : null,
  }
}

/** 공지 목록 경로. 검색어가 있으면 `?q=`로 유지한다. */
export function noticeListPath(query: string): string {
  const q = query.trim()
  return q === '' ? '/support' : `/support?q=${encodeURIComponent(q)}`
}

/** 공지 상세 경로. 목록에서 검색어를 들고 왔다면 같은 검색어를 유지한다. */
export function noticeDetailPath(id: string, query: string): string {
  const base = `/support/notices/${encodeURIComponent(id)}`
  const q = query.trim()
  return q === '' ? base : `${base}?q=${encodeURIComponent(q)}`
}

/** YYYY-MM-DD를 "2026년 11월 18일"로 표시한다(UTC로 해석하지 않는다). 형식이 올바르지 않으면 입력을 그대로 돌려준다. */
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})
export function formatNoticeDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return dateFormat.format(new Date(year, month - 1, day, 12))
}
