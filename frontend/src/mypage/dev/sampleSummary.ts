import type { MyPageSummary, SampleFlags } from '../mypageTypes.ts'

/**
 * 개발 전용 예시 데이터. 디자인 검수를 위한 값이며 실제 사용자 정보가 아니다.
 * 이 파일은 개발 서버에서만 불러온다(mypageSource.ts). 운영 빌드에는 포함되지 않는다.
 *
 * 신체 정보(키·몸무게·BMI)는 PIN 인증 전에 노출하지 않는 항목이라 예시 수치를 만들지 않는다.
 * 닉네임·회원 유형은 인증 사용자 값을 그대로 쓰므로 여기에 두지 않는다.
 * 이해도(지식 수준)는 계정의 이해도 확인 결과에서 오므로 예시에 없다(mypage/knowledgeSource.ts).
 */

const ALL_SAMPLE: SampleFlags = {
  level: true,
  points: true,
  weekly: true,
}

/** `?sample=1`: 모든 구역에 값이 있는 예시 */
export const SAMPLE_FILLED: MyPageSummary = {
  sample: ALL_SAMPLE,
  level: {
    state: 'ready',
    data: {
      level: 3,
      progress: { experience: 347, nextLevelExperience: 500 },
    },
  },
  points: { state: 'ready', data: { balance: 1280 } },
  weekly: {
    state: 'ready',
    data: { exerciseCount: 2, mealCount: 5, score: 78 },
  },
}

/** `?sample=empty`: 연결은 되었지만 값이 없는 상태(API 연결 전과 구분해서 확인하기 위한 예시) */
export const SAMPLE_EMPTY: MyPageSummary = {
  sample: ALL_SAMPLE,
  level: { state: 'unavailable' },
  points: { state: 'unavailable' },
  weekly: { state: 'empty' },
}

/** `?sample=error`: 활동을 불러오다 문제가 생긴 상태(연결 전·기록 없음과 문구가 다른지 확인하기 위한 예시) */
export const SAMPLE_ERROR: MyPageSummary = {
  sample: ALL_SAMPLE,
  level: { state: 'unavailable' },
  points: { state: 'unavailable' },
  weekly: { state: 'error' },
}
