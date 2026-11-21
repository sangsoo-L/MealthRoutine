import { useCallback, useMemo } from 'react'
import type { ToggleResult } from '../exercise/favoritesContext.ts'
import { useFoodFavorites } from './foodFavorites.ts'

export type FoodFavoriteState =
  | { status: 'guest' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; favorite: boolean }

/**
 * 한 음식의 즐겨찾기 상태(회원 전용). 상태는 FoodFavoritesProvider가 계정별로 한 번만 불러와 공유하므로 F01·F02·D02·P07이 항상 같은 값이다.
 * toggle은 저장이 끝난 뒤에만 상태를 바꾼다. 같은 음식은 저장 중에 다시 눌러도 무시한다. 저장에 실패하면 상태는 그대로이고 saveFailed가 true다.
 */
export function useFoodFavorite(foodId: string): {
  state: FoodFavoriteState
  saving: boolean
  saveFailed: boolean
  toggle: () => Promise<ToggleResult>
  reload: () => void
} {
  const {
    status,
    ids,
    savingIds,
    failedIds,
    toggle: toggleFavorite,
    reload,
  } = useFoodFavorites()
  const favorite = ids.has(foodId)
  const state = useMemo<FoodFavoriteState>(
    () => (status === 'ready' ? { status, favorite } : { status }),
    [status, favorite],
  )
  const toggle = useCallback(
    () => toggleFavorite(foodId),
    [toggleFavorite, foodId],
  )
  return {
    state,
    saving: savingIds.has(foodId),
    saveFailed: failedIds.has(foodId),
    toggle,
    reload,
  }
}
