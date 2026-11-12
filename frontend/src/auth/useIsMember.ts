import { useAuth } from './authContext.ts'

/**
 * 로그인 회원인지. 회원 전용 UI를 "그릴지 말지" 정할 때 쓴다(숨기는 것이 아니라 렌더링하지 않는다).
 *
 * 보수적으로 판정한다: 인증이 확인되었고(`authenticated`) 사용자 정보가 있을 때만 회원이다.
 * 그 밖의 모든 경우(비회원, 이후 생길 수 있는 확인 중·불명확한 상태)는 회원이 아니다.
 * 현재 인증 Context는 `authenticated`·`unauthenticated` 두 상태뿐이고, 개발용 세션을 첫 렌더 전에 동기로 복원하므로
 * "확인 중" 상태가 실제로는 없다(auth/AuthProvider.tsx). 그래서 새 전역 인증 로직을 만들지 않고 Context의 값만 읽는다.
 * 이 판정은 화면 표시용이며 보안 경계가 아니다(실제 권한 검사는 서버가 한다).
 */
export function useIsMember(): boolean {
  const { status, user } = useAuth()
  return status === 'authenticated' && user !== null
}
