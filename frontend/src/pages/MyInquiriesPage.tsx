import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import InquiryHistoryView from '../components/support/InquiryHistoryView.tsx'
import { createInquirySource } from '../inquiry/inquiry.ts'
import { useInquiries } from '../inquiry/useInquiries.ts'

const SOURCE = createInquirySource()

/**
 * P13 내 문의(`/mypage/inquiries`, 회원 전용). 서버 연결 전에는 조회하지 않고 "아직 볼 수 없어요(문의 없음 아님)"를 알린다.
 * 읽기 전용이며 문의 상태·답변을 바꾸거나 만들어 내지 않는다. 문의 상세는 별도 화면이 아니라 목록 안에서 펼친다. 상위 화면은 상세 설정(P09)이다.
 */
export default function MyInquiriesPage() {
  usePageTitle('내 문의')
  const { state, reload } = useInquiries(SOURCE)
  return <InquiryHistoryView state={state} onRetry={reload} />
}
