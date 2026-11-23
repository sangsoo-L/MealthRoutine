import type { Exercise } from './exerciseTypes.ts'

/**
 * 운동 루틴 읽기 모델. 루틴 화면(W06~W08)은 아직 없고, 지금은 운동 JSON 시드(exercise/seed/)의 조회 계층만 이 모양으로 돌려준다.
 * 화면용 임시 형태이며 API 응답 구조가 아니다(운동 루틴 API의 응답 구조는 미확정, README의 API 인수인계).
 * 실제 API가 정해지면 변환을 저장소 구현에 둔다.
 *
 * - id는 원본 routine_id를 문자열로 바꾼 값이다. 새로 만들거나 바꾸지 않는다.
 * - 소유자·템플릿 여부·공개 범위는 원본 값을 그대로 담을 뿐 해석하지 않는다.
 *   (owner_user_id가 비어 있고 is_template이 false인 조합의 의미는 기획·백엔드 확인 전이다.)
 * - 항목의 기록 방식(횟수형·시간형·중량형)은 원본에 필드가 없어 담지 않는다. 목표 횟수와 목표 시간 중 값이 있는 쪽이 있을 뿐이다.
 */
export interface Routine {
  id: string
  name: string
  description: string
  difficulty: Exercise['difficulty']
  /** 원본 owner_user_id. 없으면 null. */
  ownerUserId: string | null
  isTemplate: boolean
  visibility: 'private' | 'shared' | 'public'
}

export interface RoutineItem {
  id: string
  routineId: string
  /** 원본 exercise_id를 문자열로 바꾼 값(Exercise.id와 같은 값). */
  exerciseId: string
  /** 루틴 안의 순서(1부터). */
  sequenceNumber: number
  targetSets: number
  /** 목표 횟수. 시간으로 정한 항목이면 null. */
  targetReps: number | null
  /** 목표 시간(초). 횟수로 정한 항목이면 null. */
  targetDurationSeconds: number | null
  /** 세트 사이 휴식(초). 없으면 null. */
  restSeconds: number | null
}

/** 루틴 항목과 그 운동 정보를 이은 것. 운동 정보는 표시용이며 수행 기록을 대신하지 않는다. */
export interface RoutineItemWithExercise extends RoutineItem {
  exercise: Exercise
}

export interface RoutineWithExercises extends Routine {
  items: readonly RoutineItemWithExercise[]
}
