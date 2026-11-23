/**
 * 음식 등록 요청(F03)과 내 요청 내역(P04·P04-1)의 입력 검증, 서버 계약, 상태 표시 규칙.
 *
 * 음식 등록 요청 전용 API는 API 명세서의 89개에 없다(README의 API 인수인계 확인). 아래 계약은 **확정된 API가 아니라** 화면이 주고받을 값의
 * 모양이며, 실제 경로·필드·상태값은 백엔드와 확정한 뒤 변환을 `FoodRequestSource` 구현에 둔다. 요청 접수·저장·관리자 처리·음식 DB 반영은
 * 모두 서버 담당이고, 이 파일과 화면은 아무것도 저장하거나 승인하지 않는다.
 * 연결된 구현(`createFoodRequestSource`)은 지금 항상 null(연결 전)이다. 화면은 서버가 준 값만 보여 주며, 접수 완료·요청 내역·처리 상태를
 * 만들어 내지 않는다.
 */

/** 영양표 사진 크기 한도(명세 F03: "영양정보가 보이는 사진 · 최대 10MB"). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export interface FoodRequestInput {
  /** 필수. 앞뒤 공백을 뺀 값. */
  foodName: string
  /** 선택(브랜드 또는 판매처). 비었으면 null. */
  brand: string | null
  /** 선택(등록에 도움이 되는 설명). 비었으면 null. */
  description: string | null
  /** 선택(영양표 사진). 첨부 오류가 있으면 첨부 없이 텍스트만 보낸다. */
  attachment: File | null
}

export type FoodNameError = 'empty'
export type AttachmentError = 'type' | 'size'

export const FOOD_NAME_ERROR_MESSAGE: Record<FoodNameError, string> = {
  empty: '음식 이름을 입력해 주세요.',
}

export const ATTACHMENT_ERROR_MESSAGE: Record<AttachmentError, string> = {
  type: '이미지 파일만 첨부할 수 있어요. 사진 없이 텍스트만 요청해도 괜찮아요.',
  size: '사진은 10MB 이하만 첨부할 수 있어요. 사진 없이 텍스트만 요청해도 괜찮아요.',
}

/** 음식 이름 검증: 앞뒤 공백을 뺀 뒤 비어 있으면 오류. 명세에 다른 입력 제한이 없어 길이 같은 제한을 만들지 않는다. */
export function validateFoodName(
  value: string,
): { ok: true; name: string } | { ok: false; error: FoodNameError } {
  const name = value.trim()
  return name === '' ? { ok: false, error: 'empty' } : { ok: true, name }
}

/** 첨부 검증: 이미지(image/*)이고 10MB 이하여야 한다. 통과하면 null. */
export function validateAttachment(file: {
  type: string
  size: number
}): AttachmentError | null {
  if (!file.type.startsWith('image/')) return 'type'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'size'
  return null
}

/** 요청 생성 결과. 서버가 준 값만 담는다: 새로 접수했거나, 같은 요청이 이미 있어 그 요청을 알려 준다(명세: 유사 요청이면 기존 요청 확인). */
export type FoodRequestResult =
  | { kind: 'accepted'; requestId: string }
  | { kind: 'similar'; requestId: string }

export interface FoodRequestComment {
  id: string
  authorName: string | null
  /** ISO 8601. 없거나 올바르지 않으면 "작성일 미기록". */
  createdAt: string | null
  /** 이 메모가 알린 처리 상태(서버 값). */
  status: string | null
  body: string
}

/** 서버가 준 내 요청 한 건. 상태는 서버 값을 그대로 담고, 이 앱은 바꾸지 않는다. */
export interface FoodRequestItem {
  /** 접수 번호 */
  requestId: string
  foodName: string
  brand: string | null
  description: string | null
  /** ISO 8601. 없으면 "접수일 미기록". */
  createdAt: string | null
  status: string | null
  adminComments: readonly FoodRequestComment[]
}

/**
 * 서버 연결 경계(확정된 API가 아니다).
 * - createRequest: 음식 등록 요청 생성. 서버가 접수하면 결과를 돌려주고, 접수하지 못하면 reject한다.
 * - listRequests: 내 요청 목록(처리 상태 포함).
 * - getRequest: 요청 한 건의 상세와 처리 상태.
 */
export interface FoodRequestSource {
  createRequest(
    input: FoodRequestInput,
    signal: AbortSignal,
  ): Promise<FoodRequestResult>
  listRequests(signal: AbortSignal): Promise<readonly FoodRequestItem[]>
  getRequest(requestId: string, signal: AbortSignal): Promise<FoodRequestItem>
}

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createFoodRequestSource(): FoodRequestSource | null {
  return null
}

/**
 * F03의 처리 상태. idle 초기 · invalid 입력 오류 · preparing 요청 준비 · unavailable API 미연결 · submitting 요청 중 · failed 요청 실패 ·
 * done 요청 완료(서버 접수 응답이 있을 때만).
 */
export type SubmitPhase =
  | { phase: 'idle' }
  | { phase: 'invalid' }
  | { phase: 'preparing' }
  | { phase: 'unavailable' }
  | { phase: 'submitting' }
  | { phase: 'failed' }
  | { phase: 'done'; result: FoodRequestResult }

/** 요청 한 번의 결과. 연결이 없으면 보내지 않고 unavailable, 서버가 접수하면 done, 예외는 failed다. */
export async function runFoodRequest(
  source: FoodRequestSource | null,
  input: FoodRequestInput,
  signal: AbortSignal,
): Promise<SubmitPhase> {
  if (source === null) return { phase: 'unavailable' }
  try {
    return { phase: 'done', result: await source.createRequest(input, signal) }
  } catch {
    return { phase: 'failed' }
  }
}

