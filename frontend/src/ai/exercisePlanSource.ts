import type { Exercise } from '../exercise/exerciseTypes.ts'
import {
  collectLevelEvidence,
  type LevelEvidence,
} from './exercisePlanEvidence.ts'

/**
 * I02-1 로컬 예시 추천이 읽는 운동 카탈로그와 운동량 근거(운동 JSON 시드)의 출처. W01-2의 planSource와 같은 방식이다:
 * 지금은 개발 서버에서만 시드를 쓰고 그 외(운영 빌드)에는 null이다. null은 "이 빌드에서는 추천에 쓸 운동 데이터가 연결되어 있지 않다"는 뜻이며
 * 화면은 "준비 중"으로 안내한다(운영 번들에 시드가 들어가지 않는다). 시드가 올바르지 않아 읽지 못해도 null이다.
 */
const seedModule = import.meta.env.DEV
  ? await import('../exercise/seed/seedData.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export interface LocalPlanSource {
  exercises: readonly Exercise[]
  evidence: LevelEvidence
}

let cached: LocalPlanSource | null | undefined

export function createLocalPlanSource(): LocalPlanSource | null {
  if (!seedModule || !mockStorage) return null
  // 개발·검수용: 운동 데이터 소스 미연결 상태를 재현한다(운동 목록·진행·W01-2와 같은 플래그).
  if (mockStorage.mockFlag('unavailable', 'exercise')) return null
  if (cached === undefined) {
    try {
      const catalog = seedModule.getSeedCatalog()
      cached = {
        exercises: catalog.getAllExercises(),
        evidence: collectLevelEvidence(catalog),
      }
    } catch {
      cached = null
    }
  }
  return cached
}
