import { normalizeDraft, newItemId } from './workoutDraftModel.ts'
import type {
  DraftItem,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import {
  isIsoTimestamp,
  isValidOwnerId,
  isValidRequestId,
  validListItems,
} from './workoutModel.ts'
import { sameListItems } from './workoutModel.ts'
import type { WorkoutListItem } from './workoutTypes.ts'

/**
 * 운동 루틴(W06~W08)의 저장 모델과 순수 함수(저장소·React를 부르지 않는다). 개발 서버의 IndexedDB `workoutRoutines`에 저장하는 값의 모양이다.
 *
 * - 루틴은 날짜에 묶이지 않은 "다시 쓰는 구성"이다. 운동 줄은 운동 목록(WorkoutList)과 같은 모양(WorkoutListItem)이라 세트 목표 계산·표시를 그대로 쓴다.
 * - 오늘의 운동 초안(W02)과 별개의 데이터다. 루틴으로 운동을 준비하면 초안으로 복사해 갈 뿐(routineToDraft) 루틴 자체는 바뀌지 않는다.
 * - createdAt은 최초 저장 시각이고 수정해도 유지한다. updatedAt은 수정할 때마다 갱신하며 revision이 1씩 오른다(화면명세 W06).
 * - 백엔드 DTO가 아니며 API 계약이 아니다(운동 루틴 API의 요청·응답 구조는 미확정).
 */

/** 저장 레코드의 스키마 버전. 모양을 바꾸면 올리고 exercise/local/exerciseDb.ts의 업그레이드에서 옮긴다. */
export const ROUTINE_SCHEMA_VERSION = 1

export const MAX_ROUTINE_NAME = 50
export const MAX_ROUTINE_DESCRIPTION = 200

export interface WorkoutRoutine {
  id: string
  ownerId: string
  schemaVersion: typeof ROUTINE_SCHEMA_VERSION
  name: string
  /** 소개. 없으면 빈 문자열. */
  description: string
  items: readonly WorkoutListItem[]
  /** 저장할 때마다 1씩 오르는 값(동시 수정 감지). */
  revision: number
  /** 저장 요청 식별자. 같은 계정에서 같은 요청을 반복해도 루틴이 하나만 생긴다(중복 저장 방지). */
  requestId: string
  createdAt: string
  updatedAt: string
}

export interface RoutineMetaIssue {
  field: 'name' | 'description'
  message: string
}

export type RoutineMetaResult =
  | { ok: true; name: string; description: string }
  | { ok: false; issues: readonly RoutineMetaIssue[] }

export const ROUTINE_META_MESSAGES = {
  nameRequired: '루틴 이름을 입력해 주세요.',
  nameTooLong: `루틴 이름은 ${MAX_ROUTINE_NAME}자 이하로 입력해 주세요.`,
  descriptionTooLong: `소개는 ${MAX_ROUTINE_DESCRIPTION}자 이하로 입력해 주세요.`,
} as const

/** 이름(필수, 앞뒤 공백 제외 1~50자)과 소개(선택, 200자 이하)를 검증하고 정리한 값을 돌려준다. */
export function validateRoutineMeta(
  name: string,
  description: string,
): RoutineMetaResult {
  const cleanName = name.trim()
  const cleanDescription = description.trim()
  const issues: RoutineMetaIssue[] = []
  if (cleanName === '') {
    issues.push({ field: 'name', message: ROUTINE_META_MESSAGES.nameRequired })
  } else if (cleanName.length > MAX_ROUTINE_NAME) {
    issues.push({ field: 'name', message: ROUTINE_META_MESSAGES.nameTooLong })
  }
  if (cleanDescription.length > MAX_ROUTINE_DESCRIPTION) {
    issues.push({
      field: 'description',
      message: ROUTINE_META_MESSAGES.descriptionTooLong,
    })
  }
  return issues.length === 0
    ? { ok: true, name: cleanName, description: cleanDescription }
    : { ok: false, issues }
}

interface RoutineContentParams {
  name: string
  description: string
  draft: WorkoutDraft
  knownExerciseIds?: ReadonlySet<string>
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
}

/** 초안을 기존 normalizeDraft로 걸러 저장 모양의 운동 줄로 만든다. 올바르지 않으면 null. */
function toItems(params: RoutineContentParams): WorkoutListItem[] | null {
  const normalized = normalizeDraft(
    params.draft,
    params.knownExerciseIds,
    params.allowedRecordTypes,
  )
  if (!normalized) return null
  return normalized.map((item) => ({
    exerciseId: item.exerciseId,
    exerciseNameSnapshot: item.name,
    recordType: item.recordType,
    sets: item.sets.map((set) => ({ ...set })),
  }))
}

/**
 * 새 루틴을 만든다. 이름·소개나 초안(운동 1개 이상, 세트 목표)이 올바르지 않으면 null이다.
 * revision은 1이고 createdAt = updatedAt = now다.
 */
export function buildRoutine(
  params: RoutineContentParams & {
    id: string
    ownerId: string
    requestId: string
    now: Date
  },
): WorkoutRoutine | null {
  const meta = validateRoutineMeta(params.name, params.description)
  if (!meta.ok) return null
  const items = toItems(params)
  if (!items) return null
  const at = params.now.toISOString()
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    name: meta.name,
    description: meta.description,
    items,
    revision: 1,
    requestId: params.requestId,
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * 루틴을 수정한 새 값을 만든다. id·소유자·요청 id·createdAt은 그대로이고, revision은 1 오르며, updatedAt은 now다(최초 저장 시각은 유지).
 * 이름·소개나 초안이 올바르지 않으면 null이다.
 */
export function buildRoutineUpdate(
  existing: WorkoutRoutine,
  params: RoutineContentParams & { now: Date },
): WorkoutRoutine | null {
  const meta = validateRoutineMeta(params.name, params.description)
  if (!meta.ok) return null
  const items = toItems(params)
  if (!items) return null
  return {
    ...existing,
    name: meta.name,
    description: meta.description,
    items,
    revision: existing.revision + 1,
    updatedAt: params.now.toISOString(),
  }
}

/** 두 루틴의 내용(이름·소개·운동 구성)이 같은지. 같은 저장 요청의 재전송인지 판정할 때 쓴다. */
export function sameRoutineContent(
  a: Pick<WorkoutRoutine, 'name' | 'description' | 'items'>,
  b: Pick<WorkoutRoutine, 'name' | 'description' | 'items'>,
): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    sameListItems(a.items, b.items)
  )
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 저장소에서 읽은 루틴. 모양이 맞지 않으면 null(손상). */
export function parseWorkoutRoutine(raw: unknown): WorkoutRoutine | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== ROUTINE_SCHEMA_VERSION ||
    typeof raw.id !== 'string' ||
    raw.id === '' ||
    !isValidOwnerId(raw.ownerId) ||
    typeof raw.name !== 'string' ||
    raw.name.trim() === '' ||
    raw.name.length > MAX_ROUTINE_NAME ||
    typeof raw.description !== 'string' ||
    raw.description.length > MAX_ROUTINE_DESCRIPTION ||
    !validListItems(raw.items) ||
    typeof raw.revision !== 'number' ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1 ||
    !isValidRequestId(raw.requestId) ||
    !isIsoTimestamp(raw.createdAt) ||
    !isIsoTimestamp(raw.updatedAt)
  ) {
    return null
  }
  return raw as unknown as WorkoutRoutine
}

/**
 * 루틴을 W02 초안(오늘의 운동 구성)으로 복사한다. 루틴 자체는 바꾸지 않으며 초안의 항목 id는 새로 만든다.
 * 운동 이름은 저장 당시의 스냅샷이다. 초안 검증(validateDraft)은 이 초안을 받는 쪽(replaceDraft)이 한다.
 */
export function routineToDraft(
  routine: Pick<WorkoutRoutine, 'items'>,
  now: () => string = () => new Date().toISOString(),
  idFactory: () => string = newItemId,
): WorkoutDraft {
  const items: DraftItem[] = routine.items.map((item) => ({
    itemId: idFactory(),
    exerciseId: item.exerciseId,
    name: item.exerciseNameSnapshot,
    recordType: item.recordType,
    sets: item.sets.map((set) => ({ ...set })),
  }))
  return { v: 1, day: 'today', items, updatedAt: now() }
}