/**
 * P04 목록 조회 상태(조회 전·로딩은 loading으로 보인다).
 * unavailable은 서버 연결 전이다. "요청 없음"(empty)이 아니다.
 */
export type RequestListState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; items: readonly FoodRequestItem[] }

/** 목록 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. */
export async function runListRequests(
  source: FoodRequestSource | null,
  signal: AbortSignal,
): Promise<Exclude<RequestListState, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    const items = await source.listRequests(signal)
    return items.length === 0 ? { status: 'empty' } : { status: 'ready', items }
  } catch {
    return { status: 'error' }
  }
}

/** 표시용 처리 상태 구분. 서버의 상태값(한글 또는 영문 코드)을 화면 구분으로 옮긴다. 모르는 값은 unknown이다. */
export type RequestStatusKey =
  'received' | 'review' | 'needInfo' | 'completed' | 'rejected' | 'unknown'

/** 상태 배지 글자와 처리 안내. 명세 P04의 접수·검토 중·반영 완료와 F03의 추가정보 필요·반려를 담는다. */
export const REQUEST_STATUS_LABEL: Record<
  RequestStatusKey,
  { label: string; guide: string }
> = {
  received: {
    label: '접수',
    guide: '요청 내용을 받았어요. 순서대로 확인할 예정이에요.',
  },
  review: {
    label: '검토 중',
    guide: '음식 정보와 영양 자료를 확인하고 있어요.',
  },
  needInfo: {
    label: '추가 정보 필요',
    guide: '확인을 위해 추가 정보가 필요해요.',
  },
  completed: { label: '반영 완료', guide: '음식 정보 반영이 완료되었어요.' },
  rejected: { label: '반려', guide: '이번 요청은 반영되지 않았어요.' },
  unknown: { label: '상태 확인 중', guide: '처리 상태를 확인하고 있어요.' },
}

const STATUS_ALIASES: Readonly<Record<string, RequestStatusKey>> = {
  received: 'received',
  접수: 'received',
  review: 'review',
  '검토 중': 'review',
  needinfo: 'needInfo',
  need_info: 'needInfo',
  '추가정보 필요': 'needInfo',
  '추가 정보 필요': 'needInfo',
  completed: 'completed',
  '반영 완료': 'completed',
  반영: 'completed',
  rejected: 'rejected',
  반려: 'rejected',
}

export function statusKeyOf(
  value: string | null | undefined,
): RequestStatusKey {
  if (value === null || value === undefined) return 'unknown'
  return (
    STATUS_ALIASES[value.trim().toLowerCase()] ??
    STATUS_ALIASES[value.trim()] ??
    'unknown'
  )
}

function timeOf(value: string | null): number {
  const time = value === null ? NaN : Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

/** 관리자 메모를 작성 시각 오름차순(시간순 누적)으로. */
export function sortedComments(
  item: FoodRequestItem,
): readonly FoodRequestComment[] {
  // 서버가 메모 목록을 주지 않아도(없음·null) 화면이 깨지지 않게 빈 목록으로 본다.
  return [...(item.adminComments ?? [])].sort(
    (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt),
  )
}

/**
 * 카드 배지에 쓰는 처리 상태: 가장 최근의 알려진 상태를 가진 관리자 메모의 상태, 없으면 요청 자체의 상태(명세 P04).
 * 서버가 준 값만 옮기며 이 앱이 상태를 바꾸지 않는다.
 */
export function requestStatus(item: FoodRequestItem): RequestStatusKey {
  const known = sortedComments(item).filter(
    (comment) => statusKeyOf(comment.status) !== 'unknown',
  )
  const latest = known.at(-1)
  return latest ? statusKeyOf(latest.status) : statusKeyOf(item.status)
}

/** 상태 필터(명세 P04: 전체·접수·검토 중·반영 완료). 추가정보 필요·반려는 전체에서만 보인다. */
export type RequestFilter = 'all' | 'received' | 'review' | 'completed'
export const REQUEST_FILTERS: readonly RequestFilter[] = [
  'all',
  'received',
  'review',
  'completed',
]
export const REQUEST_FILTER_LABEL: Record<RequestFilter, string> = {
  all: '전체',
  received: '접수',
  review: '검토 중',
  completed: '반영 완료',
}

export function filterCounts(
  items: readonly FoodRequestItem[],
): Record<RequestFilter, number> {
  const counts: Record<RequestFilter, number> = {
    all: items.length,
    received: 0,
    review: 0,
    completed: 0,
  }
  for (const item of items) {
    const key = requestStatus(item)
    if (key === 'received' || key === 'review' || key === 'completed') {
      counts[key] += 1
    }
  }
  return counts
}

export function filterItems(
  items: readonly FoodRequestItem[],
  filter: RequestFilter,
): readonly FoodRequestItem[] {
  return filter === 'all'
    ? items
    : items.filter((item) => requestStatus(item) === filter)
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** 요청일(한국 시간). 없거나 올바르지 않으면 "접수일 미기록". */
export function requestDateLabel(value: string | null): string {
  return timeOf(value) === 0
    ? '접수일 미기록'
    : dateFormat.format(new Date(value as string))
}

/** 메모 작성 시각(한국 시간). 없거나 올바르지 않으면 "작성일 미기록". */
export function commentTimeLabel(value: string | null): string {
  return timeOf(value) === 0
    ? '작성일 미기록'
    : timeFormat.format(new Date(value as string))
}

export const PATH_FOOD_REQUEST = '/foods/request'
export const PATH_MY_FOOD_REQUESTS = '/mypage/requests'
