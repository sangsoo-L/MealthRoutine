/**
 * 운동 탐색(E01)의 필터 정의, 주소(URL) 표현, 검색 처리 경계.
 *
 * 필터 항목과 값은 화면명세 v5.0 E01(스토리보드 v5.0)의 운동 검색 화면을 따른다.
 * 난이도·운동 부위·운동 도구는 각각 하나만 고르고(단일 선택), 서로 독립된 조건이며 "전체"는 값 없음(null)이다.
 * 운동 검색 API(GET /api/v1/exercises)는 명세서에 경로만 있고 요청·응답 구조가 정의되지 않았다(frontend/docs/api-status.md).
 * 그래서 아래 값은 화면을 그리기 위한 것이며 API 코드값이 아니다. 백엔드와 확정되면 맞춘다.
 */
import type { ExerciseResult } from './searchTypes.ts'

export const DIFFICULTIES = ['초급', '중급', '고급'] as const
export const TOOLS = [
  '덤벨',
  '맨몸',
  '밴드',
  '폼롤러',
  '마사지볼',
  '풀업 바',
] as const

/** 운동 부위: 큰 분류 제목 아래 세부 부위를 단일 선택한다(스토리보드 v5.0). */
export const BODY_PART_GROUPS: ReadonlyArray<{
  label: string
  parts: readonly string[]
}> = [
  { label: '상체', parts: ['등', '가슴', '어깨', '팔'] },
  { label: '하체', parts: ['엉덩이', '허벅지', '종아리'] },
  { label: '코어', parts: ['복부', '허리'] },
  { label: '전신', parts: ['유산소', '스트레칭'] },
]

const ALL_PARTS: readonly string[] = BODY_PART_GROUPS.flatMap((g) => g.parts)

export type FilterKey = 'difficulty' | 'part' | 'tool'

/** null은 "전체"(조건 없음). */
export type ExerciseFilters = Record<FilterKey, string | null>

export const EMPTY_FILTERS: ExerciseFilters = {
  difficulty: null,
  part: null,
  tool: null,
}

export const FILTER_LABELS: Record<FilterKey, string> = {
  difficulty: '난이도',
  part: '운동 부위',
  tool: '운동 도구',
}

/** 결과 화면의 조건 요약에 쓰는 짧은 이름(스토리보드 v5.0: 난이도·부위·도구). */
const SUMMARY_LABELS: Record<FilterKey, string> = {
  difficulty: '난이도',
  part: '부위',
  tool: '도구',
}

/** 운동 이름과 필터 조건. 검색하기를 누를 때의 값이다. */
export interface ExerciseCriteria {
  query: string
  filters: ExerciseFilters
}

export const MAX_EXERCISE_QUERY = 50

const ALLOWED: Record<FilterKey, readonly string[]> = {
  difficulty: DIFFICULTIES,
  part: ALL_PARTS,
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

/**
 * 현재 연결. 운동 검색 API와 데이터가 없어서 항상 "데이터 소스 미연결"을 돌려준다.
 * 가짜 운동을 만들지 않고, 결과 없음·오류로도 처리하지 않는다.
 */
export const exerciseBackend: ExerciseBackend = {
  connected: false,
  search: () => Promise.resolve({ status: 'unavailable' }),
}
