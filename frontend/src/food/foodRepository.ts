import type { Food } from './foodTypes.ts'

/**
 * 음식 데이터 경계. 화면(F01·F02·D02·끼니 상세)은 이 인터페이스만 안다. 지금 구현은 개발 서버 전용 개발용 예시(food/dev/)이며,
 * 실제 음식 API(`/api/v1/foods`)가 정해지면 food/foodSource.ts의 반환만 교체한다.
 * 조회가 실패하면 예외를 던진다(빈 값으로 바꾸지 않는다).
 */
export interface FoodRepository {
  /** 'dev-sample'이면 개발용 예시 데이터이며 개발 서버에서만 쓴다. */
  readonly kind: 'dev-sample'
  list(): Promise<readonly Food[]>
  /** 없으면 null. */
  getById(foodId: string): Promise<Food | null>
}
