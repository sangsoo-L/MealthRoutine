import { useCallback, useMemo, useState } from 'react'

/** 선택한 운동. 이름은 선택한 시점의 값이며, 선택 목록을 목록 조회 상태와 무관하게 그리려고 함께 보관한다. */
export interface SelectedExercise {
  id: string
  name: string
}

/**
 * 운동 선택 화면(W13)의 임시 선택. 화면(페이지) 안에서만 사는 값이며 주소·저장소·서버에 남기지 않는다.
 * - 같은 운동은 한 번만 담긴다(중복 선택 방지). 이미 담긴 운동을 다시 toggle하면 빠진다.
 * - 선택한 순서를 유지한다(나중에 호출부가 이 순서대로 목록에 추가한다).
 * - 즐겨찾기 등록 여부와 무관하다. 별을 해제하거나 탭·검색어를 바꿔도 선택은 그대로다.
 * 선택 개수 상한은 두지 않는다.
 */
export function useExerciseSelection(): {
  items: readonly SelectedExercise[]
  /** 선택한 운동 id(선택 순서). 호출부에 넘길 값이다. */
  ids: readonly string[]
  isSelected: (id: string) => boolean
  toggle: (exercise: SelectedExercise) => void
  remove: (id: string) => void
} {
  const [items, setItems] = useState<readonly SelectedExercise[]>([])

  const ids = useMemo(() => items.map((item) => item.id), [items])
  const idSet = useMemo(() => new Set(ids), [ids])

  const isSelected = useCallback((id: string) => idSet.has(id), [idSet])

  const toggle = useCallback((exercise: SelectedExercise) => {
    setItems((prev) =>
      prev.some((item) => item.id === exercise.id)
        ? prev.filter((item) => item.id !== exercise.id)
        : [...prev, { id: exercise.id, name: exercise.name }],
    )
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) =>
      prev.some((item) => item.id === id)
        ? prev.filter((item) => item.id !== id)
        : prev,
    )
  }, [])

  return { items, ids, isSelected, toggle, remove }
}
