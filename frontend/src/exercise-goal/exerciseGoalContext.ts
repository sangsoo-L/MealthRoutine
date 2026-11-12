import { createGoalRepository } from '../health-goal/goalSource.ts'
import { loadKnowledgeLevels } from '../mypage/knowledgeSource.ts'
import {
  ExerciseGoalError,
  type ExerciseGoalContext,
} from './exerciseGoalTypes.ts'

export async function loadExerciseGoalContext(
  ownerId: string,
): Promise<ExerciseGoalContext | null> {
  const repository = createGoalRepository(ownerId)
  if (!repository) throw new ExerciseGoalError('unavailable')
  const [healthGoal, knowledge] = await Promise.all([
    repository.getGoal(),
    loadKnowledgeLevels(ownerId),
  ])
  if (!healthGoal) return null
  if (!knowledge) throw new ExerciseGoalError('unavailable')
  const exercise = knowledge.exercise
  return {
    healthGoal,
    exerciseTier: exercise?.tier ?? null,
    knowledgeSource: exercise?.source ?? 'unknown',
  }
}
