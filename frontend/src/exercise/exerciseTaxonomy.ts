/**
 * 운동 분류(난이도·운동 도구·운동 부위). 운동 탐색(E01)의 필터와 운동 데이터(Exercise)가 같은 값을 쓴다.
 *
 * 값은 화면명세 v5.0 E01(스토리보드 v5.0)의 필터를 따른다. 운동 검색 API(GET /api/v1/exercises)는 명세서에 경로만 있고 요청·응답
 * 구조가 정의되지 않았으므로(frontend/docs/api-status.md) 아래 값은 화면과 개발용 Mock이 맞춰 쓰는 것이며 API 코드값이 아니다.
 * 백엔드와 확정되면 맞춘다.
 */

export const DIFFICULTIES = ['초급', '중급', '고급'] as const
export type ExerciseDifficulty = (typeof DIFFICULTIES)[number]

export const TOOLS = [
  '덤벨',
  '맨몸',
  '밴드',
  '폼롤러',
  '마사지볼',
  '풀업 바',
] as const
export type ExerciseTool = (typeof TOOLS)[number]

/** 운동 부위: 큰 분류 제목 아래 세부 부위가 있다(스토리보드 v5.0). 세부 부위 하나 또는 큰 분류 전체를 고를 수 있다. */
export const BODY_PART_GROUPS: ReadonlyArray<{
  label: string
  parts: readonly string[]
}> = [
  { label: '상체', parts: ['등', '가슴', '어깨', '팔'] },
  { label: '하체', parts: ['엉덩이', '허벅지', '종아리'] },
  { label: '코어', parts: ['복부', '허리'] },
  { label: '전신', parts: ['유산소', '스트레칭'] },
]

export const ALL_PARTS: readonly string[] = BODY_PART_GROUPS.flatMap(
  (g) => g.parts,
)

/** 부위 필터가 받는 값: 세부 부위 또는 큰 분류(상체·하체·코어·전신) 이름. */
export const ALL_PART_FILTER_VALUES: readonly string[] = [
  ...BODY_PART_GROUPS.map((g) => g.label),
  ...ALL_PARTS,
]
