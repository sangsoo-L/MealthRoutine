import type { QuantityRuleId } from './types.ts'

/**
 * 추천 수치 규칙(rules.ts의 QUANTITY_RULES)의 **개발자용 근거**. 사용자에게 보이지 않는다.
 *
 * 이 모듈은 테스트(tests/beginnerPlanRules.test.mjs)와 문서 점검에서만 불러온다. 앱 코드(`src/`)의 어떤 모듈도 이 파일을 가져오지 않으며,
 * 그래서 운영 빌드에 이 문자열(내부 시드 파일명·"가상 루틴" 등)이 들어가지 않는다(빌드 뒤 `npm run verify:dist`가 결과물에서 확인한다).
 * 사용자에게 필요한 안전·불확실성 안내("대략적인 추정", "통증이나 어지러움이 있으면 중단" 등)는 planFlow.ts의 PLAN_TEXT에 있고 그대로다.
 */
export interface RuleEvidence {
  /** 수치의 출처와 확인 방법 */
  source: string
  /** 적용하지 않는 운동 */
  exclusions: string
  /** 불확실성 */
  uncertainty: string
}

const SEED_SOURCE =
  '프로젝트 시드 `exercise_routine_items.json`(가상 루틴, 난이도 초급 루틴의 해당 운동 항목). 전문가 검수 자료가 아니다.'

export const RULE_EVIDENCE: Readonly<Record<QuantityRuleId, RuleEvidence>> = {
  'strength-reps': {
    source: SEED_SOURCE,
    exclusions:
      '스트레칭 부위의 횟수형, 덤벨·폼롤러·풀업 바 등 시드 근거가 없는 도구, 초급이 아닌 운동',
    uncertainty:
      '시드 값이 모든 항목에서 같아 운동별 차이를 알 수 없다. 개인의 체력·통증·보조 도구에 따른 적정량은 반영하지 않는다.',
  },
  'core-hold': {
    source: SEED_SOURCE,
    exclusions: '복부 외 부위, 맨몸이 아닌 시간형, 초급이 아닌 운동',
    uncertainty:
      '근거가 플랭크 1개 항목뿐이다. 유지 시간의 개인차와 자세 부담은 반영하지 않는다.',
  },
  'stretch-hold': {
    source: SEED_SOURCE,
    exclusions:
      '밴드·폼롤러·마사지볼 스트레칭(시드 근거 없음), 스트레칭 횟수형, 초급이 아닌 운동',
    uncertainty:
      '근거가 맨몸 스트레칭 3개 항목뿐이다. 유연성·통증에 따른 적정 시간은 반영하지 않는다.',
  },
  'walk-cardio': {
    source: SEED_SOURCE,
    exclusions: '제자리 걷기 외 유산소, 초급이 아닌 운동',
    uncertainty:
      '근거가 제자리 걷기 3개 항목뿐이다. 심폐 부담의 개인차는 반영하지 않는다.',
  },
}
