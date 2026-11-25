import type { Exercise } from './exerciseTypes.ts'
import {
  RECORD_COMPONENTS,
  toStoredRecordType,
  type StoredRecordType,
} from './recordMode.ts'
import type {
  DraftDay,
  DraftIssue,
  DraftItem,
  DraftSet,
  DraftValidation,
  NormalizedItem,
  NormalizedSet,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import { RECORD_TYPES } from './workoutDraftTypes.ts'

/**
 * 운동 초안(W02)의 순수 편집·검증 함수. 화면·저장소와 무관하고 입력을 바꾸지 않는다(항상 새 객체를 돌려준다).
 * 편집할 때마다 updatedAt을 갱신한다(now로 시각을 바꿀 수 있어 테스트가 쉽다).
 */

/** 기본값은 "편집용 예시"이며 사용자가 최종 검토에서 확정한 값만 목록이 된다(명세 W02). */
export const DEFAULT_REPS = 10
export const DEFAULT_TARGET_SECONDS = 60
export const MIN_TARGET_SECONDS = 1
export const MAX_TARGET_SECONDS = 3600
/**
 * 목표 횟수·중량의 상한과 중량 자릿수. 서버의 세트 목표 규칙(docs/api_exercise_v1.0.md: reps 1~999, weightKg 0~999·소수 둘째 자리까지)과 같다.
 * 목록·계획·루틴은 완료 기록의 setTargets로 서버에 올라가므로, 이 규칙을 넘는 목표로 저장하면 그 목록으로 완료한 기록을 서버가 받지 않는다.
 * 그래서 새로 저장할 때(validateDraft) 이 규칙으로 막고 안내한다. 이미 저장된 데이터를 읽는 경로(parseWorkoutList 등)는 이 규칙을 쓰지 않는다.
 */
export const MAX_TARGET_REPS = 999
export const MAX_TARGET_WEIGHT_KG = 999

/** 목표 중량이 서버 규칙(0~999kg, 소수 둘째 자리까지) 안인지. 부동소수 오차(0.07 * 100 = 7.000000000000001)는 허용한다. */
export function isValidTargetWeightKg(value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TARGET_WEIGHT_KG) {
    return false
  }
  const cents = value * 100
  return Math.abs(cents - Math.round(cents)) <= 1e-6
}

/** 저장·화면 보호용 상한. 정상 사용에서는 닿지 않는 값이다(손상된 저장값을 걸러 내는 기준과 같다). */
export const MAX_ITEMS = 500
export const MAX_SETS_PER_ITEM = 200

const nowIso = () => new Date().toISOString()

export function createEmptyDraft(
  now: () => string = nowIso,
  day: DraftDay = 'today',
): WorkoutDraft {
  return { v: 1, day, items: [], updatedAt: now() }
}

export function hasDraftContent(draft: WorkoutDraft): boolean {
  return draft.items.length > 0
}

/** 기본 기록 방식을 정하는 데 읽는 운동 값. 기록 방식 메타데이터(recordModes)는 없을 수 있다. */
export type RecordTypeSource = Pick<Exercise, 'equipment' | 'targetMuscles'> &
  Partial<Pick<Exercise, 'recordModes'>>

/**
 * 기존 추론 규칙(스토리보드 v5.0 W02): 덤벨 운동은 중량형, 유산소·스트레칭은 시간형, 그 외는 횟수형이다.
 * 기록 방식 메타데이터가 없는 운동의 하위 호환용으로 그대로 유지한다. 운동 이름·장비로 새 예외를 더하지 않는다.
 */
function legacyRecordType(
  exercise: Pick<Exercise, 'equipment' | 'targetMuscles'>,
): RecordType {
  if ((exercise.equipment as readonly string[]).includes('덤벨'))
    return 'weight'
  if (
    exercise.targetMuscles.some(
      (part) => part === '유산소' || part === '스트레칭',
    )
  ) {
    return 'time'
  }
  return 'reps'
}

