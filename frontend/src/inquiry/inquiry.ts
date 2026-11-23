/**
 * 문의 작성(S02)과 내 문의(P13)의 입력 검증, 서버 계약, 상태 표시 규칙.
 *
 * 문의 전용 API는 API 명세서의 89개에 없다(README의 API 인수인계 확인). 아래 계약은 **확정된 API가 아니라** 화면이 주고받을 값의
 * 모양이며, 실제 경로·필드·상태값은 백엔드와 확정한 뒤 변환을 `InquirySource` 구현에 둔다. 문의 접수·저장·관리자 답변은 모두 서버 담당이고,
 * 이 파일과 화면은 아무것도 저장하거나 접수하지 않는다.
 * 연결된 구현(`createInquirySource`)은 지금 항상 null(연결 전)이다. 화면은 서버가 준 값만 보여 주며, 접수 완료·문의 내역·답변을 만들어 내지 않는다.
 *
 * 입력 규칙은 화면명세 v5.0 S02를 따른다: 유형(기록 이용·계정·멤버십·음식 요청), 제목·내용 필수(앞뒤 공백을 뺀 뒤 비어 있으면 차단).
 * 명세에 글자 수 제한이 없어 길이 제한을 만들지 않는다.
 */

export type InquiryType = 'record' | 'account' | 'membership' | 'food'

/** 문의 유형(명세 S02의 "01 문의 유형"). 화면 순서다. */
export const INQUIRY_TYPES: readonly InquiryType[] = [
  'record',
  'account',
  'membership',
  'food',
]

export const INQUIRY_TYPE_LABEL: Record<InquiryType, string> = {
  record: '기록 이용',
  account: '계정',
  membership: '멤버십',
  food: '음식 요청',
}

/** 처음 선택돼 있는 유형. 명세에 기본값 정의가 없어 목록의 첫 항목을 쓴다(사용자가 언제든 바꾼다). */
export const DEFAULT_INQUIRY_TYPE: InquiryType = 'record'

export interface InquiryInput {
  type: InquiryType
  /** 앞뒤 공백을 뺀 값. */
  title: string
  /** 앞뒤 공백을 뺀 값. */
  body: string
}

export type InquiryField = 'title' | 'body'
export type InquiryFieldError = 'empty'

export const INQUIRY_FIELD_LABEL: Record<InquiryField, string> = {
  title: '문의 제목',
  body: '문의 내용',
}

export const INQUIRY_ERROR_MESSAGE: Record<InquiryField, string> = {
  title: '문의 제목을 입력해 주세요.',
  body: '문의 내용을 입력해 주세요.',
}

/** 입력 칸 하나의 검증: 앞뒤 공백을 뺀 뒤 비어 있으면 오류. */
export function validateInquiryField(value: string): InquiryFieldError | null {
  return value.trim() === '' ? 'empty' : null
}

/** 제목·내용 검증(화면 순서). 통과하면 trim한 입력을 돌려주고, 아니면 오류가 있는 칸 목록을 돌려준다. */
export function validateInquiry(values: {
  type: InquiryType
  title: string
  body: string
}):
  | { ok: true; input: InquiryInput }
  | { ok: false; errors: readonly InquiryField[] } {
  const errors: InquiryField[] = []
  if (validateInquiryField(values.title)) errors.push('title')
  if (validateInquiryField(values.body)) errors.push('body')
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    input: {
      type: values.type,
      title: values.title.trim(),
      body: values.body.trim(),
    },
  }
}

/** 서버가 준 관리자 답변. 있으면 "답변 완료"다(명세 P13). */
export interface InquiryReply {
  authorName: string | null
  /** ISO 8601. 없거나 올바르지 않으면 "작성일 미기록". */
  createdAt: string | null
  body: string
}

/** 서버가 준 내 문의 한 건. 답변 여부는 서버 값(reply)이 정하고 이 앱은 바꾸지 않는다. */
export interface InquiryItem {
  /** 접수 번호 */
  inquiryId: string
  type: InquiryType
  title: string
  body: string
  /** ISO 8601. 없으면 "접수일 미기록". */
  createdAt: string | null
  reply: InquiryReply | null
}

/** 문의 생성 결과. 서버가 접수했을 때만 만들어진다. */
export interface InquiryResult {
  inquiryId: string
}

