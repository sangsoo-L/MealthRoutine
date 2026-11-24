import { ApiError, apiRequest } from '../../api/http.ts'
import {
  WorkoutStoreError,
  type ListQueryResult,
} from '../../exercise/workoutRepositories.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { isLocalDate, isValidRequestId } from '../../exercise/workoutModel.ts'
import { isPortion } from '../foodNutrition.ts'
import {
  MEAL_SCHEMA_VERSION,
  isMealType,
  sortByCreated,
  type MealRecord,
  type MealType,
} from '../mealModel.ts'
import type {
  CreateMealInput,
  MealRecordRepository,
  SaveMealResult,
} from '../mealRepository.ts'
import { portionOfQuantity, quantityOfPortion } from './mealQuantity.ts'
import { SERVER_FOOD_SOURCE } from './serverFoodRepository.ts'

/** 백엔드 MealRecordResponse. 프론트 기록 1건 = 백엔드 기록 1건(음식 1개)으로 주고받는다. */
interface MealItemResponse {
  mealItemId: number
  foodId: number | null
  foodName: string
  quantity: number
  amountG: number | null
  caloriesKcal: number | null
  carbohydrateG: number | null
  proteinG: number | null
  fatG: number | null
}

interface MealRecordResponse {
  mealRecordId: number
  mealAt: string // "2026-11-24T12:00:00" (한국 시간, 시간대 없음)
  mealType: string
  recordType: string
  items: MealItemResponse[]
}

/** 끼니별 기록 시각(백엔드는 날짜+시간을 받는다). */
const MEAL_TIME: Record<MealType, string> = {
  breakfast: '08:00:00',
  lunch: '12:00:00',
  dinner: '18:00:00',
}

/** 서버 기록 목록을 불러올 최근 일수(백엔드에 전체 조회 API가 없어 날짜별로 모은다). */
const LIST_ALL_DAYS = 14

const per100 = (value: number | null, grams: number): number | null =>
  value === null || grams <= 0
    ? null
    : Math.round((value * 10000) / grams) / 100

function toRecord(r: MealRecordResponse, ownerId: string): MealRecord | null {
  const item = r.items.length === 1 ? r.items[0] : undefined
  if (!item || !isMealType(r.mealType) || r.recordType !== 'actual') return null
  const grams = item.amountG ?? item.quantity * 100
  const at = new Date(`${r.mealAt}+09:00`).toISOString()
  return {
    id: String(r.mealRecordId),
    ownerId,
    schemaVersion: MEAL_SCHEMA_VERSION,
    localDate: r.mealAt.slice(0, 10),
    mealType: r.mealType,
    foodId: item.foodId === null ? '' : String(item.foodId),
    foodName: item.foodName,
    portion: portionOfQuantity(item.quantity), // 중량이 아니라 인분으로 복원
    weightGrams: Math.round(grams),
    // 백엔드는 먹은 양 기준 영양소를 주므로 100g 기준으로 되돌린다
    nutritionSnapshot: {
      kcal: per100(item.caloriesKcal, grams),
      protein: per100(item.proteinG, grams),
      fat: per100(item.fatG, grams),
      carb: per100(item.carbohydrateG, grams),
    },
    nutritionSource: SERVER_FOOD_SOURCE,
    revision: 1, // 백엔드에 revision이 없어 고정값을 쓴다
    requestId: `server-${r.mealRecordId}`,
    createdAt: at,
    updatedAt: at,
  }
}

