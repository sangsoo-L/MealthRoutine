import {
  hasMissingBodyInfo,
  type BodyMeasurementState,
} from '../../body-measurements/bodyTypes.ts'

/**
 * 회원 홈 추천 영역에 무엇을 보여 줄지 정하는 규칙(순수 함수). 표시는 HomeBodyInfoCard·HomeRecommendationBanner가 맡는다.
 *
 * - 조회를 마친 상태에서 키·몸무게 중 하나라도 누락되면 입력 유도 카드로 기존 추천 배너를 대체한다.
 * - 조회 중·API 미연결(unavailable)은 기존 배너를 그대로 둔다(레이아웃 흔들림을 줄인다). 미연결을 등록 완료로 보지도, 누락으로 보지도 않는다.
 * - 조회 실패는 기존 배너를 두고 재시도 안내를 덧붙인다. 실패를 "미등록"으로 보지 않는다.
 * - 등록 완료는 기존 배너다.
 * 수치는 다루지 않는다(등록 여부만).
 */
export type MissingBodyField = 'both' | 'height' | 'weight'

export type HomeBodyInfoView =
  | { kind: 'banner' }
  | { kind: 'banner-with-retry' }
  | { kind: 'card'; missing: MissingBodyField }

export function selectHomeBodyInfoView(
  state: BodyMeasurementState,
): HomeBodyInfoView {
  if (state.status === 'error') return { kind: 'banner-with-retry' }
  if (state.status !== 'ready' || !hasMissingBodyInfo(state))
    return { kind: 'banner' }
  const { height, weight } = state.value
  return {
    kind: 'card',
    missing: !height && !weight ? 'both' : !height ? 'height' : 'weight',
  }
}

export const MISSING_TITLE: Record<MissingBodyField, string> = {
  both: '키와 몸무게를 알려주세요',
  height: '키를 알려주세요',
  weight: '몸무게를 알려주세요',
}
