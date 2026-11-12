import type { SurveyDraft, SurveyResult } from './signupExperienceTypes.ts'

export { EXPERIENCE_SUBJECT_ID } from './subject.ts'

/**
 * 개발용 가입 체험의 공개 인터페이스. 회원가입(A03) → 운동·식단 이해도 확인 → 홈 흐름을 백엔드·인증 없이 시험하기 위한 것이다.
 *
 * 개발 서버에서만 실제 동작(dev/devSignupExperience)을 불러온다. import.meta.env.DEV는 빌드 때 상수로 바뀌어
 * 운영 빌드에서는 이 분기와 dev/ 코드가 제거되고, 아래 함수는 모두 "아무 일도 하지 않음"이 된다
 * (auth/authBackend.ts, mypage/mypageSource.ts, onboarding-assessment/assessmentSource.ts와 같은 방식).
 *
 * 이것은 로그인이 아니다. 인증 상태(AuthProvider)·AuthUser·권한을 만들거나 바꾸지 않으며, 인증이 필요한 화면은 그대로 막힌다.
 * 체험 표지가 풀어 주는 것은 이해도 확인 화면의 접근뿐이다(guards/AuthOrExperienceGate).
 *
 * [개발용 우회 표시] 정식 흐름은 A03 → P05(2차 비밀번호 설정) → A02(초기설문) → 이해도 확인 → H01이다. P05는 아직 만들지 않았고,
 * 이 체험 흐름은 P05와 A02를 건너뛴다. 정식 흐름에서 둘을 삭제하거나 완료한 것으로 처리한 것이 아니다.
 * A02는 그대로 남아 있어, 체험 중 주소로 /survey를 직접 열면 진행 복구·완료 이동이 동작한다(체험 흐름의 필수 단계는 아니다).
 *
 * 실제 가입 API가 연결되면: 가입 성공 응답으로 인증 상태를 만드는 정식 흐름으로 바꾸고, 이 모듈과 dev/ 폴더, 게이트의 체험 분기를 지운다.
 */
const devModule = import.meta.env.DEV
  ? await import('./dev/devSignupExperience.ts')
  : null

/** 이 빌드에서 가입 체험을 쓸 수 있는지. 운영 빌드에서는 항상 false다. */
export const signupExperienceAvailable = devModule !== null

export function isSignupExperienceActive(): boolean {
  return devModule ? devModule.isActive() : false
}

export function subscribeSignupExperience(listener: () => void): () => void {
  return devModule ? devModule.subscribe(listener) : () => {}
}

/** 체험을 시작한다. 가입 폼의 입력값은 받지도 저장하지도 않는다. 운영 빌드에서는 아무 일도 하지 않는다. */
export function startSignupExperience(): void {
  devModule?.start()
}

/** 체험을 끝내고 체험 데이터(표지·설문·이해도 확인)를 모두 지운다. */
export function endSignupExperience(): void {
  devModule?.end()
}

/**
 * 이 화면을 떠날 때 체험을 끝내도록 예약한다. 실제로 끝나는 시점은 접근 게이트가 언마운트될 때다(flushSignupExperienceEnd).
 * 화면 이동의 반영은 라우터가 비동기로 처리해서, 이동 직후에 바로 체험을 끝내면 이동이 반영되기 전에 접근 제한 안내가 잠깐 보인다.
 * 게이트 뒤에 있는 화면(이해도 확인)에서 홈으로 갈 때 쓴다. 운영 빌드에서는 아무 일도 하지 않는다.
 */
let endOnLeave = false
export function endSignupExperienceOnLeave(): void {
  if (devModule) endOnLeave = true
}

/** 예약된 체험 종료를 실행한다. 예약이 없으면 아무 일도 하지 않는다. */
export function flushSignupExperienceEnd(): void {
  if (!endOnLeave) return
  endOnLeave = false
  endSignupExperience()
}

export function loadSurveyDraft(subjectId: string): SurveyDraft | null {
  return devModule ? devModule.loadSurveyDraft(subjectId) : null
}

export function saveSurveyDraft(subjectId: string, draft: SurveyDraft): void {
  devModule?.saveSurveyDraft(subjectId, draft)
}

export function clearSurveyDraft(subjectId: string): void {
  devModule?.clearSurveyDraft(subjectId)
}

export function saveSurveyResult(
  subjectId: string,
  result: SurveyResult,
): void {
  devModule?.saveSurveyResult(subjectId, result)
}
