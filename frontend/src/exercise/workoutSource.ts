import type {
  WorkoutListRepository,
  WorkoutRecordRepository,
  WorkoutSessionRepository,
} from './workoutRepositories.ts'

/**
 * 운동 목록·수행 세션·완료 기록 저장소의 출처. 지금은 개발 서버에서만 IndexedDB 로컬 저장소(kind 'local')를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 저장 수단이 연결되어 있지 않다"는 뜻이며 화면은 이를 "준비 중"으로 안내한다(기록 없음·오류와 구분).
 * 운영 빌드는 로그인 자체가 동작하지 않으므로(auth/unavailableBackend) 운영에서는 이 저장소를 만들 일도 없다.
 *
 * - 로컬 저장소는 개발용 Mock(kind 'mock', 코드 상수)과 다르다: 사용자가 입력한 값을 이 브라우저의 IndexedDB에 실제로 저장한다.
 *   단, 이 브라우저에만 있는 사본이며 서버 보관이 아니다(기기·브라우저를 바꾸면 없고, 브라우저가 지울 수 있다).
 * - import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 로컬 저장소 청크가 제거된다(exerciseSource.ts와 같은 방식).
 * - 저장소는 계정 id로만 만든다. id는 인증 Context(useAuth)가 인증을 확인한 사용자의 값이며 임의로 만들지 않는다.
 *   로그아웃해도 IndexedDB의 값은 지우지 않는다(이 브라우저의 유일한 사본). 로그아웃 뒤 화면 접근은 라우트의 AuthGate가 막는다.
 *
 * 서버 연동이 정해지면 같은 인터페이스를 구현한 객체로 아래 반환을 교체한다(화면은 그대로).
 */
const localModule = import.meta.env.DEV
  ? await import('./local/indexedDbWorkoutRepositories.ts')
  : null

export function createWorkoutListRepository(
  ownerId: string,
): WorkoutListRepository | null {
  return localModule
    ? localModule.createIndexedDbWorkoutListRepository(ownerId)
    : null
}

export function createWorkoutSessionRepository(
  ownerId: string,
): WorkoutSessionRepository | null {
  return localModule
    ? localModule.createIndexedDbWorkoutSessionRepository(ownerId)
    : null
}

export function createWorkoutRecordRepository(
  ownerId: string,
): WorkoutRecordRepository | null {
  return localModule
    ? localModule.createIndexedDbWorkoutRecordRepository(ownerId)
    : null
}
