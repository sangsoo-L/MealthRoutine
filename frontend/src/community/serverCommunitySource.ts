import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../api/http.ts'
import type {
  CommunitySource,
  CreatePostResult,
  DeletePostResult,
  PostDetail,
  PostSummary,
  UpdatePostResult,
} from './community.ts'

/**
 * 커뮤니티 서버 연결(C1, 내 글 수정·삭제 C2). 실제 모드(개발 기본·운영 빌드)에서 쓴다. 모의 모드는 개발용 예시 저장소(dev/devCommunity.ts)다.
 *
 * 서버 계약(docs/api_community_v1.0.md). 서버 이름(ERD 값)을 화면 타입으로 바꾸는 일은 이 파일만 한다(결정 C1-D3):
 * - `GET /community/posts?postType=general&page=0&size=50` — 비회원 허용. `data.content[]` `{postId, postType, title, authorName, createdAt}`
 * - `GET /community/posts/{postId}` — 비회원 허용. `{postId, postType, title, content, authorName, createdAt, mine}`, 없는 글·숨긴 글 404 `POST_NOT_FOUND`
 * - `POST /community/posts` — 로그인 필요. `{postType:'general', title, content}` → 201 `{postId}`. 작성자는 서버가 토큰으로 정한다.
 * - `PATCH /community/posts/{postId}` — 작성자만. `{title, content}` → 200 상세와 같은 모양. 404 `POST_NOT_FOUND`(삭제·숨김·없음·자유게시판 아님), 403 `ACCESS_DENIED`(남의 글)
 * - `DELETE /community/posts/{postId}` — 작성자만. 200 `{success, message}`(data 없음). 오류는 PATCH와 같다.
 *
 * - 이번 서버는 자유게시판(general)만 있다. Q&A·댓글·응원은 `supports`로 "연결 전/준비 중"이 된다(C1-D6, D8).
 * - 목록은 토큰을 붙이지 않는다(`auth: 'none'`): 응답에 회원별 값이 없고, 만료 토큰 때문에 공개 글을 못 보는 일을 피한다.
 * - 상세는 회원 연결(`member: true`)이면 `auth: 'optional'`로 보내 `mine`을 받는다(C2-D1). 비회원 연결은 처음부터 `auth: 'none'`이다.
 *   회원 상세가 401·네트워크 오류·5xx로 실패하면(토큰 재발급 실패가 그대로 전해진 경우 포함) **비회원으로 한 번만** 다시 읽는다
 *   (C2-IMPL-2, mine=false → 버튼 없음). 404·400·403·형식 오류·사용자가 취소한 요청은 다시 읽지 않는다.
 * - 목록은 첫 50개만 가져온다(페이지 화면 없음, C1-D7).
 * - 서버 실패 때 예시 저장소로 넘어가지 않는다.
 */

type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

/** 목록 한 번에 가져오는 글 수(C1-D7). */
export const LIST_SIZE = 50

/** 공통 호출의 네트워크 오류 코드(api/core.ts `NETWORK_ERROR`와 같은 값). */
const NETWORK = 'NETWORK'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function positiveId(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null
}

/** 화면 주소의 글 id가 서버에 물어볼 수 있는 값인지(양의 정수, 앞에 0 없음, 안전한 정수 범위). */
export function isServerPostId(id: string): boolean {
  return /^[1-9][0-9]{0,15}$/.test(id) && Number.isSafeInteger(Number(id))
}

/**
 * 서버 시각(오프셋 없는 서울 시각 "YYYY-MM-DDTHH:mm:ss")을 오프셋이 있는 ISO 문자열로 바꾼다.
 * 브라우저 시간대와 상관없이 같은 순간으로 읽히게 한다. 모양이 다르면 null(화면은 "작성일 미기록").
 */
export function seoulIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return null
  const iso = `${value}+09:00`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/** 목록 행 변환. 자유게시판(general) 글만 받는다. 모양이 다르면 null(→ 목록 조회 실패). */