/**
 * 서버 연결 경계(확정된 API가 아니다).
 * - createInquiry: 문의 생성. 서버가 접수하면 결과를 돌려주고, 접수하지 못하면 reject한다.
 * - listInquiries: 내 문의 목록(관리자 답변 포함). 본인 문의만 오는 것은 서버가 보장한다.
 */
export interface InquirySource {
  createInquiry(
    input: InquiryInput,
    signal: AbortSignal,
  ): Promise<InquiryResult>
  listInquiries(signal: AbortSignal): Promise<readonly InquiryItem[]>
}

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createInquirySource(): InquirySource | null {
  return null
}

/**
 * S02의 처리 상태. idle 초기 · invalid 입력 오류 · submitting 접수 요청 중 · failed 요청 실패 · done 접수 완료(서버 접수 응답이 있을 때만).
 * "서버 연결 전"은 처리 상태가 아니라 연결(source) 유무로 정해지며 제출 버튼이 비활성이다.
 */
export type InquirySubmitPhase =
  | { phase: 'idle' }
  | { phase: 'invalid' }
  | { phase: 'submitting' }
  | { phase: 'failed' }
  | { phase: 'done'; result: InquiryResult }

/** 접수 요청 한 번의 결과. 연결이 없으면 보내지 않고 null이다(호출한 쪽이 연결 전으로 다룬다). 예외는 failed다. */
export async function runCreateInquiry(
  source: InquirySource | null,
  input: InquiryInput,
  signal: AbortSignal,
): Promise<InquirySubmitPhase | null> {
  if (source === null) return null
  try {
    return { phase: 'done', result: await source.createInquiry(input, signal) }
  } catch {
    return { phase: 'failed' }
  }
}

/**
 * P13 목록 조회 상태(조회 전·로딩은 loading으로 보인다).
 * unavailable은 서버 연결 전이다. "문의 없음"(empty)이 아니다.
 */
export type InquiryListState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; items: readonly InquiryItem[] }

/** 목록 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. */
export async function runListInquiries(
  source: InquirySource | null,
  signal: AbortSignal,
): Promise<Exclude<InquiryListState, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    const items = await source.listInquiries(signal)
    return items.length === 0 ? { status: 'empty' } : { status: 'ready', items }
  } catch {
    return { status: 'error' }
  }
}

/** 처리 상태: 관리자 답변이 있으면 답변 완료, 없으면 답변 대기(명세 P13). */
export type InquiryStatusKey = 'answered' | 'waiting'

export const INQUIRY_STATUS_LABEL: Record<
  InquiryStatusKey,
  { label: string; guide: string }
> = {
  answered: { label: '답변 완료', guide: '관리자 답변이 등록되었어요.' },
  waiting: {
    label: '답변 대기',
    guide:
      '아직 답변이 등록되지 않았어요. 답변이 등록되면 이곳에서 확인할 수 있어요.',
  },
}

export function inquiryStatus(item: InquiryItem): InquiryStatusKey {
  return item.reply === null || item.reply === undefined
    ? 'waiting'
    : 'answered'
}

/** 문의 유형 표시 이름. 서버가 모르는 값을 주면 이름 없이 비워 둔다(유형을 지어내지 않는다). */
export function inquiryTypeLabel(value: string): string | null {
  return Object.hasOwn(INQUIRY_TYPE_LABEL, value)
    ? INQUIRY_TYPE_LABEL[value as InquiryType]
    : null
}

function timeOf(value: string | null | undefined): number {
  const time = value === null || value === undefined ? NaN : Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

/** 최신 문의가 위로 오게 정렬한다(날짜가 없는 항목은 맨 아래, 같으면 받은 순서 유지). */
export function sortInquiries(
  items: readonly InquiryItem[],
): readonly InquiryItem[] {
  return [...items].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
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

/** 접수일(한국 시간). 없거나 올바르지 않으면 "접수일 미기록". */
export function inquiryDateLabel(value: string | null): string {
  return timeOf(value) === 0
    ? '접수일 미기록'
    : dateFormat.format(new Date(value as string))
}

/** 답변 작성 시각(한국 시간). 없거나 올바르지 않으면 "작성일 미기록". */
export function replyTimeLabel(value: string | null): string {
  return timeOf(value) === 0
    ? '작성일 미기록'
    : timeFormat.format(new Date(value as string))
}

/** S02·P13 경로(문의 작성은 명세 S02, 내 문의는 P13. URL은 v5.0에 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_INQUIRY = '/support/inquiry'
export const PATH_MY_INQUIRIES = '/mypage/inquiries'
