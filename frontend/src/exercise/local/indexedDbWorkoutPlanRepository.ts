import {
  buildWorkoutPlan,
  buildWorkoutPlanReplace,
  isWorkoutPlanDateOpen,
  parseWorkoutPlan,
  type WorkoutPlan,
} from '../workoutPlanModel.ts'
import type {
  CreateWorkoutPlanInput,
  ReplaceWorkoutPlanInput,
  SaveWorkoutPlanResult,
  WorkoutPlanRepository,
} from '../workoutPlanRepository.ts'
import {
  isLocalDate,
  isValidRequestId,
  sameListItems,
  toLocalDate,
} from '../workoutModel.ts'
import {
  WorkoutStoreError,
  type ListQueryResult,
} from '../workoutRepositories.ts'
import { DEV_CATALOG_VERSION, type LocalDate } from '../workoutTypes.ts'
import {
  INDEX,
  STORE_WORKOUT_PLANS,
  newRecordId,
  requestResult,
  runTransaction,
} from './exerciseDb.ts'
import {
  assertOwner,
  assertWritable,
  parseOwned,
  parseStored,
  splitRows,
  type LocalRepositoryOptions,
} from './indexedDbWorkoutRepositories.ts'

function byPlanDate(a: WorkoutPlan, b: WorkoutPlan): number {
  return a.planDate < b.planDate ? -1 : a.planDate > b.planDate ? 1 : 0
}

/**
 * [개발 전용] 내일 운동 계획 IndexedDB 저장소(DB v5의 workoutPlans). 개발 서버에서만 불러온다(exercise/workoutPlanSource.ts).
 * 계정 격리·무결성 규칙은 다른 운동 저장소와 같다: 모든 조회는 ownerId로 시작하는 인덱스 범위만 쓰고, id로 읽은 값도 ownerId가 다르면 없는 것으로 본다.
 * 모든 쓰기는 같은 트랜잭션 안에서 소유자와 revision을 다시 확인한다. 이 저장소는 운동 목록·세션·기록·루틴 저장소를 읽지도 쓰지도 않는다.
 *
 * - 계획 날짜는 저장소의 시계 기준 "오늘 이후"만 만들거나 고칠 수 있다(자정이 지나 오늘이 된 계획은 더 이상 내일 계획이 아니며 조회·삭제만 가능하고
 *   자동으로 오늘의 운동이 되지도 않는다).
 * - 계정+날짜 인덱스가 유일이라, 두 탭이 동시에 같은 날짜에 저장해도 날짜별 계획은 1개뿐이다(두 번째 저장은 planExists로 실패한다).
 */
export function createIndexedDbWorkoutPlanRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): WorkoutPlanRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  return {
    kind: 'local',

    async create(
      input: CreateWorkoutPlanInput,
    ): Promise<SaveWorkoutPlanResult> {
      if (!isValidRequestId(input.requestId)) {
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      }
      const at = now()
      const candidate = buildWorkoutPlan({
        id: newId(),
        ownerId,
        requestId: input.requestId,
        planDate: input.planDate,
        draft: input.draft,
        knownExerciseIds: input.knownExerciseIds,
        allowedRecordTypes: input.allowedRecordTypes,
        catalogVersion: DEV_CATALOG_VERSION,
        now: at,
      })
      if (!candidate) {
        throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
      }
      // 계획 날짜는 저장 시점의 오늘 이후여야 한다. 화면을 연 채 자정이 지나면 여기서 거부된다.
      if (!isWorkoutPlanDateOpen(candidate.planDate, toLocalDate(at))) {
        throw new WorkoutStoreError('validation', { code: 'invalidPlanDate' })
      }
      // 읽기와 같은 검증을 한 번 더 거친다(저장에 성공한 값이 나중에 손상으로 읽히지 않게).
      assertWritable(candidate, parseWorkoutPlan, 'invalidDraft')
      return runTransaction([STORE_WORKOUT_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_WORKOUT_PLANS)
        const sameRequest = parseStored(
          await requestResult(
            store
              .index(INDEX.workoutPlansByOwnerRequest)
              .get([ownerId, input.requestId]),
          ),
          parseWorkoutPlan,
        )
        if (sameRequest) {
          // 같은 요청의 재전송이면 처음 저장한 계획을 돌려준다. 같은 요청 id에 다른 구성이 오면 조용히 넘기지 않는다.
          if (
            sameRequest.planDate !== candidate.planDate ||
            !sameListItems(sameRequest.items, candidate.items)
          ) {
            throw new WorkoutStoreError('conflict', { code: 'requestConflict' })
          }
          return { plan: sameRequest, created: false }
        }
        // 같은 날짜에 이미 계획이 있으면 만들지 않는다(교체는 확인을 받은 뒤 replace로 한다). 같은 순간의 다른 탭 저장은 아래 유일 인덱스가 막는다.
        const sameDate = await requestResult(
          store
            .index(INDEX.workoutPlansByOwnerDate)
            .count(IDBKeyRange.only([ownerId, candidate.planDate])),
        )
        if (sameDate > 0) {
          throw new WorkoutStoreError('conflict', { code: 'planExists' })
        }
        await requestResult(store.add(candidate))
        return { plan: candidate, created: true }
      })
    },

    async get(planId: string): Promise<WorkoutPlan | null> {
      return runTransaction([STORE_WORKOUT_PLANS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_WORKOUT_PLANS).get(planId)),
          parseWorkoutPlan,
          ownerId,
        ),
      )
    },

    async listFrom(date: LocalDate): Promise<ListQueryResult<WorkoutPlan>> {
      if (!isLocalDate(date)) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_WORKOUT_PLANS], 'readonly', async (tx) => {
        // [ownerId, date] 이상 [ownerId, []] 이하: 이 계정의 계획 날짜가 date 이상인 키 전체.
        const raws = await requestResult(
          tx
            .objectStore(STORE_WORKOUT_PLANS)
            .index(INDEX.workoutPlansByOwnerDate)
            .getAll(IDBKeyRange.bound([ownerId, date], [ownerId, []])),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseWorkoutPlan,
          ownerId,
        )
        // 키 범위와 저장된 값이 어긋난 행은 보여 주지 않는다.
        return {
          items: valid.filter((p) => p.planDate >= date).sort(byPlanDate),
          skippedCount,
        }
      })
    },

    async listByDate(
      planDate: LocalDate,
    ): Promise<ListQueryResult<WorkoutPlan>> {
      if (!isLocalDate(planDate)) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_WORKOUT_PLANS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_WORKOUT_PLANS)
            .index(INDEX.workoutPlansByOwnerDate)
            .getAll(IDBKeyRange.only([ownerId, planDate])),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseWorkoutPlan,
          ownerId,
        )
        return {
          items: valid.filter((p) => p.planDate === planDate),
          skippedCount,
        }
      })
    },

    async replace(
      planId: string,
      input: ReplaceWorkoutPlanInput,
    ): Promise<WorkoutPlan> {
      if (!Number.isInteger(input.expectedRevision)) {
        throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
      }
      const at = now()
      return runTransaction([STORE_WORKOUT_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_WORKOUT_PLANS)
        const existing = parseOwned(
          await requestResult(store.get(planId)),
          parseWorkoutPlan,
          ownerId,
        )
        if (!existing) throw new WorkoutStoreError('notFound')
        if (existing.revision !== input.expectedRevision) {
          throw new WorkoutStoreError('conflict', {
            code: 'revisionMismatch',
            currentRevision: existing.revision,
          })
        }
        if (!isWorkoutPlanDateOpen(existing.planDate, toLocalDate(at))) {
          throw new WorkoutStoreError('validation', {
            code: 'invalidPlanDate',
          })
        }
        const next = buildWorkoutPlanReplace(existing, {
          draft: input.draft,
          knownExerciseIds: input.knownExerciseIds,
          allowedRecordTypes: input.allowedRecordTypes,
          catalogVersion: DEV_CATALOG_VERSION,
          now: at,
        })
        if (!next) {
          throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
        }
        assertWritable(next, parseWorkoutPlan, 'invalidDraft')
        await requestResult(store.put(next))
        return next
      })
    },

    async delete(
      planId: string,
      deleteOptions?: { expectedRevision?: number },
    ): Promise<void> {
      return runTransaction([STORE_WORKOUT_PLANS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_WORKOUT_PLANS)
        const existing = parseOwned(
          await requestResult(store.get(planId)),
          parseWorkoutPlan,
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
