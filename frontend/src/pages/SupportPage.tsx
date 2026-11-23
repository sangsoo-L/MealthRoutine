import { useSearchParams } from 'react-router'
import NoticeListView from '../components/support/NoticeListView.tsx'
import { getNotices } from '../support/notices.ts'

/**
 * S01 공지사항(`/support`, 비회원도 열람). 검색어는 주소(`?q=`)에 보관해 상세(S01-1)에서 돌아와도 유지한다.
 * 공지 데이터는 support/notices.ts(운영 공지 API 연결 전이라 비어 있음)에서 가져온다.
 */
export default function SupportPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  return (
    <NoticeListView
      notices={getNotices()}
      query={query}
      onQueryChange={(value) =>
        setParams(value === '' ? {} : { q: value }, { replace: true })
      }
    />
  )
}
