import {
  ALL_PARTS,
  TOOLS,
  type ExerciseDifficulty,
  type ExerciseTool,
} from '../exerciseTaxonomy.ts'
import {
  validateRecordModes,
  type CatalogRecordMode,
  type RecordModeIssue,
} from '../recordMode.ts'

/**
 * 운동 JSON 시드 3종(exercises·exercise_routines·exercise_routine_items)의 검증. 순수 함수이며 파일·화면과 무관하다.
 *
 * 원본은 외부 입력으로 본다. 올바르지 않은 항목은 조용히 빼거나 다른 운동으로 바꾸지 않고, 모든 문제를 모아 돌려준다
 * (호출한 쪽이 데이터 전체를 쓰지 않고 원인을 알린다). 원본 값은 바꾸지 않는다.
 */

export type SeedFile = 'exercises' | 'routines' | 'routineItems'

export interface SeedIssue {
  file: SeedFile
  /** 배열에서의 위치(0부터). 파일 전체의 문제면 없다. */
  index?: number
  /** 해당 행의 id(있을 때). */
  id?: number
  field?: string
  message: string
}

// ─── 원본 행 ────────────────────────────────────────────────

export interface SeedExerciseRow {
  exercise_id: number
  name: string
  instructions: string
  difficulty: SeedDifficulty
  exercise_type: string
  exercise_equipment: string
  description: string
  cautions: string
  source_url: string | null
  /**
   * 기록 방식 메타데이터(선택). 둘은 함께 있거나 함께 없어야 한다. 없는 운동은 기존 추론 규칙(workoutDraftModel.defaultRecordType)을 쓴다.
   * 카탈로그 코드를 쓰며 중량+횟수형은 `weight_reps`다(저장 코드 `weight`로의 변환은 recordMode.toStoredRecordType).
   */
  default_record_mode?: CatalogRecordMode
  allowed_record_modes?: readonly CatalogRecordMode[]
  created_at: string
  updated_at: string
}

export interface SeedRoutineRow {
  routine_id: number
  owner_user_id: number | string | null
  routine_name: string
  description: string
  difficulty: SeedDifficulty
  is_template: boolean
  visibility: SeedVisibility
  created_at: string
  updated_at: string
}

export interface SeedRoutineItemRow {
  exercise_routine_item_id: number
  exercise_id: number
  routine_id: number
  sequence_number: number
  target_sets: number
  target_reps: number | null
  target_duration_seconds: number | null
  rest_seconds: number | null
  created_at: string
}

export type SeedDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type SeedVisibility = 'private' | 'shared' | 'public'

export interface ValidSeed {
  exercises: readonly SeedExerciseRow[]
  routines: readonly SeedRoutineRow[]
  routineItems: readonly SeedRoutineItemRow[]
}

export type SeedValidation =
  { ok: true; data: ValidSeed } | { ok: false; issues: readonly SeedIssue[] }

// ─── 값 규칙 ────────────────────────────────────────────────

/** 원본 난이도 → 화면 난이도. */
export const SEED_DIFFICULTY_LABEL: Record<SeedDifficulty, ExerciseDifficulty> =
  {
    beginner: '초급',
    intermediate: '중급',
    advanced: '고급',
  }

/**
 * 원본 장비 값 → 화면 도구(TOOLS). 값은 하나씩만 대응시키며 모르는 장비는 오류다(다른 도구로 바꾸지 않는다).
 * 원본의 `풀업바`는 화면 분류의 `풀업 바`와 띄어쓰기만 다르다.
 */
export const SEED_EQUIPMENT_TOOL: Record<string, ExerciseTool> = {
  덤벨: '덤벨',
  맨몸: '맨몸',
  밴드: '밴드',
  폼롤러: '폼롤러',
  마사지볼: '마사지볼',
  풀업바: '풀업 바',
}

const VISIBILITIES: readonly SeedVisibility[] = ['private', 'shared', 'public']

/** 루틴 항목 값의 범위. 운동 목록 모델(workoutDraftModel)의 한도와 같거나 안쪽이다. */
export const SEED_LIMITS = {
  maxSetsPerItem: 200,
  maxReps: 999,
  maxDurationSeconds: 3600,
  maxRestSeconds: 3600,
} as const

const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const HTTP_URL = /^https?:\/\/\S+$/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  TIMESTAMP.test(value) &&
  Number.isFinite(Date.parse(value.replace(' ', 'T') + 'Z'))

