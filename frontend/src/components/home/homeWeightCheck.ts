import {
  hasMissingBodyInfo,
  type BodyMeasurementState,
} from '../../body-measurements/bodyTypes.ts'
import {
  isWeightCardDismissed,
  type WeightCardDismissal,
} from '../../weight-log/weightCardDismissal.ts'
import type { WeightCheckState } from '../../weight-log/useWeightCheck.ts'

/**
 * 홈 추천 영역에 월간 몸무게 확인 카드를 보여 줄지 정하는 규칙(순수 함수). 신체 정보 입력 카드(selectHomeBodyInfoView)가 먼저다.
 *
 * 우선순위(하나의 주요 카드만): 키·몸무게 미등록 → 기록 불일치 → 월간 확인일 도래 → 기존 오늘의 추천.
 * - 신체 정보를 조회하지 못했거나 조회 중·연결 전이거나 누락이면 이 카드를 보이지 않는다(미등록 카드가 먼저이고, 상태를 모를 때 안내하지 않는다).
 * - 몸무게 기록을 조회 중·실패·연결 전이면 보이지 않는다.
 * - no-history·legacyWeightUndated(기록일을 모르는 기존 몸무게)는 확인일 도래로 취급하지 않는다. future-date(기록일이 미래)도 보이지 않는다
 *   (기록을 남길 수 없는 상태라 안내해도 할 수 있는 일이 없다).
 * - 마지막 기록과 현재 몸무게가 어긋나면(consistent: false) mismatch, 일치하고 확인일이 되었으면(needsCheck) due다.
 * - 오늘(서울) "나중에 하기"를 눌렀다면 카드를 보이지 않고 기존 추천으로 돌아간다. 다음 날에는 다시 평가한다.
 */
export type HomeWeightView =
  { kind: 'none' } | { kind: 'card'; variant: 'due' | 'mismatch' }

export function selectHomeWeightView(args: {
  body: BodyMeasurementState
  weight: WeightCheckState
  dismissal: WeightCardDismissal | null
}): HomeWeightView {
  const { body, weight, dismissal } = args
  if (body.status !== 'ready' || hasMissingBodyInfo(body))
    return { kind: 'none' }
  if (weight.status !== 'ready') return { kind: 'none' }
  const s = weight.value
  if (
    s.reason === 'no-history' ||
    s.reason === 'future-date' ||
    s.legacyWeightUndated
  )
    return { kind: 'none' }
  const variant = !s.consistent ? 'mismatch' : s.needsCheck ? 'due' : null
  if (variant === null) return { kind: 'none' }
  if (isWeightCardDismissed(dismissal, s.today)) return { kind: 'none' }
  return { kind: 'card', variant }
}

/**
 * 몸무게 기록 상태를 불러오지 못했을 때 기존 추천 아래에 재시도 안내를 붙일지(순수 함수).
 * - 신체 정보가 모두 등록된 상태(카드 규칙과 같은 조건)에서만 보인다. 신체 정보 조회가 실패했으면 신체 정보 오류 안내가 먼저이고,
 *   누락·조회 중·연결 전이면 몸무게 안내를 보이지 않는다.
 * - 조회 실패(error)이거나, 사용자가 "다시 확인"으로 요청한 조회가 진행 중(retrying)일 때 보인다. 진행 중에도 안내를 유지해
 *   안내가 깜빡이며 사라졌다 나타나지 않게 하고, 그 동안 버튼을 막아 중복 요청을 방지한다.
 * - 연결 전(unavailable)은 실패가 아니므로 보이지 않는다. 몸무게 수치는 다루지 않는다.
 */
export function selectHomeWeightRetry(args: {
  body: BodyMeasurementState
  weight: WeightCheckState
  retrying: boolean
}): 'none' | 'error' | 'retrying' {
  const { body, weight, retrying } = args
  if (body.status !== 'ready' || hasMissingBodyInfo(body)) return 'none'
  if (weight.status === 'error') return 'error'
  if (weight.status === 'loading' && retrying) return 'retrying'
  return 'none'
}

export const WEIGHT_CARD_TEXT = {
  due: {
    title: '이번 달 몸무게를 확인해 볼까요?',
    description:
      '지난 기록 이후 한 달이 지났어요. 지금 몸무게를 기록하고 변화를 확인해 보세요.',
    action: '몸무게 기록하기',
  },
  mismatch: {
    title: '몸무게 기록을 확인해 주세요',
    description:
      '등록된 몸무게와 마지막 기록이 일치하지 않아요. 현재 몸무게를 다시 기록하면 이후 변화도 이어서 관리할 수 있어요.',
    action: '기록 확인하기',
  },
} as const
