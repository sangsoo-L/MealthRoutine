import {
  INDEX,
  STORE_DAILY_QUIZZES,
  STORE_REWARD_LEDGER,
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
import { isLocalDate } from '../../exercise/workoutModel.ts'
import { WorkoutStoreError } from '../../exercise/workoutRepositories.ts'
import {
  isAnswerId,
  isOptionId,
  newDailyQuiz,
  newRewardEntry,
  parseDailyQuiz,
  parseRewardEntry,
} from '../quizModel.ts'
import { rewardKeyFor } from '../quizPolicy.ts'
import type {
  CompleteResult,
  DailyQuiz,
  QuizRepository,
  RewardEntry,
  RewardTotals,
} from '../quizRepository.ts'

/**
 * [개발 전용] 알아가기 퀴즈 IndexedDB 저장소(DB v6의 dailyQuizzes·rewardLedger). 개발 서버에서만 불러온다(quiz/quizSource.ts).
 * 계정 격리: 모든 조회는 ownerId로 시작하는 인덱스 범위만 쓰고, 읽은 값도 ownerId가 다르면 없는 것으로 본다.
 *
 * 중복 방지는 저장소 계층에서 한다. 계정+날짜 유일 인덱스가 같은 날짜의 출제·응시 행을 하나로, 계정+보상 키 유일 인덱스가 같은 날짜의 보상을
 * 하나로 막는다. 응시 완료 기록과 보상 내역은 한 트랜잭션에서 쓰므로 둘 중 하나만 남는 일이 없고, 여러 탭이 동시에 제출해도
 * 트랜잭션이 차례로 실행되어 두 번째 제출은 "이미 완료"를 읽고 아무것도 쓰지 않는다.
 */
export function createIndexedDbQuizRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): QuizRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  return {
    kind: 'local',

    async get(localDate: string): Promise<DailyQuiz | null> {
      if (!isLocalDate(localDate)) throw new WorkoutStoreError('validation')
      return runTransaction([STORE_DAILY_QUIZZES], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(
            tx
              .objectStore(STORE_DAILY_QUIZZES)
              .index(INDEX.quizzesByOwnerDate)
              .get([ownerId, localDate]),
          ),
          parseDailyQuiz,
          ownerId,
        ),
      )
    },

    async listAnsweredQuestionIds(): Promise<string[]> {
      return runTransaction([STORE_DAILY_QUIZZES], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_DAILY_QUIZZES)
            .index(INDEX.quizzesByOwnerDate)
            .getAll(ownerRange(ownerId)),
        )
        const { valid } = splitRows(raws, parseDailyQuiz, ownerId)
        return valid
          .filter((q) => q.completedAt !== null)
          .map((q) => q.questionId)
      })
    },

    async assign(localDate: string, questionId: string) {
      if (!isLocalDate(localDate) || questionId === '') {
        throw new WorkoutStoreError('validation')
      }
      const candidate = newDailyQuiz({
        id: newId(),
        ownerId,
        localDate,
        questionId,
        now: now(),
      })
      assertWritable(candidate, parseDailyQuiz, 'invalidDraft')
      return runTransaction([STORE_DAILY_QUIZZES], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_DAILY_QUIZZES)
        const existing = parseStored(
          await requestResult(
            store.index(INDEX.quizzesByOwnerDate).get([ownerId, localDate]),
          ),
          parseDailyQuiz,
        )
        // 이미 출제된 날은 문제를 바꾸지 않는다(새로고침·다른 탭에서 와도 같은 문제).
        if (existing) return { quiz: existing, created: false }
        await requestResult(store.add(candidate))
        return { quiz: candidate, created: true }
      })
    },

    async complete(input): Promise<CompleteResult> {
      const { localDate, selectedAnswerId, correctAnswerId } = input
      if (
        !isLocalDate(localDate) ||
        !isAnswerId(selectedAnswerId) ||
        !isAnswerId(correctAnswerId) ||
        // 4지선다(A~D) 응답을 OX 정답에, 또는 그 반대로 채점하지 않는다.
        isOptionId(selectedAnswerId) !== isOptionId(correctAnswerId)
      ) {
        throw new WorkoutStoreError('validation')
      }
      const at = now()
      const transactionId = newId()
      return runTransaction(
        [STORE_DAILY_QUIZZES, STORE_REWARD_LEDGER],
        'readwrite',
        async (tx) => {
          const quizzes = tx.objectStore(STORE_DAILY_QUIZZES)
          const ledger = tx.objectStore(STORE_REWARD_LEDGER)
          const existing = parseOwned(
            await requestResult(
              quizzes.index(INDEX.quizzesByOwnerDate).get([ownerId, localDate]),
            ),
            parseDailyQuiz,
            ownerId,
          )
          if (!existing) throw new WorkoutStoreError('notFound')
          const key = rewardKeyFor(localDate)
          const readReward = async (): Promise<RewardEntry | null> =>
            parseOwned(
              await requestResult(
                ledger.index(INDEX.ledgerByOwnerKey).get([ownerId, key]),
              ),
              parseRewardEntry,
              ownerId,
            )
          // 재응시·재보상 불가: 이미 완료한 퀴즈는 아무것도 쓰지 않고 기존 결과를 돌려준다.
          if (existing.completedAt !== null) {
            return {
              quiz: existing,
              reward: await readReward(),
              alreadyCompleted: true,
            }
          }
          const isCorrect = selectedAnswerId === correctAnswerId
          const done: DailyQuiz = {
            ...existing,
            selectedAnswerId,
            isCorrect,
            completedAt: at.toISOString(),
          }
          assertWritable(done, parseDailyQuiz, 'invalidDraft')
          let reward: RewardEntry | null = null
          if (isCorrect) {
            // 같은 날짜의 보상 내역이 이미 있으면(비정상) 더하지 않고 기존 내역을 쓴다. 유일 인덱스가 최종 방어선이다.
            reward = await readReward()
            if (!reward) {
              reward = assertWritable(
                newRewardEntry({ transactionId, ownerId, localDate, now: at }),
                parseRewardEntry,
                'invalidDraft',
              )
              await requestResult(ledger.add(reward))
            }
          }
          await requestResult(quizzes.put(done))
          return { quiz: done, reward, alreadyCompleted: false }
        },
      )
    },

    async getReward(localDate: string): Promise<RewardEntry | null> {
      if (!isLocalDate(localDate)) throw new WorkoutStoreError('validation')
      return runTransaction([STORE_REWARD_LEDGER], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(
            tx
              .objectStore(STORE_REWARD_LEDGER)
              .index(INDEX.ledgerByOwnerKey)
              .get([ownerId, rewardKeyFor(localDate)]),
          ),
          parseRewardEntry,
          ownerId,
        ),
      )
    },

    async totals(): Promise<RewardTotals> {
      return runTransaction([STORE_REWARD_LEDGER], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_REWARD_LEDGER)
            .index(INDEX.ledgerByOwnerKey)
            .getAll(ownerRange(ownerId)),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseRewardEntry,
          ownerId,
        )
        return {
          points: valid.reduce((sum, r) => sum + r.points, 0),
          experience: valid.reduce((sum, r) => sum + r.experience, 0),
          count: valid.length,
          skippedCount,
        }
      })
    },
  }
}