/** 서버 오류를 화면이 아는 저장소 오류로 바꾼다. */
function storeError(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 404) return new WorkoutStoreError('notFound')
    if (error.status === 400)
      return new WorkoutStoreError('validation', { code: 'invalidMeal' })
    if (error.status === 403) return new WorkoutStoreError('notFound')
  }
  return new WorkoutStoreError('error', { cause: error })
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayKst(): LocalDate {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

export function createServerMealRecordRepository(
  ownerId: string,
): MealRecordRepository {
  // 같은 requestId로 다시 저장하면 새로 만들지 않는다(화면의 재시도 대비, 탭 메모리 기준)
  const savedByRequest = new Map<string, MealRecord>()

  async function listByDate(
    localDate: LocalDate,
  ): Promise<ListQueryResult<MealRecord>> {
    if (!isLocalDate(localDate)) throw new WorkoutStoreError('validation')
    try {
      const rows = await apiRequest<MealRecordResponse[]>(
        'GET',
        `/meal-records?date=${localDate}&recordType=actual`,
      )
      const items = rows
        .map((r) => toRecord(r, ownerId))
        .filter((r): r is MealRecord => r !== null)
      return {
        items: sortByCreated(items),
        skippedCount: rows.length - items.length,
      }
    } catch (error) {
      throw storeError(error)
    }
  }

  return {
    kind: 'server',

    async create(input: CreateMealInput): Promise<SaveMealResult> {
      if (!isValidRequestId(input.requestId))
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      if (
        !isLocalDate(input.localDate) ||
        !isMealType(input.mealType) ||
        !isPortion(input.portion)
      )
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      const done = savedByRequest.get(input.requestId)
      if (done) return { record: done, created: false }
      try {
        const quantity = quantityOfPortion(input.portion)
        const r = await apiRequest<MealRecordResponse>(
          'POST',
          '/meal-records',
          {
            body: {
              mealAt: `${input.localDate}T${MEAL_TIME[input.mealType]}`,
              mealType: input.mealType,
              recordType: 'actual',
              items: [{ foodId: Number(input.food.id), quantity }],
            },
          },
        )
        const record = toRecord(r, ownerId)
        if (!record) throw new WorkoutStoreError('error')
        savedByRequest.set(input.requestId, record)
        return { record, created: true }
      } catch (error) {
        throw error instanceof WorkoutStoreError ? error : storeError(error)
      }
    },

    async get(recordId) {
      if (!/^\d+$/.test(recordId)) return null
      try {
        const r = await apiRequest<MealRecordResponse>(
          'GET',
          `/meal-records/${recordId}`,
        )
        return toRecord(r, ownerId)
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.status === 404 || error.status === 403)
        )
          return null // 없는 기록·다른 계정의 기록
        throw storeError(error)
      }
    },

    listByDate,

    async listAll() {
      const today = todayKst()
      const days = Array.from({ length: LIST_ALL_DAYS }, (_, i) =>
        shiftDate(today, -i),
      )
      const results = await Promise.all(days.map((d) => listByDate(d)))
      return {
        items: sortByCreated(results.flatMap((r) => r.items)),
        skippedCount: results.reduce((n, r) => n + r.skippedCount, 0),
      }
    },

    async update(recordId, input) {
      if (!isPortion(input.portion))
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      const current = await this.get(recordId)
      if (!current || current.foodId === '')
        throw new WorkoutStoreError('notFound')
      // 양 구분을 바꾸지 않았으면 서버 기록(중량·영양소)을 그대로 둔다
      if (current.portion === input.portion)
        return { ...current, revision: input.expectedRevision + 1 }
      try {
        const quantity = quantityOfPortion(input.portion)
        const r = await apiRequest<MealRecordResponse>(
          'PATCH',
          `/meal-records/${recordId}`,
          { body: { items: [{ foodId: Number(current.foodId), quantity }] } },
        )
        const record = toRecord(r, ownerId)
        if (!record) throw new WorkoutStoreError('error')
        return { ...record, revision: input.expectedRevision + 1 }
      } catch (error) {
        throw error instanceof WorkoutStoreError ? error : storeError(error)
      }
    },

    async delete(recordId) {
      if (!/^\d+$/.test(recordId)) throw new WorkoutStoreError('notFound')
      try {
        await apiRequest('DELETE', `/meal-records/${recordId}`)
      } catch (error) {
        throw storeError(error)
      }
    },
  }
}
