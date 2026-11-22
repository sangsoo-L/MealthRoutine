import {
  ACTUAL_FIELDS,
  REQUIRED_ACTUAL_FIELDS,
  isStoredRecordType,
  type ActualField,
  type StoredRecordType,
} from './recordMode.ts'
import { MAX_MEASURED_MS } from './workoutModel.ts'
import { parseReps, parseWeightKg } from './setInput.ts'

/**
 * 신규 완료 세트의 구성값 검증(순수 함수). 세트를 "새로 완료"할 때 그 방식의 모든 구성값이 있는지, 값이 유효한지 확인한다.
 *
 * 이 검증은 저장된 데이터를 읽는 경로(parseWorkoutList·parseWorkoutSession·parseWorkoutRecord)와 분리되어 있고, 그쪽에서 호출하지 않는다.
 * 그래서 과거 기록(중량 미입력 `weight`, 시간 미측정 `time`)은 계속 유효하게 읽힌다. W14 완료 처리·W15 저장에 연결하는 것은 후속 단계다.
 *
 * 정책(A안)
 * - 필수: REQUIRED_ACTUAL_FIELDS의 모든 값. 미입력(null·undefined)이면 완료할 수 없다.
 * - 횟수: 1~999의 정수(0·소수·범위 밖 거부). 중량: 0~999kg, 소수점 첫째 자리까지. 0kg은 명시적으로 입력한 값으로 인정한다.
 *   시간: 1ms 이상 24시간 이하의 정수 ms. 미측정(없음)과 0ms를 모두 거부한다(신규 완료 기록에는 수행 시간 0이 없다).
 *   숫자 한계는 W14 입력 규칙(workoutProgress.parseReps·parseWeightKg)과 저장 모델(MAX_MEASURED_MS)을 그대로 쓴다.
 * - 방식의 구성값이 아닌 실제 값 필드(예: reps 방식의 중량)와 알 수 없는 필드는 거부한다. 기존 저장 모델(validPerformedSet)이
 *   방식별 허용 필드 밖의 키를 거부하는 것과 같은 규칙이다.
 * - 완료하지 않은 세트(completed가 true가 아님)에는 아무것도 강제하지 않는다.
 */

export interface CompletedSetInput {
  completed: boolean
  actualReps?: number | null
  actualWeightKg?: number | null
  measuredMs?: number | null
}

export type CompletedSetIssueReason =
  /** 필수 값이 없다(null·undefined). */
  | 'missing'
  /** 값이 유효하지 않다(숫자가 아님·음수·소수 횟수·범위 초과·자릿수 초과 등). */
  | 'invalid'
  /** 0이다. 횟수 0회·시간 0ms는 신규 완료 값으로 인정하지 않는다(중량 0kg은 해당 없음). */
  | 'zero'
  /** 이 방식의 구성값이 아닌 필드에 값이 있다. */
  | 'unexpected'

export interface CompletedSetIssue {
  /** 문제가 있는 필드. 방식 값이 올바르지 않으면 'recordType'. */
  field: string
  reason: CompletedSetIssueReason
}

export type NewCompletedSetValidation =
  { ok: true } | { ok: false; issues: readonly CompletedSetIssue[] }

const isAbsent = (value: unknown): boolean =>
  value === undefined || value === null

function checkField(
  field: ActualField,
  value: unknown,
): CompletedSetIssueReason | null {
  if (isAbsent(value)) return 'missing'
  if (typeof value !== 'number') return 'invalid'
  switch (field) {
    case 'actualReps':
      if (value === 0) return 'zero'
      return parseReps(value).ok ? null : 'invalid'
    case 'actualWeightKg':
      return parseWeightKg(value).ok ? null : 'invalid'
    case 'measuredMs':
      if (value === 0) return 'zero'
      return Number.isInteger(value) && value > 0 && value <= MAX_MEASURED_MS
        ? null
        : 'invalid'
  }
}

/**
 * 새로 완료하는 세트를 검증한다. recordType은 저장 코드(StoredRecordType)다.
 * 입력을 바꾸지 않고, 문제가 있으면 모두 모아 돌려준다.
 */
export function validateNewCompletedSet(
  recordType: StoredRecordType,
  set: CompletedSetInput,
): NewCompletedSetValidation {
  if (!isStoredRecordType(recordType)) {
    return { ok: false, issues: [{ field: 'recordType', reason: 'invalid' }] }
  }
  if (set.completed !== true) return { ok: true }
  const issues: CompletedSetIssue[] = []
  const required = REQUIRED_ACTUAL_FIELDS[recordType]
  for (const field of required) {
    const reason = checkField(field, set[field])
    if (reason !== null) issues.push({ field, reason })
  }
  for (const [key, value] of Object.entries(set)) {
    if (key === 'completed') continue
    const isActual = (ACTUAL_FIELDS as readonly string[]).includes(key)
    const isRequired = (required as readonly string[]).includes(key)
    if (isRequired) continue
    // 구성값이 아닌 실제 값 필드는 값이 있을 때만, 알 수 없는 키는 값과 무관하게 거부한다.
    if (!isActual || !isAbsent(value)) {
      issues.push({ field: key, reason: 'unexpected' })
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/**
 * 신규 완료 검증의 문제를 사용자에게 보일 안내 문구로 바꾼다(중복 문구는 한 번만). 화면(W14)이 완료하지 못한 이유를 알릴 때 쓴다.
 */
export function describeCompletedSetIssues(
  issues: readonly CompletedSetIssue[],
): string {
  const lines: string[] = []
  const add = (text: string) => {
    if (!lines.includes(text)) lines.push(text)
  }
  for (const issue of issues) {
    if (issue.field === 'measuredMs') {
      add(
        issue.reason === 'zero'
          ? '측정한 시간이 0초예요. 타이머로 시간을 측정한 뒤 완료해 주세요.'
          : issue.reason === 'missing'
            ? '수행 시간을 측정해 주세요. 타이머를 시작한 뒤 세트를 완료할 수 있어요.'
            : '측정한 시간을 확인해 주세요.',
      )
    } else if (issue.field === 'actualWeightKg') {
      add(
        issue.reason === 'missing'
          ? '실제 중량을 입력해 주세요. 0kg도 입력할 수 있어요.'
          : '실제 중량을 확인해 주세요.',
      )
    } else if (issue.field === 'actualReps') {
      add(
        issue.reason === 'missing' || issue.reason === 'zero'
          ? '실제 횟수를 입력해 주세요.'
          : '실제 횟수를 확인해 주세요.',
      )
    } else {
      add('이 기록 방식에 없는 값이 있어요. 입력을 확인해 주세요.')
    }
  }
  return lines.join(' ')
}
