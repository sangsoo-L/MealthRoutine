import type { QuizRepository } from './quizRepository.ts'
import { createServerQuizRepository } from './server/serverQuizRepository.ts'

/**
 * 오늘의 퀴즈 연결 자리.
 * - 개발용 체험 로그인(VITE_DEV_AUTH=true)일 때만 브라우저 저장소(IndexedDB)를 쓴다.
 * - 그 외에는 백엔드 퀴즈 API(/quizzes/today)에 연결한다. 문항 내용은 프론트 문제 은행을 그대로 쓰고,
 *   서버가 정한 오늘의 문항 id를 quizIdMap.ts로 은행 id에 맞춘다.
 */
const localModule =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
    ? await import('./local/indexedDbQuizRepository.ts')
    : null

export function createQuizRepository(ownerId: string): QuizRepository | null {
  return localModule
    ? localModule.createIndexedDbQuizRepository(ownerId)
    : createServerQuizRepository(ownerId)
}
