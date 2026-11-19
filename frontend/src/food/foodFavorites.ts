import { createContext, useContext, useEffect } from 'react'
import type { ToggleResult } from '../exercise/favoritesContext.ts'

/**
 * 음식 즐겨찾기 공유 상태(회원 한 명의 즐겨찾기 목록 기준). 운동 즐겨찾기(exercise/favoritesContext.ts)와 같은 모양이지만 데이터는 완전히 따로다.
 * - guest: 비회원. 즐겨찾기는 회원 기능이라 조회·저장하지 않는다(저장소에 접근하지 않는다).
 * - loading: 이 계정의 목록을 불러오는 중. unavailable: 저장소가 연결되지 않았다(운영 빌드 등, "해제됨"이 아니다). error: 조회 실패. ready: ids가 음식 id 모음이다.
 */
export type FoodFavoritesStatus =
  'guest' | 'loading' | 'unavailable' | 'error' | 'ready'

export interface FoodFavoritesContextValue {
  userId: string | null
  status: FoodFavoritesStatus
  ids: ReadonlySet<string>
  savingIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
  /** 음식 하나를 등록·해제한다. 저장이 성공한 뒤에만 ids를 바꾸고, 실패하면 ids는 그대로다. */
  toggle: (foodId: string) => Promise<ToggleResult>
  reload: () => void
  /**
   * 이 목록을 쓰는 화면이 마운트될 때 부른다(useFoodFavorites가 대신 부른다). 제공자는 처음 호출된 뒤에야 조회를 시작하므로
   * 음식 화면을 열지 않는 회원(운동 화면 등)은 음식 즐겨찾기를 조회하지 않는다. 여러 번 불러도 한 번만 조회한다.
   */
  activate: () => void
}

export const FoodFavoritesContext =
  createContext<FoodFavoritesContextValue | null>(null)

/** 공유 음식 즐겨찾기 상태. FoodFavoritesProvider 안에서만 쓸 수 있다. */
export function useFoodFavorites(): FoodFavoritesContextValue {
  const value = useContext(FoodFavoritesContext)
  const activate = value?.activate
  useEffect(() => {
    activate?.()
  }, [activate])
  if (value === null) {
    throw new Error(
      'useFoodFavorites는 FoodFavoritesProvider 안에서만 사용할 수 있습니다.',
    )
  }
  return value
}
