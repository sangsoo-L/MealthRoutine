import type { ExerciseGoalRepository } from './exerciseGoalTypes.ts'

const local = import.meta.env.DEV
  ? await import('./local/localExerciseGoalRepository.ts')
  : null

/** 실제 서버 계약이 정해지기 전에는 개발 서버의 계정별 로컬 구현만 사용한다. */
export function createExerciseGoalRepository(
  ownerId: string,
): ExerciseGoalRepository | null {
  return local ? local.createLocalExerciseGoalRepository(ownerId) : null
}
