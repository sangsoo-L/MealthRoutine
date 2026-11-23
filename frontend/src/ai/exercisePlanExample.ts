/**
 * I02 AI 운동 플랜 안내의 "고정 예시" 데이터와 재생 프레임(순수 함수). 실제 AI 추천 결과가 아니며 AI·저장소·초안·체험 횟수를 쓰지 않는다.
 *
 * 예시의 운동은 모두 기존 운동 카탈로그(105개)에 있는 운동의 id·이름이다. 기록 방식은 카탈로그가 허용하는 방식과 호환된다
 * (횟수형 reps, 시간형 time, 중량+횟수형 weight). 중량은 자동으로 권장하지 않으므로 값을 만들지 않고 "직접 입력"으로만 안내한다.
 * 세트·횟수·시간·휴식은 그 운동의 **같은 난이도 시드 루틴 항목**의 값 그대로이고, 각 예시는 I02-1 로컬 예시 추천(buildLocalPlan)이 같은 조건·
 * 첫 구성(rotation 0)에서 만드는 결과와 같다. 카탈로그·근거·I02-1 결과와의 일치는 테스트가 확인한다.
 */
export type ExampleKey = 'bodyweight' | 'dumbbell'

/** 표시용 기록 방식. 저장 코드와 같은 이름이다(weight = 중량+횟수). */
export type ExampleRecordType = 'reps' | 'time' | 'weight'

export interface ExampleRow {
  /** 카탈로그 운동 id */
  exerciseId: string
  /** 카탈로그 운동 이름 */
  name: string
  recordType: ExampleRecordType
  sets: number
  /** 세트 사이 휴식(초). 시드 루틴 항목의 rest_seconds 그대로다. */
  restSeconds: number
  /** 횟수형·중량+횟수형의 세트당 횟수 */
  reps?: number
  /** 시간형의 세트당 목표 시간(초) */
  seconds?: number
}

export interface ExampleConditions {
  difficulty: '초급' | '중급'
  parts: readonly string[]
  tools: readonly string[]
  /** 휴식 포함 요청 시간(분) */
  minutes: 10 | 20
}

export interface PlanExample {
  key: ExampleKey
  tabLabel: string
  conditions: ExampleConditions
  rows: readonly ExampleRow[]
}

export const PLAN_EXAMPLES: readonly PlanExample[] = [
  {
    key: 'bodyweight',
    tabLabel: '맨몸 · 10분',
    conditions: {
      difficulty: '초급',
      parts: ['상체', '하체', '코어'],
      tools: ['맨몸'],
      minutes: 10,
    },
    rows: [
      {
        exerciseId: '4',
        name: '월 푸시업',
        recordType: 'reps',
        sets: 2,
        reps: 8,
        restSeconds: 60,
      },
      {
        exerciseId: '13',
        name: '글루트 브리지',
        recordType: 'reps',
        sets: 2,
        reps: 8,
        restSeconds: 60,
      },
      {
        exerciseId: '22',
        name: '플랭크',
        recordType: 'time',
        sets: 2,
        seconds: 20,
        restSeconds: 60,
      },
    ],
  },
  {
    key: 'dumbbell',
    tabLabel: '덤벨 · 20분',
    conditions: {
      difficulty: '중급',
      parts: ['상체', '하체'],
      tools: ['덤벨'],
      minutes: 20,
    },
    rows: [
      {
        exerciseId: '2',
        name: '원암 덤벨 로우',
        recordType: 'weight',
        sets: 3,
        reps: 10,
        restSeconds: 75,
      },
      {
        exerciseId: '18',
        name: '덤벨 고블릿 스쿼트',
        recordType: 'weight',
        sets: 3,
        reps: 10,
        restSeconds: 75,
      },
      {
        exerciseId: '7',
        name: '덤벨 숄더 프레스',
        recordType: 'weight',
        sets: 3,
        reps: 10,
        restSeconds: 75,
      },
      {
        exerciseId: '21',
        name: '덤벨 카프 레이즈',
        recordType: 'weight',
        sets: 3,
        reps: 10,
        restSeconds: 75,
      },
    ],
  },
]

/** 입력 단계 이름(명세: 난이도 → 부위 → 도구 → 시간). */
export const INPUT_STEPS = ['난이도', '부위', '도구', '시간'] as const

/** 예시 한 번의 재생 장면. */
export type ExampleFrame =
  /** 조건을 한 단계씩 채운다(filled: 채워진 단계 수 1~4) */
  | { phase: 'input'; filled: 1 | 2 | 3 | 4 }
  /** 목록 구성 중(분석 로더 자리). AI 분석이라고 표현하지 않는다. */
  | { phase: 'loading' }
  /** 추천 행이 차례로 나타난다 */
  | { phase: 'rows'; shown: number }
  /** 날짜 선택 팝업(date가 null이면 고르기 전) */
  | { phase: 'register'; date: 'today' | 'tomorrow' | null }
  /** 등록 완료 안내 */
  | { phase: 'done'; date: 'today' | 'tomorrow' }

/** 예시의 등록 날짜는 첫 번째 예시는 오늘, 두 번째는 내일로 번갈아 보여 준다. */
export function registerDateOf(key: ExampleKey): 'today' | 'tomorrow' {
  return key === 'bodyweight' ? 'today' : 'tomorrow'
}

/** 한 예시의 재생 프레임 순서: 조건 입력 4장면 → 구성 중 → 행 1…n → 날짜 선택 → 날짜 고름 → 완료. */
export function buildFrames(example: PlanExample): ExampleFrame[] {
  const date = registerDateOf(example.key)
  const frames: ExampleFrame[] = [
    { phase: 'input', filled: 1 },
    { phase: 'input', filled: 2 },
    { phase: 'input', filled: 3 },
    { phase: 'input', filled: 4 },
    { phase: 'loading' },
  ]
  for (let shown = 1; shown <= example.rows.length; shown += 1) {
    frames.push({ phase: 'rows', shown })
  }
  frames.push(
    { phase: 'register', date: null },
    { phase: 'register', date },
    { phase: 'done', date },
  )
  return frames
}

/** 프레임별 머무는 시간(ms). 마지막 완료 장면은 읽을 시간을 더 준다. */
export const FRAME_MS = 1400
export const LAST_FRAME_MS = 2600

/** 모션 줄이기 환경에서 처음 보여 줄 정지 장면: 추천 목록이 모두 나온 장면(정보가 가장 많은 장면)이다. */
export function staticFrameIndex(example: PlanExample): number {
  return 5 + example.rows.length - 1
}

/** 한 행의 세트·횟수·시간 글자. 중량은 값을 만들지 않고 직접 입력으로 안내한다. */
export function rowDetail(row: ExampleRow): string {
  const amount =
    row.recordType === 'time'
      ? `${row.sets}세트 × ${row.seconds}초`
      : `${row.sets}세트 × ${row.reps}회`
  const rest = `세트 사이 휴식 ${row.restSeconds}초`
  return row.recordType === 'weight'
    ? `${amount} · ${rest} · 중량 직접 입력`
    : `${amount} · ${rest}`
}

export function conditionValue(
  conditions: ExampleConditions,
  step: (typeof INPUT_STEPS)[number],
): string {
  switch (step) {
    case '난이도':
      return conditions.difficulty
    case '부위':
      return conditions.parts.join(' · ')
    case '도구':
      return conditions.tools.join(' · ')
    case '시간':
      return `휴식 포함 ${conditions.minutes}분`
  }
}

export const DATE_LABEL = { today: '오늘', tomorrow: '내일' } as const
