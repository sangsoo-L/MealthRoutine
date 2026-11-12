import type { Exercise } from './exerciseTypes.ts'
import type {
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

/** 저장·화면 보호용 상한. 정상 사용에서는 닿지 않는 값이다(손상된 저장값을 걸러 내는 기준과 같다). */
export const MAX_ITEMS = 500
export const MAX_SETS_PER_ITEM = 200

const nowIso = () => new Date().toISOString()

export function createEmptyDraft(now: () => string = nowIso): WorkoutDraft {
  return { v: 1, day: 'today', items: [], updatedAt: now() }
}

export function hasDraftContent(draft: WorkoutDraft): boolean {
  return draft.items.length > 0
}

/**
 * 운동의 기본 기록 방식(스토리보드 v5.0 W02의 규칙). 덤벨 운동은 중량형, 유산소·스트레칭은 시간형, 그 외는 횟수형이다.
 * 운동을 추가할 때 한 번 정해 명시 값으로 저장하고, 사용자가 이후 바꿀 수 있다.
 */
export function defaultRecordType(
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
    recordType: defaultRecordType(exercise),
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

/** 기록 방식을 바꾼다. 세트의 입력값은 그대로 보존한다(최종 검토에서 방식에 맞게 걸러 낸다). */
export function setItemRecordType(
  draft: WorkoutDraft,
  itemId: string,
  recordType: RecordType,
  now: () => string = nowIso,
): WorkoutDraft {
  if (!RECORD_TYPES.includes(recordType)) return draft
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
  reps: '횟수는 1 이상의 정수로 입력해 주세요.',
  weight: '중량은 0 이상의 숫자로 입력해 주세요.',
  time: `목표 시간은 ${MIN_TARGET_SECONDS}~${MAX_TARGET_SECONDS}초의 정수로 입력해 주세요.`,
  unknownExercise:
    '이 운동의 정보를 찾을 수 없어요. 삭제한 뒤 다시 추가해 주세요.',
  duplicateExercise: '같은 운동이 중복되어 있어요.',
  duplicateItem: '운동 항목이 중복되어 있어요.',
  recordType: '기록 방식을 선택해 주세요.',
  noSets: '세트가 하나 이상 있어야 해요.',
} as const

/**
 * 초안 전체를 검증한다. 오류가 있는 운동·세트를 가리키는 목록을 돌려준다.
 * - 운동 1개 이상, 운동당 세트 1개 이상, 운동 id·항목 id 중복 없음, 기록 방식은 허용된 세 가지.
 * - 횟수형: reps는 1 이상의 정수. 중량형: reps + weightKg는 비어 있어도 되지만 입력했다면 0 이상의 유한한 숫자.
 *   시간형: targetSeconds는 1~3600의 정수(reps는 보이지 않는 값이라 검사하지 않는다).
 * - knownExerciseIds를 주면 그 목록에 없는 운동 id를 오류로 본다(운동 정보를 읽을 수 없을 때는 주지 않는다).
 */
export function validateDraft(
  draft: WorkoutDraft,
  knownExerciseIds?: ReadonlySet<string>,
): DraftValidation {
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
    if (item.sets.length === 0) {
      issues.push({
        itemId: item.itemId,
        field: 'sets',
        message: ISSUE_MESSAGES.noSets,
      })
      continue
    }
    item.sets.forEach((set, setIndex) => {
      const at = { itemId: item.itemId, setIndex }
      if (item.recordType === 'time') {
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
        return
      }
      if (!isInt(set.reps) || set.reps < 1) {
        issues.push({ ...at, field: 'reps', message: ISSUE_MESSAGES.reps })
      }
      if (
        item.recordType === 'weight' &&
        set.weightKg !== undefined &&
        (!Number.isFinite(set.weightKg) || set.weightKg < 0)
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
 * 최종 검토용 결과. 유효한 초안에서만 만들 수 있고(그렇지 않으면 null), 선택한 기록 방식과 관계없는 필드를 걸러 낸 **새 값**이다.
 * 원본 초안은 바꾸지 않는다. W11(최종 검토)이 구현되면 같은 함수를 쓴다.
 */
export function normalizeDraft(
  draft: WorkoutDraft,
  knownExerciseIds?: ReadonlySet<string>,
): readonly NormalizedItem[] | null {
  if (!validateDraft(draft, knownExerciseIds).ok) return null
  return draft.items.map((item): NormalizedItem => ({
    exerciseId: item.exerciseId,
    name: item.name,
    recordType: item.recordType,
    sets: item.sets.map((set): NormalizedSet => {
      if (item.recordType === 'time') {
        return { targetSeconds: set.targetSeconds as number }
      }
      if (item.recordType === 'weight') {
        return set.weightKg === undefined
          ? { reps: set.reps as number }
          : { reps: set.reps as number, weightKg: set.weightKg }
      }
      return { reps: set.reps as number }
    }),
  }))
}
