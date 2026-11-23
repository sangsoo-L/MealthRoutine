/**
 * 커뮤니티(C01·C01-2 목록, C05·C04 상세, C02·C02-1 작성)의 타입·검증·경로와 서버 연결 경계.
 *
 * **서버 계약은 확정되지 않았다.** 관련 API(README의 API 인수인계 §13 #78~89: 게시글 목록·작성·상세·수정·삭제, 댓글 조회·작성·수정·삭제, 신고, 게시글 좋아요·취소)는
 * 있지만 요청·응답 형식·게시판 구분 방식·정렬·페이지네이션·오류 형식이 모두 미정이다(API 정책 문서 §4). 아래 `CommunitySource`와 값 모양은
 * 화면이 받을 값의 **제안**일 뿐이고, 실제 요청·응답 변환은 이 인터페이스를 구현하는 쪽에 둔다(`createCommunitySource`는 운영 빌드에서 항상 null).
 *
 * 이 앱이 하지 않는 것: 게시글·댓글·좋아요를 서버 없이 저장한 것처럼 보이는 것, 작성자·권한·삭제 여부를 판정하는 것(서버 몫).
 * 삭제된 루틴 좋아요 API는 쓰지 않으며 "응원"은 게시글 좋아요(#88·#89)에 대응한다.
 */

/** 게시판. free: 자유게시판(C01·C05), qa: 초보자 Q&A(C01-2·C04). 운동 루틴 공유(C01-1·C02-2·C03)는 후속이라 없다. */
export type CommunityBoard = 'free' | 'qa'

/** Q&A 질문의 메인 카테고리(필수, 단일 선택). */
export type QaCategory = 'exercise' | 'meal'

export const QA_CATEGORIES: readonly QaCategory[] = ['exercise', 'meal']
export const QA_CATEGORY_LABEL: Record<QaCategory, string> = {
  exercise: '운동',
  meal: '식단',
}

/** 답변자 등급(서버가 주는 값). Q&A 답변은 중급·고급 회원이 한다. */
export type AnswererTier = 'intermediate' | 'advanced'
export const ANSWERER_TIER_LABEL: Record<AnswererTier, string> = {
  intermediate: '중급',
  advanced: '고급',
}

/** 게시글 목록의 한 행(서버가 준 값). 없는 값은 null이며 화면이 만들지 않는다. */
export interface PostSummary {
  id: string
  board: CommunityBoard
  title: string
  /** 목록에 보이는 요약(서버가 줄 때만). */
  excerpt: string | null
  authorName: string
  /** 작성 시각(ISO 8601). 없으면 null → "작성일 미기록". */
  createdAt: string | null
  /** 댓글 수(자유게시판 목록에 표시). */
  commentCount: number | null
  /** Q&A 답변 여부(Q&A 목록의 배지). 서버가 주지 않으면 null. */
  answered: boolean | null
  /** Q&A 카테고리(Q&A 글). */
  qaCategory: QaCategory | null
  /** 개발 서버 전용 예시 글 표지. 실제 서버 글에는 없다. */
  example?: boolean
}

/** 게시글 상세(서버가 준 값). */
export interface PostDetailData extends PostSummary {
  body: string
  /** 응원(게시글 좋아요) 수. */
  likeCount: number | null
  /** 내가 응원했는지(회원에게만 의미가 있다). */
  likedByMe: boolean | null
}

/** 댓글(자유게시판) 또는 답변(Q&A). */
export interface PostComment {
  id: string
  authorName: string
  /** 답변자 등급(Q&A). 서버가 주지 않으면 null → "등급 확인 전". */
  authorTier: AnswererTier | null
  body: string
  createdAt: string | null
}

export interface PostDetail {
  post: PostDetailData
  comments: readonly PostComment[]
}

/** 글 작성 입력. 작성자·작성 시각·게시판 권한은 서버가 정한다. */
export type NewPostInput =
  | { board: 'free'; title: string; body: string }
  | { board: 'qa'; category: QaCategory; title: string; body: string }

/**
 * 서버 연결 경계(확정된 API가 아니다). 읽기는 비회원도 가능하고 쓰기(작성·댓글·응원)는 회원만 한다(권한 판정은 서버).
 * - getPost: 없는 글·삭제된 글은 null이다(오류가 아니다). 실패는 예외로 던진다.
 * - 요청은 AbortSignal로 취소·이탈 때 중단할 수 있어야 한다.
 */
