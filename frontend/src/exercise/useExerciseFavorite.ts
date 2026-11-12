import { useCallback, useMemo } from 'react'
import { useFavorites, type ToggleResult } from './favoritesContext.ts'

export type { ToggleResult }

/**
 * 한 운동의 즐겨찾기 상태(회원 전용).
 * - guest: 비회원. 즐겨찾기는 회원 기능이라 조회·저장하지 않는다.
 * - loading: 이 계정의 즐겨찾기를 불러오는 중.
 * - unavailable: 즐겨찾기 데이터 소스가 연결되지 않았다(운영 빌드 등). "해제됨"이 아니다.
 * - error: 연결은 되어 있으나 조회에 실패했다.
 * - ready: 조회 성공. favorite이 등록 여부다.
 */
export type ExerciseFavoriteState =
  | { status: 'guest' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; favorite: boolean }

/**
 * 운동 하나의 즐겨찾기 등록·해제를 화면에서 쓰는 훅. 상태는 FavoritesProvider가 계정별로 한 번만 불러와 공유하므로,
 * 같은 운동을 보여 주는 다른 화면·컴포넌트와 항상 같은 값이다(여기서 바꾸면 그쪽도 바뀐다). 이 훅은 공유 상태에서 한 운동만 골라 주는 얇은 창구다.
 *
 * toggle은 저장이 끝난 뒤에만 상태를 바꾼다(저장 전에는 등록된 것처럼 보이지 않는다). 같은 운동은 저장 중에 다시 눌러도 무시한다.
 * 저장에 실패하면 상태는 그대로이고 saveFailed가 true가 되며, 다시 toggle하면 같은 동작을 다시 시도한다.
 * 계정이 바뀌면 이전 계정의 값은 즉시 사라지고 불러오는 중으로 돌아간다. FavoritesProvider 안에서만 쓸 수 있다.
 */
export function useExerciseFavorite(exerciseId: string): {
  state: ExerciseFavoriteState
  /** 이 운동의 저장(등록·해제) 진행 중 */
  saving: boolean
  /** 이 운동의 직전 저장이 실패했다. 다시 시도하거나 다른 조작을 하면 사라진다. */
  saveFailed: boolean
  toggle: () => Promise<ToggleResult>
  /** 조회 실패(error) 뒤에 다시 불러온다. */
  reload: () => void
} {
  const {
    status,
    ids,
    savingIds,
    failedIds,
    toggle: toggleFavorite,
    reload,
  } = useFavorites()

  const favorite = ids.has(exerciseId)
  const state = useMemo<ExerciseFavoriteState>(
    () => (status === 'ready' ? { status, favorite } : { status }),
    [status, favorite],
  )

  const toggle = useCallback(
    () => toggleFavorite(exerciseId),
    [toggleFavorite, exerciseId],
  )

  return {
    state,
    saving: savingIds.has(exerciseId),
    saveFailed: failedIds.has(exerciseId),
    toggle,
    reload,
  }
}
