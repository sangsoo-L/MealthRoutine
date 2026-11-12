import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/authContext.ts'
import type { Exercise } from './exerciseTypes.ts'
import {
  addExercisesToDraft,
  addSetToItem,
  createEmptyDraft,
  hasDraftContent,
  moveItemInDraft,
  newItemId,
  removeItemFromDraft,
  removeSetFromItem,
  setItemRecordType,
  updateSetInItem,
} from './workoutDraftModel.ts'
import {
  WorkoutDraftContext,
  type WorkoutDraftContextValue,
} from './workoutDraftContext.ts'
import { readWorkoutDraft, saveWorkoutDraft } from './workoutDraftStorage.ts'
import type { DraftSet, RecordType, WorkoutDraft } from './workoutDraftTypes.ts'

interface ProviderState {
  /** 이 상태가 속한 사용자 id. 비회원이면 null. 화면 밖으로 내보내거나 저장 키에 쓰지 않는다. */
  owner: string | null
  draft: WorkoutDraft
  discardedNotice: boolean
  storageUnavailable: boolean
  /** 마지막 저장이 실패했다. 사용자(owner)와 함께 초기화되므로 다른 사용자에게 남지 않는다. */
  saveFailed: boolean
}

/**
 * 사용자에 맞는 처음 상태. 저장된 초안은 **읽기만** 한다(렌더 중에 불러도 저장소를 바꾸지 않는다).
 * 쓸 수 없는 저장값(손상·다른 버전·다른 소유자)은 빈 초안으로 시작하며, 그 저장값은 아래 저장 효과가 빈 초안을 저장하면서 지운다.
 */
function initialState(userId: string | null): ProviderState {
  if (!userId) {
    return {
      owner: null,
      draft: createEmptyDraft(),
      discardedNotice: false,
      storageUnavailable: false,
      saveFailed: false,
    }
  }
  const read = readWorkoutDraft(userId)
  return {
    owner: userId,
    draft: read.draft ?? createEmptyDraft(),
    discardedNotice: read.discarded,
    storageUnavailable: read.storageUnavailable,
    saveFailed: false,
  }
}

/** 편집 한 번의 시각. 상태 업데이터 밖에서 한 번 정해 업데이터가 항상 같은 결과를 내게 한다. */
function stamp(): () => string {
  const at = new Date().toISOString()
  return () => at
}

/**
 * 운동 목록 편집 초안(W02)의 공유 상태 제공자. W02와 W13(운동 선택)은 별도 라우트라 W02가 언마운트되어도 초안이 남아야 하므로
 * 컴포넌트 안이 아니라 앱 수준에 둔다(FavoritesProvider와 같은 위치와 방식).
 *
 * - 비회원이면 초안을 쓰지 않고 저장소에도 접근하지 않는다.
 * - 회원이면 계정별 sessionStorage(workoutDraftStorage)에서 초안을 복구한다. 새로고침해도 편집 중인 구성이 남고, 로그아웃·로그인은
 *   auth/accountScope가 지우며, 사용자가 바뀌면 이전 사용자의 메모리 상태를 렌더 중에 즉시 버린다(이전 사용자의 초안이 한 번도 보이지 않는다).
 * - 편집은 모두 불변 순수 함수(workoutDraftModel)로 하고, 상태 업데이터는 순수하다(시각·항목 id는 호출 시점에 한 번 만든다).
 *   저장은 초안이 바뀐 뒤에 하며 실패해도 현재 탭의 편집은 계속된다(persistence가 unavailable로 알린다).
 * 이 상태는 편집 중인 임시 값이다. 운동 목록 확정·수행 기록·루틴의 영구 저장은 이 Provider가 하지 않는다.
 */
