import { useHomeRecommendation } from '../../home-recommendation/useHomeRecommendation.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import HomeRecommendationBanner from './HomeRecommendationBanner.tsx'

/**
 * [현재 홈에서 쓰지 않음] 로그인 홈 개편(사용자 지시)으로 "오늘의 추천"을 홈에서 뺐다. 정책·조회 모듈과 함께 다시 쓸 수 있게 남겨 둔 코드이며 정리 대상 후보다.
 *
 * 회원 홈 "오늘의 추천" 자리의 개인화 배너. 이 계정의 운동·식단 기록과 운동 목표를 읽어(useHomeRecommendation) 추천 하나를 보여 준다.
 * 키·몸무게 입력 카드나 몸무게 확인 카드가 이 자리를 차지할 때는 렌더되지 않으므로 그동안은 기록을 읽지 않는다.
 * 읽는 중이거나 읽지 못하면 기본 추천이 보이고, "기록 없음"으로 단정하지 않는다.
 */
export default function HomePersonalizedRecommendation({
  userId,
  today,
}: {
  userId: string
  today: LocalDate
}) {
  const recommendation = useHomeRecommendation(userId, today)
  return <HomeRecommendationBanner recommendation={recommendation} />
}
