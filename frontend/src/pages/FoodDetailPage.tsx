import { useState } from 'react'
import { useParams } from 'react-router'
import { useIsMember } from '../auth/useIsMember.ts'
import FoodDetailView, {
  FoodStateNotice,
} from '../components/food/FoodDetailView.tsx'
import { useFood } from '../food/useFoods.ts'

function FoodDetailBody({ foodId }: { foodId: string }) {
  const { state, reload } = useFood(foodId)
  const isMember = useIsMember()
  const [grams, setGrams] = useState(100)
  if (state.status !== 'ready') {
    return <FoodStateNotice state={state} onRetry={reload} />
  }
  return (
    <FoodDetailView
      food={state.food}
      grams={grams}
      onGramsChange={setGrams}
      isMember={isMember}
    />
  )
}

/**
 * F02 음식 영양정보와 알레르기 안내(`/foods/:foodId`, 비회원도 열람). 음식 데이터는 음식 저장소(개발 서버에서는 개발용 예시)에서 읽고,
 * 없는 음식·준비 중·조회 실패는 각각 안내한다. 즐겨찾기·식단 기록은 회원에게만 보인다. 음식이 바뀌면 key로 본체를 다시 만들어 선택한 중량이 남지 않게 한다.
 */
export default function FoodDetailPage() {
  const { foodId = '' } = useParams()
  return <FoodDetailBody key={foodId} foodId={foodId} />
}