export default function WorkoutDraftProvider({
  children,
}: {
  children: ReactNode
}) {
  const { status: authStatus, user } = useAuth()
  // 인증이 확정된 회원일 때만 사용자 id를 쓴다(FavoritesProvider와 같은 기준).
  const userId = authStatus === 'authenticated' && user ? user.id : null

  const [state, setState] = useState<ProviderState>(() => initialState(userId))

  // 사용자가 바뀌면 지난 사용자의 상태를 바로 버리고 새 사용자의 저장된 초안을 읽는다(렌더 중 상태 보정, 읽기만 한다).
  if (state.owner !== userId) setState(initialState(userId))

  // 초안이 바뀐 뒤에 저장한다(빈 초안은 저장값을 지운다). 비회원은 저장하지 않는다. 결과(저장 실패 여부)는 효과 안에서 바로 상태로
  // 쓰지 않고 다음 틱에 반영하며, 그 사이 사용자가 바뀌었으면 반영하지 않는다.
  useEffect(() => {
    const owner = state.owner
    if (owner === null) return
    const ok = saveWorkoutDraft(owner, state.draft)
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setState((prev) =>
        prev.owner === owner && prev.saveFailed === ok
          ? { ...prev, saveFailed: !ok }
          : prev,
      )
    })
    return () => {
      cancelled = true
    }
  }, [state.owner, state.draft])

  /** 초안을 바꾼다. 실제로 바뀌지 않으면(같은 초안) 상태·안내를 그대로 둔다. 바뀌면 손상 안내는 사라진다. */
  const apply = useCallback((change: (draft: WorkoutDraft) => WorkoutDraft) => {
    setState((prev) => {
      if (prev.owner === null) return prev
      const next = change(prev.draft)
      return next === prev.draft
        ? prev
        : { ...prev, draft: next, discardedNotice: false }
    })
  }, [])

  // 새로 시작해도 "저장돼 있던 구성을 버렸다"는 안내는 W02에서 보이도록 유지한다(다음 실제 편집에서 사라진다).
  const startNew = useCallback(() => {
    setState((prev) =>
      prev.owner === null ? prev : { ...prev, draft: createEmptyDraft() },
    )
  }, [])
  const addExercises = useCallback(
    (exercises: readonly Exercise[]) => {
      const now = stamp()
      // 항목 id는 업데이트 밖에서 미리 만든다(건너뛰는 운동은 쓰지 않는다). 업데이터를 다시 실행해도 같은 결과가 나온다.
      const ids = exercises.map(() => newItemId())
      apply((draft) => {
        let next = 0
        return addExercisesToDraft(draft, exercises, now, () => ids[next++])
      })
    },
    [apply],
  )
  const removeItem = useCallback(
    (itemId: string) => {
      const now = stamp()
      apply((draft) => removeItemFromDraft(draft, itemId, now))
    },
    [apply],
  )
  const moveItem = useCallback(
    (itemId: string, direction: 'up' | 'down') => {
      const now = stamp()
      apply((draft) => moveItemInDraft(draft, itemId, direction, now))
    },
    [apply],
  )
  const setRecordType = useCallback(
    (itemId: string, recordType: RecordType) => {
      const now = stamp()
      apply((draft) => setItemRecordType(draft, itemId, recordType, now))
    },
    [apply],
  )
  const addSet = useCallback(
    (itemId: string) => {
      const now = stamp()
      apply((draft) => addSetToItem(draft, itemId, now))
    },
    [apply],
  )
  const removeSet = useCallback(
    (itemId: string, setIndex: number) => {
      const now = stamp()
      apply((draft) => removeSetFromItem(draft, itemId, setIndex, now))
    },
    [apply],
  )
  const updateSet = useCallback(
    (
      itemId: string,
      setIndex: number,
      patch: Partial<Record<keyof DraftSet, number | undefined>>,
    ) => {
      const now = stamp()
      apply((draft) => updateSetInItem(draft, itemId, setIndex, patch, now))
    },
    [apply],
  )

  const value = useMemo<WorkoutDraftContextValue>(
    () => ({
      status: state.owner === null ? 'guest' : 'ready',
      draft: state.draft,
      hasContent: hasDraftContent(state.draft),
      persistence:
        state.storageUnavailable || state.saveFailed ? 'unavailable' : 'ok',
      discardedNotice: state.discardedNotice,
      startNew,
      addExercises,
      removeItem,
      moveItem,
      setRecordType,
      addSet,
      removeSet,
      updateSet,
    }),
    [
      state,
      startNew,
      addExercises,
      removeItem,
      moveItem,
      setRecordType,
      addSet,
      removeSet,
      updateSet,
    ],
  )

  return <WorkoutDraftContext value={value}>{children}</WorkoutDraftContext>
}
