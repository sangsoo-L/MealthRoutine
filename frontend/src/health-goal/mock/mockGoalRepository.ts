import {
  mockDelay,
  mockFlag,
  mockKey,
  readMockJson,
  writeMockJson,
} from '../../dev-mock/devMockStorage.ts'
import { buildGoal, parseStoredGoal } from '../goalPolicy.ts'
import { GoalSaveError, type HealthGoalRepository } from '../goalRepository.ts'

/**
 * [개발 전용] 건강관리 목표 Mock 저장소. 서버가 맡을 저장·보관을 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(goalSource.ts).
 *
 * - 저장 위치는 localStorage의 `mealthroutine.dev.mock.goal.<사용자 id>`다(dev-mock/devMockStorage.ts). 로그아웃에도 남고 다른 계정의
 *   키는 읽지 않는다. 처음에는 모든 개발용 계정이 목표 없음이다.
 * - 읽은 값은 외부 입력으로 보고 parseStoredGoal로 검증한다(합 100, 방향·비율 일치, 허용 범위). 유효하지 않으면 "목표 없음"이다.
 * - 저장은 정책별 허용 비율만 받아 buildGoal로 만든다. 실패하면 기존 값을 건드리지 않는다.
 * - 이해도 등급이 바뀌어도 저장된 목표를 자동으로 바꾸지 않는다(이 저장소는 등급을 알지 못한다).
 * - 짧은 지연을 둔다. 개발·검수용 스위치(mockFlag)로 조회·저장 실패를 재현할 수 있다.
 */
export function createMockGoalRepository(options: {
  userId: string
  latencyMs?: number
}): HealthGoalRepository {
  const { userId, latencyMs = 300 } = options
  const key = mockKey('goal', userId)

  return {
    kind: 'mock',

    async getGoal() {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'goal')) throw new Error('mock load failure')
      return parseStoredGoal(readMockJson(key))
    },

    async saveGoal(input) {
      await mockDelay(latencyMs)
      if (mockFlag('failSave', 'goal')) throw new GoalSaveError('failed')
      const goal = buildGoal(input)
      if (!goal) throw new GoalSaveError('invalid')
      try {
        writeMockJson(key, goal)
      } catch {
        throw new GoalSaveError('failed')
      }
      return goal
    },
  }
}
