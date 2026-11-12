import { useCallback, useEffect, useState } from 'react'
import { createExerciseRepository } from './exerciseSource.ts'
import type { Exercise } from './exerciseTypes.ts'

/**
 * 운동 목록(카탈로그) 조회 상태.
 * - loading: 불러오는 중.
 * - unavailable: 운동 데이터 소스가 연결되지 않았다(운영 빌드 등). "운동 없음"이나 오류가 아니다.
 * - error: 연결은 되어 있으나 조회에 실패했다.
 * - ready: 조회 성공.
 */
export type ExerciseCatalogState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; exercises: readonly Exercise[] }

type Settled = Exclude<ExerciseCatalogState, { status: 'loading' }>

interface Loaded {
  /** 몇 번째 조회의 결과인지. 현재 조회와 다르면 지난 조회의 값이라 쓰지 않는다. */
  attempt: number
  state: Settled
}

/**
 * 운동 선택 화면(W13)이 쓰는 운동 목록. 조건 없이 한 번 조회해(ExerciseRepository.list) 즐겨찾기 id와의 매칭과 직접 검색이 같은 목록을 쓴다.
 * 운동마다 getById를 부르지 않는다(N+1 없음). 마운트당 list는 한 번이고 reload로만 다시 부른다.
 *
 * 개발 서버에서는 Mock 운동 데이터(15종) 전체가 오지만, 실제 API(GET /api/v1/exercises)는 페이지 단위 응답이라 한 번의 조회가 전체 운동을
 * 보장하지 않는다(페이지네이션은 이번 범위가 아니다). 운영 빌드에는 저장소가 없어 항상 unavailable이며 Mock으로 대체하지 않는다.
 */
export function useExerciseCatalog(): {
  state: ExerciseCatalogState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    const repository = createExerciseRepository()
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ attempt, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository
      .list({ query: '', difficulty: null, part: null, tool: null })
      .then(
        (exercises) => {
          if (!cancelled) {
            setLoaded({ attempt, state: { status: 'ready', exercises } })
          }
        },
        () => {
          if (!cancelled) setLoaded({ attempt, state: { status: 'error' } })
        },
      )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const state: ExerciseCatalogState =
    loaded && loaded.attempt === attempt ? loaded.state : { status: 'loading' }

  return { state, reload }
}