/** 기록 방식 메타데이터 오류의 필드와 설명. */
const RECORD_MODE_ISSUE: Record<
  RecordModeIssue,
  { field: string; message: string }
> = {
  defaultInvalid: {
    field: 'default_record_mode',
    message:
      'default_record_mode는 time·reps·weight_reps·time_reps·weight_time 중 하나여야 합니다.',
  },
  allowedNotArray: {
    field: 'allowed_record_modes',
    message: 'allowed_record_modes가 배열이 아닙니다.',
  },
  allowedEmpty: {
    field: 'allowed_record_modes',
    message: 'allowed_record_modes가 비어 있습니다.',
  },
  allowedInvalidValue: {
    field: 'allowed_record_modes',
    message:
      'allowed_record_modes에 time·reps·weight_reps·time_reps·weight_time이 아닌 값이 있습니다.',
  },
  allowedDuplicate: {
    field: 'allowed_record_modes',
    message: 'allowed_record_modes에 같은 값이 중복됩니다.',
  },
  defaultNotAllowed: {
    field: 'default_record_mode',
    message:
      'default_record_mode가 allowed_record_modes에 포함되어 있지 않습니다.',
  },
}

/** 행마다 같은 방식으로 문제를 모은다. */
class Collector {
  readonly issues: SeedIssue[] = []
  private readonly file: SeedFile
  constructor(file: SeedFile) {
    this.file = file
  }

  add(index: number, id: number | undefined, field: string, message: string) {
    this.issues.push({ file: this.file, index, id, field, message })
  }

  fileLevel(message: string) {
    this.issues.push({ file: this.file, message })
  }
}

function rowId(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key]
  return typeof value === 'number' ? value : undefined
}

function checkText(
  c: Collector,
  index: number,
  id: number | undefined,
  row: Record<string, unknown>,
  field: string,
) {
  if (!isText(row[field])) {
    c.add(index, id, field, `${field}가 비어 있거나 문자열이 아닙니다.`)
  }
}

function checkTimestamps(
  c: Collector,
  index: number,
  id: number | undefined,
  row: Record<string, unknown>,
  fields: readonly string[],
) {
  for (const field of fields) {
    if (!isTimestamp(row[field])) {
      c.add(
        index,
        id,
        field,
        `${field}가 'YYYY-MM-DD HH:mm:ss' 형식이 아닙니다.`,
      )
    }
  }
}

function checkUniqueId(
  c: Collector,
  rows: readonly unknown[],
  key: string,
): Set<number> {
  const seen = new Set<number>()
  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const id = row[key]
    if (!isPositiveInt(id)) {
      c.add(index, undefined, key, `${key}가 1 이상의 정수가 아닙니다.`)
      return
    }
    if (seen.has(id)) {
      c.add(index, id, key, `${key} ${id}가 중복됩니다.`)
    }
    seen.add(id)
  })
  return seen
}

function requireArray(
  c: Collector,
  raw: unknown,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(raw)) {
    c.fileLevel(`${label}가 배열이 아닙니다.`)
    return []
  }
  if (raw.length === 0) c.fileLevel(`${label}가 비어 있습니다.`)
  raw.forEach((row, index) => {
    if (!isRecord(row)) {
      c.add(index, undefined, '(행)', '행이 객체가 아닙니다.')
    }
  })
  return raw
}

// ─── 파일별 검증 ────────────────────────────────────────────

