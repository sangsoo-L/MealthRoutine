/**
 * `/ai`가 보여 줄 화면 결정(순수 함수). 로그인한 회원은 AI 서비스 홈, 로그인하지 않았으면 비회원 AI 소개 랜딩이다.
 * 인증 상태를 아직 모르면(확인 중) 어느 쪽도 보여 주지 않는다("pending"): 잘못된 화면이 잠깐 보이지 않게 하려는 것이다.
 * 지금 개발용 로그인은 동기로 복원되어 'loading'을 쓰지 않지만, 실제 인증이 비동기가 되어도 이 판정은 그대로 안전하다.
 * 알 수 없는 값도 pending으로 본다(로그인한 것으로도, 하지 않은 것으로도 단정하지 않는다).
 */
export type AiEntryKind = 'member' | 'guest' | 'pending'

export function aiEntryKind(status: string): AiEntryKind {
  if (status === 'authenticated') return 'member'
  if (status === 'unauthenticated') return 'guest'
  return 'pending'
}
