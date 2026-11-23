import type { Entitlement } from '../authTypes.ts'

/**
 * 개발용 계정 식별자. 세션·계정별 저장 키·마이페이지 개발용 값이 쓰는 고정 식별자라서 멤버십 상품 구분이 없어진 뒤에도 바꾸지 않았다.
 * 이름(exercise·meal·full)은 개발용 계정의 옛 이름일 뿐 멤버십 상품이나 기능 권한이 아니다.
 */
export type DevAccountId = 'free' | 'exercise' | 'meal' | 'full'

/**
 * 개발 전용 테스트 계정 데이터. 이 파일과 devBackend.ts만 계정·비밀번호를 가진다.
 * 서버에 만든 계정이 아니고 보안을 제공하지 않으며, 운영 빌드에는 포함되지 않는다.
 * 이메일은 example.com 가상 주소이고, 비밀번호는 실제 서비스나 개인 계정에 쓰지 않는 개발 전용 값이다.
 */
export interface DevAccount {
  /** 세션에 저장하는 식별자. 멤버십 상품 유형(entitlement)과 별개다. */
  id: DevAccountId
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
    entitlement: 'basic',
  },
  {
    id: 'meal',
    email: 'member.meal@example.com',
    password: 'Mr-Dev-Meal-2026',
    nickname: '식단멤버',
    entitlement: 'basic',
  },
  {
    id: 'full',
    email: 'member.full@example.com',
    password: 'Mr-Dev-Full-2026',
    nickname: '종합멤버',
    entitlement: 'pro',
  },
]
