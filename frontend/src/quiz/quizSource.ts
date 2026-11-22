import type { QuizRepository } from './quizRepository.ts'

/**
 * 퀴즈 저장소 출처. 지금은 개발 서버에서만 IndexedDB 로컬 저장소(DB v6)를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 저장 수단이 연결되어 있지 않다"는 뜻이며 화면은 "준비 중"으로 안내한다(가짜 기록·보상을 만들지 않는다).
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 로컬 저장소 청크가 제거된다.
 */
const localModule = import.meta.env.DEV
  ? await import('./local/indexedDbQuizRepository.ts')
  : null

export function createQuizRepository(ownerId: string): QuizRepository | null {
  return localModule ? localModule.createIndexedDbQuizRepository(ownerId) : null
}