/**
 * 운동의 기본 기록 방식을 저장 코드(5종)로 정한다. 카탈로그 메타데이터의 기본값이 있으면 그것을 쓰고(weight_reps는 저장 코드 weight로 변환),
 * 없으면 기존 추론 규칙을 쓴다. 운동을 추가할 때 한 번 정해 명시 값으로 저장하고, 사용자가 이후 허용된 방식 안에서 바꿀 수 있다.
 * 복합 방식(time_reps·weight_time)도 그대로 돌려준다. 복합 방식 목록은 저장할 수 있지만 운동 시작은 막혀 있다(recordMode.RUNNABLE_RECORD_TYPES).
 */
export function resolveStoredRecordType(
  exercise: RecordTypeSource,
): StoredRecordType {
  const mode = exercise.recordModes?.default
  return mode === undefined
    ? legacyRecordType(exercise)
    : toStoredRecordType(mode)
}

/** 기록 방식 메타데이터가 없는 운동(옛 Mock·알 수 없는 운동)이 고를 수 있는 방식: 기존 3종 호환 정책. */
export const LEGACY_ALLOWED_RECORD_TYPES: readonly RecordType[] = [
  'time',
  'weight',
  'reps',
]

/**
 * 운동에서 고를 수 있는 기록 방식(저장 코드). 메타데이터가 있으면 허용 목록(카탈로그 순서)이고, 없으면 기존 3종이다.
 * 기본 방식은 항상 이 목록에 포함된다(메타데이터가 있으면 검증이 보장하고, 없으면 기존 추론이 3종 중 하나다).
 */
export function allowedRecordTypes(
  exercise: RecordTypeSource,
): readonly RecordType[] {
  const modes = exercise.recordModes
  return modes
    ? modes.allowed.map(toStoredRecordType)
    : LEGACY_ALLOWED_RECORD_TYPES
}

/** 운동 id별 허용 기록 방식. 저장 직전 재검증(validateDraft·normalizeDraft)과 W02의 선택지 제한이 같은 표를 쓴다. */
export type AllowedRecordTypes = ReadonlyMap<string, readonly RecordType[]>

export function buildAllowedRecordTypes(
  exercises: readonly (RecordTypeSource & Pick<Exercise, 'id'>)[],
): Map<string, readonly RecordType[]> {
  return new Map(
    exercises.map((exercise) => [exercise.id, allowedRecordTypes(exercise)]),
  )
}

/** 새로 만든 세트. 이전 세트의 값을 복사하지 않는다. */
export function createDefaultSet(): DraftSet {
  return { reps: DEFAULT_REPS, targetSeconds: DEFAULT_TARGET_SECONDS }
}

let idCounter = 0

/** 화면용 운동 항목 식별자. 저장된 값과 겹치지 않도록 시각과 난수를 섞는다. */
export function newItemId(): string {
  idCounter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `i${Date.now().toString(36)}${idCounter.toString(36)}${random}`
}

export function createDraftItem(
  exercise: Exercise,
  idFactory: () => string = newItemId,
): DraftItem {
  return {
    itemId: idFactory(),
    exerciseId: exercise.id,
    name: exercise.name,
    recordType: resolveStoredRecordType(exercise),
    sets: [createDefaultSet()],
  }
}

function touch(draft: WorkoutDraft, items: DraftItem[], now: () => string) {
  return { ...draft, items, updatedAt: now() }
}

/**
 * 운동을 초안 끝에 추가한다. 이미 있는 운동 id와 입력 안의 중복은 건너뛰고, 입력 순서를 유지한다.
 * 추가할 것이 없으면 같은 초안을 돌려준다(불필요한 갱신·저장을 만들지 않는다).
 */
export function addExercisesToDraft(
  draft: WorkoutDraft,
  exercises: readonly Exercise[],
  now: () => string = nowIso,
  idFactory: () => string = newItemId,
): WorkoutDraft {
  const present = new Set(draft.items.map((item) => item.exerciseId))
  const added: DraftItem[] = []
  for (const exercise of exercises) {
    if (present.has(exercise.id)) continue
    if (draft.items.length + added.length >= MAX_ITEMS) break
    present.add(exercise.id)
    added.push(createDraftItem(exercise, idFactory))
  }
  if (added.length === 0) return draft
  return touch(draft, [...draft.items, ...added], now)
}

