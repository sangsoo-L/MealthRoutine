/**
 * 음식 탐색(F01)의 검색 조건 정의, 주소(URL) 표현, 검색 처리 경계.
 *
 * 조건 항목과 값은 화면명세 v5.0 F01과 스토리보드 v5.0(음식 검색 최종 구성)을 따른다.
 * - 식품 구분: 전체 · 음식·요리 · 가공식품 · 식재료 (단일 선택)
 * - 음식 종류: 식품 구분에 따라 달라지는 서비스 분류(한식·중식 같은 필수 분류는 제거), 단일 선택, 전체 종류는 조건 없음
 * - 상세 필터: 100g당 열량 최소·최대(kcal), 단백질 최소(g). 빈 값은 "제한 없음"이며 0과 다르다.
 * 식품 구분 이름은 명세 JSON에 "음식요리", 스토리보드 코드에 "음식·요리"로 달라 코드 쪽 표기를 썼다(확인 필요).
 *
 * 음식 검색 API(GET /api/v1/foods)는 명세서에 경로만 있고 요청·응답 구조가 정의되지 않았다(frontend/docs/api-status.md).
 * 아래 값은 화면을 그리기 위한 것이며 API 코드값이 아니다. 백엔드와 확정되면 맞춘다.
 */
import type { FoodResult } from './searchTypes.ts'

export const FOOD_TYPES = ['음식·요리', '가공식품', '식재료'] as const
export type FoodType = (typeof FOOD_TYPES)[number]

export const FOOD_KINDS: Record<FoodType, readonly string[]> = {
  '음식·요리': [
    '밥·죽',
    '면류',
    '국·찌개',
    '반찬',
    '샐러드',
    '소스·드레싱',
    '음료',
  ],
  가공식품: ['도시락', '간식', '유제품', '소스·드레싱', '음료'],
  식재료: ['곡류', '육류', '채소', '과일', '수산물'],
}

/** 식품 구분이 "전체"일 때의 음식 종류: 모든 구분의 종류를 중복 없이 모은다. */
const ALL_KINDS: readonly string[] = [
  ...new Set(Object.values(FOOD_KINDS).flat()),
]

/** 식품 구분(null=전체)에서 고를 수 있는 음식 종류. */
export function kindsFor(type: string | null): readonly string[] {
  return type !== null && type in FOOD_KINDS
    ? FOOD_KINDS[type as FoodType]
    : ALL_KINDS
}

/** 상세 필터. 값은 입력한 글자 그대로이고 빈 문자열이 "제한 없음"이다. */
export interface FoodNutrition {
  minKcal: string
  maxKcal: string
  minProtein: string
}

export const EMPTY_NUTRITION: FoodNutrition = {
  minKcal: '',
  maxKcal: '',
  minProtein: '',
}

export interface FoodCriteria {
  query: string
  /** null은 전체 */
  type: string | null
  /** null은 전체 종류 */
  kind: string | null
  nutrition: FoodNutrition
}

export const MAX_FOOD_QUERY = 50

/** 0 이상의 숫자(소수 가능)인지. 빈 문자열은 "제한 없음"이라 여기서 다루지 않는다. */
function isNonNegativeNumber(value: string): boolean {
  return /^\d{1,7}(\.\d{1,2})?$/.test(value.trim())
}

/**
 * 상세 필터 검증. 오류 문구를 돌려주고 통과하면 null이다. 음수·숫자가 아닌 값·최소가 최대보다 큰 값을 막는다.
 * 빈 값은 통과한다(제한 없음).
 */
/** 검증 오류: 문구와, 오류를 연결·포커스할 입력. */
export interface NutritionError {
  field: keyof FoodNutrition
  message: string
}

export function validateNutrition(n: FoodNutrition): NutritionError | null {
  const fields: Array<[keyof FoodNutrition, string, string]> = [
    ['minKcal', '최소 열량', n.minKcal],
    ['maxKcal', '최대 열량', n.maxKcal],
    ['minProtein', '단백질 최소량', n.minProtein],
  ]
  for (const [field, label, value] of fields) {
    if (value.trim() !== '' && !isNonNegativeNumber(value)) {
      return { field, message: `${label}은 0 이상의 숫자로 입력해 주세요.` }
    }
  }
  if (
    n.minKcal.trim() !== '' &&
    n.maxKcal.trim() !== '' &&
    Number(n.minKcal) > Number(n.maxKcal)
  ) {
    // 어느 한쪽이 틀렸다고 단정할 수 없어 최대 열량 입력에 오류를 연결한다.
    return {
      field: 'maxKcal',
      message: '최소 열량이 최대 열량보다 클 수 없어요.',
    }
  }
  return null
}

/** 입력한 숫자를 정규화한다(007 → 7, 120.50 → 120.5). 빈 값은 그대로 둔다. 검증을 통과한 값에만 쓴다. */
export function normalizeNumber(value: string): string {
  const v = value.trim()
  return v === '' ? '' : String(Number(v))
}

