import type { AccountWorkGuard } from '../auth/authContext.ts'
import { registerAccountCleanup } from '../auth/accountScope.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import type { GoalAuthorization } from '../exercise-goal/exerciseGoalTypes.ts'
import {
  clearPinToken,
  currentPinEpoch,
  getPinToken,
  getPinTokenExpiresAt,
} from '../pin-settings/pinTokenStore.ts'

/**
 * P05 확인이 만든 신체 정보 열람 표지를 P01로 넘기는 앱 수준 메모리.
 *
 * - 메모리(모듈 변수)에만 있다. localStorage·sessionStorage·URL·라우터 state·로그에 넣지 않으므로 새로고침하면 사라진다.
 * - PIN 원문과 신체 수치는 담지 않는다. 한 번에 하나의 표지만 둔다. 같은 열람인지는 **객체 동일성**으로 판단한다.
 * - 모의(`kind:'mock'`): 개발용 저장소의 열람 권한(`GoalAuthorization`). 수치를 읽을 때마다 저장소가 권한을 다시 확인한다.
 * - 서버(`kind:'server'`, F5 계획 8.1): **토큰 값을 넣지 않는다**(읽을 때 `getPinToken`). 열람 기한(`revealUntil`, 확인 성공 후 1분과 토큰 만료 중 이른 쪽),
 *   시작 때의 로그인 작업 표식, 그때의 PIN 폐기 번호만 둔다. 유효성은 `isServerGrantLive`가 판단한다.
 * - 폐기는 `revokeBodyAccessIf(표지)`로 **그 표지가 지금도 현재일 때만** 한다(늦게 도착한 이전 열람의 결과·정리가 새 열람을 지우지 않게, R2).
 *   무조건 폐기(`revokeBodyAccess`)는 로그인·로그아웃·세션 종료의 계정 정리에만 쓴다.
 */
export interface MockBodyAccessGrant {
  readonly kind: 'mock'
  readonly ownerId: string
  readonly access: GoalAuthorization
}

export interface ServerBodyAccessGrant {
  readonly kind: 'server'
  readonly ownerId: string
  /**
   * 브라우저 시계(ms). 이 시각이 되면(같은 시각 포함) 열람이 끝난다. 발행 시각+1분과 PIN 토큰 만료 중 **이른 쪽**이다(F5-D9):
   * 확인 응답이 늦어 토큰이 1분보다 먼저 만료되면 그 시각에 P01 타이머가 사용자 동작 없이 가린다.
   */
  readonly revealUntil: number
  readonly guard: AccountWorkGuard
  /** 표지를 만들 때의 PIN 폐기 번호. 그 뒤 토큰이 폐기·교체되면 달라진다. */
  readonly pinEpoch: number
}

export type BodyAccessGrant = MockBodyAccessGrant | ServerBodyAccessGrant

/** 서버 열람 시간(F5-D5). 확인 성공(표지 발행) 시각부터 1분이다. */
export const SERVER_REVEAL_MS = 60_000

let current: BodyAccessGrant | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

/** 모의 표지의 저장소 쪽 권한도 지운다. 운영 빌드에는 저장소가 없어 아무 일도 하지 않는다. */
function lockStored(grant: BodyAccessGrant): void {
  if (grant.kind !== 'mock') return
  try {
    createExerciseGoalRepository(grant.ownerId)?.lock(grant.access)
  } catch {
    // 저장소를 쓸 수 없어도 메모리의 권한은 이미 버렸다.
  }
}

function replace(next: BodyAccessGrant): void {
  const previous = current
  current = next
  if (
    previous &&
    previous.kind === 'mock' &&
    !(next.kind === 'mock' && previous.access.token === next.access.token)
  )
    lockStored(previous)
  emit()
}

/** 모의 P05 인증 성공 뒤 호출한다. 이전 권한은 저장소에서도 지운다. */
export function grantBodyAccess(
  ownerId: string,
  access: GoalAuthorization,
): MockBodyAccessGrant {
  const grant: MockBodyAccessGrant = { kind: 'mock', ownerId, access }
  replace(grant)
  return grant
}

/**
 * 서버 P05 확인 성공 뒤 **표지를 만들기 바로 앞에서** 다시 확인하고 발행한다(F5 계획 8.8.2). 확인 응답과 이 호출 사이에 await가 있어
 * 그 사이 로그인·PIN 토큰이 바뀔 수 있기 때문이다. 하나라도 어긋나면 아무것도 바꾸지 않고 null.
 * - 화면이 살아 있고(`alive`) 요청이 취소되지 않았으며, 시작 때의 로그인 작업이 그대로이고, 이 회원의 PIN 토큰이 있다.
 */
export function issueServerBodyAccess(args: {
  ownerId: string
  guard: AccountWorkGuard
  signal?: AbortSignal
  alive: () => boolean
  now?: number
}): ServerBodyAccessGrant | null {
  const { ownerId, guard, signal, alive } = args
  const now = args.now ?? Date.now()
  if (
    !alive() ||
    signal?.aborted === true ||
    guard.userId !== ownerId ||
    !guard.isCurrent()
  )
    return null
  // 이 회원의 토큰이 지금 쓸 수 있어야 한다(없거나 만료·로그인 변경이면 null). 기한은 토큰 만료를 넘지 않는다(F5-D9).
  const tokenExpiresAt = getPinTokenExpiresAt(ownerId, now)
  if (tokenExpiresAt === null) return null
  const grant: ServerBodyAccessGrant = {
    kind: 'server',
    ownerId,
    revealUntil: Math.min(now + SERVER_REVEAL_MS, tokenExpiresAt),
    guard,
    pinEpoch: currentPinEpoch(),
  }
  replace(grant)
  return grant
}

/**
 * 서버 표지가 지금도 쓸 수 있는지(F5 계획 8.1). 현재 표지와 같은 객체 · 로그인 작업 유효 · PIN 폐기 번호 그대로 ·
 * 기한 전(`now < revealUntil`, 같은 시각은 끝) · 이 회원의 토큰이 남아 있음. 보내기 전·응답 반영 전·표시할 때·알림 때 부른다.
 */
export function isServerGrantLive(
  grant: ServerBodyAccessGrant,
  now: number = Date.now(),
): boolean {
  return (
    current === grant &&
    grant.guard.isCurrent() &&
    currentPinEpoch() === grant.pinEpoch &&
    now < grant.revealUntil &&
    getPinToken(grant.ownerId, now) !== null
  )
}

/**
 * 그 표지가 지금도 현재일 때만 폐기한다(R2). 다르면 아무것도 하지 않고 false.
 * 서버 표지는 PIN 폐기 번호가 그대로일 때만 이 탭의 토큰도 버린다(그 사이 새로 저장된 토큰은 건드리지 않는다).
 */
export function revokeBodyAccessIf(grant: BodyAccessGrant): boolean {
  if (current !== grant) return false
  current = null
  if (grant.kind === 'mock') lockStored(grant)
  else if (currentPinEpoch() === grant.pinEpoch) clearPinToken()
  emit()
  return true
}

/** 무조건 폐기. 계정 정리(로그인·로그아웃·세션 종료)에서만 쓴다. 서버 토큰은 pinTokenStore가 같은 정리에서 따로 지운다. */
export function revokeBodyAccess(): void {
  const previous = current
  if (!previous) return
  current = null
  lockStored(previous)
  emit()
}

export function getBodyAccess(): BodyAccessGrant | null {
  return current
}

export function subscribeBodyAccess(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

registerAccountCleanup(revokeBodyAccess)
