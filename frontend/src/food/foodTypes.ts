/**
 * 음식 도메인의 화면용 타입. 음식 검색 API(`GET /api/v1/foods`)는 명세서에 경로만 있고 요청·응답 구조가 정의되지 않았다(README의 API 인수인계).
 * 아래 모양은 화면을 그리기 위한 임시 형태이며 API 계약이 아니다. 실제 API가 정해지면 변환을 저장소 구현에 둔다.
 *
 * 영양 값은 모두 "있을 때만" 있다. null은 정보 없음이며 0과 다르다(0으로 바꿔 채우지 않는다).
 */

/** 영양 값. null은 정보 없음(0 아님). */
export type NutrientValue = number | null

/** 100g 기준 영양값. 이 서비스는 100g 기준값에 선택한 중량을 곱해(÷100) 선택량 영양값을 계산한다(화면명세 F02). */
export interface Per100g {
  kcal: NutrientValue
  /** 단백질(g) */
  protein: NutrientValue
  /** 지방(g) */
  fat: NutrientValue
  /** 탄수화물(g) */
  carb: NutrientValue
}

/**
 * 영양정보의 출처. 지금은 개발용 예시뿐이다(스토리보드 v5.0의 정적 foodDB 4개). 실제 운영 데이터처럼 보이지 않도록
 * 화면이 `label`을 그대로 보여 준다.
 */
export interface FoodSource {
  kind: 'dev-sample' | 'server'
  label: string
}

export interface Food {
  id: string
  name: string
  /** 원본 데이터의 분류(예: 한식·양식·음료). 서비스 식품 구분·음식 종류와는 다른 값이며 없으면 null이다. */
  category: string | null
  per100g: Per100g
  /**
   * 원본 데이터의 알레르기·원재료 메모. 원재료 목록이 아니며 안전을 보증하지 않는다. 없으면 null이다.
   * 원재료 데이터 자체는 없으므로 화면은 항상 "확인 불가"를 함께 알린다.
   */
  allergyNote: string | null
  source: FoodSource
  /**
   * 이 음식의 1인분 중량(g). 서버 음식만 있다(백엔드와 같은 기준: referenceServingSize, 없으면 servingSize).
   * 없으면 화면은 시안 예시 1인분(SAMPLE_SERVING_GRAMS)으로 계산한다.
   */
  servingGrams?: number
}
