import { createPlanSource, type PlanSource } from './engine.ts'

/**
 * 추천 엔진이 읽는 카탈로그와 근거(운동 JSON 시드)의 출처. 운동 데이터 출처(exerciseSource.ts)와 같은 방식이다:
 * 지금은 개발 서버에서만 시드를 쓰고 그 외(운영 빌드)에는 null이다. null은 "이 빌드에서는 추천에 쓸 운동 데이터가 연결되어 있지 않다"는
 * 뜻이며 화면은 "준비 중"으로 안내한다(운영 번들에 시드가 들어가지 않는다).
 * 시드가 올바르지 않아 읽지 못하면 null이다(원인은 시드 조회 계층이 콘솔에 한 번 남긴다).
 */
const seedModule = import.meta.env.DEV
  ? await import('../seed/seedData.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../../dev-mock/devMockStorage.ts')
  : null

let cached: PlanSource | null | undefined

export function createBeginnerPlanSource(): PlanSource | null {
  if (!seedModule || !mockStorage) return null
  // 개발·검수용: 운동 데이터 소스 미연결 상태를 재현한다(운동 목록·진행과 같은 플래그).
  if (mockStorage.mockFlag('unavailable', 'exercise')) return null
  if (cached === undefined) {
    try {
      cached = createPlanSource(seedModule.getSeedCatalog())
    } catch {
      cached = null
    }
  }
  return cached
}
