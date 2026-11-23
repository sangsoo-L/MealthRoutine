import { useParams, useSearchParams } from 'react-router'
import NoticeDetailView from '../components/support/NoticeDetailView.tsx'
import { findNoticeNeighbors, getNotices } from '../support/notices.ts'

/**
 * S01-1 공지사항 상세(`/support/notices/:noticeId`, 비회원도 열람). 목록에서 넘겨 준 검색어(`?q=`)를 유지하고,
 * 없는 공지 id는 없는 공지를 만들지 않고 "찾을 수 없어요"를 보여 준다.
 */
export default function NoticeDetailPage() {
  const { noticeId = '' } = useParams()
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  return (
    <NoticeDetailView
      neighbors={findNoticeNeighbors(getNotices(), noticeId, query)}
      query={query}
    />
  )
}
