/**
 * 커뮤니티(C01·C01-2 목록, C05·C04 상세, C02·C02-1 작성)의 타입·검증·경로와 서버 연결 경계.
 *
 * **서버 계약은 확정되지 않았다.** 관련 API(README의 API 인수인계 §13 #78~89: 게시글 목록·작성·상세·수정·삭제, 댓글 조회·작성·수정·삭제, 신고, 게시글 좋아요·취소)는
 * 있지만 요청·응답 형식·게시판 구분 방식·정렬·페이지네이션·오류 형식이 모두 미정이다(API 정책 문서 §4). 아래 `CommunitySource`와 값 모양은
 * 화면이 받을 값의 **제안**일 뿐이고, 실제 요청·응답 변환은 이 인터페이스를 구현하는 쪽에 둔다(`createCommunitySource`는 운영 빌드에서 항상 null).
 *
 * 이 앱이 하지 않는 것: 게시글·댓글·좋아요를 서버 없이 저장한 것처럼 보이는 것, 작성자·권한·삭제 여부를 판정하는 것(서버 몫).
 * 내 글 수정·삭제 버튼은 서버가 준 `mine`으로만 보인다(C2).
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
  /**
   * 내가 쓴 글인지(C2-D1, 서버가 토큰의 회원과 작성자를 비교해 준 값). 수정·삭제 버튼을 보일지만 정하며 최종 권한은 서버가 다시 확인한다.
   * 없거나 null이면 모른다 → 버튼을 숨긴다. 닉네임으로 판정하지 않는다.
   */
  mine?: boolean | null
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
 * 연결이 지원하는 범위. 서버 연결(C1)은 자유게시판의 목록·상세·작성만 있고 Q&A·댓글·응원 API는 아직 없다.
 * 지원하지 않는 게시판은 연결이 없는 것처럼(unavailable) 보이고, 지원하지 않는 댓글·응원은 화면이 "준비 중"으로 숨긴다
 * (빈 댓글 0개·실패 메시지로 오해하지 않게, 결정 C1-D6).
 */
export interface CommunitySupports {
  boards: readonly CommunityBoard[]
  comments: boolean
  likes: boolean
  /**
   * 내 글 수정·삭제를 지원하는 게시판(C2). 서버는 자유게시판만 수정·삭제할 수 있다(C2-D3: 다른 유형은 404).
   * 없으면 지원하지 않는다(버튼 없음).
   */
  editOwn?: readonly CommunityBoard[]
}

/**
 * 글 등록 결과(C1-R2). 저장 여부를 확실히 아는 경우와 모르는 경우를 나눈다.
 * - created: 서버가 등록한 글의 id를 줬다.
 * - rejected: 저장되지 않은 것이 확실하다(보내기 전에 막힘, 서버가 4xx로 거절).
 * - uncertain: 서버가 이미 저장했을 수 있다(네트워크 오류·5xx·형식이 어긋난 성공 응답·이전 로그인의 늦은 응답).
 *   같은 글이 두 번 생길 수 있으므로 자동으로 다시 보내지 않고 목록에서 확인하라고 안내한다.
 */
export type CreatePostResult =
  { kind: 'created'; id: string } | { kind: 'rejected' } | { kind: 'uncertain' }

/** 글 수정 입력(C2-D2). 제목·본문 둘 다 보낸다. 게시판·작성자는 바꾸지 않는다. */
export interface PostEditInput {
  title: string
  body: string
}

/**
 * 글 수정 결과(C2). 확실한 경우와 모르는 경우를 나눈다.
 * - updated: 서버가 고친 글을 돌려줬다.
 * - gone: 404. 삭제됐거나 숨겨졌거나 없는 글이다(서버가 구분해 주지 않으므로 "삭제됨"으로 단정하지 않는다, C2-R4).
 * - forbidden: 403 ACCESS_DENIED. 내 글이 아니다(다른 403은 여기 넣지 않는다).
 * - rejected: 바뀌지 않은 것이 확실하다(보내기 전에 막힘, 그 밖의 4xx).
 * - uncertain: 바뀌었는지 모른다(네트워크 오류·5xx·형식이 어긋난 성공 응답).
 */
export type UpdatePostResult =
  | { kind: 'updated'; detail: PostDetail }
  | { kind: 'gone' }
  | { kind: 'forbidden' }
  | { kind: 'rejected' }
  | { kind: 'uncertain' }

