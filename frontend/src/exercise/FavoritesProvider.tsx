import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { registerAccountCleanup } from '../auth/accountScope.ts'
import { useAuth } from '../auth/authContext.ts'
import type { ExerciseFavoriteRepository } from './favoriteRepository.ts'
import { createFavoriteRepository } from './favoriteSource.ts'
import {
  FavoritesContext,
  type FavoritesContextValue,
  type FavoritesStatus,
  type ToggleResult,
} from './favoritesContext.ts'

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

/**
 * 로그인 세대. 로그인 성공·로그아웃·세션 종료 때(clearAccountScopedData) 1씩 오른다.
 * 같은 계정으로 다시 로그인해도 바뀌므로, 이전 로그인 때 보낸 조회·저장의 늦은 응답을 계정 id만으로는 가려낼 수 없는 경우를 막는다.
 */
let accountGeneration = 0
registerAccountCleanup(() => {
  accountGeneration += 1
})

type Settled =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; ids: ReadonlySet<string> }

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  list: Settled
}

/** 계정별로 운동 id 모음을 따로 들고 있는 값. 다른 계정의 저장 완료가 지금 계정의 값을 건드리지 않게 한다. */
type ScopedIds = ReadonlyMap<string, ReadonlySet<string>>

const EMPTY_SCOPED: ScopedIds = new Map()

function loadKey(userId: string, attempt: number): string {
  return `${userId}|${attempt}`
}

/** owner 계정의 id 모음에서 id를 넣거나 뺀 새 값. 모음이 비면 계정 항목을 지운다. */
function updateScoped(
  prev: ScopedIds,
  owner: string,
  id: string,
  on: boolean,
): ScopedIds {
  const base = prev.get(owner) ?? EMPTY_IDS
  if (base.has(id) === on) return prev
  const ids = new Set(base)
  if (on) ids.add(id)
  else ids.delete(id)
  const next = new Map(prev)
  if (ids.size === 0) next.delete(owner)
  else next.set(owner, ids)
  return next
}

/** owner 계정의 모음 전체를 지운 새 값. 없으면 그대로 돌려준다. */
function clearScoped(prev: ScopedIds, owner: string): ScopedIds {
  if (!prev.has(owner)) return prev
  const next = new Map(prev)
  next.delete(owner)
  return next
}

/** 현재 계정의 모음. 비회원이거나 항목이 없으면 빈 모음이다. */
function scopedFor(scoped: ScopedIds, userId: string | null) {
  return (userId !== null ? scoped.get(userId) : undefined) ?? EMPTY_IDS
}

/**
 * 운동 즐겨찾기 공유 상태 제공자. 회원 한 명의 즐겨찾기 목록을 한 번만 조회해 앱 전체가 같은 값을 쓴다.
 * 어느 화면(E02, 이후 W13·P07)에서 바꿔도 같은 상태가 바뀌어 별 표시가 서로 어긋나지 않는다.
 *
 * - 배치: App에서 AuthProvider 안, RouterProvider 바깥. 비회원도 보는 공개 화면(E02)과 이후 회원 전용 화면이 모두 덮이고,
 *   화면을 옮겨도 상태가 유지된다. 이 컴포넌트를 둔다고 즐겨찾기가 켜지는 것은 아니다: 비회원이면 저장소를 만들지도 않는다.
 * - 조회: 인증된 회원(user.id)일 때만 한다. 계정(또는 reload 횟수)이 바뀌면 이전 값을 버리고 다시 조회한다.
 * - 저장: 저장이 성공한 뒤에만 ids를 바꾼다. 실패하면 ids는 그대로이고 그 운동의 failedIds에만 표시된다.
 *   같은 운동은 저장 중에 다시 눌러도 무시한다(저장소도 멱등이라 이중으로 막는다). 다른 운동은 서로 막지 않는다.
 * - 계정 전환·로그아웃: 이전 계정의 값은 즉시 보이지 않고, 늦게 도착한 이전 계정의 조회·저장 결과는 반영하지 않는다.
 *   같은 계정으로 다시 로그인한 경우도 같다: 조회 번호(attempt)를 0으로 되돌리지 않고 계속 올리며, 요청을 보낸 때의 로그인 세대가
 *   지금과 다르면 응답을 버린다(이전 로그인의 늦은 등록·해제 성공이 새 조회 결과를 덮어쓰지 않게).
 * - 저장소가 요청마다 시간 상한을 두므로(api/apiFavoriteRepository.ts) 서버가 답하지 않아도 로딩은 error(다시 시도)로,
 *   저장은 failed로 끝나 버튼 잠금이 풀린다.
 * 저장소 인터페이스(favoriteRepository)는 list/add/remove만 쓴다. 사용자 id는 인증 Context의 값만 쓴다.
 * createRepository는 Chrome 회귀 하네스가 응답 시점을 정하는 저장소를 넣을 때만 쓴다. 앱은 넘기지 않는다(기본은 favoriteSource).
 */