function updateItem(
  draft: WorkoutDraft,
  itemId: string,
  change: (item: DraftItem) => DraftItem,
  now: () => string,
): WorkoutDraft {
  const index = draft.items.findIndex((item) => item.itemId === itemId)
  if (index < 0) return draft
  const next = change(draft.items[index])
  if (next === draft.items[index]) return draft
  const items = draft.items.slice()
  items[index] = next
  return touch(draft, items, now)
}

/** 마지막 운동도 삭제할 수 있다(빈 초안이 된다). 빈 초안은 최종 검토가 막힌다. */
export function removeItemFromDraft(
  draft: WorkoutDraft,
  itemId: string,
  now: () => string = nowIso,
): WorkoutDraft {
  if (!draft.items.some((item) => item.itemId === itemId)) return draft
  return touch(
    draft,
    draft.items.filter((item) => item.itemId !== itemId),
    now,
  )
}

/** 운동 순서를 한 칸 옮긴다. 양 끝에서 더 옮길 수 없으면 같은 초안을 돌려준다. 다른 운동의 데이터는 그대로다. */
export function moveItemInDraft(
  draft: WorkoutDraft,
  itemId: string,
  direction: 'up' | 'down',
  now: () => string = nowIso,
): WorkoutDraft {
  const from = draft.items.findIndex((item) => item.itemId === itemId)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= draft.items.length) return draft
  const items = draft.items.slice()
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)
  return touch(draft, items, now)
}

/**
 * 기록 방식을 바꾼다. 세트의 입력값은 그대로 보존한다(최종 검토에서 방식에 맞게 걸러 낸다).
 * allowedTypes를 주면 그 목록에 없는 방식은 받지 않는다(같은 초안을 돌려준다). 이미 그 방식이면 바꾸지 않는다.
 */
export function setItemRecordType(
  draft: WorkoutDraft,
  itemId: string,
  recordType: RecordType,
  now: () => string = nowIso,
  allowedTypes?: readonly RecordType[],
): WorkoutDraft {
  if (!RECORD_TYPES.includes(recordType)) return draft
  if (allowedTypes && !allowedTypes.includes(recordType)) return draft
  return updateItem(
    draft,
    itemId,
    (item) => (item.recordType === recordType ? item : { ...item, recordType }),
    now,
  )
}

export function addSetToItem(
  draft: WorkoutDraft,
  itemId: string,
  now: () => string = nowIso,
): WorkoutDraft {
  return updateItem(
    draft,
    itemId,
    (item) =>
      item.sets.length >= MAX_SETS_PER_ITEM
        ? item
        : { ...item, sets: [...item.sets, createDefaultSet()] },
    now,
  )
}

/** 세트를 지운다. 마지막 세트는 지울 수 없다. */
export function removeSetFromItem(
  draft: WorkoutDraft,
  itemId: string,
  setIndex: number,
  now: () => string = nowIso,
): WorkoutDraft {
  return updateItem(
    draft,
    itemId,
    (item) => {
      if (item.sets.length <= 1) return item
      if (
        !Number.isInteger(setIndex) ||
        setIndex < 0 ||
        setIndex >= item.sets.length
      ) {
        return item
      }
      return {
        ...item,
        sets: item.sets.filter((_, index) => index !== setIndex),
      }
    },
    now,
  )
}

/**
 * 세트 값을 바꾼다. patch의 필드가 undefined면 그 값을 비운다(입력창을 비운 경우). 유한하지 않은 숫자는 받지 않는다.
 */
export function updateSetInItem(
  draft: WorkoutDraft,
  itemId: string,
  setIndex: number,
  patch: Partial<Record<keyof DraftSet, number | undefined>>,
  now: () => string = nowIso,
): WorkoutDraft {
  for (const value of Object.values(patch)) {
    if (value !== undefined && !Number.isFinite(value)) return draft
  }
  return updateItem(
    draft,
    itemId,
    (item) => {
      if (
        !Number.isInteger(setIndex) ||
        setIndex < 0 ||
        setIndex >= item.sets.length
      ) {
        return item
      }
      const sets = item.sets.slice()
      const next: DraftSet = { ...sets[setIndex] }
      for (const [key, value] of Object.entries(patch) as [
        keyof DraftSet,
        number | undefined,
      ][]) {
        if (value === undefined) delete next[key]
        else next[key] = value
      }
      sets[setIndex] = next
      return { ...item, sets }
    },
    now,
  )
}

