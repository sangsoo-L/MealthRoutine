import { ACCOUNT_SCOPE_PREFIX } from '../auth/accountScope.ts'
import { MAX_ITEMS, MAX_SETS_PER_ITEM } from './workoutDraftModel.ts'
import type {
  DraftItem,
  DraftSet,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import { RECORD_TYPES } from './workoutDraftTypes.ts'

/**
 * 운동 초안의 임시 저장(계정별 sessionStorage). 새로고침해도 편집 중인 구성을 되살리려는 화면 쪽 저장이며, 영구 저장소가 아니다.
 * 탭을 닫으면 사라지고, 탭마다 따로 가지며(탭 사이 실시간 동기화 없음), 운동 기록·루틴의 정본 저장소로 쓰지 않는다.
 *
 * - 키는 고정이며 사용자 ID·이메일·토큰을 넣지 않는다. 키가 계정 정리 접두어(auth/accountScope.ts)로 시작하므로 로그인·로그아웃이
 *   `clearAccountScopedData`로 함께 지운다.
 * - 값에는 소유자 지문을 함께 둔다. 로그아웃이 정리하지 못한 경우를 대비한 불일치 검출용이며 보안 수단이 아니다
 *   (아래 ownerFingerprint). 지문이 현재 사용자와 다르면 그 초안은 쓰지 않고 지운다.
 * - 읽은 값은 외부 입력으로 본다. 모양이 조금이라도 맞지 않으면 일부만 살리지 않고 초안 전체를 버린다.
 * - 저장소를 쓸 수 없거나 쓰기에 실패해도 화면은 메모리 상태로 계속 동작한다(호출한 쪽이 저장 실패를 알린다).
 */

/** 고정 키. 계정 정리 접두어로 시작한다. */
export const WORKOUT_DRAFT_KEY = `${ACCOUNT_SCOPE_PREFIX}workout-draft`

const STORAGE_VERSION = 1

/** 저장 원문 길이 상한(문자 수). */
const MAX_RAW_LENGTH = 2_000_000

/** sessionStorage와 같은 모양의 최소 저장소. 테스트에서 대체할 수 있다. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): DraftStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * 소유자 지문. 사용자 ID를 짧은 값으로 바꿔 "이 초안이 지금 사용자의 것인지"만 비교한다.
 * 단순한 비암호 해시(cyrb53)이며 개인정보를 암호화하거나 안전하게 보호하지 않는다(짧은 ID는 추측될 수 있다).
 * 인증 토큰이나 비밀값은 쓰지 않는다. 저장소의 값은 같은 출처의 스크립트가 읽을 수 있으므로 민감한 값은 초안에 넣지 않는다.
 */
export function ownerFingerprint(userId: string): string {
  const seed = 'mealthroutine.workout-draft'
  const text = `${seed}|${userId}`
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 값이 없거나(undefined) 유한한 숫자여야 한다. 그 밖의 값(문자열, null=NaN·Infinity 직렬화 등)은 손상이다. */
function optionalNumber(value: unknown): { ok: boolean; value?: number } {
  if (value === undefined) return { ok: true }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, value }
  }
  return { ok: false }
}

function parseSet(raw: unknown): DraftSet | null {
  if (!isRecord(raw)) return null
  const reps = optionalNumber(raw.reps)
  const weightKg = optionalNumber(raw.weightKg)
  const targetSeconds = optionalNumber(raw.targetSeconds)
  if (!reps.ok || !weightKg.ok || !targetSeconds.ok) return null
  const set: DraftSet = {}
  if (reps.value !== undefined) set.reps = reps.value
  if (weightKg.value !== undefined) set.weightKg = weightKg.value
  if (targetSeconds.value !== undefined) set.targetSeconds = targetSeconds.value
  return set
}

function nonEmptyString(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    value === value.trim()
  )
}

