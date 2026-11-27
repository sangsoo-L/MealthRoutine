import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import { loadKnowledgeLevels } from '../mypage/knowledgeSource.ts'
import {
  runGetPost,
  runListPosts,
  type CommunityBoard,
  type CommunitySource,
  type ListState,
  type PostDetail,
  type PostState,
  type QaCategory,
} from './community.ts'
import { createCommunitySource } from './communitySource.ts'

/**
 * 현재 사용자의 커뮤니티 연결. 사용자가 바뀌면 새로 만든다(모의 저장소가 작성자 이름에 쓰고, 서버 연결은 회원이면 상세에서 `mine`을 받는다).
 * 닉네임이 아직 없는 회원도 회원 연결이다(닉네임은 모의 저장소의 작성자 이름에만 쓴다).
 * 연결이 이 게시판을 지원하지 않으면 null이다(실제 서버는 아직 Q&A가 없어 "연결 전" 안내가 보인다, C1-D8).
 */
export function useCommunitySource(
  board: CommunityBoard,
): CommunitySource | null {
  const { user } = useAuth()
  const id = user?.id ?? null
  const nickname = user?.nickname ?? null
  const source = useMemo(
    () =>
      createCommunitySource(
        id !== null ? { id, nickname: nickname ?? '회원' } : null,
      ),
    [id, nickname],
  )
  return source !== null && source.supports.boards.includes(board)
    ? source
    : null
}

/**
 * 목록 조회(읽기 전용). 연결이 없으면 조회하지 않고 unavailable이다(글 없음이 아니다). 화면을 떠나면 진행 중 조회를 중단하고
 * 다시 시도(reload)는 같은 조회를 다시 한다.
 */
export function usePostList(
  source: CommunitySource | null,
  board: CommunityBoard,
): { state: ListState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    key: string
    state: Exclude<ListState, { status: 'loading' }>
  } | null>(null)
  const key = `${board}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    void runListPosts(source, board, controller.signal).then((state) => {
      if (!controller.signal.aborted) setLoaded({ key, state })
    })
    return () => controller.abort()
  }, [source, board, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return {
    state:
      loaded !== null && loaded.key === key
        ? loaded.state
        : { status: 'loading' },
    reload,
  }
}

/**
 * 상세 조회(읽기 전용). 비어 있는 id는 서버에 묻지 않고 없는 글이다.
 * `refresh`는 댓글·응원 같은 쓰기 뒤에 서버 값을 조용히 다시 읽는다(화면을 로딩으로 바꾸지 않고 도착하면 바꾼다).
 * `viewer`(지금 사용자 id, 비회원은 빈 값)가 키에 들어가 계정이 바뀌면 바로 "불러오는 중"이 된다: 이전 계정의 `mine:true`가
 * 새 계정 화면에 잠깐이라도 남지 않는다(C2).
 * `replace`는 수정 성공 응답의 글로 화면을 바로 바꾼다. 그 전에 시작된 조회가 늦게 도착해도 버린다(옛 내용으로 덮지 않음).
 */
export function usePost(
  source: CommunitySource | null,
  board: CommunityBoard,
  postId: string,
  viewer = '',
): {
  state: PostState
  reload: () => void
  refresh: () => void
  replace: (detail: PostDetail) => void
} {
  const [attempt, setAttempt] = useState(0)
  const [refreshes, setRefreshes] = useState(0)
  const [loaded, setLoaded] = useState<{
    key: string
    state: Exclude<PostState, { status: 'loading' }>
  } | null>(null)
  // replace가 올리는 세대. 조회는 시작할 때의 세대를 기억하고, 그 사이 replace가 있었으면 결과를 버린다.
  const generation = useRef(0)
  const base = `${viewer}:${board}:${postId}:${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    const started = generation.current
    void runGetPost(source, board, postId, controller.signal).then((state) => {
      if (!controller.signal.aborted && generation.current === started)
        setLoaded({ key: base, state })
    })
    return () => controller.abort()
  }, [source, board, postId, base, refreshes])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const refresh = useCallback(() => setRefreshes((n) => n + 1), [])
  const replace = useCallback(
    (detail: PostDetail) => {
      generation.current += 1
      setLoaded({ key: base, state: { status: 'ready', detail } })
    },
    [base],
  )
  return {
    state:
      loaded !== null && loaded.key === base
        ? loaded.state
        : { status: 'loading' },
    reload,
    refresh,
    replace,
  }
}

/**
 * Q&A 답변 자격의 화면 상태. 질문 카테고리와 같은 영역의 이해도(운동 질문은 운동 이해도, 식단 질문은 식단 이해도)가 중급·고급이면 입력을 연다.
 * 실제 권한 판정은 서버가 하고 이 값은 안내와 입력 표시에만 쓴다. 이해도를 알 수 없으면(미확인·조회 수단 없음) 입력을 열지 않는다(임의로 허용하지 않는다).
 * - guest: 비회원. loading: 확인 중. error: 이해도 조회 실패. unknown: 이해도·카테고리를 알 수 없다.
 * - beginner: 초보라 답변할 수 없다. allowed: 중급 이상이다.
 */
export type AnswerEligibility =
  | { kind: 'guest' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unknown' }
  | { kind: 'beginner' }
  | { kind: 'allowed' }

export function useAnswerEligibility(category: QaCategory | null): {
  eligibility: AnswerEligibility
  retry: () => void
} {
  const { status, user } = useAuth()
  const userId = status === 'authenticated' && user ? user.id : null
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    key: string
    result: 'error' | { tier: string | null } | 'unknown'
  } | null>(null)
  const key = `${userId ?? ''}:${category ?? ''}:${attempt}`

  useEffect(() => {
    if (userId === null || category === null) return
    let cancelled = false
    loadKnowledgeLevels(userId).then(
      (levels) => {
        if (cancelled) return
        if (levels === null) setLoaded({ key, result: 'unknown' })
        else
          setLoaded({ key, result: { tier: levels[category]?.tier ?? null } })
      },
      () => {
        if (!cancelled) setLoaded({ key, result: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, category, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  let eligibility: AnswerEligibility
  if (userId === null) eligibility = { kind: 'guest' }
  else if (category === null) eligibility = { kind: 'unknown' }
  else if (loaded === null || loaded.key !== key)
    eligibility = { kind: 'loading' }
  else if (loaded.result === 'error') eligibility = { kind: 'error' }
  else if (loaded.result === 'unknown') eligibility = { kind: 'unknown' }
  else if (
    loaded.result.tier === 'intermediate' ||
    loaded.result.tier === 'advanced'
  )
    eligibility = { kind: 'allowed' }
  else if (loaded.result.tier === 'beginner') eligibility = { kind: 'beginner' }
  else eligibility = { kind: 'unknown' }
  return { eligibility, retry }
}