export function toSummary(value: unknown): PostSummary | null {
  const row = record(value)
  if (row === null) return null
  const id = positiveId(row.postId)
  if (
    id === null ||
    row.postType !== 'general' ||
    typeof row.title !== 'string' ||
    typeof row.authorName !== 'string'
  )
    return null
  return {
    id,
    board: 'free',
    title: row.title,
    excerpt: null,
    authorName: row.authorName,
    createdAt: seoulIso(row.createdAt),
    commentCount: null,
    answered: null,
    qaCategory: null,
  }
}

/** 상세 변환. 자유게시판 글이 아니면 'other'(→ 없는 글), 모양이 다르면 null(→ 조회 실패). `mine`은 boolean이어야 한다(C2-D1). */
export function toDetail(value: unknown): PostDetail | 'other' | null {
  const row = record(value)
  if (row === null) return null
  if (row.postType !== 'general')
    return typeof row.postType === 'string' ? 'other' : null
  const summary = toSummary(row)
  if (
    summary === null ||
    typeof row.content !== 'string' ||
    typeof row.mine !== 'boolean'
  )
    return null
  return {
    post: {
      ...summary,
      body: row.content,
      likeCount: null,
      likedByMe: null,
      mine: row.mine,
    },
    comments: [],
  }
}

/**
 * 회원 상세 조회 실패 중 비회원으로 한 번 다시 읽을 것(C2-IMPL-2). 공통 세션은 만료 토큰 → 재발급(또는 재발급 뒤 확인)이
 * 네트워크 오류·5xx로 실패하면 그 오류를 그대로 던지고, 재발급이 거절되면 원래 401을 던진다.
 * 403(정지 계정 등)·404·400·형식 오류·취소는 다시 읽지 않는다.
 */
export function shouldReadAsGuest(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 401) return true
  if (error.status === 0) return error.errorCode === NETWORK
  return error.status >= 500
}

/**
 * 등록 실패 분류(C1-R2, 신체정보 저장 `classifySaveError`와 같은 기준).
 * - 보내기 전에 막힘(상태 0이지만 네트워크 오류가 아님: 로그인 없음 등)·서버 4xx → rejected(저장되지 않음)
 * - 네트워크 오류·5xx·형식이 어긋난 2xx·ApiError가 아닌 예외 → uncertain(서버가 저장했을 수 있음)
 */
export function classifyCreateError(error: unknown): CreatePostResult {
  if (!(error instanceof ApiError)) return { kind: 'uncertain' }
  if (error.status === 0)
    return error.errorCode === NETWORK
      ? { kind: 'uncertain' }
      : { kind: 'rejected' }
  if (error.status >= 500) return { kind: 'uncertain' }
  if (error.status >= 200 && error.status < 300) return { kind: 'uncertain' }
  return { kind: 'rejected' }
}

/**
 * 수정·삭제 실패 분류(C2). 404 `POST_NOT_FOUND`만 gone, 403 `ACCESS_DENIED`만 forbidden이다(다른 403·404는 rejected).
 * 네트워크 오류·5xx·형식이 어긋난 2xx·ApiError가 아닌 예외는 바뀌었는지 모르므로 uncertain이다.
 */
export function classifyWriteError(
  error: unknown,
):
  | { kind: 'gone' }
  | { kind: 'forbidden' }
  | { kind: 'rejected' }
  | { kind: 'uncertain' } {
  if (!(error instanceof ApiError)) return { kind: 'uncertain' }
  if (error.status === 0)
    return error.errorCode === NETWORK
      ? { kind: 'uncertain' }
      : { kind: 'rejected' }
  if (error.status === 404 && error.errorCode === 'POST_NOT_FOUND')
    return { kind: 'gone' }
  if (error.status === 403 && error.errorCode === 'ACCESS_DENIED')
    return { kind: 'forbidden' }
  if (error.status >= 500) return { kind: 'uncertain' }
  if (error.status >= 200 && error.status < 300) return { kind: 'uncertain' }
  return { kind: 'rejected' }
}

/**
 * 실제 서버 구현. 시험에서는 가짜 fetch 세션의 request를 넘긴다. 앱은 공통 호출(apiRequest)을 쓴다.
 * `member`는 이 연결이 로그인한 사용자용인지다(`communitySource.ts`가 정한다). 비회원 연결은 상세도 토큰 없이 읽는다.
 */
