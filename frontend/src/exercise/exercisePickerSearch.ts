import { ALL_PARTS, BODY_PART_GROUPS } from './exerciseTaxonomy.ts'
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
 * 직접 검색의 필터 조건. 검색어와 서로 독립이며 모두 만족해야 한다(AND).
 * - difficulty: 난이도 이름(초급·중급·고급, exerciseTaxonomy.DIFFICULTIES). null은 "전체". 원본의 beginner 등은 운동 저장소가 이미 이 이름으로 바꿔 둔다.
 * - parts: 선택한 운동 부위(Exercise.targetMuscles의 값. 원본의 exercise_type) 여러 개. 선택한 것 중 하나라도 맞으면 포함한다(OR).
 *   빈 배열이 "전체"(운동 부위 조건 없음)다. "전체"를 부위 값으로 따로 저장하지 않는다. 큰 분류(상체·하체 등, Exercise.category)와 다르다.
 *   배열은 운동 분류(ALL_PARTS)의 순서로 정리해 둔다(sortParts).
 */
export interface PickerFilters {
  difficulty: string | null
  parts: readonly string[]
}

export const EMPTY_PICKER_FILTERS: PickerFilters = {
  difficulty: null,
  parts: [],
}

/** 선택한 부위를 운동 분류의 순서로 정리한다(중복·알 수 없는 값 제거). 표시·비교가 선택한 순서에 흔들리지 않게 한다. */
export function sortParts(parts: readonly string[]): readonly string[] {
  return ALL_PARTS.filter((part) => parts.includes(part))
}

/**
 * 부위 하나를 선택·해제한다. 선택되어 있으면 그 부위만 빼고, 없으면 더한다(다른 선택은 유지). 결과는 운동 분류의 순서다.
 * 마지막 부위를 빼면 빈 배열(= 전체)이 된다.
 */
export function togglePickerPart(
  selected: readonly string[],
  part: string,
): readonly string[] {
  return sortParts(
    selected.includes(part)
      ? selected.filter((value) => value !== part)
      : [...selected, part],
  )
}

/**
 * 검색 조건 행에 보여 줄 부위 선택값: 없으면 "전체", 1개는 "등", 2개는 "등, 어깨", 3개 이상은 "등 외 2개"(운동 분류의 순서 기준).
 */
export function formatPickerParts(parts: readonly string[]): string {
  const sorted = sortParts(parts)
  if (sorted.length === 0) return '전체'
  if (sorted.length <= 2) return sorted.join(', ')
  return `${sorted[0]} 외 ${sorted.length - 1}개`
}

/** 검색어 AND 난이도 AND (선택한 운동 부위 중 하나). 입력 목록의 순서를 유지한다. 선택·즐겨찾기 같은 다른 상태는 건드리지 않는다. */
export function filterPickerExercises(
  catalog: readonly Exercise[],
  query: string,
  filters: PickerFilters,
): readonly Exercise[] {
  return catalog.filter(
    (exercise) =>
      matchesPickerQuery(exercise, query) &&
      (filters.difficulty === null ||
        exercise.difficulty === filters.difficulty) &&
      (filters.parts.length === 0 ||
        exercise.targetMuscles.some((muscle) =>
          filters.parts.includes(muscle),
        )),
  )
}

/**
 * 직접 검색의 검색 조건 한 벌(검색어 + 필터). 화면은 "입력 중인 조건"과 "실제 검색에 적용한 조건"을 따로 가진다.
 * 검색어는 앞뒤 공백을 무시해 비교한다.
 */
export interface PickerCriteria extends PickerFilters {
  query: string
}

export const EMPTY_PICKER_CRITERIA: PickerCriteria = {
  query: '',
  ...EMPTY_PICKER_FILTERS,
}

/** 두 조건이 같은지(검색어는 앞뒤 공백 제외, 부위는 선택한 순서와 무관). 입력 중인 조건이 적용한 조건과 같을 때만 결과가 유효하다. */
export function samePickerCriteria(
  a: PickerCriteria,
  b: PickerCriteria,
): boolean {
  const aParts = sortParts(a.parts)
  const bParts = sortParts(b.parts)
  return (
    a.query.trim() === b.query.trim() &&
    a.difficulty === b.difficulty &&
    aParts.length === bParts.length &&
    aParts.every((part, index) => part === bParts[index])
  )
}

/** 처음 상태(검색어 없음·전체·전체)인지. */
export function isDefaultPickerCriteria(criteria: PickerCriteria): boolean {
  return samePickerCriteria(criteria, EMPTY_PICKER_CRITERIA)
}

/** 검색 결과 위에 보여 줄 조건 요약. 아무 조건도 없으면 "전체 운동"이다. 부위는 선택한 것을 모두 보여 준다. */
export function pickerCriteriaSummary(criteria: PickerCriteria): string[] {
  const summary: string[] = []
  const query = criteria.query.trim()
  if (query) summary.push(`검색어: ${query}`)
  if (criteria.difficulty) summary.push(`난이도: ${criteria.difficulty}`)
  const parts = sortParts(criteria.parts)
  if (parts.length > 0) summary.push(`운동 부위: ${parts.join(', ')}`)
  return summary.length > 0 ? summary : ['전체 운동']
}

/** 조건에 맞는 운동(검색어 AND 난이도 AND 운동 부위 OR). */
export function searchByCriteria(
  catalog: readonly Exercise[],
  criteria: PickerCriteria,
): readonly Exercise[] {
  return filterPickerExercises(catalog, criteria.query, criteria)
}

/**
 * 부위 필터의 선택지: 불러온 운동 목록에 실제로 있는 운동 부위만, 운동 분류(exerciseTaxonomy.ALL_PARTS)의 순서로 돌려준다.
 * 운동 데이터가 바뀌면 선택지도 자동으로 따라간다.
 */
export function availablePickerParts(
  catalog: readonly Exercise[],
): readonly string[] {
  return ALL_PARTS.filter((part) =>
    catalog.some((exercise) => exercise.targetMuscles.includes(part)),
  )
}

/**
 * 부위 선택지를 큰 분류(상체 → 하체 → 코어 → 전신) 아래로 묶는다. 묶음 정의는 exerciseTaxonomy.BODY_PART_GROUPS를 그대로 쓴다.
 * 불러온 운동에 실제로 있는 부위만 담고, 부위가 하나도 없는 분류는 빼며, 없는 부위를 만들어 채우지 않는다.
 * 분류 이름은 구분용 제목일 뿐이며 "분류 전체" 같은 선택지는 만들지 않는다.
 */
export function groupedPickerParts(
  catalog: readonly Exercise[],
): ReadonlyArray<{ label: string; parts: readonly string[] }> {
  const available = new Set(availablePickerParts(catalog))
  return BODY_PART_GROUPS.map((group) => ({
    label: group.label,
    parts: group.parts.filter((part) => available.has(part)),
  })).filter((group) => group.parts.length > 0)
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
