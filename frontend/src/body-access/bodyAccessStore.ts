import { registerAccountCleanup } from '../auth/accountScope.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import type { GoalAuthorization } from '../exercise-goal/exerciseGoalTypes.ts'

/**
 * P05 확인이 만든 신체 정보 열람 권한을 P01로 넘기는 앱 수준 메모리.
 *
 * - 메모리(모듈 변수)에만 있다. localStorage·sessionStorage·URL·라우터 state·로그에 넣지 않으므로 새로고침하면 사라진다.
 * - 이 값은 "누구의 어떤 권한 토큰인지"만 담는다. PIN 원문과 신체 수치는 담지 않는다.
 * - 이 값이 있다고 수치를 볼 수 있는 것이 아니다. 수치를 읽을 때마다 저장소(`BodyMeasurementRepository.getMeasurements`)가
 *   권한을 다시 확인한다(계정·만료·PIN 변경). 만료 판단은 타이머가 아니라 `access.expiresAt`과 저장소의 시계가 한다.
 * - 한 번에 하나의 권한만 둔다. 새 권한이 들어오면 이전 권한은 저장소에서도 지운다.
 * - 로그인·로그아웃(계정 전환)의 `clearAccountScopedData`가 함께 지운다.
 */
export interface BodyAccessGrant {
  ownerId: string
  access: GoalAuthorization
}

let current: BodyAccessGrant | null = null
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

/** 저장소 쪽 권한도 지운다. 운영 빌드에는 저장소가 없어 아무 일도 하지 않는다. */
function lockStored(grant: BodyAccessGrant): void {
  try {
    createExerciseGoalRepository(grant.ownerId)?.lock(grant.access)
  } catch {
    // 저장소를 쓸 수 없어도 메모리의 권한은 이미 버렸다.
  }
}

/** P05 인증 성공 뒤 호출한다. 이전 권한은 저장소에서도 지운다. */
export function grantBodyAccess(
  ownerId: string,
  access: GoalAuthorization,
): void {
  const previous = current
  current = { ownerId, access }
  if (previous && previous.access.token !== access.token) lockStored(previous)
  emit()
}

/** 열람 권한을 즉시 폐기한다(숨기기·만료·이탈·로그아웃·계정 전환). 권한이 없으면 아무 일도 하지 않는다. */
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
