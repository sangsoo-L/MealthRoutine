import {
  mockDelay,
  mockFlag,
  mockKey,
  readMockJson,
  writeMockJson,
} from '../../dev-mock/devMockStorage.ts'
import { FavoriteSaveError } from '../../exercise/favoriteRepository.ts'
import type { FoodFavoriteRepository } from '../foodFavoriteRepository.ts'

/**
 * [개발 전용] 음식 즐겨찾기 Mock 저장소(계정별 localStorage). 개발 서버에서만 불러온다(food/foodFavoriteSource.ts).
 *
 * - 저장 위치는 localStorage의 `mealthroutine.dev.mock.foodFavorite.<사용자 id>`다. 운동 즐겨찾기 키(`exerciseFavorite`)와 다르며 서로의 값을 읽거나 쓰지 않는다.
 *   사용자 id는 인증 Context가 준 값뿐이고, 로그아웃에도 남는다. 다른 계정의 키는 읽지 않는다.
 * - 저장하는 것은 음식 id 문자열 목록뿐이다. 읽은 값은 외부 입력으로 본다(문자열이 아니거나 비었거나 너무 긴 항목, 중복은 없는 것).
 * - 등록·해제는 멱등이다. 쓰기에 실패하면 아무것도 바꾸지 않는다. 개발·검수용 스위치(mockFlag, 값 `foodFavorite` 또는 `all`)로 조회·저장 실패를 재현할 수 있다.
 */
const MAX_ID_LENGTH = 100

function isValidFoodId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value === value.trim()
  )
}

function readIds(userId: string): string[] {
  const raw = readMockJson(mockKey('foodFavorite', userId))
  const ids =
    typeof raw === 'object' && raw !== null
      ? (raw as { ids?: unknown }).ids
      : undefined
  if (!Array.isArray(ids)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of ids) {
    if (isValidFoodId(value) && !seen.has(value)) {
      seen.add(value)
      result.push(value)
    }
  }
  return result
}

function writeIds(userId: string, ids: readonly string[]): void {
  writeMockJson(mockKey('foodFavorite', userId), {
    v: 1,
    ids,
    updatedAt: new Date().toISOString(),
  })
}

export function createMockFoodFavoriteRepository(options: {
  userId: string
  latencyMs?: number
}): FoodFavoriteRepository {
  const { userId, latencyMs = 200 } = options

  async function change(foodId: string, on: boolean): Promise<void> {
    await mockDelay(latencyMs)
    if (mockFlag('failSave', 'foodFavorite'))
      throw new FavoriteSaveError('failed')
    if (!isValidFoodId(foodId)) throw new FavoriteSaveError('invalid')
    try {
      const ids = readIds(userId)
      if (ids.includes(foodId) === on) return
      writeIds(
        userId,
        on ? [...ids, foodId] : ids.filter((id) => id !== foodId),
      )
    } catch {
      throw new FavoriteSaveError('failed')
    }
  }

  return {
    kind: 'mock',
    async list() {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'foodFavorite')) {
        throw new Error('mock load failure')
      }
      return readIds(userId)
    },
    add: (foodId) => change(foodId, true),
    remove: (foodId) => change(foodId, false),
  }
}
