import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import RequestHistoryView from '../components/food/request/RequestHistoryView.tsx'
import { createFoodRequestSource } from '../food-request/foodRequest.ts'
import { useFoodRequests } from '../food-request/useFoodRequests.ts'

const SOURCE = createFoodRequestSource()

/**
 * P04 내 요청 내역(`/mypage/requests`, 회원 전용). 요청 있음 상태(P04-1)의 목록 모양까지 이 화면이 맡는다. 서버 연결 전에는 조회하지 않고
 * "아직 볼 수 없어요(요청 없음 아님)"를 알린다. 읽기 전용이며 요청 상태를 바꾸지 않는다. 상위 화면은 상세 설정(P09)이다.
 */
export default function MyRequestsPage() {
  usePageTitle('내 요청 내역')
  const { state, reload } = useFoodRequests(SOURCE)
  return <RequestHistoryView state={state} onRetry={reload} />
}