/** 주소(?q=&type=&kind=&minKcal=&maxKcal=&minProtein=&view=results)에서 조건과 화면 상태를 읽는다. 허용되지 않은 값은 무시한다. */
export function parseFoodCriteria(params: URLSearchParams): {
  criteria: FoodCriteria
  showResults: boolean
} {
  const typeParam = params.get('type')
  const type =
    typeParam !== null && (FOOD_TYPES as readonly string[]).includes(typeParam)
      ? typeParam
      : null
  const kindParam = params.get('kind')
  const kind =
    kindParam !== null && kindsFor(type).includes(kindParam) ? kindParam : null
  const nutrition: FoodNutrition = {
    minKcal: params.get('minKcal') ?? '',
    maxKcal: params.get('maxKcal') ?? '',
    minProtein: params.get('minProtein') ?? '',
  }
  // 검증을 통과하지 못하는 상세 필터 값은 통째로 무시한다(일부만 남기면 의미가 달라진다).
  const clean =
    validateNutrition(nutrition) === null ? nutrition : EMPTY_NUTRITION
  return {
    criteria: {
      query: (params.get('q') ?? '').trim().slice(0, MAX_FOOD_QUERY),
      type,
      kind,
      nutrition: {
        minKcal: normalizeNumber(clean.minKcal),
        maxKcal: normalizeNumber(clean.maxKcal),
        minProtein: normalizeNumber(clean.minProtein),
      },
    },
    showResults: params.get('view') === 'results',
  }
}

/** 조건을 주소로 만든다. 값이 있는 조건만 담는다. */
export function foodCriteriaUrl(
  criteria: FoodCriteria,
  showResults: boolean,
): string {
  const params = new URLSearchParams()
  const query = criteria.query.trim()
  if (query) params.set('q', query)
  if (criteria.type) params.set('type', criteria.type)
  if (criteria.kind) params.set('kind', criteria.kind)
  for (const key of ['minKcal', 'maxKcal', 'minProtein'] as const) {
    const value = criteria.nutrition[key].trim()
    if (value) params.set(key, value)
  }
  if (showResults) params.set('view', 'results')
  const text = params.toString()
  return text ? `/foods?${text}` : '/foods'
}

export type FoodTagKey =
  'query' | 'type' | 'kind' | 'minKcal' | 'maxKcal' | 'minProtein'

/** 결과 화면의 "적용한 조건" 태그. 하나씩 해제할 수 있도록 key를 함께 준다. 조건이 없으면 빈 배열이다. */
export function foodTags(
  criteria: FoodCriteria,
): Array<{ key: FoodTagKey; label: string }> {
  const tags: Array<{ key: FoodTagKey; label: string }> = []
  if (criteria.query.trim())
    tags.push({ key: 'query', label: `검색어: ${criteria.query.trim()}` })
  if (criteria.type)
    tags.push({ key: 'type', label: `식품 구분: ${criteria.type}` })
  if (criteria.kind)
    tags.push({ key: 'kind', label: `음식 종류: ${criteria.kind}` })
  if (criteria.nutrition.minKcal)
    tags.push({
      key: 'minKcal',
      label: `100g당 ${criteria.nutrition.minKcal}kcal 이상`,
    })
  if (criteria.nutrition.maxKcal)
    tags.push({
      key: 'maxKcal',
      label: `100g당 ${criteria.nutrition.maxKcal}kcal 이하`,
    })
  if (criteria.nutrition.minProtein)
    tags.push({
      key: 'minProtein',
      label: `단백질 ${criteria.nutrition.minProtein}g 이상`,
    })
  return tags
}

/** 태그 하나를 해제한 조건. 식품 구분을 해제하면 그 구분에 속하던 음식 종류도 함께 푼다. */
export function withoutTag(
  criteria: FoodCriteria,
  key: FoodTagKey,
): FoodCriteria {
  switch (key) {
    case 'query':
      return { ...criteria, query: '' }
    case 'type':
      return { ...criteria, type: null, kind: null }
    case 'kind':
      return { ...criteria, kind: null }
    default:
      return {
        ...criteria,
        nutrition: { ...criteria.nutrition, [key]: '' },
      }
  }
}

/** 상세 필터 행에 보이는 값. 설정한 조건이 있으면 개수, 없으면 안내 문구. */
export function nutritionSummary(n: FoodNutrition): string {
  const count = [n.minKcal, n.maxKcal, n.minProtein].filter(
    (v) => v !== '',
  ).length
  return count > 0 ? `${count}개 조건` : '열량 · 단백질'
}

/**
 * 음식 검색 한 번의 결과.
 * - unavailable: 데이터 소스(검색 API·데이터)가 연결되지 않았다. "결과 없음"이나 "오류"가 아니다.
 * - error: 연결은 되어 있으나 검색에 실패했다.
 * - results: 성공. 목록이 비어 있으면 "결과 없음"이다.
 */
export type FoodSearchOutcome =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'results'; items: readonly FoodResult[] }

/**
 * 음식 검색 처리 경계. 음식 탐색 화면은 이 인터페이스만 안다.
 * 검색 API가 정해지면 이 인터페이스를 구현한 객체로 `foodBackend`를 교체한다.
 */
export interface FoodBackend {
  /** 데이터 소스가 실제로 연결되어 있는지. false이면 화면이 준비 중임을 미리 알린다. */
  readonly connected: boolean
  search(criteria: FoodCriteria): Promise<FoodSearchOutcome>
}

/**
 * 현재 연결. 음식 검색 API와 데이터가 없어서 항상 "데이터 소스 미연결"을 돌려준다.
 * 가짜 음식을 만들지 않고, 결과 없음·오류로도 처리하지 않는다.
 */
export const foodBackend: FoodBackend = {
  connected: false,
  search: () => Promise.resolve({ status: 'unavailable' }),
}
