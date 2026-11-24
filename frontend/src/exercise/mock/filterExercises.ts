import { BODY_PART_GROUPS } from '../exerciseTaxonomy.ts'
import type { Exercise, ExerciseQuery } from '../exerciseTypes.ts'

/**
 * 운동 목록 필터링. 개발용 시드 저장소와 운영 빌드의 API 저장소(api/apiExerciseRepository.ts)가 함께 쓴다. API 저장소는 카탈로그 전체를
 * 받아 두고 여기서 거르므로 두 환경에서 같은 조건에 걸리는 운동이 같다(순서는 받은 목록의 순서라 다를 수 있다). 조건은 서로 독립(AND)이다.
 *
 * - 이름: 부분 일치, 대소문자·공백 무시.
 * - 난이도·도구: 값이 같아야 한다. 도구는 필요한 도구 중 하나라도 같으면 일치다.
 * - 부위: 세부 부위(예: 가슴)이면 자극 부위에 그 값이 있어야 한다. 큰 분류(상체·하체·코어·전신)이면 운동의 큰 분류가 같거나
 *   자극 부위 중 하나가 그 분류의 세부 부위여야 한다(예: 코어 = 복부·허리를 쓰는 운동).
 */
const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase()

export function matchesPart(exercise: Exercise, part: string): boolean {
  const group = BODY_PART_GROUPS.find((g) => g.label === part)
  if (!group) return exercise.targetMuscles.includes(part)
  return (
    exercise.category === group.label ||
    exercise.targetMuscles.some((m) => group.parts.includes(m))
  )
}

export function filterExercises(
  exercises: readonly Exercise[],
  query: ExerciseQuery,
): readonly Exercise[] {
  const text = normalize(query.query)
  return exercises.filter(
    (e) =>
      (text === '' || normalize(e.name).includes(text)) &&
      (query.difficulty === null || e.difficulty === query.difficulty) &&
      (query.part === null || matchesPart(e, query.part)) &&
      (query.tool === null ||
        (e.equipment as readonly string[]).includes(query.tool)),
  )
}
