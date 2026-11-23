import type {
  CommunityActor,
  CommunityBoard,
  CommunitySource,
  NewPostInput,
  PostComment,
  PostDetail,
  PostDetailData,
  PostSummary,
} from '../community.ts'

/**
 * [개발 전용] 커뮤니티 예시 저장소. 서버가 없어서 목록·상세·작성·댓글·응원 화면을 확인할 수 없는 문제를 우회하는 용도다.
 * 명세 data의 "시안 메모리 게시글·댓글"과 같은 방식이다.
 *
 * - 개발 서버에서만 불러온다(`communitySource.ts`가 `import.meta.env.DEV`로 막아 운영 빌드에는 이 파일이 들어가지 않는다).
 * - **탭 메모리에만 둔다.** localStorage·sessionStorage·IndexedDB에 쓰지 않으며 새로고침하면 처음 예시로 돌아간다. 서버로 보내지도 않는다.
 * - 예시 글은 `example: true`이고 작성자는 "개발용 예시"다. 실제 사용자의 글이 아니며 화면은 개발 서버에서 예시임을 밝힌다.
 *   등록한 글·댓글·응원도 이 탭 안에서만 보이는 예시이며 어디에도 게시되지 않는다.
 * - 권한 판정(작성자·답변 자격)은 하지 않는다. 화면이 회원 여부와 이해도로 입력을 열고 닫는다(실제 판정은 서버 몫).
 */

const EXAMPLE_AUTHOR = '개발용 예시'

interface StoredPost extends PostDetailData {
  comments: PostComment[]
  likedBy: Set<string>
}

function seed(): StoredPost[] {
  return [
    {
      id: 'dev-free-1',
      board: 'free',
      title: '오늘 처음으로 30분 걸었어요',
      excerpt: '무리하지 않고 천천히 걸었는데 기분이 좋아졌어요.',
      authorName: EXAMPLE_AUTHOR,
      createdAt: '2026-11-20T09:10:00+09:00',
      commentCount: 2,
      answered: null,
      qaCategory: null,
      example: true,
      body: '무리하지 않고 천천히 걸었는데 기분이 좋아졌어요.\n내일도 짧게라도 이어 가 보려고 해요.',
      likeCount: 3,
      likedByMe: null,
      likedBy: new Set(),
      comments: [
        {
          id: 'dev-free-1-c1',
          authorName: EXAMPLE_AUTHOR,
          authorTier: null,
          body: '시작이 제일 어려운데 대단해요!',
          createdAt: '2026-11-20T10:00:00+09:00',
        },
        {
          id: 'dev-free-1-c2',
          authorName: EXAMPLE_AUTHOR,
          authorTier: null,
          body: '저도 오늘 같이 걸었어요.',
          createdAt: '2026-11-20T12:30:00+09:00',
        },
      ],
    },
    {
      id: 'dev-free-2',
      board: 'free',
      title: '식단 기록 3일째예요',
      excerpt: '기록하니까 간식이 눈에 보여요.',
      authorName: EXAMPLE_AUTHOR,
      createdAt: '2026-11-21T20:00:00+09:00',
      commentCount: 0,
      answered: null,
      qaCategory: null,
      example: true,
      body: '기록하니까 간식이 눈에 보여요.\n다음 주는 간식 시간을 정해 볼 생각이에요.',
      likeCount: 0,
      likedByMe: null,
      likedBy: new Set(),
      comments: [],
    },
    {
      id: 'dev-free-3',
      board: 'free',
      title: '날짜가 기록되지 않은 예시 글',
      excerpt: null,
      authorName: EXAMPLE_AUTHOR,
      createdAt: null,
      commentCount: 0,
      answered: null,
      qaCategory: null,
      example: true,
      body: '작성일이 없는 글은 "작성일 미기록"으로 보여요.',
      likeCount: null,
      likedByMe: null,
      likedBy: new Set(),
      comments: [],
    },
    {
      id: 'dev-qa-1',
      board: 'qa',
      title: '운동을 처음 시작하는데 일주일에 몇 번이 좋을까요?',
      excerpt: null,
      authorName: EXAMPLE_AUTHOR,
      createdAt: '2026-11-21T08:00:00+09:00',
      commentCount: 0,
      answered: false,
      qaCategory: 'exercise',
      example: true,
      body: '운동을 거의 해 본 적이 없어요. 처음에는 일주일에 몇 번, 한 번에 얼마나 하면 좋을지 궁금해요.',
      likeCount: null,
      likedByMe: null,
      likedBy: new Set(),
      comments: [],
    },
    {
      id: 'dev-qa-2',
      board: 'qa',
      title: '아침을 거르면 점심에 너무 배고파요',
      excerpt: null,
      authorName: EXAMPLE_AUTHOR,
      createdAt: '2026-11-19T07:40:00+09:00',
      commentCount: 1,
      answered: true,
      qaCategory: 'meal',
      example: true,
      body: '아침을 자주 거르는데 점심에 한꺼번에 많이 먹게 돼요. 어떻게 해 보면 좋을까요?',
      likeCount: null,
      likedByMe: null,
      likedBy: new Set(),
      comments: [
        {
          id: 'dev-qa-2-a1',
          authorName: EXAMPLE_AUTHOR,
          authorTier: 'intermediate',
          body: '아침에 아주 가볍게라도 먹어 보면 점심 식사량이 조금 달라질 수 있어요. 먹은 양을 며칠 기록해 보면 내게 맞는 방법을 찾기 쉬워요.',
          createdAt: '2026-11-19T11:20:00+09:00',
        },
      ],
    },
  ]
}