/** 글 삭제 결과(C2). deleted만 "삭제했어요"라고 말할 수 있다. gone(404)은 원인을 모른다. */
export type DeletePostResult =
  | { kind: 'deleted' }
  | { kind: 'gone' }
  | { kind: 'forbidden' }
  | { kind: 'rejected' }
  | { kind: 'uncertain' }

/**
 * 서버 연결 경계. 읽기는 비회원도 가능하고 쓰기(작성·댓글·응원)는 회원만 한다(권한 판정은 서버).
 * - getPost: 없는 글·삭제된 글은 null이다(오류가 아니다). 실패는 예외로 던진다.
 * - createPost: 예외 대신 `CreatePostResult`를 돌려준다.
 * - 요청은 AbortSignal로 취소·이탈 때 중단할 수 있어야 한다.
 */
export interface CommunitySource {
  readonly supports: CommunitySupports
  listPosts(
    board: CommunityBoard,
    signal: AbortSignal,
  ): Promise<readonly PostSummary[]>
  getPost(
    board: CommunityBoard,
    postId: string,
    signal: AbortSignal,
  ): Promise<PostDetail | null>
  createPost(
    input: NewPostInput,
    signal: AbortSignal,
  ): Promise<CreatePostResult>
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
  /** 내 글 수정(C2). 예외 대신 `UpdatePostResult`를 돌려준다. */
  updatePost?(
    postId: string,
    input: PostEditInput,
    signal: AbortSignal,
  ): Promise<UpdatePostResult>
  /** 내 글 삭제(C2). 예외 대신 `DeletePostResult`를 돌려준다. */
  deletePost?(postId: string, signal: AbortSignal): Promise<DeletePostResult>
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
    (post.mine === undefined ||
      post.mine === null ||
      typeof post.mine === 'boolean') &&
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

/** 서버와 같은 최대 글자 수(C1-D4). 제목은 DB VARCHAR(250), 본문은 5,000자. */
export const TITLE_MAX = 250
export const BODY_MAX = 5000

export const COMPOSE_TOO_LONG_MESSAGE: Record<'title' | 'body', string> = {
  title: `제목은 ${TITLE_MAX}자까지 쓸 수 있어요.`,
  body: `내용은 ${BODY_MAX.toLocaleString('ko-KR')}자까지 쓸 수 있어요.`,
}

/** 글자 수(코드포인트). 이모지 1개 = 1자로 서버·DB와 같은 방식으로 센다. */
export function charCount(value: string): number {
  return [...value].length
}

/**
 * 작성 입력 검증(서버와 같은 규칙, ERR-2). 제목·내용은 앞뒤 공백을 뺀 뒤 비어 있으면 막고(`trim()`: 줄 바꿈·NBSP·전각 공백 포함),
 * 제목 250자·내용 5,000자를 넘으면 막는다(`tooLong`). Q&A는 카테고리(운동/식단)가 필수다(기타 값 차단).
 */
export function validateCompose(
  board: CommunityBoard,
  values: { category: string | null; title: string; body: string },
):
  | { ok: true; input: NewPostInput }
  | {
      ok: false
      errors: readonly ComposeField[]
      tooLong: readonly ComposeField[]
    } {
  const errors: ComposeField[] = []
  const tooLong: ComposeField[] = []
  const title = values.title.trim()
  const body = values.body.trim()
  if (board === 'qa' && !isQaCategory(values.category)) errors.push('category')
  if (title === '') errors.push('title')
  else if (charCount(title) > TITLE_MAX) {
    errors.push('title')
    tooLong.push('title')
  }
  if (body === '') errors.push('body')
  else if (charCount(body) > BODY_MAX) {
    errors.push('body')
    tooLong.push('body')
  }
  if (errors.length > 0) return { ok: false, errors, tooLong }
  if (board === 'qa' && isQaCategory(values.category))
    return {
      ok: true,
      input: { board: 'qa', category: values.category, title, body },
    }
  return { ok: true, input: { board: 'free', title, body } }
}

/** 로그인 작업 표식(`useAuth().beginAccountWork`)의 모양. 시험에서는 `createLoginWork`가 같은 값을 준다. */
export type BeginAccountWork = () => { isCurrent: () => boolean } | null

/**
 * 보낸 등록 요청의 결과와, 그 요청을 보낸 로그인 작업이 아직 지금 작업인지 묻는 함수(C1-R1·C1-C1).
 * 결과는 응답이 온 순간이 아니라 화면이 실제로 쓰는 순간(`settleSubmittedPost`)에 다시 판정한다.
 * 응답 처리와 화면 반영 사이에 새 로그인이 시작될 수 있기 때문이다(로그인 시작은 작업 번호만 바꾸고 user.id는 아직 그대로라
 * 폼 key·화면 이탈 취소만으로는 막지 못한다).
 */
export interface SubmittedPost {
  result: CreatePostResult
  isCurrent: () => boolean
}

const ALWAYS_CURRENT = () => true

/**
 * 글 등록 한 번(C1-R1). 로그인 작업에 묶는다.
 * - 로그인 작업이 없거나 보내기 직전에 이미 바뀌었으면 보내지 않는다 → rejected(보내지 않았으니 저장되지 않음이 확실).
 * - 보냈으면 그 작업의 현재성 검사를 결과와 함께 돌려준다. 판정은 `settleSubmittedPost`가 마지막에 한다.
 * - 예상하지 못한 예외도 저장 여부를 모르므로 uncertain이다.
 */
export async function submitPost(
  source: CommunitySource,
  input: NewPostInput,
  signal: AbortSignal,
  beginAccountWork: BeginAccountWork,
): Promise<SubmittedPost> {
  const guard = beginAccountWork()
  if (guard === null || !guard.isCurrent())
    return { result: { kind: 'rejected' }, isCurrent: ALWAYS_CURRENT }
  let result: CreatePostResult
  try {
    result = await source.createPost(input, signal)
  } catch {
    result = { kind: 'uncertain' }
  }
  return { result, isCurrent: () => guard.isCurrent() }
}

/**
 * 등록 결과를 화면에 반영하는 마지막 단계(C1-C1). 반영 직전에 로그인 작업을 다시 확인한다.
 * - 그 사이 로그인 작업이 바뀌었으면(새 로그인 시작, 같은 ID 재로그인 포함) 이동하지도 "등록하지 못했어요"라고 하지도 않고
 *   uncertain(목록에서 확인 안내)만 보인다. 다른 계정으로 바뀐 경우는 폼이 새로 그려지며 요청이 취소되어 여기까지 오지 않는다.
 * - 그대로면 결과대로: created → 이동, rejected → 실패 안내, uncertain → 확인 안내.
 */
export function settleSubmittedPost(
  submitted: SubmittedPost,
  handlers: {
    created: (id: string) => void
    rejected: () => void
    uncertain: () => void
  },
): void {
  if (!submitted.isCurrent()) {
    handlers.uncertain()
    return
  }
  const { result } = submitted
  if (result.kind === 'created') handlers.created(result.id)
  else if (result.kind === 'rejected') handlers.rejected()
  else handlers.uncertain()
}

// ── 내 글 수정·삭제(C2) ──────────────────────────────────────────────────

/**
 * 수정·삭제 버튼을 보일지(C2-D1·D3). 회원이고, 연결이 이 게시판의 내 글 수정을 지원하고, 서버가 내 글이라고 답한 때만.
 * 화면 표시용이며 최종 권한은 서버가 판정한다.
 */
export function canEditOwnPost(
  supports: Pick<CommunitySupports, 'editOwn'> | null,
  board: CommunityBoard,
  isMember: boolean,
  post: Pick<PostDetailData, 'mine'>,
): boolean {
  return (
    isMember &&
    supports?.editOwn?.includes(board) === true &&
    post.mine === true
  )
}

/**
 * 쓰기 결과가 지금도 화면에 반영해도 되는지(C2-R2, 세 겹 현재성).
 * - current: 같은 화면·같은 작업·같은 로그인 작업이다 → 결과대로 반영한다.
 * - login-changed: 같은 화면·같은 작업이지만 그 사이 로그인 작업이 바뀌었다(같은 ID 재로그인 포함) → 바꾸지도 이동하지도 않고
 *   "결과를 확인하지 못했어요"만 보인다.
 * - stale: 다른 글로 옮겼거나, 화면을 떠났거나, 취소·새 작업으로 무효가 됐다 → 아무것도 표시하지 않는다.
 */
export type WriteCurrency = 'current' | 'login-changed' | 'stale'

/**
 * 상세 화면의 쓰기 범위(C2-R2). 지금 화면에 떠 있는 글(대상 키)과 작업 번호를 가진다.
 * - `activate(key)`: 화면이 이 대상 글을 보이기 시작할 때(레이아웃 효과). 대상이 바뀌면 작업 번호가 올라 이전 작업이 무효가 된다.
 * - `deactivate(key)`: 그 화면이 사라질 때. 이미 다른 대상이 활성이면 건드리지 않는다.
 * - `begin(key)`: 쓰기 작업 하나를 시작한다. 작업 번호를 올려 이전 작업을 무효로 하고, 이 작업이 아직 지금 대상·지금 작업인지 묻는 함수를 돌려준다.
 *   key가 지금 활성 대상이 아니면 번호를 바꾸지 않고 항상 false인 함수를 돌려준다(이전 화면이 지금 화면의 진행 중 작업을 무효로 만들지 않는다).
 *   이전 화면이 들고 있던 고정 key끼리 비교하지 않고 **지금 활성 대상**과 비교한다(정리가 늦는 구간 대비).
 * - `invalidate()`: 취소·편집 종료로 진행 중 작업을 무효로 한다.
 */
const NEVER_CURRENT = (): boolean => false

export function createPostWriteScope() {
  let active: string | null = null
  let op = 0
  return {
    activate(key: string) {
      if (active !== key) {
        active = key
        op += 1
      }
    },
    deactivate(key: string) {
      if (active === key) {
        active = null
        op += 1
      }
    },
    begin(key: string): () => boolean {
      // 지금 활성 대상이 아닌(정리가 늦은 이전 화면의) 시작 요청은 번호를 건드리지 않는다:
      // 그러지 않으면 지금 화면에서 진행 중인 작업까지 무효가 된다(Codex C2-C1).
      if (active !== key) return NEVER_CURRENT
      op += 1
      const mine = op
      return () => active === key && op === mine
    },
    invalidate() {
      op += 1
    },
  }
}

export type PostWriteScope = ReturnType<typeof createPostWriteScope>

/** 보낸 쓰기 요청의 결과와, 화면에 반영하는 순간 다시 묻는 현재성(C2-IMPL-3). */
export interface SubmittedWrite<R> {
  result: R
  currency: () => WriteCurrency
}

const STALE = (): WriteCurrency => 'stale'

/**
 * 수정·삭제 요청 한 번(C2-R2). 로그인 작업과 대상·작업 번호에 묶는다.
 * - 지금 대상이 아니면 보내지 않고 stale(아무것도 표시하지 않음).
 * - 로그인 작업이 없거나 이미 바뀌었으면 보내지 않고 rejected(바뀌지 않은 것이 확실).
 * - 보냈으면 결과와 함께 현재성 판정을 돌려준다. 판정은 `settlePostWrite`가 반영 직전에 한다.
 * - 연결이 예상하지 못한 예외를 던지면 결과를 모르므로 uncertain이다.
 */
async function submitPostWrite<R>(
  send: (signal: AbortSignal) => Promise<R>,
  signal: AbortSignal,
  beginAccountWork: BeginAccountWork,
  isTargetCurrent: () => boolean,
  uncertain: R,
  rejected: R,
): Promise<SubmittedWrite<R>> {
  if (!isTargetCurrent()) return { result: rejected, currency: STALE }
  const guard = beginAccountWork()
  const targetNow = (): boolean => !signal.aborted && isTargetCurrent()
  if (guard === null || !guard.isCurrent())
    return {
      result: rejected,
      currency: () => (targetNow() ? 'current' : 'stale'),
    }
  let result: R
  try {
    result = await send(signal)
  } catch {
    result = uncertain
  }
  return {
    result,
    currency: () =>
      !targetNow() ? 'stale' : guard.isCurrent() ? 'current' : 'login-changed',
  }
}

/** 내 글 수정 요청(C2). 연결이 수정을 지원하지 않으면 보내지 않고 rejected다. */
export function submitPostEdit(
  source: CommunitySource,
  postId: string,
  input: PostEditInput,
  signal: AbortSignal,
  beginAccountWork: BeginAccountWork,
  isTargetCurrent: () => boolean,
): Promise<SubmittedWrite<UpdatePostResult>> {
  const update = source.updatePost?.bind(source)
  return submitPostWrite<UpdatePostResult>(
    (s) =>
      update ? update(postId, input, s) : Promise.resolve({ kind: 'rejected' }),
    signal,
    beginAccountWork,
    isTargetCurrent,
    { kind: 'uncertain' },
    { kind: 'rejected' },
  )
}

/** 내 글 삭제 요청(C2). 연결이 삭제를 지원하지 않으면 보내지 않고 rejected다. */
export function submitPostDelete(
  source: CommunitySource,
  postId: string,
  signal: AbortSignal,
  beginAccountWork: BeginAccountWork,
  isTargetCurrent: () => boolean,
): Promise<SubmittedWrite<DeletePostResult>> {
  const remove = source.deletePost?.bind(source)
  return submitPostWrite<DeletePostResult>(
    (s) => (remove ? remove(postId, s) : Promise.resolve({ kind: 'rejected' })),
    signal,
    beginAccountWork,
    isTargetCurrent,
    { kind: 'uncertain' },
    { kind: 'rejected' },
  )
}

/**
 * 쓰기 결과를 화면에 반영하는 마지막 단계(C2-IMPL-3). **모든 결과**(성공·gone·forbidden·rejected·uncertain)와
 * 그에 따른 화면 교체·다시 불러오기·이동·안내가 이 판정을 거친다.
 * - stale → 아무것도 하지 않는다. login-changed → `unconfirmed`만(교체·이동 없음). current → 결과 종류별 처리.
 */
export function settlePostWrite<R extends { kind: string }>(
  submitted: SubmittedWrite<R>,
  handlers: {
    [K in R['kind']]: (result: Extract<R, { kind: K }>) => void
  } & { unconfirmed: () => void },
): void {
  const currency = submitted.currency()
  if (currency === 'stale') return
  if (currency === 'login-changed') {
    handlers.unconfirmed()
    return
  }
  const kind = submitted.result.kind as R['kind']
  const handler = handlers[kind] as unknown as (result: R) => void
  handler(submitted.result)
}

/** 수정 결과 안내 문구(C2-R3·R4). gone은 "삭제됨"으로 단정하지 않는다. */
export const EDIT_RESULT_TEXT = {
  updated: '글을 수정했어요.',
  gone: '글을 찾을 수 없어요. 삭제됐거나 지금은 볼 수 없는 글일 수 있어요. 입력한 내용은 그대로 남아 있어요.',
  forbidden: '내 글만 수정할 수 있어요.',
  rejected: '수정하지 못했어요. 입력한 내용은 그대로 남아 있어요.',
  uncertain:
    '수정됐는지 확인하지 못했어요. 다른 기기나 탭에서 이 글을 고쳤다면, 다시 저장할 때 그 내용을 덮어써요.',
  unconfirmed:
    '로그인 상태가 바뀌어 수정 결과를 확인하지 못했어요. 글을 다시 불러와 확인해 주세요.',
  cancelledWhileSaving:
    '편집을 그만뒀어요. 이미 보낸 수정은 서버에 반영됐을 수 있어요. 글을 다시 불러와 확인해 주세요.',
} as const

/**
 * 편집 취소 뒤 안내(Codex C2-C2). 입력만 하던 중의 취소는 아무것도 보내지 않았으니 안내가 없다.
 * 저장 요청을 보낸 뒤의 취소는 화면의 대기만 끝낼 뿐 서버가 이미 받은 수정을 되돌리지 않으므로,
 * 저장이 취소됐다고 말하지 않고 반영됐을 수 있다고 알린 뒤 다시 불러오기 버튼(recheck)을 남긴다.
 */
export function editCancelNotice(
  wasSaving: boolean,
): { tone: 'error'; text: string; recheck: true } | null {
  return wasSaving
    ? {
        tone: 'error',
        text: EDIT_RESULT_TEXT.cancelledWhileSaving,
        recheck: true,
      }
    : null
}

/** 삭제 결과 안내 문구(C2-R4). deleted만 "삭제했어요"라고 말한다. */
export const DELETE_RESULT_TEXT = {
  deleted: '글을 삭제했어요.',
  gone: '글을 찾을 수 없어 목록으로 이동했어요.',
  forbidden: '내 글만 삭제할 수 있어요.',
  rejected: '삭제하지 못했어요. 잠시 후 다시 시도해 주세요.',
  uncertain: '삭제됐는지 확인하지 못했어요. 다시 시도해 주세요.',
  unconfirmed:
    '로그인 상태가 바뀌어 삭제 결과를 확인하지 못했어요. 글을 다시 불러와 확인해 주세요.',
} as const

/** 삭제 뒤 목록으로 넘기는 안내 표지(라우터 state). */
export type BoardNotice = 'deleted' | 'gone'

export function isBoardNotice(value: unknown): value is BoardNotice {
  return value === 'deleted' || value === 'gone'
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

/** 서버가 아직 댓글·응원을 지원하지 않을 때(C1-D6). 댓글이 없다는 뜻이 아니다. */
export const COMMENTS_UNSUPPORTED_TEXT =
  '댓글과 응원은 준비 중이에요. 곧 이 글에 댓글을 남길 수 있어요.'

export const PRIVACY_WARNING =
  '올린 글은 누구나 볼 수 있어요. 이름·연락처·주소 같은 개인정보는 적지 마세요.'

export const MEDICAL_NOTE =
  '답변은 참고용이며 의료적 진단이나 처방을 대신하지 않아요.'