const isInt = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value)

export const ISSUE_MESSAGES = {
  noItems: '운동을 하나 이상 등록해 주세요.',
  reps: `횟수는 1 이상의 정수(최대 ${MAX_TARGET_REPS}회)로 입력해 주세요.`,
  weight: `중량은 0~${MAX_TARGET_WEIGHT_KG}kg, 소수점 둘째 자리까지 입력해 주세요.`,
  time: `목표 시간은 ${MIN_TARGET_SECONDS}~${MAX_TARGET_SECONDS}초의 정수로 입력해 주세요.`,
  unknownExercise:
    '이 운동의 정보를 찾을 수 없어요. 삭제한 뒤 다시 추가해 주세요.',
  duplicateExercise: '같은 운동이 중복되어 있어요.',
  duplicateItem: '운동 항목이 중복되어 있어요.',
  recordType: '기록 방식을 선택해 주세요.',
  recordTypeNotAllowed:
    '이 운동에서는 사용할 수 없는 기록 방식이에요. 허용된 방식으로 바꿔 주세요.',
  noSets: '세트가 하나 이상 있어야 해요.',
} as const

/**
 * 초안 전체를 검증한다. 오류가 있는 운동·세트를 가리키는 목록을 돌려준다.
 * - 운동 1개 이상, 운동당 세트 1개 이상, 운동 id·항목 id 중복 없음, 기록 방식은 저장 코드 5종 중 하나.
 * - 목표값은 방식의 구성값(recordMode.RECORD_COMPONENTS)에 따라 검사한다. 시간: targetSeconds 1~3600의 정수. 횟수: reps 1~999의 정수.
 *   중량: weightKg는 비어 있어도 되지만(목표 중량은 선택) 입력했다면 0~999kg, 소수 둘째 자리까지(서버 규칙, isValidTargetWeightKg).
 *   구성값이 아닌 값(보이지 않는 입력)은 검사하지 않는다.
 *   시간형 reps, 횟수형 targetSeconds처럼 방식과 관계없는 값은 초안에 남아 있어도 오류가 아니다(정규화에서 걸러 낸다).
 * - knownExerciseIds를 주면 그 목록에 없는 운동 id를 오류로 본다(운동 정보를 읽을 수 없을 때는 주지 않는다).
 * - allowedRecordTypes를 주면 그 운동에서 허용하지 않는 기록 방식을 오류로 본다(허용 정보가 없는 운동은 판단하지 않는다).
 *   화면에서 선택지를 제한해도 저장 직전에 이 검증을 다시 한다. 기존에 저장된 목록은 이 검증을 받지 않는다(읽기 경로에서 호출하지 않는다).
 * - options.serverLimits가 false면 횟수 상한(999)과 중량 상한·자릿수를 보지 않는다(예전 규칙: 횟수 1 이상 정수, 중량 0 이상).
 *   이미 저장된 루틴·계획을 초안으로 옮길 때(replaceDraft) 쓴다. 이 규칙이 생기기 전에 저장한 값(예: 22.555kg)도 W02로 옮겨지고,
 *   W02·W11이 저장 전에 이 검증(기본값)으로 그 값을 안내한다.
 */