function validateExercises(c: Collector, raw: unknown): Set<number> {
  const rows = requireArray(c, raw, 'exercises')
  const ids = checkUniqueId(c, rows, 'exercise_id')
  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const id = rowId(row, 'exercise_id')
    for (const field of [
      'name',
      'instructions',
      'description',
      'cautions',
    ] as const) {
      checkText(c, index, id, row, field)
    }
    if (!Object.hasOwn(SEED_DIFFICULTY_LABEL, String(row.difficulty))) {
      c.add(
        index,
        id,
        'difficulty',
        `difficulty '${String(row.difficulty)}'는 beginner·intermediate·advanced가 아닙니다.`,
      )
    }
    if (
      typeof row.exercise_type !== 'string' ||
      !ALL_PARTS.includes(row.exercise_type)
    ) {
      c.add(
        index,
        id,
        'exercise_type',
        `exercise_type '${String(row.exercise_type)}'는 운동 부위 분류(${ALL_PARTS.join('·')})에 없습니다.`,
      )
    }
    const equipment = row.exercise_equipment
    if (
      typeof equipment !== 'string' ||
      !Object.hasOwn(SEED_EQUIPMENT_TOOL, equipment) ||
      !TOOLS.includes(SEED_EQUIPMENT_TOOL[equipment])
    ) {
      c.add(
        index,
        id,
        'exercise_equipment',
        `exercise_equipment '${String(equipment)}'는 알려진 운동 도구가 아닙니다.`,
      )
    }
    const url = row.source_url
    if (url !== null && !(typeof url === 'string' && HTTP_URL.test(url))) {
      c.add(
        index,
        id,
        'source_url',
        'source_url은 null이거나 http(s) 주소여야 합니다(빈 문자열은 허용하지 않습니다).',
      )
    }
    // 기록 방식 메타데이터(선택): 있으면 둘 다 있어야 하고 모든 불변식을 지켜야 한다. 둘 다 없으면 기존 추론을 쓴다.
    const hasDefaultMode = Object.hasOwn(row, 'default_record_mode')
    const hasAllowedModes = Object.hasOwn(row, 'allowed_record_modes')
    if (hasDefaultMode !== hasAllowedModes) {
      c.add(
        index,
        id,
        hasDefaultMode ? 'allowed_record_modes' : 'default_record_mode',
        'default_record_mode와 allowed_record_modes는 함께 있거나 함께 없어야 합니다.',
      )
    } else if (hasDefaultMode) {
      const modes = validateRecordModes(
        row.default_record_mode,
        row.allowed_record_modes,
      )
      if (!modes.ok) {
        for (const issue of modes.issues) {
          const info = RECORD_MODE_ISSUE[issue]
          c.add(index, id, info.field, info.message)
        }
      }
    }
    checkTimestamps(c, index, id, row, ['created_at', 'updated_at'])
  })
  return ids
}

function validateRoutines(c: Collector, raw: unknown): Set<number> {
  const rows = requireArray(c, raw, 'routines')
  const ids = checkUniqueId(c, rows, 'routine_id')
  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const id = rowId(row, 'routine_id')
    checkText(c, index, id, row, 'routine_name')
    checkText(c, index, id, row, 'description')
    if (!Object.hasOwn(SEED_DIFFICULTY_LABEL, String(row.difficulty))) {
      c.add(
        index,
        id,
        'difficulty',
        `difficulty '${String(row.difficulty)}'는 beginner·intermediate·advanced가 아닙니다.`,
      )
    }
    const owner = row.owner_user_id
    if (!(owner === null || isPositiveInt(owner) || isText(owner))) {
      c.add(
        index,
        id,
        'owner_user_id',
        'owner_user_id는 null이거나 정수·비어 있지 않은 문자열이어야 합니다.',
      )
    }
    if (typeof row.is_template !== 'boolean') {
      c.add(index, id, 'is_template', 'is_template가 true·false가 아닙니다.')
    }
    if (!VISIBILITIES.includes(row.visibility as SeedVisibility)) {
      c.add(
        index,
        id,
        'visibility',
        `visibility '${String(row.visibility)}'는 private·shared·public이 아닙니다.`,
      )
    }
    checkTimestamps(c, index, id, row, ['created_at', 'updated_at'])
  })
  return ids
}

