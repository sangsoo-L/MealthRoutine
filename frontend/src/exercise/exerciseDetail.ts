import { createExerciseRepository } from './exerciseSource.ts'
import type { Exercise } from './exerciseTypes.ts'

/**
 * 운동 상세(E02) 조회 한 번의 결과. 화면은 이 네 가지를 서로 다른 안내로 보여 준다.
 * - unavailable: 운동 데이터 소스가 연결되지 않았다(개발 서버의 미연결 스위치). "없는 운동"이나 "오류"가 아니다.
 * - error: 연결은 되어 있으나 조회에 실패했다.
 * - notFound: 조회는 성공했지만 그 id의 운동이 없다(삭제된 운동·잘못된 주소).
 * - ready: 운동을 찾았다.
 */
export type ExerciseDetailOutcome =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'ready'; exercise: Exercise }

/**
 * 운동 한 건을 조회한다. 운동 탐색(E01)·통합검색과 같은 운동 저장소(`createExerciseRepository` → `ExerciseRepository.getById`)를 쓰며
 * 상세용 데이터를 따로 두지 않는다. 운영 빌드에서는 API 저장소가 받아 둔 전체 운동에서 찾는다.
 */
export async function loadExercise(id: string): Promise<ExerciseDetailOutcome> {
  const repository = createExerciseRepository()
  if (!repository) return { status: 'unavailable' }
  try {
    const exercise = await repository.getById(id)
    return exercise ? { status: 'ready', exercise } : { status: 'notFound' }
  } catch {
    return { status: 'error' }
  }
}
