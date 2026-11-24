import type { AccountWorkGuard } from '../auth/authContext.ts'
import { registerAccountCleanup } from '../auth/accountScope.ts'

/**
 * 서버 PIN 토큰(`X-Pin-Token`) 보관(F4, 계획 3.4). F4는 저장·읽기·폐기 규칙만 만들고, 실제 사용(신체정보 API)은 F5가 한다.
 *
 * - **메모리(이 모듈 변수)에만** 둔다. localStorage·sessionStorage·URL·라우터 state·로그·오류 객체에 넣지 않는다.
 *   새로고침하거나 다른 탭에서는 없다.
 * - 저장 항목은 회원·토큰·만료 시각·로그인 작업 표식(`AccountWorkGuard`)이다. 읽을 때 셋 중 하나라도 어긋나면 지우고 null이다.
 * - **PIN 자체 폐기 번호(`pinEpoch`):** 로그인 표식은 로그인 수명만 가린다. PIN 변경·명시적 폐기는 로그인 작업을 바꾸지 않으므로
 *   PIN 수명용 번호를 따로 둔다. `clearPinToken()`과 새 토큰 저장 때 1 올린다. 확인 요청은 시작 때 번호를 잡아 두고,
 *   응답을 저장하기 직전에 번호가 그대로인지 본다(그 사이 폐기·다른 저장이 있었으면 저장하지 않는다).
 *   이 번호는 인증 공통의 로그인 작업 번호와 독립이다(PIN 폐기가 닉네임 저장 등 로그인 작업을 무효로 만들지 않는다).
 * - 프론트 폐기는 "이 탭이 더 쓰지 않는다"는 뜻일 뿐 서버 무효화가 아니다. 서버 토큰은 만료까지 남는다(PIN7-5, 서버 정책 불변).
 */

interface PinTokenEntry {
  ownerId: string
  token: string
  /** 브라우저 시계 기준(ms). 요청 시작 시각 + 유효 시간 − 여유(계획 3.4 R2) */
  expiresAt: number
  guard: AccountWorkGuard
}

let entry: PinTokenEntry | null = null
let epoch = 0

/** 지금 PIN 폐기 번호. 확인 요청이 시작할 때 잡아 두고 저장 직전에 다시 비교한다. */
export function currentPinEpoch(): number {
  return epoch
}

/**
 * PIN 자체 폐기: 보관한 토큰을 바로 비우고 번호를 올려 진행 중인 확인 응답도 저장하지 못하게 한다.
 * 부르는 곳: PIN 등록·변경 성공, `PIN_LOCKED` 수신, 계정 정리(로그인·로그아웃·세션 종료), F5 사용처의 숨기기·이탈·보호 API 거절.
 */
export function clearPinToken(): void {
  entry = null
  epoch += 1
}

/** 확인에 성공한 토큰을 저장한다(이전 토큰은 교체). 번호를 올려 늦게 도착한 다른 확인 응답이 이 토큰을 덮지 못하게 한다. */
export function storePinToken(
  ownerId: string,
  token: string,
  expiresAt: number,
  guard: AccountWorkGuard,
): void {
  entry = { ownerId, token, expiresAt, guard }
  epoch += 1
}

/**
 * 지금 쓸 수 있는 토큰. 회원 일치 + 로그인 작업 유효 + 만료 전일 때만 돌려준다. 아니면 보관분을 지우고 null이다.
 * 만료를 타이머에 맡기지 않고 읽을 때마다 판단한다. 읽기 실패로 지울 때는 번호를 올리지 않는다(진행 중 확인과 무관한 정리).
 */
export function getPinToken(
  ownerId: string,
  now: number = Date.now(),
): string | null {
  if (entry === null) return null
  if (
    entry.ownerId !== ownerId ||
    !entry.guard.isCurrent() ||
    now >= entry.expiresAt
  ) {
    entry = null
    return null
  }
  return entry.token
}

// 로그인·로그아웃·세션 종료의 계정 정리에서 함께 폐기한다(계획 3.4 ③).
registerAccountCleanup(clearPinToken)