function parseItem(raw: unknown): DraftItem | null {
  if (!isRecord(raw)) return null
  const { itemId, exerciseId, name, recordType, sets } = raw
  // 항목 id는 화면의 DOM id·label 연결에 쓰이므로 안전한 문자만 허용한다(앱이 만드는 값은 영문 소문자·숫자뿐이다).
  if (!nonEmptyString(itemId, 64) || !/^[0-9A-Za-z_-]+$/.test(itemId))
    return null
  if (!nonEmptyString(exerciseId, 100)) return null
  if (!nonEmptyString(name, 100)) return null
  if (
    typeof recordType !== 'string' ||
    !RECORD_TYPES.includes(recordType as RecordType)
  ) {
    return null
  }
  if (
    !Array.isArray(sets) ||
    sets.length < 1 ||
    sets.length > MAX_SETS_PER_ITEM
  ) {
    return null
  }
  const parsedSets: DraftSet[] = []
  for (const rawSet of sets) {
    const set = parseSet(rawSet)
    if (!set) return null
    parsedSets.push(set)
  }
  return {
    itemId,
    exerciseId,
    name,
    recordType: recordType as RecordType,
    sets: parsedSets,
  }
}

export type ParseResult =
  | { ok: true; draft: WorkoutDraft }
  | { ok: false; reason: 'corrupt' | 'version' | 'owner' }

/**
 * 저장된 문자열을 초안으로 읽는다(순수 함수). 모양이 조금이라도 맞지 않으면 실패한다.
 * - corrupt: JSON이 아니거나 필드·타입·숫자·중복(운동 id·항목 id)·배열이 올바르지 않다.
 * - version: 저장 스키마 버전이 다르다(이 기능은 아직 이전 버전이 없어 마이그레이션 없이 버린다).
 * - owner: 소유자 지문이 지금 사용자와 다르다.
 */
export function parseStoredDraft(raw: string, userId: string): ParseResult {
  // 정상 초안은 수십 KB를 넘지 않는다. 지나치게 큰 값은 파싱하지 않고 손상으로 본다.
  if (raw.length > MAX_RAW_LENGTH) return { ok: false, reason: 'corrupt' }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (!isRecord(value)) return { ok: false, reason: 'corrupt' }
  if (value.wv !== STORAGE_VERSION) return { ok: false, reason: 'version' }
  if (typeof value.owner !== 'string') return { ok: false, reason: 'corrupt' }
  if (value.owner !== ownerFingerprint(userId)) {
    return { ok: false, reason: 'owner' }
  }
  const draft = value.draft
  if (!isRecord(draft)) return { ok: false, reason: 'corrupt' }
  if (draft.v !== STORAGE_VERSION) return { ok: false, reason: 'version' }
  if (draft.day !== 'today') return { ok: false, reason: 'corrupt' }
  if (
    typeof draft.updatedAt !== 'string' ||
    draft.updatedAt.length === 0 ||
    draft.updatedAt.length > 40 ||
    Number.isNaN(Date.parse(draft.updatedAt))
  ) {
    return { ok: false, reason: 'corrupt' }
  }
  if (
    draft.editingListId !== undefined &&
    !nonEmptyString(draft.editingListId, 64)
  ) {
    return { ok: false, reason: 'corrupt' }
  }
  if (
    !Array.isArray(draft.items) ||
    draft.items.length < 1 ||
    draft.items.length > MAX_ITEMS
  ) {
    return { ok: false, reason: 'corrupt' }
  }
  const items: DraftItem[] = []
  const itemIds = new Set<string>()
  const exerciseIds = new Set<string>()
  for (const rawItem of draft.items) {
    const item = parseItem(rawItem)
    if (!item) return { ok: false, reason: 'corrupt' }
    if (itemIds.has(item.itemId) || exerciseIds.has(item.exerciseId)) {
      return { ok: false, reason: 'corrupt' }
    }
    itemIds.add(item.itemId)
    exerciseIds.add(item.exerciseId)
    items.push(item)
  }
  const parsed: WorkoutDraft = {
    v: 1,
    day: 'today',
    items,
    updatedAt: draft.updatedAt,
  }
  if (typeof draft.editingListId === 'string') {
    parsed.editingListId = draft.editingListId
  }
  return { ok: true, draft: parsed }
}

