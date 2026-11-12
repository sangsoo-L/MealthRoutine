import type { Exercise } from './exerciseTypes.ts'

/**
 * 운동 선택 화면(W13)의 순수 매칭 함수. 화면·저장소와 무관하고 이미 불러온 운동 목록만 다룬다.
 *
 * 직접 검색: 검색어가 운동 이름, 세부 운동 부위(targetMuscles), 운동 도구(equipment), 상체·하체·전신 대분류(category) 중
 * 하나라도 포함되면 일치한다(화면명세 v5.0·스토리보드 W13의 "운동명·부위·도구 검색"). 필드를 이어 붙인 문자열에서 찾지 않고 각 값을 따로 비교하므로
 * 서로 다른 필드가 이어져 생기는 우연한 일치가 없다. 대소문자·공백은 무시한다(운동 탐색 E01의 이름 검색과 같은 규칙).
 * 검색어가 비어 있으면 모든 운동이 일치한다(스토리보드의 includes('') 동작).
 * 운동 검색 API(GET /api/v1/exercises)의 keyword 의미와 부위 필드는 미확정이라, 이 규칙은 이미 불러온 데이터에 대한 화면 규칙이며 API 계약이 아니다.
 */
const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase()

/** 운동 하나가 검색어와 일치하는지. */
export function matchesPickerQuery(exercise: Exercise, query: string): boolean {
  const text = normalize(query)
  if (text === '') return true
  const fields: readonly string[] = [
    exercise.name,
    exercise.category,
    ...exercise.targetMuscles,
    ...exercise.equipment,
  ]
  return fields.some((value) => normalize(value).includes(text))
}

/** 검색어와 일치하는 운동. 입력 목록의 순서를 유지한다. */
export function searchPickerExercises(
  catalog: readonly Exercise[],
  query: string,
): readonly Exercise[] {
  return catalog.filter((exercise) => matchesPickerQuery(exercise, query))
}

/**
 * 즐겨찾기로 등록된 운동. 등록 순서가 아니라 운동 목록(카탈로그)의 순서로 돌려준다(스토리보드와 같다).
 * missing은 즐겨찾기 id 중 운동 목록에서 찾지 못한 개수다. 삭제된 운동이거나 운동 데이터가 일부만 왔을 수 있으며,
 * 정상 "즐겨찾기 없음"과 구분하려고 개수를 따로 알려 준다. 없는 운동 객체를 만들어 채우지 않는다.
 */
export function pickFavoriteExercises(
  catalog: readonly Exercise[],
  favoriteIds: ReadonlySet<string>,
): { items: readonly Exercise[]; missing: number } {
  const items = catalog.filter((exercise) => favoriteIds.has(exercise.id))
  return { items, missing: favoriteIds.size - items.length }
}

/** 목록 행의 부가 정보 한 줄. 순서는 난이도·부위·도구(운동 탐색 E01 카드와 같다). 값이 없는 항목은 생략한다. */
export function pickerExerciseMeta(exercise: Exercise): string {
  return [
    exercise.difficulty,
    exercise.targetMuscles.join('·'),
    exercise.equipment.join('·'),
  ]
    .filter((value) => value !== '')
    .join(' · ')
}