function validateRoutineItems(
  c: Collector,
  raw: unknown,
  exerciseIds: ReadonlySet<number>,
  routineIds: ReadonlySet<number>,
) {
  const rows = requireArray(c, raw, 'routineItems')
  checkUniqueId(c, rows, 'exercise_routine_item_id')
  const sequences = new Map<number, Set<number>>()
  const itemCount = new Map<number, number>()

  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const id = rowId(row, 'exercise_routine_item_id')
    const exerciseId = row.exercise_id
    const routineId = row.routine_id
    if (!isPositiveInt(exerciseId) || !exerciseIds.has(exerciseId)) {
      c.add(
        index,
        id,
        'exercise_id',
        `exercise_id ${String(exerciseId)}에 해당하는 운동이 없습니다.`,
      )
    }
    if (!isPositiveInt(routineId) || !routineIds.has(routineId)) {
      c.add(
        index,
        id,
        'routine_id',
        `routine_id ${String(routineId)}에 해당하는 루틴이 없습니다.`,
      )
    }
    const sequence = row.sequence_number
    if (!isPositiveInt(sequence)) {
      c.add(
        index,
        id,
        'sequence_number',
        'sequence_number가 1 이상의 정수가 아닙니다.',
      )
    } else if (isPositiveInt(routineId)) {
      const used = sequences.get(routineId) ?? new Set<number>()
      if (used.has(sequence)) {
        c.add(
          index,
          id,
          'sequence_number',
          `루틴 ${routineId}에서 sequence_number ${sequence}가 중복됩니다.`,
        )
      }
      used.add(sequence)
      sequences.set(routineId, used)
    }
    if (isPositiveInt(routineId)) {
      itemCount.set(routineId, (itemCount.get(routineId) ?? 0) + 1)
    }

    const sets = row.target_sets
    if (!isPositiveInt(sets) || sets > SEED_LIMITS.maxSetsPerItem) {
      c.add(
        index,
        id,
        'target_sets',
        `target_sets는 1~${SEED_LIMITS.maxSetsPerItem}의 정수여야 합니다.`,
      )
    }
    const reps = row.target_reps
    const seconds = row.target_duration_seconds
    const hasReps = reps !== null && reps !== undefined
    const hasSeconds = seconds !== null && seconds !== undefined
    if (hasReps === hasSeconds) {
      c.add(
        index,
        id,
        'target_reps',
        'target_reps와 target_duration_seconds 중 정확히 하나만 값이 있어야 합니다.',
      )
    }
    if (hasReps && (!isPositiveInt(reps) || reps > SEED_LIMITS.maxReps)) {
      c.add(
        index,
        id,
        'target_reps',
        `target_reps는 1~${SEED_LIMITS.maxReps}의 정수여야 합니다.`,
      )
    }
    if (
      hasSeconds &&
      (!isPositiveInt(seconds) || seconds > SEED_LIMITS.maxDurationSeconds)
    ) {
      c.add(
        index,
        id,
        'target_duration_seconds',
        `target_duration_seconds는 1~${SEED_LIMITS.maxDurationSeconds}초의 정수여야 합니다.`,
      )
    }
    const rest = row.rest_seconds
    if (
      rest !== null &&
      !(
        typeof rest === 'number' &&
        Number.isInteger(rest) &&
        rest >= 0 &&
        rest <= SEED_LIMITS.maxRestSeconds
      )
    ) {
      c.add(
        index,
        id,
        'rest_seconds',
        `rest_seconds는 null이거나 0~${SEED_LIMITS.maxRestSeconds}의 정수여야 합니다.`,
      )
    }
    checkTimestamps(c, index, id, row, ['created_at'])
  })

  for (const routineId of routineIds) {
    if (!itemCount.has(routineId)) {
      c.fileLevel(`루틴 ${routineId}에 운동 항목이 하나도 없습니다.`)
    }
  }
}

/** 시드 3종을 검증한다. 문제가 하나라도 있으면 모두 모아 돌려주며 데이터는 돌려주지 않는다. */
export function validateSeed(raw: {
  exercises: unknown
  routines: unknown
  routineItems: unknown
}): SeedValidation {
  const exercisesC = new Collector('exercises')
  const routinesC = new Collector('routines')
  const itemsC = new Collector('routineItems')
  const exerciseIds = validateExercises(exercisesC, raw.exercises)
  const routineIds = validateRoutines(routinesC, raw.routines)
  validateRoutineItems(itemsC, raw.routineItems, exerciseIds, routineIds)
  const issues = [...exercisesC.issues, ...routinesC.issues, ...itemsC.issues]
  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    data: {
      exercises: raw.exercises as readonly SeedExerciseRow[],
      routines: raw.routines as readonly SeedRoutineRow[],
      routineItems: raw.routineItems as readonly SeedRoutineItemRow[],
    },
  }
}

/** 문제 한 건을 한 줄로(개발 콘솔·오류 메시지용). */
export function describeSeedIssue(issue: SeedIssue): string {
  const where =
    issue.index === undefined
      ? issue.file
      : `${issue.file}[${issue.index}]${issue.id === undefined ? '' : `(id ${issue.id})`}`
  return `${where}${issue.field ? `.${issue.field}` : ''}: ${issue.message}`
}
