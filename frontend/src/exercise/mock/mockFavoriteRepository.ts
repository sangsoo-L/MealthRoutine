import {
  mockDelay,
  mockFlag,
  mockKey,
  readMockJson,
  writeMockJson,
} from '../../dev-mock/devMockStorage.ts'
import {
  FavoriteSaveError,
  type ExerciseFavoriteRepository,
} from '../favoriteRepository.ts'

/**
 * [개발 전용] 운동 즐겨찾기 Mock 저장소. 서버가 맡을 저장·보관을 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(favoriteSource.ts).
 *
 * - 저장 위치는 localStorage의 `mealthroutine.dev.mock.exerciseFavorite.<사용자 id>`다(dev-mock/devMockStorage.ts). 사용자 id는
 *   인증 Context가 준 값뿐이고, 로그아웃에도 남아 "다음 로그인에도 저장돼 있음"을 재현한다. 다른 계정의 키는 읽지 않는다.
 * - 저장하는 것은 운동 id 문자열 목록뿐이다. 운동 객체를 복사하지 않는다.
 * - 읽은 값은 외부 입력으로 본다. 문자열이 아니거나 비었거나 너무 긴 항목, 중복은 "없는 것"이다.
 * - 등록·해제는 멱등이다(명세: 이미 등록돼 있어도, 등록돼 있지 않아도 성공). 쓰기에 실패하면 아무것도 바꾸지 않는다.
 * - 짧은 지연을 둔다. 개발·검수용 스위치(mockFlag, 값 `exerciseFavorite` 또는 `all`)로 조회 실패·저장 실패를 재현할 수 있다.
 */

const MAX_ID_LENGTH = 100

function isValidExerciseId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value === value.trim()
  )
}

/** 저장된 id 목록. 유효하지 않은 항목과 중복은 버린다. 저장소에 접근할 수 없으면 예외를 던진다. */
function readIds(userId: string): string[] {
  const raw = readMockJson(mockKey('exerciseFavorite', userId))
  const ids =
    typeof raw === 'object' && raw !== null
      ? (raw as { ids?: unknown }).ids
      : undefined
  if (!Array.isArray(ids)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of ids) {
    if (isValidExerciseId(value) && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function writeIds(userId: string, ids: readonly string[]): void {
  writeMockJson(mockKey('exerciseFavorite', userId), {
    v: 1,
    ids,
    updatedAt: new Date().toISOString(),
  })
}

export function createMockFavoriteRepository(options: {
  userId: string
  latencyMs?: number
}): ExerciseFavoriteRepository {
  const { userId, latencyMs = 300 } = options

  return {
    kind: 'mock',

    async list() {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'exerciseFavorite')) {
        throw new Error('mock load failure')
      }
      return readIds(userId)
    },

    async add(exerciseId) {
      await mockDelay(latencyMs)
      if (mockFlag('failSave', 'exerciseFavorite')) {
        throw new FavoriteSaveError('failed')
      }
      if (!isValidExerciseId(exerciseId)) throw new FavoriteSaveError('invalid')
      try {
        const ids = readIds(userId)
        if (ids.includes(exerciseId)) return
        writeIds(userId, [...ids, exerciseId])
      } catch {
        throw new FavoriteSaveError('failed')
      }
    },

    async remove(exerciseId) {
      await mockDelay(latencyMs)
      if (mockFlag('failSave', 'exerciseFavorite')) {
        throw new FavoriteSaveError('failed')
      }
      if (!isValidExerciseId(exerciseId)) throw new FavoriteSaveError('invalid')
      try {
        const ids = readIds(userId)
        if (!ids.includes(exerciseId)) return
        writeIds(
          userId,
          ids.filter((id) => id !== exerciseId),
        )
      } catch {
        throw new FavoriteSaveError('failed')
      }
    },
  }
}
