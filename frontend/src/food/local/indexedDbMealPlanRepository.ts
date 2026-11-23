import {
  INDEX,
  STORE_MEAL_PLANS,
  newRecordId,
  requestResult,
  runTransaction,
} from '../../exercise/local/exerciseDb.ts'
import {
  assertOwner,
  assertWritable,
  parseOwned,
  parseStored,
  splitRows,
  type LocalRepositoryOptions,
} from '../../exercise/local/indexedDbWorkoutRepositories.ts'
import {
  isLocalDate,
  isValidRequestId,
  toLocalDate,
} from '../../exercise/workoutModel.ts'
import {
  WorkoutStoreError,
  type ListQueryResult,
} from '../../exercise/workoutRepositories.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { isPortion, type Portion } from '../foodNutrition.ts'
import { sortByCreated } from '../mealModel.ts'
import {
  buildMealPlan,
  buildMealPlanUpdate,
  isPlanDateOpen,
  parseMealPlan,
  sameMealPlanContent,
  type MealPlan,
} from '../mealPlanModel.ts'
import type {
  CreateMealPlanInput,
  MealPlanRepository,
  SaveMealPlanResult,
} from '../mealPlanRepository.ts'

/**
 * [개발 전용] 내일 식단 계획 IndexedDB 저장소(DB v4의 mealPlans). 개발 서버에서만 불러온다(food/mealPlanSource.ts).
 * 계정 격리·무결성 규칙은 식단 기록 저장소와 같다: 모든 조회는 ownerId로 시작하는 인덱스 범위만 쓰고, id로 읽은 값도 ownerId가 다르면 없는 것으로 본다.
 * 모든 쓰기는 같은 트랜잭션 안에서 소유자와 revision을 다시 확인한다. 이 저장소는 실제 섭취 기록(mealRecords)을 읽지도 쓰지도 않는다.
 * 계획 날짜는 저장소의 시계 기준 "오늘 이후"만 만들거나 고칠 수 있다(자정이 지나 오늘이 된 계획은 더 이상 내일 계획이 아니며 자동으로 실제 섭취가 되지도 않는다).
 */
export function createIndexedDbMealPlanRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): MealPlanRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  return {
    kind: 'local',

    async create(input: CreateMealPlanInput): Promise<SaveMealPlanResult> {
      if (!isValidRequestId(input.requestId)) {
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      }
      const at = now()
      const candidate = buildMealPlan({
        id: newId(),
        ownerId,
        requestId: input.requestId,
        planDate: input.planDate,
        mealType: input.mealType,
        food: input.food,
        portion: input.portion,
        now: at,
      })
      if (!candidate) {
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      }
      // 계획 날짜는 저장 시점의 오늘 이후여야 한다. 화면을 연 채 자정이 지나면 여기서 거부된다.
      if (!isPlanDateOpen(candidate.planDate, toLocalDate(at))) {
        throw new WorkoutStoreError('validation', { code: 'invalidPlanDate' })
      }
      // 읽기와 같은 검증을 한 번 더 거친다(저장에 성공한 값이 나중에 손상으로 읽히지 않게).
      assertWritable(candidate, parseMealPlan, 'invalidMeal')
      return runTransaction([STORE_MEAL_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEAL_PLANS)
        const existing = parseStored(
          await requestResult(
            store
              .index(INDEX.mealPlansByOwnerRequest)
              .get([ownerId, input.requestId]),
          ),
          parseMealPlan,
        )
        if (existing) {
          // 같은 요청의 재전송이면 처음 저장한 계획을 돌려준다. 같은 요청 id에 다른 내용이 오면 조용히 넘기지 않는다.
          if (!sameMealPlanContent(existing, candidate)) {
            throw new WorkoutStoreError('conflict', { code: 'requestConflict' })
          }
          return { plan: existing, created: false }
        }
        await requestResult(store.add(candidate))
        return { plan: candidate, created: true }
      })
    },

    async get(planId: string): Promise<MealPlan | null> {
      return runTransaction([STORE_MEAL_PLANS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_MEAL_PLANS).get(planId)),
          parseMealPlan,
          ownerId,
        ),
      )
    },

    async listByDate(planDate: LocalDate): Promise<ListQueryResult<MealPlan>> {
      if (!isLocalDate(planDate)) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_MEAL_PLANS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_MEAL_PLANS)
            .index(INDEX.mealPlansByOwnerDate)
            .getAll(IDBKeyRange.only([ownerId, planDate])),
        )
        const { valid, skippedCount } = splitRows(raws, parseMealPlan, ownerId)
        // 키 범위와 저장된 값이 어긋난 행은 보여 주지 않는다.
        return {
          items: sortByCreated(valid.filter((p) => p.planDate === planDate)),
          skippedCount,
        }
      })
    },

    async update(
      planId: string,
      input: { expectedRevision: number; portion: Portion },
    ): Promise<MealPlan> {
      if (
        !Number.isInteger(input.expectedRevision) ||
        !isPortion(input.portion)
      ) {
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      }
      const at = now()
      return runTransaction([STORE_MEAL_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEAL_PLANS)
        const existing = parseOwned(
          await requestResult(store.get(planId)),
          parseMealPlan,
          ownerId,
        )
        if (!existing) throw new WorkoutStoreError('notFound')
        if (existing.revision !== input.expectedRevision) {
          throw new WorkoutStoreError('conflict', {
            code: 'revisionMismatch',
            currentRevision: existing.revision,
          })
        }
        if (!isPlanDateOpen(existing.planDate, toLocalDate(at))) {
          throw new WorkoutStoreError('validation', {
            code: 'invalidPlanDate',
          })
        }
        const next = buildMealPlanUpdate(existing, {
          portion: input.portion,
          now: at,
        })
        if (!next) {
          throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
        }
        assertWritable(next, parseMealPlan, 'invalidMeal')
        await requestResult(store.put(next))
        return next
      })
    },

    async delete(
      planId: string,
      deleteOptions?: { expectedRevision?: number },
    ): Promise<void> {
      return runTransaction([STORE_MEAL_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEAL_PLANS)
        const existing = parseOwned(
          await requestResult(store.get(planId)),
          parseMealPlan,
          ownerId,
        )
        if (!existing) throw new WorkoutStoreError('notFound')
        if (
          deleteOptions?.expectedRevision !== undefined &&
          deleteOptions.expectedRevision !== existing.revision
        ) {
          throw new WorkoutStoreError('conflict', {
            code: 'revisionMismatch',
            currentRevision: existing.revision,
          })
        }
        await requestResult(store.delete(planId))
      })
    },
  }
}
