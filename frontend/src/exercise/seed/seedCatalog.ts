import { BODY_PART_GROUPS } from '../exerciseTaxonomy.ts'
import type {
  Exercise,
  ExerciseCategory,
  ExerciseQuery,
} from '../exerciseTypes.ts'
import { filterExercises } from '../mock/filterExercises.ts'
import type {
  Routine,
  RoutineItem,
  RoutineWithExercises,
} from '../routineTypes.ts'
import {
  SEED_DIFFICULTY_LABEL,
  SEED_EQUIPMENT_TOOL,
  describeSeedIssue,
  validateSeed,
  type SeedExerciseRow,
  type SeedIssue,
  type SeedRoutineItemRow,
  type SeedRoutineRow,
} from './seedValidation.ts'

/**
 * 운동 JSON 시드의 조회 계층(운동·루틴·루틴 항목). 원본 행(seedValidation의 Seed*Row)을 화면용 모델(Exercise·Routine·RoutineItem)로 바꿔
 * 메모리에 한 번 만들어 두고, 여기서만 조회한다. 컴포넌트는 원본 JSON이나 원본 행을 직접 만지지 않는다.
 *
 * - 순수 함수다(원본을 인자로 받는다). 원본 JSON을 읽는 곳은 seedData.ts 하나다.
 * - id는 원본 exercise_id·routine_id를 문자열로 바꾼 값이며 새로 만들거나 바꾸지 않는다. 운동 이름은 표시용이고 식별자가 아니다.
 * - 원본이 올바르지 않으면 SeedDataError를 던진다. 문제 있는 운동을 빼거나 다른 운동으로 바꾸지 않는다.
 * - 반환하는 값은 읽기 전용(얼린 객체)이다.
 * - 원본의 created_at·updated_at은 화면이 쓰지 않아 모델에 담지 않는다. 원본에는 그대로 있다.
 * - 이 계층은 운동의 기록 방식을 스스로 추론하지 않는다. 원본 행에 기록 방식 메타데이터(default_record_mode·allowed_record_modes)가 있으면
 *   Exercise.recordModes에 카탈로그 코드 그대로 담고, 없으면 담지 않는다. 기본 기록 방식 결정은 운동 목록 쪽 규칙
 *   (workoutDraftModel.defaultRecordType: 메타데이터 우선, 없으면 기존 추론)이고, 루틴 항목의 목표값은 값이 있는 쪽(횟수 또는 시간)만 그대로 돌려준다.
 */

export class SeedDataError extends Error {
  readonly issues: readonly SeedIssue[]
  constructor(issues: readonly SeedIssue[]) {
    const head = issues.slice(0, 5).map(describeSeedIssue).join('\n')
    const more = issues.length > 5 ? `\n… 외 ${issues.length - 5}건` : ''
    super(
      `운동 JSON 시드가 올바르지 않습니다(${issues.length}건):\n${head}${more}`,
    )
    this.name = 'SeedDataError'
    this.issues = issues
  }
}

export interface SeedCatalog {
  getAllExercises(): readonly Exercise[]
  /** 없으면 null. 알 수 없는 id를 다른 운동으로 바꾸지 않는다. */
  getExerciseById(exerciseId: string): Exercise | null
  /** 운동 이름 검색(부분 일치, 대소문자·공백 무시). 빈 검색어면 전체. */
  searchExercises(query: string): readonly Exercise[]
  /** 난이도·부위·도구 조건(서로 독립, null은 전체). 이름 검색어까지 함께 쓰려면 queryExercises를 쓴다. */
  filterExercises(
    filters: Pick<ExerciseQuery, 'difficulty' | 'part' | 'tool'>,
  ): readonly Exercise[]
  /** 이름·난이도·부위·도구 조건을 함께 적용한다(ExerciseRepository.list와 같은 규칙). */
  queryExercises(query: ExerciseQuery): readonly Exercise[]
  getAllRoutines(): readonly Routine[]
  getRoutineById(routineId: string): Routine | null
  /** 루틴의 항목(sequence_number 순서). 루틴이 없으면 null. */
  getRoutineItems(routineId: string): readonly RoutineItem[] | null
  /** 루틴과 항목별 운동 정보. 루틴이 없으면 null. */
  getRoutineWithExercises(routineId: string): RoutineWithExercises | null
}

function categoryOf(exerciseType: string): ExerciseCategory {
  const group = BODY_PART_GROUPS.find((g) => g.parts.includes(exerciseType))
  // validateSeed가 exercise_type을 확인했으므로 항상 찾는다.
  return (group?.label ?? '전신') as ExerciseCategory
}

