import { createContext, useContext } from 'react'

/**
 * 운동 즐겨찾기 공유 상태의 상태값(회원 한 명의 즐겨찾기 목록 기준).
 * - guest: 비회원. 즐겨찾기는 회원 기능이라 조회·저장하지 않는다(저장소에 접근하지 않는다).
 * - loading: 이 계정의 즐겨찾기 목록을 불러오는 중.
 * - unavailable: 즐겨찾기 데이터 소스가 연결되지 않았다(운영 빌드 등). "해제됨"이 아니다.
 * - error: 연결은 되어 있으나 목록 조회에 실패했다.
 * - ready: 조회 성공. ids가 등록된 운동 id 모음이다.
 */
export type FavoritesStatus =
  'guest' | 'loading' | 'unavailable' | 'error' | 'ready'

/** toggle의 결과. ignored는 비회원·조회 전·같은 운동 저장 중이라 아무것도 하지 않았다는 뜻이다. */
export type ToggleResult = 'added' | 'removed' | 'failed' | 'ignored'

export interface FavoritesContextValue {
  /** 인증 Context의 사용자 id. 비회원이면 null이다. */
  userId: string | null
  status: FavoritesStatus
  /** 등록된 운동 id. status가 ready일 때만 값이 있고, 그 밖에는 빈 모음이다. */
  ids: ReadonlySet<string>
  /** 저장(등록·해제) 진행 중인 운동 id */
  savingIds: ReadonlySet<string>
  /** 직전 저장이 실패한 운동 id. 같은 운동을 다시 저장하거나 reload하면 사라진다. */
  failedIds: ReadonlySet<string>
  /** 운동 하나를 등록·해제한다. 저장이 성공한 뒤에만 ids를 바꾸고, 실패하면 ids는 그대로다. */
  toggle: (exerciseId: string) => Promise<ToggleResult>
  /** 조회 실패(error) 뒤에 목록을 다시 불러온다. */
  reload: () => void
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(
  null,
)

/** 공유 즐겨찾기 상태. FavoritesProvider 안에서만 쓸 수 있다. */
export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext)
  if (value === null) {
    throw new Error(
      'useFavorites는 FavoritesProvider 안에서만 사용할 수 있습니다.',
    )
  }
  return value
}
