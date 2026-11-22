import type { Entitlement } from '../authTypes.ts'

/**
 * 개발 전용 테스트 계정 데이터. 이 파일과 devBackend.ts만 계정·비밀번호를 가진다.
 * 서버에 만든 계정이 아니고 보안을 제공하지 않으며, 운영 빌드에는 포함되지 않는다.
 * 이메일은 example.com 가상 주소이고, 비밀번호는 실제 서비스나 개인 계정에 쓰지 않는 개발 전용 값이다.
 */
export interface DevAccount {
  /** 세션에 저장하는 식별자. 회원 유형과 같은 값을 쓴다. */
  id: Entitlement
  email: string
  password: string
  nickname: string
  entitlement: Entitlement
}

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  {
    id: 'free',
    email: 'member.free@example.com',
    password: 'Mr-Dev-Free-2026',
    nickname: '일반회원',
    entitlement: 'free',
  },
  {
    id: 'exercise',
    email: 'member.exercise@example.com',
    password: 'Mr-Dev-Exercise-2026',
    nickname: '운동멤버',
    entitlement: 'exercise',
  },
  {
    id: 'meal',
    email: 'member.meal@example.com',
    password: 'Mr-Dev-Meal-2026',
    nickname: '식단멤버',
    entitlement: 'meal',
  },
  {
    id: 'full',
    email: 'member.full@example.com',
    password: 'Mr-Dev-Full-2026',
    nickname: '종합멤버',
    entitlement: 'full',
  },
]