function toExercise(row: SeedExerciseRow): Exercise {
  const exercise: Exercise = {
    id: String(row.exercise_id),
    name: row.name,
    category: categoryOf(row.exercise_type),
    targetMuscles: [row.exercise_type],
    difficulty: SEED_DIFFICULTY_LABEL[row.difficulty],
    equipment: [SEED_EQUIPMENT_TOOL[row.exercise_equipment]],
    // 원본은 단계로 나뉘어 있지 않아 단계 목록은 비우고, 소개(instructions)·방법(description)을 각각 담는다.
    instructions: [],
    precautions: [row.cautions],
    summary: row.instructions,
    description: row.description,
  }
  if (row.source_url !== null) exercise.sourceUrl = row.source_url
  // 기록 방식 메타데이터는 있을 때만 담는다(validateSeed가 둘이 함께 있고 올바름을 확인했다). 카탈로그 코드 그대로 두고 변환하지 않는다.
  if (
    row.default_record_mode !== undefined &&
    row.allowed_record_modes !== undefined
  ) {
    exercise.recordModes = Object.freeze({
      default: row.default_record_mode,
      allowed: Object.freeze([...row.allowed_record_modes]),
    })
  }
  return Object.freeze(exercise)
}

function toRoutine(row: SeedRoutineRow): Routine {
  return Object.freeze({
    id: String(row.routine_id),
    name: row.routine_name,
    description: row.description,
    difficulty: SEED_DIFFICULTY_LABEL[row.difficulty],
    ownerUserId: row.owner_user_id === null ? null : String(row.owner_user_id),
    isTemplate: row.is_template,
    visibility: row.visibility,
  })
}

function toRoutineItem(row: SeedRoutineItemRow): RoutineItem {
  return Object.freeze({
    id: String(row.exercise_routine_item_id),
    routineId: String(row.routine_id),
    exerciseId: String(row.exercise_id),
    sequenceNumber: row.sequence_number,
    targetSets: row.target_sets,
    targetReps: row.target_reps,
    targetDurationSeconds: row.target_duration_seconds,
    restSeconds: row.rest_seconds,
  })
}

const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase()

/** 원본 3종으로 조회 계층을 만든다. 원본이 올바르지 않으면 SeedDataError. */
export function createSeedCatalog(raw: {
  exercises: unknown
  routines: unknown
  routineItems: unknown
}): SeedCatalog {
  const validation = validateSeed(raw)
  if (!validation.ok) throw new SeedDataError(validation.issues)
  const { data } = validation

  const exercises = Object.freeze(data.exercises.map(toExercise))
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))
  const routines = Object.freeze(data.routines.map(toRoutine))
  const routineById = new Map(routines.map((r) => [r.id, r]))

  const itemsByRoutine = new Map<string, RoutineItem[]>()
  for (const row of data.routineItems) {
    const item = toRoutineItem(row)
    const list = itemsByRoutine.get(item.routineId) ?? []
    list.push(item)
    itemsByRoutine.set(item.routineId, list)
  }
  for (const [routineId, list] of itemsByRoutine) {
    itemsByRoutine.set(
      routineId,
      list.sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    )
  }

  return {
    getAllExercises: () => exercises,

    getExerciseById: (exerciseId) => exerciseById.get(exerciseId) ?? null,

    searchExercises(query) {
      const text = normalize(query)
      return text === ''
        ? exercises
        : exercises.filter((e) => normalize(e.name).includes(text))
    },

    filterExercises: (filters) =>
      filterExercises(exercises, { query: '', ...filters }),

    queryExercises: (query) => filterExercises(exercises, query),

    getAllRoutines: () => routines,

    getRoutineById: (routineId) => routineById.get(routineId) ?? null,

    getRoutineItems(routineId) {
      const items = itemsByRoutine.get(routineId)
      return items ? Object.freeze([...items]) : null
    },

    getRoutineWithExercises(routineId) {
      const routine = routineById.get(routineId)
      const items = itemsByRoutine.get(routineId)
      if (!routine || !items) return null
      return Object.freeze({
        ...routine,
        items: Object.freeze(
          items.map((item) =>
            Object.freeze({
              ...item,
              // validateSeed가 참조를 확인했으므로 항상 있다.
              exercise: exerciseById.get(item.exerciseId) as Exercise,
            }),
          ),
        ),
      })
    },
  }
}
