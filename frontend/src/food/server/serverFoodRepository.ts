import { ApiError, apiRequest } from '../../api/http.ts'
import type { FoodRepository } from '../foodRepository.ts'
import type { Food, FoodSource, NutrientValue } from '../foodTypes.ts'

/** 백엔드 FoodResponse (GET /foods, GET /foods/{foodId}). 영양소는 servingSize(100g·100ml) 기준이다. */
interface FoodResponse {
  foodId: number
  name: string
  category: string | null
  brand: string | null
  servingSize: number | null
  servingUnit: string | null
  referenceServingSize: number | null
  caloriesKcal: number | null
  carbohydrateG: number | null
  proteinG: number | null
  fatG: number | null
}

interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export const SERVER_FOOD_SOURCE: FoodSource = {
  kind: 'server',
  label: '식약처 식품영양성분 DB',
}

/** 한 번에 받는 음식 수(백엔드 페이지 최대값 2000 이하). */
const PAGE_SIZE = 2000

const num = (v: number | null | undefined): NutrientValue =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** 음식 id → 1인분 중량(g). 식단 기록에서 그램을 "몇 인분"으로 바꿀 때 쓴다. */
const servingGrams = new Map<string, number>()

function toFood(r: FoodResponse): Food {
  const id = String(r.foodId)
  // 백엔드 계산과 같게: 1인분 = referenceServingSize, 없으면 기준량(servingSize)
  servingGrams.set(id, r.referenceServingSize ?? r.servingSize ?? 100)
  return {
    id,
    name: r.brand ? `${r.name} (${r.brand})` : r.name,
    category: r.category ?? null,
    per100g: {
      kcal: num(r.caloriesKcal),
      protein: num(r.proteinG),
      fat: num(r.fatG),
      carb: num(r.carbohydrateG),
    },
    allergyNote: null, // 원본 데이터에 알레르기 정보가 없다
    source: SERVER_FOOD_SOURCE,
  }
}

function getPage(page: number): Promise<PageResponse<FoodResponse>> {
  return apiRequest<PageResponse<FoodResponse>>(
    'GET',
    `/foods?page=${page}&size=${PAGE_SIZE}`,
    { auth: 'optional' }, // 음식 조회는 비회원도 가능
  )
}

/** 음식 전체(약 2만 3천 건)를 한 번만 받아 메모리에 둔다. 화면이 전체 목록에서 거르는 구조라서 임시로 이렇게 한다. */
let allFoods: Promise<readonly Food[]> | null = null

async function loadAll(): Promise<readonly Food[]> {
  const first = await getPage(0)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) =>
      getPage(i + 1),
    ),
  )
  return [first, ...rest].flatMap((p) => p.content.map(toFood))
}

/** 1인분 중량(g). 모르면 백엔드에서 한 건 조회해 채운다. */
export async function servingGramsOf(foodId: string): Promise<number> {
  const known = servingGrams.get(foodId)
  if (known !== undefined) return known
  await serverFoodRepository.getById(foodId)
  return servingGrams.get(foodId) ?? 100
}

export const serverFoodRepository: FoodRepository = {
  kind: 'server',
  list() {
    if (!allFoods) {
      allFoods = loadAll().catch((error: unknown) => {
        allFoods = null // 실패하면 다음 reload 때 다시 받는다
        throw error
      })
    }
    return allFoods
  },
  async getById(foodId) {
    if (!/^\d+$/.test(foodId)) return null
    try {
      const r = await apiRequest<FoodResponse>('GET', `/foods/${foodId}`, {
        auth: 'optional',
      })
      return toFood(r)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  },
}