export interface CommunitySource {
  listPosts(
    board: CommunityBoard,
    signal: AbortSignal,
  ): Promise<readonly PostSummary[]>
  getPost(
    board: CommunityBoard,
    postId: string,
    signal: AbortSignal,
  ): Promise<PostDetail | null>
  createPost(input: NewPostInput, signal: AbortSignal): Promise<{ id: string }>
  addComment(
    postId: string,
    body: string,
    signal: AbortSignal,
  ): Promise<PostComment>
  setLike(
    postId: string,
    liked: boolean,
    signal: AbortSignal,
  ): Promise<{ liked: boolean; likeCount: number }>
}

/** 개발 서버의 예시 저장소가 알아야 하는 현재 사용자(운영의 서버는 인증 토큰으로 안다). */
export interface CommunityActor {
  id: string
  nickname: string
}

// ── 경로(사용자 승인 임시 확정 URL, v5.0은 URL을 정의하지 않는다) ──────────────

export const PATH_COMMUNITY = '/community'
export const PATH_COMMUNITY_NEW = '/community/posts/new'
export const PATH_QA = '/community/qa'
export const PATH_QA_NEW = '/community/qa/new'

export function postPath(board: CommunityBoard, id: string): string {
  return board === 'qa'
    ? `${PATH_QA}/${encodeURIComponent(id)}`
    : `${PATH_COMMUNITY}/posts/${encodeURIComponent(id)}`
}

export const BOARD_LIST_PATH: Record<CommunityBoard, string> = {
  free: PATH_COMMUNITY,
  qa: PATH_QA,
}
export const BOARD_NEW_PATH: Record<CommunityBoard, string> = {
  free: PATH_COMMUNITY_NEW,
  qa: PATH_QA_NEW,
}

// ── 조회 상태 ────────────────────────────────────────────────────────────

/**
 * 목록 조회 상태. unavailable은 서버 연결 전이다(글이 없다는 뜻이 아니다). empty는 서버가 글이 없다고 답한 경우다.
 */
export type ListState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; posts: readonly PostSummary[] }

/** 상세 조회 상태. notfound는 서버가 없는 글·삭제된 글이라고 답한 경우다. */
export type PostState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'notfound' }
  | { status: 'ready'; detail: PostDetail }

const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'
const isNullableCount = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' && Number.isInteger(value) && value >= 0)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isQaCategory(value: unknown): value is QaCategory {
  return value === 'exercise' || value === 'meal'
}

/** 서버 값이 목록 행의 모양인지(모르는 모양은 조회 실패로 본다. 글을 지어내지 않는다). */
export function isPostSummary(value: unknown): value is PostSummary {
  if (!isObject(value)) return false
  return (
    isString(value.id) &&
    value.id !== '' &&
    (value.board === 'free' || value.board === 'qa') &&
    isString(value.title) &&
    isNullableString(value.excerpt) &&
    isString(value.authorName) &&
    isNullableString(value.createdAt) &&
    isNullableCount(value.commentCount) &&
    (value.answered === null || typeof value.answered === 'boolean') &&
    (value.qaCategory === null || isQaCategory(value.qaCategory))
  )
}

function isComment(value: unknown): value is PostComment {
  if (!isObject(value)) return false
  return (
    isString(value.id) &&
    isString(value.authorName) &&
    (value.authorTier === null ||
      value.authorTier === 'intermediate' ||
      value.authorTier === 'advanced') &&
    isString(value.body) &&
    isNullableString(value.createdAt)
  )
}

export function isPostDetail(value: unknown): value is PostDetail {
  if (!isObject(value) || !isObject(value.post)) return false
  const post = value.post
  return (
    isPostSummary(post) &&
    isString(post.body) &&
    isNullableCount(post.likeCount) &&
    (post.likedByMe === null || typeof post.likedByMe === 'boolean') &&
    Array.isArray(value.comments) &&
    value.comments.every(isComment)
  )
}

/** 목록 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. */
export async function runListPosts(
  source: CommunitySource | null,
  board: CommunityBoard,
  signal: AbortSignal,
): Promise<Exclude<ListState, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    const posts = await source.listPosts(board, signal)
    return Array.isArray(posts) &&
      posts.every((post) => isPostSummary(post) && post.board === board)
      ? { status: 'ready', posts }
      : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}

