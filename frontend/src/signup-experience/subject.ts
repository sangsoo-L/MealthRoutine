/**
 * 개발용 가입 체험의 저장 주체 ID. 체험 중에 쓰는 임시 데이터(설문 진행·결과, 이해도 확인 출제·응답)를
 * 계정별 키(auth/accountScope.ts의 accountScopedKey)로 저장할 때 계정 ID 자리에 이 값을 쓴다.
 *
 * 이 값은 실제 계정이 아니다. AuthUser의 id와 겹치지 않으며(개발용 계정 id는 free·exercise·meal·full), 인증 상태에는 어떤 영향도 주지 않는다.
 * 모든 키가 같은 접두어(mealthroutine.account.)를 가지므로 로그인·로그아웃 때의 기존 정리(clearAccountScopedData)가 체험 데이터도 함께 지운다.
 */
export const EXPERIENCE_SUBJECT_ID = 'signup-experience'