export function createServerCommunitySource(
  request: RequestFn = apiRequest,
  { member = false }: { member?: boolean } = {},
): CommunitySource {
  return {
    supports: {
      boards: ['free'],
      comments: false,
      likes: false,
      editOwn: ['free'],
    },

    async listPosts(board, signal) {
      if (board !== 'free') throw new Error('지원하지 않는 게시판')
      const data = record(
        await request<unknown>(
          'GET',
          `/community/posts?postType=general&page=0&size=${LIST_SIZE}`,
          { auth: 'none', signal },
        ),
      )
      if (data === null || !Array.isArray(data.content))
        throw new Error('목록 형식 오류')
      const posts = data.content.map(toSummary)
      if (posts.some((post) => post === null)) throw new Error('목록 형식 오류')
      return posts as PostSummary[]
    },

    async getPost(board, postId, signal) {
      if (board !== 'free' || !isServerPostId(postId)) return null
      const path = `/community/posts/${encodeURIComponent(postId)}`
      let data: unknown
      try {
        try {
          data = await request<unknown>('GET', path, {
            auth: member ? 'optional' : 'none',
            signal,
          })
        } catch (error) {
          if (!member || signal.aborted || !shouldReadAsGuest(error))
            throw error
          // 공개 글은 로그인 상태가 꼬여도 읽혀야 한다: 토큰 없이 한 번만 다시 읽는다(mine=false).
          data = await request<unknown>('GET', path, { auth: 'none', signal })
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 404 &&
          error.errorCode === 'POST_NOT_FOUND'
        )
          return null
        throw error
      }
      const detail = toDetail(data)
      if (detail === 'other') return null
      if (detail === null || detail.post.id !== postId)
        throw new Error('상세 형식 오류')
      return detail
    },

    async createPost(input, signal) {
      // 이번 서버는 자유게시판만 받는다. 다른 게시판은 보내지 않는다(저장되지 않음이 확실).
      if (input.board !== 'free') return { kind: 'rejected' }
      let data: unknown
      try {
        data = await request<unknown>('POST', '/community/posts', {
          body: {
            postType: 'general',
            title: input.title,
            content: input.body,
          },
          expectStatus: 201,
          signal,
        })
      } catch (error) {
        return classifyCreateError(error)
      }
      const id = positiveId(record(data)?.postId)
      // 201인데 id를 알 수 없으면 서버가 저장했을 수 있다.
      return id === null ? { kind: 'uncertain' } : { kind: 'created', id }
    },

    async updatePost(postId, input, signal): Promise<UpdatePostResult> {
      // 보낼 수 없는 id는 보내지 않는다(바뀌지 않음이 확실).
      if (!isServerPostId(postId)) return { kind: 'rejected' }
      let data: unknown
      try {
        data = await request<unknown>(
          'PATCH',
          `/community/posts/${encodeURIComponent(postId)}`,
          {
            body: { title: input.title, content: input.body },
            expectStatus: 200,
            signal,
          },
        )
      } catch (error) {
        return classifyWriteError(error)
      }
      const detail = toDetail(data)
      // 200인데 고친 글을 알 수 없으면 바뀌었는지 모른다.
      if (detail === null || detail === 'other' || detail.post.id !== postId)
        return { kind: 'uncertain' }
      return { kind: 'updated', detail }
    },

    async deletePost(postId, signal): Promise<DeletePostResult> {
      if (!isServerPostId(postId)) return { kind: 'rejected' }
      try {
        // 성공 응답에는 data가 없다(공통 응답이 null 필드를 뺀다). 돌아온 값은 보지 않는다.
        await request<unknown>(
          'DELETE',
          `/community/posts/${encodeURIComponent(postId)}`,
          { expectStatus: 200, signal },
        )
      } catch (error) {
        return classifyWriteError(error)
      }
      return { kind: 'deleted' }
    },

    async addComment() {
      throw new Error('댓글은 아직 서버에 연결되지 않았어요')
    },

    async setLike() {
      throw new Error('응원은 아직 서버에 연결되지 않았어요')
    },
  }
}
