import type {
  WeightCheckStatus,
  WeightLogInput,
  WeightLogRepository,
} from '../weight-log/weightLogTypes.ts'
import {
  weightCycleKey,
  type WeightNotificationService,
} from './weightNotificationService.ts'

/**
 * 알림 완료 처리의 결과.
 * - resolved: 그 확인 주기의 알림을 처리 완료로 표시했다.
 * - none: 처리할 알림이 없다(이번 주기의 알림이 아직 없었거나, 첫 기록이거나, 알림 저장소가 없다). 실패가 아니다.
 * - failed: 알림 완료 처리만 실패했다. 몸무게 기록은 이미 성공해 저장돼 있다. key로 완료 처리만 다시 시도할 수 있다.
 */
export type NotificationCompletion =
  { state: 'resolved' } | { state: 'none' } | { state: 'failed'; key: string }

export interface RecordOutcome {
  /** 기록 직후의 확인 상태(수치 없음). */
  status: WeightCheckStatus
  /** 알림 완료 처리의 진행. 기록 저장과 분리돼 있어 기다리지 않고 화면을 먼저 갱신할 수 있다. 절대 reject하지 않는다. */
  completion: Promise<NotificationCompletion>
}

/**
 * 몸무게를 기록하고, 성공하면 그 기록이 끝낸 확인 주기의 알림을 처리 완료로 표시한다.
 *
 * - 기록(logWeight)이 실패하면(partialSave 포함) 예외를 그대로 던지고 알림은 건드리지 않는다.
 * - 기록이 성공한 뒤에는 알림 처리의 결과와 상관없이 기록은 성공이다. 알림 완료 처리가 실패해도 기록을 다시 실행하지 않으며,
 *   completion이 failed(key)를 알려 주면 호출한 쪽이 service.resolveByKey(key)로 완료 처리만 다시 시도한다.
 * - previous는 기록 직전의 확인 상태다. 첫 기록(이력 없음)이거나 주기를 모르면 처리할 알림이 없다.
 * - 읽음(readAt)과 다른 알림은 바꾸지 않는다. 몸무게 수치를 알림 쪽에 넘기지 않는다.
 */
export async function recordWeightAndComplete(args: {
  weight: WeightLogRepository
  service: WeightNotificationService | null
  previous: WeightCheckStatus | null
  input: WeightLogInput
}): Promise<RecordOutcome> {
  const { weight, service, previous, input } = args
  const status = await weight.logWeight(input)
  const key = previous ? weightCycleKey(previous) : null
  if (!service || !key) {
    return { status, completion: Promise.resolve({ state: 'none' }) }
  }
  const completion = service.resolveByKey(key).then(
    (outcome): NotificationCompletion => ({ state: outcome }),
    (): NotificationCompletion => ({ state: 'failed', key }),
  )
  return { status, completion }
}