/**
 * 상세 조회 한 번의 결과. 비어 있거나 올바르지 않은 id는 서버에 묻지 않고 없는 글이다.
 * 서버가 준 글이 다른 게시판 글이거나 모양이 다르면 조회 실패다(다른 게시판 글을 이 화면에 보이지 않는다).
 */
export async function runGetPost(
  source: CommunitySource | null,
  board: CommunityBoard,
  postId: string,
  signal: AbortSignal,
): Promise<Exclude<PostState, { status: 'loading' }>> {
  if (postId.trim() === '') return { status: 'notfound' }
  if (source === null) return { status: 'unavailable' }
  try {
    const detail = await source.getPost(board, postId, signal)
    if (detail === null) return { status: 'notfound' }
    return isPostDetail(detail) && detail.post.board === board
      ? { status: 'ready', detail }
      : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}

// ── 표시 규칙 ────────────────────────────────────────────────────────────

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 작성일(한국 시간). 없거나 올바르지 않으면 "작성일 미기록"(없는 날짜를 만들지 않는다). */
export function formatPostDate(value: string | null): string {
  const time = value === null ? NaN : Date.parse(value)
  return Number.isNaN(time)
    ? '작성일 미기록'
    : dateFormat.format(new Date(time))
}

/** 서버가 준 횟수 표시. 없으면 null이라 숫자를 쓰지 않는다. */
export function countLabel(value: number | null): string {
  return value === null ? '' : String(value)
}

// ── 작성 검증 ────────────────────────────────────────────────────────────

export type ComposeField = 'category' | 'title' | 'body'

export const COMPOSE_ERROR_MESSAGE: Record<ComposeField, string> = {
  category: '운동과 식단 중 하나를 선택해 주세요.',
  title: '제목을 입력해 주세요.',
  body: '내용을 입력해 주세요.',
}

export const COMMENT_ERROR_MESSAGE = '내용을 입력해 주세요.'

/**
 * 작성 입력 검증. 제목·내용은 앞뒤 공백을 뺀 뒤 비어 있으면 막고, Q&A는 카테고리(운동/식단)가 필수다(기타 값 차단).
 * 글자 수 제한은 명세에 없어 만들지 않는다.
 */
export function validateCompose(
  board: CommunityBoard,
  values: { category: string | null; title: string; body: string },
):
  | { ok: true; input: NewPostInput }
  | { ok: false; errors: readonly ComposeField[] } {
  const errors: ComposeField[] = []
  const title = values.title.trim()
  const body = values.body.trim()
  if (board === 'qa' && !isQaCategory(values.category)) errors.push('category')
  if (title === '') errors.push('title')
  if (body === '') errors.push('body')
  if (errors.length > 0) return { ok: false, errors }
  if (board === 'qa' && isQaCategory(values.category))
    return {
      ok: true,
      input: { board: 'qa', category: values.category, title, body },
    }
  return { ok: true, input: { board: 'free', title, body } }
}

/** 댓글·답변 입력 검증(앞뒤 공백을 뺀 뒤 비어 있으면 막는다). */
export function validateComment(value: string): string | null {
  const body = value.trim()
  return body === '' ? null : body
}

// ── 안내 문구 ────────────────────────────────────────────────────────────

/** 서버 연결 전 안내(목록·상세). 글이 없다는 뜻이 아니라는 점을 분명히 한다. */
export const COMMUNITY_UNAVAILABLE_TEXT =
  '커뮤니티 글을 아직 불러올 수 없어요. 서버에 연결되기 전이라 글이 없다는 뜻은 아니에요.'

/** 서버 연결 전 작성 안내. 등록·저장되지 않는다는 사실을 분명히 알린다. */
export const COMPOSE_UNAVAILABLE_TEXT =
  '커뮤니티 등록 기능이 아직 서버에 연결되지 않았어요. 지금은 글을 올릴 수 없고, 작성한 내용은 등록되지도 저장되지도 않아요.'

export const PRIVACY_WARNING =
  '올린 글은 누구나 볼 수 있어요. 이름·연락처·주소 같은 개인정보는 적지 마세요.'

export const MEDICAL_NOTE =
  '답변은 참고용이며 의료적 진단이나 처방을 대신하지 않아요.'
