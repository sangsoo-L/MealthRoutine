import {
  INDEX,
  STORE_MEALS,
  newRecordId,
  requestResult,
  runTransaction,
} from '../../exercise/local/exerciseDb.ts'
import {
  assertOwner,
  assertWritable,
  ownerRange,
  parseOwned,
  parseStored,
  splitRows,
  type LocalRepositoryOptions,
} from '../../exercise/local/indexedDbWorkoutRepositories.ts'
import { isLocalDate, isValidRequestId } from '../../exercise/workoutModel.ts'
import {
  WorkoutStoreError,
  type ListQueryResult,
} from '../../exercise/workoutRepositories.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { isPortion, type Portion } from '../foodNutrition.ts'
import {
  buildMealRecord,
  buildMealUpdate,
  parseMealRecord,
  sameMealContent,
  sortByCreated,
  type MealRecord,
} from '../mealModel.ts'
import type {
  CreateMealInput,
  MealRecordRepository,
  SaveMealResult,
} from '../mealRepository.ts'

/**
 * [개발 전용] 식단 기록 IndexedDB 저장소(DB v3의 mealRecords). 개발 서버에서만 불러온다(food/mealSource.ts).
 * 계정 격리·무결성 규칙은 운동 저장소와 같다: 모든 조회는 ownerId로 시작하는 인덱스 범위만 쓰고, id로 읽은 값도 ownerId가 다르면 없는 것으로 본다.
 * 모든 쓰기는 같은 트랜잭션 안에서 소유자와 revision을 다시 확인한다. 이 격리는 화면 사이의 데이터 섞임을 막는 규칙이며 보안 수단이 아니다.
 */
export function createIndexedDbMealRecordRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): MealRecordRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  return {
    kind: 'local',

    async create(input: CreateMealInput): Promise<SaveMealResult> {
      if (!isValidRequestId(input.requestId)) {
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      }
      const candidate = buildMealRecord({
        id: newId(),
        ownerId,
        requestId: input.requestId,
        localDate: input.localDate,
        mealType: input.mealType,
        food: input.food,
        portion: input.portion,
        now: now(),
      })
      if (!candidate) {
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      }
      // 읽기와 같은 검증을 한 번 더 거친다(저장에 성공한 값이 나중에 손상으로 읽히지 않게).
      assertWritable(candidate, parseMealRecord, 'invalidMeal')
      return runTransaction([STORE_MEALS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEALS)
        const existing = parseStored(
          await requestResult(
            store
              .index(INDEX.mealsByOwnerRequest)
              .get([ownerId, input.requestId]),
          ),
          parseMealRecord,
        )
        if (existing) {
          // 같은 요청의 재전송이면 처음 저장한 기록을 돌려준다. 같은 요청 id에 다른 내용이 오면 조용히 넘기지 않는다.
          if (!sameMealContent(existing, candidate)) {
            throw new WorkoutStoreError('conflict', { code: 'requestConflict' })
          }
          return { record: existing, created: false }
        }
        await requestResult(store.add(candidate))
        return { record: candidate, created: true }
      })
    },

    async get(recordId: string): Promise<MealRecord | null> {
      return runTransaction([STORE_MEALS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_MEALS).get(recordId)),
          parseMealRecord,
          ownerId,
        ),
      )
    },

    async listByDate(
      localDate: LocalDate,
    ): Promise<ListQueryResult<MealRecord>> {
      if (!isLocalDate(localDate)) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_MEALS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_MEALS)
            .index(INDEX.mealsByOwnerDate)
            .getAll(IDBKeyRange.only([ownerId, localDate])),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseMealRecord,
          ownerId,
        )
        // 키 범위와 저장된 값이 어긋난 행은 보여 주지 않는다.
        return {
          items: sortByCreated(valid.filter((r) => r.localDate === localDate)),
          skippedCount,
        }
      })
    },

    async listAll(): Promise<ListQueryResult<MealRecord>> {
      return runTransaction([STORE_MEALS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_MEALS)
            .index(INDEX.mealsByOwnerDate)
            .getAll(ownerRange(ownerId)),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseMealRecord,
          ownerId,
        )
        return { items: sortByCreated(valid), skippedCount }
      })
    },

    async update(
      recordId: string,
      input: { expectedRevision: number; portion: Portion },
    ): Promise<MealRecord> {
      if (
        !Number.isInteger(input.expectedRevision) ||
        !isPortion(input.portion)
      ) {
        throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
      }
      const at = now()
      return runTransaction([STORE_MEALS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEALS)
        const existing = parseOwned(
          await requestResult(store.get(recordId)),
          parseMealRecord,
          ownerId,
        )
        if (!existing) throw new WorkoutStoreError('notFound')
        if (existing.revision !== input.expectedRevision) {
          throw new WorkoutStoreError('conflict', {
            code: 'revisionMismatch',
            currentRevision: existing.revision,
          })
        }
        const next = buildMealUpdate(existing, {
          portion: input.portion,
          now: at,
        })
        if (!next) {
          throw new WorkoutStoreError('validation', { code: 'invalidMeal' })
        }
        assertWritable(next, parseMealRecord, 'invalidMeal')
        await requestResult(store.put(next))
        return next
      })
    },

    async delete(
      recordId: string,
      deleteOptions?: { expectedRevision?: number },
    ): Promise<void> {
      return runTransaction([STORE_MEALS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_MEALS)
        const existing = parseOwned(
          await requestResult(store.get(recordId)),
          parseMealRecord,
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
        await requestResult(store.delete(recordId))
      })
    },
  }
}
