import {
  createIndexedDbWorkoutListRepository,
  createIndexedDbWorkoutRecordRepository,
  createIndexedDbWorkoutRoutineRepository,
  createIndexedDbWorkoutSessionRepository,
} from './local/indexedDbWorkoutRepositories.ts'
import { createApiRoutineRepository } from './api/apiRoutineRepository.ts'
import type {
  WorkoutListRepository,
  WorkoutRecordRepository,
  WorkoutRoutineRepository,
  WorkoutSessionRepository,
} from './workoutRepositories.ts'

/**
 * 운동 목록·수행 세션·완료 기록·루틴 저장소의 출처.
 *
 * - 오늘 운동 목록, 수행 세션, 완료 기록은 개발 서버와 운영 빌드 모두 이 브라우저의 IndexedDB 로컬 저장소(kind 'local')를 쓴다.
 *   오늘 목록과 진행 중인 세션은 서버에 두지 않는다. 완료 기록은 서버에도 테이블과 업로드 API(POST /workout-sessions/records)가 있고,
 *   그 업로드 연결은 다음 단계에서 한다(그 전까지 완료 기록은 이 브라우저에만 있다).
 * - 루틴은 서버에 저장한다. 운영 빌드는 루틴 API 저장소(api/apiRoutineRepository.ts)를 쓰고, 개발 서버는 지금처럼 로컬 저장소를 쓴다.
 * - 로컬 저장소는 개발용 Mock(kind 'mock', 코드 상수)과 다르다: 사용자가 입력한 값을 IndexedDB에 실제로 저장한다.
 *   단, 이 브라우저에만 있는 사본이며 서버 보관이 아니다(기기·브라우저를 바꾸면 없고, 브라우저가 지울 수 있다).
 * - 저장소는 계정 id로만 만든다. id는 인증 Context(useAuth)가 서버에서 확인한 회원 id이며 임의로 만들지 않는다.
 *   모든 조회·쓰기는 계정 id로 범위를 좁혀서, 같은 브라우저에서 계정을 바꿔도 다른 계정의 값은 보이지 않는다.
 *   로그아웃해도 IndexedDB의 값은 지우지 않는다(이 브라우저의 유일한 사본). 로그아웃 뒤 화면 접근은 라우트의 AuthGate가 막는다.
 */
export function createWorkoutListRepository(
  ownerId: string,
): WorkoutListRepository | null {
  return createIndexedDbWorkoutListRepository(ownerId)
}

export function createWorkoutSessionRepository(
  ownerId: string,
): WorkoutSessionRepository | null {
  return createIndexedDbWorkoutSessionRepository(ownerId)
}

export function createWorkoutRecordRepository(
  ownerId: string,
): WorkoutRecordRepository | null {
  return createIndexedDbWorkoutRecordRepository(ownerId)
}

/**
 * 운동 루틴(W06~W08) 저장소. 운영 빌드는 루틴 API 저장소, 개발 서버는 IndexedDB 로컬 저장소다.
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 로컬 루틴 저장소 생성 코드가 빠진다.
 */
export function createWorkoutRoutineRepository(
  ownerId: string,
): WorkoutRoutineRepository | null {
  return import.meta.env.DEV
    ? createIndexedDbWorkoutRoutineRepository(ownerId)
    : createApiRoutineRepository(ownerId)
}