export function validateDraft(
  draft: WorkoutDraft,
  knownExerciseIds?: ReadonlySet<string>,
  allowed?: AllowedRecordTypes,
  options: { serverLimits?: boolean } = {},
): DraftValidation {
  const serverLimits = options.serverLimits ?? true
  const issues: DraftIssue[] = []
  if (draft.items.length === 0) {
    issues.push({ field: 'items', message: ISSUE_MESSAGES.noItems })
  }
  const exerciseIds = new Set<string>()
  const itemIds = new Set<string>()
  for (const item of draft.items) {
    if (itemIds.has(item.itemId)) {
      issues.push({
        itemId: item.itemId,
        field: 'items',
        message: ISSUE_MESSAGES.duplicateItem,
      })
    }
    itemIds.add(item.itemId)
    if (exerciseIds.has(item.exerciseId)) {
      issues.push({
        itemId: item.itemId,
        field: 'exercise',
        message: ISSUE_MESSAGES.duplicateExercise,
      })
    }
    exerciseIds.add(item.exerciseId)
    if (knownExerciseIds && !knownExerciseIds.has(item.exerciseId)) {
      issues.push({
        itemId: item.itemId,
        field: 'exercise',
        message: ISSUE_MESSAGES.unknownExercise,
      })
    }
    if (!RECORD_TYPES.includes(item.recordType)) {
      issues.push({
        itemId: item.itemId,
        field: 'recordType',
        message: ISSUE_MESSAGES.recordType,
      })
      continue
    }
    const allowedTypes = allowed?.get(item.exerciseId)
    if (allowedTypes && !allowedTypes.includes(item.recordType)) {
      issues.push({
        itemId: item.itemId,
        field: 'recordType',
        message: ISSUE_MESSAGES.recordTypeNotAllowed,
      })
    }
    if (item.sets.length === 0) {
      issues.push({
        itemId: item.itemId,
        field: 'sets',
        message: ISSUE_MESSAGES.noSets,
      })
      continue
    }
    const parts = RECORD_COMPONENTS[item.recordType]
    item.sets.forEach((set, setIndex) => {
      const at = { itemId: item.itemId, setIndex }
      if (parts.time) {
        if (
          !isInt(set.targetSeconds) ||
          set.targetSeconds < MIN_TARGET_SECONDS ||
          set.targetSeconds > MAX_TARGET_SECONDS
        ) {
          issues.push({
            ...at,
            field: 'targetSeconds',
            message: ISSUE_MESSAGES.time,
          })
        }
      }
      if (
        parts.reps &&
        (!isInt(set.reps) ||
          set.reps < 1 ||
          (serverLimits && set.reps > MAX_TARGET_REPS))
      ) {
        issues.push({ ...at, field: 'reps', message: ISSUE_MESSAGES.reps })
      }
      if (
        parts.weight &&
        set.weightKg !== undefined &&
        (serverLimits
          ? !isValidTargetWeightKg(set.weightKg)
          : !Number.isFinite(set.weightKg) || set.weightKg < 0)
      ) {
        issues.push({
          ...at,
          field: 'weightKg',
          message: ISSUE_MESSAGES.weight,
        })
      }
    })
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/**
 * 최종 검토용 결과. 유효한 초안에서만 만들 수 있고(그렇지 않으면 null), 선택한 기록 방식의 구성값만 담은 **새 값**이다
 * (다른 방식에서 입력했다가 남은 값은 걸러 낸다). 원본 초안은 바꾸지 않는다. W11(최종 검토)과 저장소가 같은 함수를 쓴다.
 */
export function normalizeDraft(
  draft: WorkoutDraft,
  knownExerciseIds?: ReadonlySet<string>,
  allowed?: AllowedRecordTypes,
): readonly NormalizedItem[] | null {
  if (!validateDraft(draft, knownExerciseIds, allowed).ok) return null
  return draft.items.map((item): NormalizedItem => {
    const parts = RECORD_COMPONENTS[item.recordType]
    return {
      exerciseId: item.exerciseId,
      name: item.name,
      recordType: item.recordType,
      sets: item.sets.map((set): NormalizedSet => {
        const normalized: {
          reps?: number
          targetSeconds?: number
          weightKg?: number
        } = {}
        if (parts.reps) normalized.reps = set.reps as number
        if (parts.time) normalized.targetSeconds = set.targetSeconds as number
        if (parts.weight && set.weightKg !== undefined) {
          normalized.weightKg = set.weightKg
        }
        return normalized as NormalizedSet
      }),
    }
  })
}
