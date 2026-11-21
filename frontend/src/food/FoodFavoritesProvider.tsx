import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/authContext.ts'
import type { ToggleResult } from '../exercise/favoritesContext.ts'
import { createFoodFavoriteRepository } from './foodFavoriteSource.ts'
import {
  FoodFavoritesContext,
  type FoodFavoritesContextValue,
  type FoodFavoritesStatus,
} from './foodFavorites.ts'

const EMPTY: ReadonlySet<string> = new Set<string>()

type Settled =
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; ids: ReadonlySet<string> }

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  list: Settled
}

/** 계정별로 음식 id 모음을 따로 들고 있는 값. 다른 계정의 저장 완료가 지금 계정의 값을 건드리지 않게 한다. */
type ScopedIds = ReadonlyMap<string, ReadonlySet<string>>
const EMPTY_SCOPED: ScopedIds = new Map()

function updateScoped(
  prev: ScopedIds,
  owner: string,
  id: string,
  on: boolean,
): ScopedIds {
  const base = prev.get(owner) ?? EMPTY
  if (base.has(id) === on) return prev
  const ids = new Set(base)
  if (on) ids.add(id)
  else ids.delete(id)
  const next = new Map(prev)
  if (ids.size === 0) next.delete(owner)
  else next.set(owner, ids)
  return next
}

function clearScoped(prev: ScopedIds, owner: string): ScopedIds {
  if (!prev.has(owner)) return prev
  const next = new Map(prev)
  next.delete(owner)
  return next
}

/**
 * 음식 즐겨찾기 공유 상태 제공자. 운동 즐겨찾기(FavoritesProvider)와 같은 규칙이고 데이터만 따로다.
 * F01·F02·D02·P07이 같은 상태를 보므로 어디서 바꿔도 별 표시가 어긋나지 않는다.
 *
 * - 조회는 인증된 회원일 때만 한다(비회원이면 저장소를 만들지 않는다). 계정(또는 reload 횟수)이 바뀌면 이전 값을 버리고 다시 조회한다.
 * - 저장이 성공한 뒤에만 ids를 바꾼다. 실패하면 ids는 그대로이고 그 음식의 failedIds에만 표시된다. 같은 음식은 저장 중에 다시 눌러도 무시한다.
 * - 계정 전환·로그아웃: 이전 계정의 값은 즉시 보이지 않고, 늦게 도착한 이전 계정의 조회·저장 결과는 반영하지 않는다.
 */
export default function FoodFavoritesProvider({
  children,
}: {
  children: ReactNode
}) {
  const { status: authStatus, user } = useAuth()
  const userId = authStatus === 'authenticated' && user ? user.id : null

  // 음식 즐겨찾기를 쓰는 화면이 처음 마운트될 때 켜진다(그 전에는 조회하지 않는다).
  const [active, setActive] = useState(false)
  const activate = useCallback(() => setActive(true), [])
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [saving, setSaving] = useState<ScopedIds>(EMPTY_SCOPED)
  const [failed, setFailed] = useState<ScopedIds>(EMPTY_SCOPED)
  const busy = useRef<Set<string>>(new Set())

  // 계정이 바뀌면 지난 계정의 값을 바로 버린다(렌더 중 상태 보정).
  const [prevUserId, setPrevUserId] = useState(userId)
  if (prevUserId !== userId) {
    setPrevUserId(userId)
    setAttempt(0)
    setLoaded(null)
    setSaving(EMPTY_SCOPED)
    setFailed(EMPTY_SCOPED)
  }

  const key = userId ? `${userId}|${attempt}` : null

  useEffect(() => {
    if (!userId || !active) return
    let cancelled = false
    const effectKey = `${userId}|${attempt}`
    const repository = createFoodFavoriteRepository(userId)
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
    repository.list().then(
      (ids) => {
        if (!cancelled) {
          setLoaded({
            key: effectKey,
            list: { status: 'ready', ids: new Set(ids) },
          })
        }
      },
      () => {
        if (!cancelled) setLoaded({ key: effectKey, list: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, attempt, active])

  const list: Settled | null =
    key !== null && loaded !== null && loaded.key === key ? loaded.list : null
  const readyIds = list?.status === 'ready' ? list.ids : null
  const status: FoodFavoritesStatus = !userId
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
    async (foodId: string): Promise<ToggleResult> => {
      if (!userId || key === null || readyIds === null) return 'ignored'
      const lock = `${userId}|${foodId}`
      if (busy.current.has(lock)) return 'ignored'
      const repository = createFoodFavoriteRepository(userId)
      if (!repository) {
        setFailed((prev) => updateScoped(prev, userId, foodId, true))
        return 'failed'
      }
      busy.current.add(lock)
      setSaving((prev) => updateScoped(prev, userId, foodId, true))
      setFailed((prev) => updateScoped(prev, userId, foodId, false))
      const next = !readyIds.has(foodId)
      try {
        if (next) await repository.add(foodId)
        else await repository.remove(foodId)
        // 저장이 성공한 뒤에만 목록을 바꾼다. 그 사이 계정이나 조회가 바뀌었으면(key가 다르면) 반영하지 않는다.
        setLoaded((prev) => {
          if (!prev || prev.key !== key || prev.list.status !== 'ready') {
            return prev
          }
          const ids = new Set(prev.list.ids)
          if (next) ids.add(foodId)
          else ids.delete(foodId)
          return { key, list: { status: 'ready', ids } }
        })
        return next ? 'added' : 'removed'
      } catch {
        setFailed((prev) => updateScoped(prev, userId, foodId, true))
        return 'failed'
      } finally {
        busy.current.delete(lock)
        setSaving((prev) => updateScoped(prev, userId, foodId, false))
      }
    },
    [userId, key, readyIds],
  )

  const value = useMemo<FoodFavoritesContextValue>(
    () => ({
      userId,
      status,
      ids: readyIds ?? EMPTY,
      savingIds: (userId !== null ? saving.get(userId) : undefined) ?? EMPTY,
      failedIds: (userId !== null ? failed.get(userId) : undefined) ?? EMPTY,
      toggle,
      reload,
      activate,
    }),
    [userId, status, readyIds, saving, failed, toggle, reload, activate],
  )

  return <FoodFavoritesContext value={value}>{children}</FoodFavoritesContext>
}
