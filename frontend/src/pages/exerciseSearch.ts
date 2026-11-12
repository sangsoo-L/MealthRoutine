/**
 * 운동 탐색(E01)의 주소(URL) 표현과 검색 처리 경계.
 * 필터 타입·빈 조건·라벨·검색어 최대 길이처럼 컴포넌트와 함께 쓰는 정의는 `exercise/exerciseFilters.ts`에 있다.
 *
 * 필터 항목과 값은 화면명세 v5.0 E01(스토리보드 v5.0)의 운동 검색 화면을 따른다.
 * 난이도·운동 부위·운동 도구는 각각 하나만 고르고(단일 선택), 서로 독립된 조건이며 "전체"는 값 없음(null)이다.
 * 운동 검색 API(GET /api/v1/exercises)는 명세서에 경로만 있고 요청·응답 구조가 정의되지 않았다(frontend/docs/api-status.md).
 * 그래서 아래 값은 화면을 그리기 위한 것이며 API 코드값이 아니다. 백엔드와 확정되면 맞춘다.
 */
import {
  ALL_PART_FILTER_VALUES,
  BODY_PART_GROUPS,
  DIFFICULTIES,
  TOOLS,
} from '../exercise/exerciseTaxonomy.ts'
import {
  MAX_EXERCISE_QUERY,
  type ExerciseCriteria,
  type FilterKey,
} from '../exercise/exerciseFilters.ts'
import { createExerciseRepository } from '../exercise/exerciseSource.ts'
import type { Exercise, ExerciseResult } from '../exercise/exerciseTypes.ts'

// 분류(난이도·도구·부위)는 운동 도메인(exercise/exerciseTaxonomy.ts)이 가지고, 필터 화면은 같은 값을 쓴다.
export { BODY_PART_GROUPS, DIFFICULTIES, TOOLS }

/** 결과 화면의 조건 요약에 쓰는 짧은 이름(스토리보드 v5.0: 난이도·부위·도구). */
const SUMMARY_LABELS: Record<FilterKey, string> = {
  difficulty: '난이도',
  part: '부위',
  tool: '도구',
}

const ALLOWED: Record<FilterKey, readonly string[]> = {
  difficulty: DIFFICULTIES,
  // 부위는 세부 부위(예: 가슴) 또는 큰 분류(상체·하체·코어·전신) 이름이다.
  part: ALL_PART_FILTER_VALUES,
  tool: TOOLS,
}

/** 주소(?q=&difficulty=&part=&tool=&view=results)에서 조건과 화면 상태를 읽는다. 허용되지 않은 값은 무시한다. */
export function parseCriteria(params: URLSearchParams): {
  criteria: ExerciseCriteria
  showResults: boolean
} {
  const read = (key: FilterKey): string | null => {
    const value = params.get(key)
    return value !== null && ALLOWED[key].includes(value) ? value : null
  }
  return {
    criteria: {
      query: (params.get('q') ?? '').trim().slice(0, MAX_EXERCISE_QUERY),
      filters: {
        difficulty: read('difficulty'),
        part: read('part'),
        tool: read('tool'),
      },
    },
    showResults: params.get('view') === 'results',
  }
}

/** 조건을 주소로 만든다. 값이 있는 조건만 담는다. */
export function criteriaUrl(
  criteria: ExerciseCriteria,
  showResults: boolean,
): string {
  const params = new URLSearchParams()
  const query = criteria.query.trim()
  if (query) params.set('q', query)
  for (const key of ['difficulty', 'part', 'tool'] as const) {
    const value = criteria.filters[key]
    if (value) params.set(key, value)
  }
  if (showResults) params.set('view', 'results')
  const text = params.toString()
  return text ? `/exercises?${text}` : '/exercises'
}

/** 결과 화면의 "검색한 조건" 요약 문구 목록. */
export function criteriaSummary(criteria: ExerciseCriteria): string[] {
  const filters = (['difficulty', 'part', 'tool'] as const)
    .filter((key) => criteria.filters[key] !== null)
    .map((key) => `${SUMMARY_LABELS[key]}: ${criteria.filters[key]}`)
  const first = criteria.query.trim()
    ? `검색어: ${criteria.query.trim()}`
    : '전체 운동'
  return [first, ...filters]
}

/**
 * 운동 검색 한 번의 결과.
 * - unavailable: 데이터 소스(검색 API·데이터)가 연결되지 않았다. "결과 없음"이나 "오류"가 아니다.
 * - error: 연결은 되어 있으나 검색에 실패했다.
 * - results: 성공. 목록이 비어 있으면 "결과 없음"이다.
 */
export type ExerciseSearchOutcome =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'results'; items: readonly ExerciseResult[] }

/**
 * 운동 검색 처리 경계. 운동 탐색 화면은 이 인터페이스만 안다.
 * 검색 API가 정해지면 이 인터페이스를 구현한 객체로 `exerciseBackend`를 교체한다.
 */
export interface ExerciseBackend {
  /** 데이터 소스가 실제로 연결되어 있는지. false이면 화면이 준비 중임을 미리 알린다. */
  readonly connected: boolean
  search(criteria: ExerciseCriteria): Promise<ExerciseSearchOutcome>
}

/** 운동 한 건을 목록 카드가 쓰는 결과 형태로 바꾼다. 값이 없는 항목은 만들어 채우지 않는다. */
function toResult(exercise: Exercise): ExerciseResult {
  return {
    id: exercise.id,
    name: exercise.name,
    bodyParts: exercise.targetMuscles,
    difficulty: exercise.difficulty,
    tools: exercise.equipment,
  }
}

/**
 * 현재 연결. 운동 데이터 저장소(exercise/exerciseSource.ts)를 통해 검색한다.
 * - 개발 서버: 개발용 Mock 운동 데이터(15종)를 조회한다.
 * - 운영 빌드: 저장소가 없다(운동 검색 API·데이터 미확정). 항상 "데이터 소스 미연결"을 돌려주며 가짜 운동을 만들지 않고
 *   결과 없음·오류로도 처리하지 않는다.
 * 저장소가 조회에 실패하면 error를 돌려준다(입력은 화면이 그대로 유지하고 재시도할 수 있다).
 */
export const exerciseBackend: ExerciseBackend = {
  // 개발·검수용 스위치로 연결 상태가 바뀔 수 있어 매번 확인한다.
  get connected() {
    return createExerciseRepository() !== null
  },
  async search(criteria) {
    const repository = createExerciseRepository()
    if (!repository) return { status: 'unavailable' }
    try {
      const items = await repository.list({
        query: criteria.query.trim(),
        difficulty: criteria.filters.difficulty,
        part: criteria.filters.part,
        tool: criteria.filters.tool,
      })
      return { status: 'results', items: items.map(toResult) }
    } catch {
      return { status: 'error' }
    }
  },
}