export default function FavoritesProvider({
  children,
  createRepository = createFavoriteRepository,
}: {
  children: ReactNode
  createRepository?: (userId: string) => ExerciseFavoriteRepository | null
}) {
  const { status: authStatus, user } = useAuth()
  // 인증이 확정된(authenticated) 회원일 때만 사용자 id를 쓴다. 사용자 정보가 남아 있어도 인증 상태가 확정이 아니면 비회원으로 본다(useIsMember와 같은 기준).
  const userId = authStatus === 'authenticated' && user ? user.id : null

  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [saving, setSaving] = useState<ScopedIds>(EMPTY_SCOPED)
  const [failed, setFailed] = useState<ScopedIds>(EMPTY_SCOPED)
  const busy = useRef<Set<string>>(new Set())

  // 계정이 바뀌면 지난 계정의 값을 바로 버린다(렌더 중 상태 보정). 로그아웃 뒤 회원 데이터가 메모리에 남지 않는다.
  const [prevUserId, setPrevUserId] = useState(userId)
  if (prevUserId !== userId) {
    setPrevUserId(userId)
    // 0으로 되돌리지 않는다. 같은 계정으로 다시 로그인해도 이전 로그인 때의 조회 키와 겹치지 않게 한다.
    setAttempt((n) => n + 1)
    setLoaded(null)
    setSaving(EMPTY_SCOPED)
    setFailed(EMPTY_SCOPED)
  }

  const key = userId ? loadKey(userId, attempt) : null

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const effectKey = loadKey(userId, attempt)
    const generation = accountGeneration
    const repository = createRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLoaded({ key: effectKey, list: { status: 'unavailable' } })
        }
      })
      return () => {
        cancelled = true
      }
    }
    // 요청한 뒤 로그인 세대가 바뀌었으면(같은 계정 재로그인 포함) 그 응답은 버리고 다시 조회한다.
    const stale = () => {
      if (generation === accountGeneration) return false
      if (!cancelled) setAttempt((n) => n + 1)
      return true
    }
    repository.list().then(
      (ids) => {
        if (stale()) return
        if (!cancelled) {
          setLoaded({
            key: effectKey,
            list: { status: 'ready', ids: new Set(ids) },
          })
        }
      },
      () => {
        if (stale()) return
        if (!cancelled) {
          setLoaded({ key: effectKey, list: { status: 'error' } })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, attempt, createRepository])

  const list: Settled | null =
    key !== null && loaded !== null && loaded.key === key ? loaded.list : null
  const readyIds = list?.status === 'ready' ? list.ids : null

  const status: FavoritesStatus = !userId
    ? 'guest'
    : list === null
      ? 'loading'
      : list.status

  const reload = useCallback(() => {
    if (!userId) return
    setFailed((prev) => clearScoped(prev, userId))
    setAttempt((n) => n + 1)
  }, [userId])

  const toggle = useCallback(
    async (exerciseId: string): Promise<ToggleResult> => {
      if (!userId || key === null || readyIds === null) return 'ignored'
      const generation = accountGeneration
      // 로그인 세대마다 따로 잠근다. 이전 로그인 때의 저장이 끝나지 않았어도 다시 로그인한 뒤에는 누를 수 있다.
      const lock = `${generation}|${userId}|${exerciseId}`
      const current = () => generation === accountGeneration
      if (busy.current.has(lock)) return 'ignored'
      const repository = createRepository(userId)
      if (!repository) {
        // 조회 뒤에 저장소가 사라진 경우(개발·검수용 스위치). 아무것도 저장하지 않았음을 안내한다.
        setFailed((prev) => updateScoped(prev, userId, exerciseId, true))
        return 'failed'
      }
      busy.current.add(lock)
      setSaving((prev) => updateScoped(prev, userId, exerciseId, true))
      setFailed((prev) => updateScoped(prev, userId, exerciseId, false))
      const next = !readyIds.has(exerciseId)
      try {
        if (next) await repository.add(exerciseId)
        else await repository.remove(exerciseId)
        // 저장이 성공한 뒤에만 목록을 바꾼다. 그 사이 계정이나 조회가 바뀌었으면(key가 다르면) 반영하지 않는다.
        // 그 사이 다시 로그인했으면(세대가 다르면) 같은 계정이라도 반영하지 않는다. 새 로그인의 조회 결과가 서버 값이다.
        if (!current()) return 'ignored'
        setLoaded((prev) => {
          if (!prev || prev.key !== key || prev.list.status !== 'ready') {
            return prev
          }
          const ids = new Set(prev.list.ids)
          if (next) ids.add(exerciseId)
          else ids.delete(exerciseId)
          return { key, list: { status: 'ready', ids } }
        })
        return next ? 'added' : 'removed'
      } catch {
        if (!current()) return 'ignored'
        setFailed((prev) => updateScoped(prev, userId, exerciseId, true))
        return 'failed'
      } finally {
        busy.current.delete(lock)
        // 이전 로그인의 저장이 새 로그인에서 같은 운동을 저장 중인 표시를 지우지 않게 한다.
        const newer = `${accountGeneration}|${userId}|${exerciseId}`
        if (current() || !busy.current.has(newer)) {
          setSaving((prev) => updateScoped(prev, userId, exerciseId, false))
        }
      }
    },
    [userId, key, readyIds, createRepository],
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({
      userId,
      status,
      ids: readyIds ?? EMPTY_IDS,
      savingIds: scopedFor(saving, userId),
      failedIds: scopedFor(failed, userId),
      toggle,
      reload,
    }),
    [userId, status, readyIds, saving, failed, toggle, reload],
  )

  return <FavoritesContext value={value}>{children}</FavoritesContext>
}
