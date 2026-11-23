import { useEffect, useMemo, useState } from 'react'
import type {
  MealPlanCandidateCount,
  MealPlanRequest,
  MealPlanTargets,
  MealPlanTargetsQuery,
  ServerInfoState,
} from './mealPlanContract.ts'
import { useMealPlanFlow } from './mealPlanFlowContext.ts'

type Settled<T> = Exclude<ServerInfoState<T>, { status: 'loading' }>

/**
 * 서버가 계산해 주는 보조 정보(끼니별 목표량·후보 수)를 읽는 공통 훅.
 * - 서버 연결이 없으면(load가 null) 요청하지 않고 `unavailable`이다. "값이 없음"이나 오류가 아니라 "연결 전"이다.
 * - key가 바뀌면 지난 조회의 결과를 쓰지 않고 다시 불러온다. 화면을 떠나거나 key가 바뀌면 진행 중 요청을 중단한다.
 */
function useServerInfo<T>(
  connected: boolean,
  key: string | null,
  load: ((signal: AbortSignal) => Promise<T>) | null,
): ServerInfoState<T> {
  const [loaded, setLoaded] = useState<{
    key: string
    state: Settled<T>
  } | null>(null)

  useEffect(() => {
    if (load === null || key === null) return
    const controller = new AbortController()
    Promise.resolve()
      .then(() => load(controller.signal))
      .then(
        (value) => {
          if (!controller.signal.aborted) {
            setLoaded({ key, state: { status: 'ready', value } })
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setLoaded({ key, state: { status: 'error' } })
          }
        },
      )
    return () => controller.abort()
  }, [key, load])

  // 서버 연결이 없으면 "연결 전"이다. 연결은 있는데 아직 물어볼 입력이 없으면 값이 없는 것이 아니라 조회 전(loading)으로 둔다.
  if (!connected) return { status: 'unavailable' }
  if (load === null || key === null) return { status: 'loading' }
  return loaded !== null && loaded.key === key
    ? loaded.state
    : { status: 'loading' }
}

/** I03-1: 끼니별 목표량(서버 계산 값). 연결 전이면 unavailable. query는 useMemo로 안정시켜 넘긴다. */
export function useMealPlanTargets(
  query: MealPlanTargetsQuery | null,
): ServerInfoState<MealPlanTargets> {
  const { source } = useMealPlanFlow()
  const key = query === null ? null : `targets:${JSON.stringify(query)}`
  const load = useMemo(
    () =>
      source !== null && query !== null
        ? (signal: AbortSignal) => source.getTargets(query, signal)
        : null,
    [source, query],
  )
  return useServerInfo(source !== null, key, load)
}

/** I03-2: 조건에 맞는 계산 가능한 후보 수(서버 계산 값). 연결 전이면 unavailable. request는 useMemo로 안정시켜 넘긴다. */
export function useCandidateCount(
  request: MealPlanRequest | null,
): ServerInfoState<MealPlanCandidateCount> {
  const { source } = useMealPlanFlow()
  const key = request === null ? null : `candidates:${JSON.stringify(request)}`
  const load = useMemo(
    () =>
      source !== null && request !== null
        ? (signal: AbortSignal) => source.countCandidates(request, signal)
        : null,
    [source, request],
  )
  return useServerInfo(source !== null, key, load)
}
