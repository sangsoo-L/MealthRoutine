import type { BodyMeasurementRepository } from './bodyRepository.ts'
import {
  createServerBodySource,
  type ServerBodySource,
} from './serverBodySource.ts'

/**
 * 신체 정보의 데이터 출처(F5). 실제/모의 모드는 F1-D3과 같은 기준이다.
 * - 모의 모드(개발 서버 + `VITE_DEV_AUTH=true`): 기존 개발용 저장소(등록 여부·수치를 브라우저에 둔다). `mockFlag('unavailable','body')`면 null.
 * - 실제 모드(개발 기본·운영 빌드): 서버 연결. 등록 여부를 모른다(`protected`, F5-D1).
 * - 계정 id가 없으면 null(어떤 계정의 정보도 읽거나 쓰지 않는다). null은 "조회·저장 수단 없음"이며 누락으로 보지 않는다.
 *
 * 모의 모드 식은 빌드 때 상수가 되어 운영 빌드에서는 모의 청크가 제거된다(pinSource.ts·authBackend.ts와 같은 방식).
 * 서버 실패 때 모의 저장소로 넘어가지 않는다.
 */
const MOCK_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'

const mockModule = MOCK_AUTH
  ? await import('./mock/mockBodyRepository.ts')
  : null
const mockStorage = MOCK_AUTH
  ? await import('../dev-mock/devMockStorage.ts')
  : null
const goalSource = MOCK_AUTH
  ? await import('../exercise-goal/exerciseGoalSource.ts')
  : null

export type BodySource =
  | { mode: 'mock'; repository: BodyMeasurementRepository }
  | { mode: 'server'; source: ServerBodySource }

/**
 * 모의 저장소만 돌려준다(기존 이름 유지: 개발용 검수 스크립트가 시드에 쓴다). 실제 모드·연결 전은 null.
 * 화면 코드는 `createBodySource`를 쓴다.
 */
export function createBodyRepository(
  userId: string,
): BodyMeasurementRepository | null {
  const source = createBodySource(userId)
  return source?.mode === 'mock' ? source.repository : null
}

export function createBodySource(userId: string): BodySource | null {
  if (!userId) return null
  if (!MOCK_AUTH) return { mode: 'server', source: createServerBodySource() }
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'body')) return null
  // 수치 조회의 PIN 열람 권한 확인은 개발용 PIN 저장소(P11·P12·W01-1과 같은 저장소)에 맡긴다.
  const goalRepository =
    goalSource?.createExerciseGoalRepository(userId) ?? null
  return {
    mode: 'mock',
    repository: mockModule.createMockBodyRepository({
      userId,
      verifyAccess: goalRepository
        ? (access) => goalRepository.verifyAccess(access)
        : undefined,
    }),
  }
}
