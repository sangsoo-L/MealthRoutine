import {
  hasMissingBodyInfo,
  type BodyMeasurementState,
} from '../../body-measurements/bodyTypes.ts'
import type { WeightCheckState } from '../../weight-log/useWeightCheck.ts'
import { parseIsoDate } from '../../weight-log/weightDate.ts'

/**
 * 마이페이지 "몸무게 기록" 섹션이 보여 줄 상태(순수 함수). 신체 정보와 몸무게 기록 상태, 재시도 진행 여부만 입력으로 받는다.
 *
 * - unavailable: 몸무게 기록 저장소가 없다(운영 빌드·API 연결 전). 기능을 쓸 수 없는 상태이고 실패가 아니다.
 * - hidden: 신체 정보를 조회하지 못해(실패·연결 전) 무엇을 안내할지 알 수 없다. 섹션을 그리지 않는다.
 *   실제 모드(`protected`, F5-D1)도 여기다: 등록 여부를 모르고 몸무게 기록은 서버에 연결되지 않았다(모의 기록으로 들어가지 않게).
 * - loading / retrying: 불러오는 중 / 사용자가 "다시 확인"으로 요청한 조회가 진행 중(안내를 유지하고 버튼을 막는다).
 * - body-missing: 키 또는 몸무게가 미등록이다. 위 신체 정보 섹션의 기존 입력 기능으로 안내한다(여기서 등록하지 않는다).
 * - error: 몸무게 기록 상태 조회 실패(재시도).
 * - future: 마지막 기록일이 오늘(서울)보다 늦다. 기록을 남길 수 없으므로 안내만 한다.
 * - start: 이력이 없다. 기존 몸무게가 있어도 이력을 자동으로 만들지 않고, 사용자가 직접 입력해 첫 기록을 시작한다.
 * - mismatch: 등록된 몸무게와 마지막 기록이 어긋났다. 이전 기록을 복사하지 않고 직접 입력하게 한다.
 * - record: 이력이 있고 정상이다. "지난번과 같아요"를 쓸 수 있다.
 * 수치는 다루지 않는다.
 */
export type WeightLogEntryView =
  | { kind: 'hidden' }
  | { kind: 'unavailable' }
  | { kind: 'loading' }
  | { kind: 'retrying' }
  | { kind: 'body-missing' }
  | { kind: 'error' }
  | { kind: 'future'; lastRecordedOn: string }
  | { kind: 'start' }
  | {
      kind: 'mismatch'
      lastRecordedOn: string | null
      nextDueOn: string | null
    }
  | { kind: 'record'; lastRecordedOn: string | null; nextDueOn: string | null }

export function selectWeightLogEntry(args: {
  body: BodyMeasurementState
  weight: WeightCheckState
  retrying: boolean
}): WeightLogEntryView {
  const { body, weight, retrying } = args
  // 실제 모드(protected)는 몸무게 기록 상태와 상관없이 섹션을 그리지 않는다(F5-C3). 운영 빌드는 몸무게 기록 저장소가 없어
  // weight가 unavailable이므로, 이 확인이 그보다 먼저여야 "연결 전" 섹션이 남지 않는다.
  if (body.status === 'protected') return { kind: 'hidden' }
  if (weight.status === 'unavailable') return { kind: 'unavailable' }
  if (body.status === 'error' || body.status === 'unavailable')
    return { kind: 'hidden' }
  if (body.status === 'loading') return { kind: 'loading' }
  if (hasMissingBodyInfo(body)) return { kind: 'body-missing' }
  if (weight.status === 'loading')
    return { kind: retrying ? 'retrying' : 'loading' }
  if (weight.status === 'error') return { kind: 'error' }
  const s = weight.value
  if (s.reason === 'future-date')
    return { kind: 'future', lastRecordedOn: s.lastRecordedOn ?? s.today }
  if (s.reason === 'no-history') return { kind: 'start' }
  const dates = { lastRecordedOn: s.lastRecordedOn, nextDueOn: s.nextDueOn }
  return s.consistent
    ? { kind: 'record', ...dates }
    : { kind: 'mismatch', ...dates }
}

/** 'YYYY-MM-DD'를 "11월 13일"로(올해가 아니면 연도 포함). 형식이 잘못되면 null. today는 같은 형식의 서울 기준 오늘이다. */
export function weightDateLabel(date: string, today: string): string | null {
  const d = parseIsoDate(date)
  if (!d) return null
  const t = parseIsoDate(today)
  const prefix = t && t.year === d.year ? '' : `${d.year}년 `
  return `${prefix}${d.month}월 ${d.day}일`
}
