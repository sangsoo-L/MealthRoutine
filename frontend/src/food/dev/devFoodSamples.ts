import type { Food, FoodSource } from '../foodTypes.ts'

/**
 * [개발 전용] 개발용 예시 음식 4개. 개발 서버에서만 불러온다(food/foodSource.ts가 import.meta.env.DEV로 동적 import). 운영 빌드에는 포함되지 않는다.
 *
 * 출처: 스토리보드 v5.0(documents/스토리보드_v5.0/storyboard.html)의 정적 예시 `foodDB` 4개를 값 그대로 옮겼다(사용자 승인, FAST-03).
 * 값(열량·단백질·지방·탄수화물·알레르기 메모)을 수정하거나 보충하지 않는다. 100g 기준값으로 쓴다(스토리보드가 `값×중량÷100`으로 계산한다).
 * 실제 외부 API·DB에서 가져온 값이 아니며 운영 데이터가 아니다. id는 이 예시를 구분하려고 붙인 개발용 식별자다.
 */
export const DEV_FOOD_SOURCE: FoodSource = {
  kind: 'dev-sample',
  label: '개발용 예시 데이터(스토리보드 foodDB)',
}

export const DEV_FOODS: readonly Food[] = [
  {
    id: 'dev-food-1',
    name: '현미밥',
    category: '한식',
    per100g: { kcal: 153, protein: 3.1, fat: 1, carb: 33 },
    allergyNote: '제품별 확인 필요',
    source: DEV_FOOD_SOURCE,
  },
  {
    id: 'dev-food-2',
    name: '닭가슴살',
    category: '한식',
    per100g: { kcal: 165, protein: 31, fat: 3.6, carb: 0 },
    allergyNote: '가공 제품의 원재료 확인 필요',
    source: DEV_FOOD_SOURCE,
  },
  {
    id: 'dev-food-3',
    name: '그린 샐러드',
    category: '양식',
    per100g: { kcal: 35, protein: 1.5, fat: 1, carb: 5 },
    allergyNote: '드레싱 원재료 확인 필요',
    source: DEV_FOOD_SOURCE,
  },
  {
    id: 'dev-food-4',
    name: '카페라테',
    category: '음료',
    per100g: { kcal: 60, protein: 3, fat: 3, carb: 5 },
    allergyNote: '우유 포함',
    source: DEV_FOOD_SOURCE,
  },
]
