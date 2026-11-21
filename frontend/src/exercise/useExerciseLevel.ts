import { useEffect, useState } from 'react'
import { loadExerciseLevel, type ExerciseLevelResult } from './exerciseLevel.ts'

export type ExerciseLevelState =
  { status: 'loading' } | ({ status: 'ready' } & ExerciseLevelResult)

interface Loaded {
  /** 어떤 계정의 결과인지. 현재 계정과 다르면 이전 계정의 값이라 쓰지 않는다. */
  userId: string
  result: ExerciseLevelResult
}

/**
 * W14 입력 방식을 정하는 운동 수준 조회. 화면이 열릴 때 계정마다 **한 번만** 조회하고, 결과(입력 방식)는 그 화면에서 고정한다.
 * 다시 조회하거나 나중에 값이 달라져도 입력 방식을 바꾸지 않는다(운동 도중 입력칸이 바뀌지 않게). 조회 중에는 loading이라
 * 화면은 입력 방식이 정해질 때까지 입력칸을 그리지 않는다. 조회 실패는 간단 입력 + failed(안내).
 */
export function useExerciseLevel(userId: string | null): ExerciseLevelState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadExerciseLevel(userId).then((result) => {
      if (!cancelled) setLoaded({ userId, result })
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!userId) {
    return {
      status: 'ready',
      mode: 'simple',
      level: null,
      source: 'unknown',
      failed: false,
    }
  }
  return loaded && loaded.userId === userId
    ? { status: 'ready', ...loaded.result }
    : { status: 'loading' }
}