/** 탭 메모리 저장소. 모듈이 다시 불러와지면(새로고침) 처음 예시로 돌아간다. */
const store: StoredPost[] = seed()
let counter = 0

function summaryOf(post: StoredPost): PostSummary {
  return {
    id: post.id,
    board: post.board,
    title: post.title,
    excerpt: post.excerpt,
    authorName: post.authorName,
    createdAt: post.createdAt,
    commentCount: post.board === 'free' ? post.comments.length : null,
    answered: post.board === 'qa' ? post.comments.length > 0 : null,
    qaCategory: post.qaCategory,
    ...(post.example ? { example: true } : {}),
  }
}

function detailOf(post: StoredPost, actor: CommunityActor | null): PostDetail {
  const { comments, likedBy, ...rest } = post
  void likedBy
  return {
    post: {
      ...rest,
      commentCount: post.board === 'free' ? comments.length : null,
      answered: post.board === 'qa' ? comments.length > 0 : null,
      likedByMe: actor === null ? null : post.likedBy.has(actor.id),
    },
    comments: comments.map((comment) => ({ ...comment })),
  }
}

function requireActor(actor: CommunityActor | null): CommunityActor {
  // 화면이 회원에게만 쓰기 입력을 열지만, 어떤 경로로든 비회원 쓰기가 오면 실패로 알린다(서버의 401과 같은 역할).
  if (actor === null) throw new Error('로그인이 필요해요')
  return actor
}

/** 개발용 연결. 현재 사용자(`actor`)는 작성자 이름과 응원 중복 방지에만 쓴다. */
export function createDevCommunitySource(
  actor: CommunityActor | null,
): CommunitySource {
  return {
    async listPosts(board: CommunityBoard) {
      return store
        .filter((post) => post.board === board)
        .map(summaryOf)
        .toSorted((a, b) => {
          // 작성일 없는 글은 맨 아래, 나머지는 최신순
          const ta = a.createdAt === null ? -Infinity : Date.parse(a.createdAt)
          const tb = b.createdAt === null ? -Infinity : Date.parse(b.createdAt)
          return tb - ta
        })
    },
    async getPost(board, postId) {
      const post = store.find((p) => p.board === board && p.id === postId)
      return post ? detailOf(post, actor) : null
    },
    async createPost(input: NewPostInput) {
      const me = requireActor(actor)
      counter += 1
      const id = `dev-new-${counter}`
      store.push({
        id,
        board: input.board,
        title: input.title,
        excerpt: null,
        authorName: me.nickname,
        createdAt: new Date().toISOString(),
        commentCount: 0,
        answered: input.board === 'qa' ? false : null,
        qaCategory: input.board === 'qa' ? input.category : null,
        body: input.body,
        likeCount: input.board === 'free' ? 0 : null,
        likedByMe: null,
        likedBy: new Set(),
        comments: [],
      })
      return { id }
    },
    async addComment(postId, body) {
      const me = requireActor(actor)
      const post = store.find((p) => p.id === postId)
      if (!post) throw new Error('글을 찾을 수 없어요')
      counter += 1
      const comment: PostComment = {
        id: `dev-comment-${counter}`,
        authorName: me.nickname,
        // 개발용 저장소는 답변자 등급을 판정하지 않는다(서버 몫).
        authorTier: null,
        body,
        createdAt: new Date().toISOString(),
      }
      post.comments.push(comment)
      return { ...comment }
    },
    async setLike(postId, liked) {
      const me = requireActor(actor)
      const post = store.find((p) => p.id === postId)
      if (!post) throw new Error('글을 찾을 수 없어요')
      const had = post.likedBy.has(me.id)
      if (liked && !had) {
        post.likedBy.add(me.id)
        post.likeCount = (post.likeCount ?? 0) + 1
      } else if (!liked && had) {
        post.likedBy.delete(me.id)
        post.likeCount = Math.max(0, (post.likeCount ?? 0) - 1)
      }
      return {
        liked: post.likedBy.has(me.id),
        likeCount: post.likeCount ?? 0,
      }
    },
  }
}
