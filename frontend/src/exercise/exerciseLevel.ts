import { loadKnowledgeLevels } from '../mypage/knowledgeSource.ts'
import type { KnowledgeLevels } from '../mypage/mypageTypes.ts'
import type { AssessmentLevelCode } from '../onboarding-assessment/assessmentTypes.ts'
import { inputModeFor, type InputMode } from './workoutProgress.ts'

/**
 * W14가 쓰는 운동 수준과 입력 방식. 값은 기존 `loadKnowledgeLevels`(운동 이해도 진단 결과, 없으면 개발용 초기값)를 그대로 쓴다.
 *
 * - beginner → 간단 입력, intermediate·advanced → 상세 입력.
 * - 수준을 알 수 없으면(결과 없음·저장소 없음) 간단 입력. 오류가 아니다.
 * - 조회가 실패하면(예외) 운동을 막지 않고 간단 입력으로 진행하며 `failed`로 안내가 필요함을 알린다.
 * 진단은 재응시가 없으므로 수준이 도중에 바뀔 일은 사실상 없다. 그래도 한 번 정한 입력 방식은 그 화면에서 고정한다(useExerciseLevel).
 */
export interface ExerciseLevelResult {
  mode: InputMode
  level: AssessmentLevelCode | null
  source: 'assessment' | 'dev-initial' | 'unknown'
  /** 조회에 실패해 간단 입력으로 대체했다(화면이 "운동 수준을 확인하지 못해 간단 입력으로 진행해요"를 안내). */
  failed: boolean
}

export async function loadExerciseLevel(
  userId: string,
  loader: (
    userId: string,
  ) => Promise<KnowledgeLevels | null> = loadKnowledgeLevels,
): Promise<ExerciseLevelResult> {
  let levels: KnowledgeLevels | null
  try {
    levels = await loader(userId)
  } catch {
    return { mode: 'simple', level: null, source: 'unknown', failed: true }
  }
  const entry = levels?.exercise ?? null
  const level = entry?.tier ?? null
  return {
    mode: inputModeFor(level),
    level,
    source: entry?.source ?? 'unknown',
    failed: false,
  }
}
