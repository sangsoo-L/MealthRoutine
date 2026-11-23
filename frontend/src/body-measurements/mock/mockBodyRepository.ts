import {
  mockDelay,
  mockFlag,
  mockKey,
  readMockJson,
  writeMockJson,
} from '../../dev-mock/devMockStorage.ts'
import {
  ExerciseGoalError,
  type GoalAuthorization,
} from '../../exercise-goal/exerciseGoalTypes.ts'
import {
  BodySaveError,
  type BodyMeasurementRepository,
} from '../bodyRepository.ts'
import type {
  BodyMeasurementInput,
  BodyMeasurementStatus,
  BodyMeasurementValues,
} from '../bodyTypes.ts'
import {
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  isValidMeasurement,
} from '../bodyValidation.ts'

/**
 * [개발 전용] 신체 정보 Mock 저장소. 서버가 맡을 저장·보관을 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(bodySource.ts).
 *
 * - 저장 위치는 localStorage의 `mealthroutine.dev.mock.body.<사용자 id>`다(dev-mock/devMockStorage.ts). 로그아웃에도 남아
 *   "다음 로그인에도 저장돼 있음"을 재현한다. 다른 계정의 키는 읽지 않는다. 기존 개발용 계정에는 값을 미리 넣어 두지 않는다
 *   (처음에는 모두 미등록이다).
 * - 읽은 값은 외부 입력으로 보고 항목마다 검증한다. 0·음수·NaN·범위 밖·문자열 등 유효하지 않은 값은 "없는 것"이다.
 * - 저장은 입력한 항목만 검증해 합치고(기존 유효한 값은 유지), 실패하면 아무것도 바꾸지 않는다.
 * - 수치는 `getMeasurements(access)`로만 읽는다. 호출마다 PIN 열람 권한(`verifyAccess`)을 다시 확인하고, 확인 수단이 없으면
 *   (`verifyAccess` 미연결) 거절한다. 그 밖의 경로로는 등록 여부만 나간다(PIN 보호).
 * - 짧은 지연을 둔다. 개발·검수용 스위치(mockFlag)로 조회 실패·저장 실패를 재현할 수 있다.
 */

interface StoredBody {
  v: 1
  heightCm?: unknown
  weightKg?: unknown
  updatedAt?: unknown
}

function readStored(userId: string): StoredBody | null {
  const raw = readMockJson(mockKey('body', userId))
  return typeof raw === 'object' && raw !== null ? (raw as StoredBody) : null
}

function statusOf(stored: StoredBody | null): BodyMeasurementStatus {
  return {
    height: isValidMeasurement(stored?.heightCm, HEIGHT_RANGE),
    weight: isValidMeasurement(stored?.weightKg, WEIGHT_RANGE),
  }
}

export function createMockBodyRepository(options: {
  userId: string
  latencyMs?: number
  /** PIN 열람 권한 확인. 유효하지 않으면 `ExerciseGoalError('expired')`를 던진다. 없으면 수치를 읽을 수 없다. */
  verifyAccess?: (access: GoalAuthorization) => void
}): BodyMeasurementRepository {
  const { userId, latencyMs = 300, verifyAccess } = options

  return {
    kind: 'mock',

    async getStatus() {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'body')) throw new Error('mock load failure')
      return statusOf(readStored(userId))
    },

    async getMeasurements(
      access: GoalAuthorization,
    ): Promise<BodyMeasurementValues> {
      // 권한 확인 수단이 없으면 어떤 값도 내주지 않는다. 지연 전후로 두 번 확인해, 기다리는 동안 끝난 권한으로는 읽을 수 없다.
      if (!verifyAccess) throw new ExerciseGoalError('unavailable')
      verifyAccess(access)
      await mockDelay(latencyMs)
      verifyAccess(access)
      if (mockFlag('failLoad', 'body')) throw new Error('mock load failure')
      const stored = readStored(userId)
      return {
        heightCm: isValidMeasurement(stored?.heightCm, HEIGHT_RANGE)
          ? stored.heightCm
          : null,
        weightKg: isValidMeasurement(stored?.weightKg, WEIGHT_RANGE)
          ? stored.weightKg
          : null,
      }
    },

    async save(input: BodyMeasurementInput) {
      await mockDelay(latencyMs)
      if (mockFlag('failSave', 'body')) throw new BodySaveError('failed')

      const hasHeight = input.heightCm !== undefined
      const hasWeight = input.weightKg !== undefined
      if (!hasHeight && !hasWeight) throw new BodySaveError('invalid')
      if (hasHeight && !isValidMeasurement(input.heightCm, HEIGHT_RANGE)) {
        throw new BodySaveError('invalid')
      }
      if (hasWeight && !isValidMeasurement(input.weightKg, WEIGHT_RANGE)) {
        throw new BodySaveError('invalid')
      }

      try {
        const current = readStored(userId)
        const currentStatus = statusOf(current)
        // 입력하지 않은 항목은 기존의 유효한 값만 이어받는다(유효하지 않은 값은 버린다).
        // 키·몸무게·갱신 시각 외의 필드(운동 목표 화면이 같은 객체에 넣는 exerciseGoalProfile 등)는 이 저장이 알지 못하는
        // 값이므로 그대로 이어받는다. 객체를 새로 만들면서 빠뜨리면 나이·성별이 사라져 목표 설정을 다시 해야 한다.
        const next: StoredBody = {
          ...current,
          v: 1,
          heightCm: hasHeight
            ? input.heightCm
            : currentStatus.height
              ? current?.heightCm
              : undefined,
          weightKg: hasWeight
            ? input.weightKg
            : currentStatus.weight
              ? current?.weightKg
              : undefined,
          updatedAt: new Date().toISOString(),
        }
        writeMockJson(mockKey('body', userId), next)
        return statusOf(next)
      } catch {
        throw new BodySaveError('failed')
      }
    },
  }
}