export interface LoadedDraft {
  /** 복구한 초안. 저장된 것이 없거나 쓸 수 없으면 null. */
  draft: WorkoutDraft | null
  /** 저장된 값이 손상·다른 버전이라 버렸다(사용자에게 알린다). 소유자 불일치는 조용히 버리므로 false다. */
  discarded: boolean
  /** 저장소 자체에 접근할 수 없었다. */
  storageUnavailable: boolean
}

export interface ReadDraft extends LoadedDraft {
  /** 읽은 값을 쓸 수 없어 저장소에서 지워야 한다(읽는 쪽이 지우는 시점을 정한다). */
  needsRemoval: boolean
}

/**
 * 현재 사용자의 저장된 초안을 **읽기만** 한다(저장소를 바꾸지 않는다). 렌더 중에 호출해도 되고 몇 번 불러도 같은 결과다.
 * 쓸 수 없는 값(손상·다른 버전·다른 소유자)은 draft=null로 돌려주고 지워야 함을 needsRemoval로 알린다.
 * 저장소 접근 예외는 삼키고 storageUnavailable로 알린다.
 */
export function readWorkoutDraft(
  userId: string,
  storage: DraftStorage | null = defaultStorage(),
): ReadDraft {
  const none = {
    draft: null,
    discarded: false,
    storageUnavailable: false,
    needsRemoval: false,
  }
  if (!storage) return { ...none, storageUnavailable: true }
  let raw: string | null
  try {
    raw = storage.getItem(WORKOUT_DRAFT_KEY)
  } catch {
    return { ...none, storageUnavailable: true }
  }
  if (raw === null) return none
  const result = parseStoredDraft(raw, userId)
  if (result.ok) return { ...none, draft: result.draft }
  return {
    ...none,
    discarded: result.reason !== 'owner',
    needsRemoval: true,
  }
}

/**
 * 읽고, 쓸 수 없는 값이면 저장소에서 지운다. 빈 상태로 시작하게 한다. 렌더 밖(이벤트·효과·테스트)에서 쓴다.
 * 삭제에 실패해도 그 값은 쓰지 않는다.
 */
export function loadWorkoutDraft(
  userId: string,
  storage: DraftStorage | null = defaultStorage(),
): LoadedDraft {
  const read = readWorkoutDraft(userId, storage)
  if (read.needsRemoval) clearWorkoutDraft(storage)
  return {
    draft: read.draft,
    discarded: read.discarded,
    storageUnavailable: read.storageUnavailable,
  }
}

/**
 * 초안을 저장한다. 운동이 없는 빈 초안은 저장하지 않고 저장된 값을 지운다. 성공하면 true, 저장소를 쓸 수 없거나 쓰기에 실패하면
 * (용량 초과 포함) false다. 실패해도 예외를 던지지 않는다.
 */
export function saveWorkoutDraft(
  userId: string,
  draft: WorkoutDraft,
  storage: DraftStorage | null = defaultStorage(),
): boolean {
  if (!storage) return false
  try {
    if (draft.items.length === 0) {
      storage.removeItem(WORKOUT_DRAFT_KEY)
      return true
    }
    storage.setItem(
      WORKOUT_DRAFT_KEY,
      JSON.stringify({
        wv: STORAGE_VERSION,
        owner: ownerFingerprint(userId),
        draft,
      }),
    )
    return true
  } catch {
    return false
  }
}

export function clearWorkoutDraft(
  storage: DraftStorage | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(WORKOUT_DRAFT_KEY)
  } catch {
    // 지울 수 없으면 지울 것도 없는 것으로 본다.
  }
}
