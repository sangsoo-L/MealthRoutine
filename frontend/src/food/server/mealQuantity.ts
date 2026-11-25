import type { Portion } from '../foodNutrition.ts'

/**
 * 프론트 양 구분(적게·보통·많이) ↔ 백엔드 quantity("몇 인분").
 * 음식마다 1인분 중량이 달라도 항상 같은 인분으로 보내므로 최소값(0.1) 미만이 되지 않고,
 * 반올림이 없어서 저장 후 다시 불러와도 같은 구분으로 돌아온다. 실제 중량·영양소는 백엔드가 1인분 기준으로 계산한다.
 */
export const PORTION_QUANTITY: Record<Portion, number> = {
  less: 0.5, // 1인분보다 적게
  normal: 1, // 1인분 정도
  more: 1.5, // 1인분보다 많이
}

export function quantityOfPortion(portion: Portion): number {
  return PORTION_QUANTITY[portion]
}

/** 서버 quantity → 양 구분. 0.5·1·1.5는 그대로, 다른 화면에서 저장한 값(예: 2인분)은 가까운 구분으로 보여 준다. */
export function portionOfQuantity(quantity: number): Portion {
  if (quantity < 0.75) return 'less'
  if (quantity < 1.25) return 'normal'
  return 'more'
}
