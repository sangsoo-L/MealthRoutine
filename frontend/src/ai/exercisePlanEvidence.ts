import type { Exercise } from '../exercise/exerciseTypes.ts'

/**
 * I02-1 로컬 예시 추천의 운동량 근거(순수 함수). 근거는 시드 루틴 항목의 target_sets·target_reps·target_duration_seconds·rest_seconds뿐이다.
 *
 * 규칙(사용자 확정):
 * - 근거는 **운동의 난이도와 같은 난이도의 루틴** 항목에서만 가져온다. 다른 난이도 루틴의 값은 빌리지 않는다(초급 운동이 중급 루틴에만 있으면 근거 없음).
 * - 같은 난이도 루틴 항목이 여러 개면 모두 같은 값(세트·횟수·시간·휴식)일 때만 근거로 쓴다. 값이 서로 다르면 충돌이라 근거로 쓰지 않는다.
 * - 운동의 기본 기록 방식에 필요한 값이 있어야 한다: 횟수형(reps·weight_reps)은 횟수, 시간형(time)은 시간. 복합 방식(time_reps·weight_time)은 두 값이 필요한데
 *   시드가 한쪽만 주므로 근거로 쓰지 않는다.
 * - 중량은 근거가 없으므로 어디서도 만들지 않는다.
 * 근거가 없거나 충돌하는 운동은 추천 "후보"로만 보이고 등록 가능한 플랜에는 들어가지 않는다.
 */

export type PlanLevel = '초급' | '중급' | '고급'

/** 시드 루틴 항목에서 읽은 한 건의 관찰값. */
export interface LevelObservation {
  sets: number
  reps: number | null
  seconds: number | null
  restSeconds: number | null
}

/** 운동 id → 루틴 난이도 → 그 난이도 루틴에서 관찰한 값들. */
export type LevelEvidence = ReadonlyMap<
  string,
  ReadonlyMap<string, readonly LevelObservation[]>
>

/** 근거 수집에 필요한 카탈로그의 최소 모양(시드 카탈로그가 만족한다). */
export interface LevelEvidenceSource {
  getAllRoutines(): readonly { id: string; difficulty: string }[]
  getRoutineItems(routineId: string):
    | readonly {
        exerciseId: string
        targetSets: number
        targetReps: number | null
        targetDurationSeconds: number | null
        restSeconds: number | null
      }[]
    | null
}

/** 모든 루틴의 항목에서 운동별·루틴 난이도별 관찰값을 모은다. 읽기만 하고 시드를 바꾸지 않는다. */
export function collectLevelEvidence(
  source: LevelEvidenceSource,
): LevelEvidence {
  const evidence = new Map<string, Map<string, LevelObservation[]>>()
  for (const routine of source.getAllRoutines()) {
    for (const item of source.getRoutineItems(routine.id) ?? []) {
      const byLevel =
        evidence.get(item.exerciseId) ?? new Map<string, LevelObservation[]>()
      const list = byLevel.get(routine.difficulty) ?? []
      list.push({
        sets: item.targetSets,
        reps: item.targetReps,
        seconds: item.targetDurationSeconds,
        restSeconds: item.restSeconds,
      })
      byLevel.set(routine.difficulty, list)
      evidence.set(item.exerciseId, byLevel)
    }
  }
  return evidence
}

/** 등록 가능한 플랜에 쓸 수 있는 근거(세트·횟수 또는 시간·휴식). 값은 시드 그대로다. */
export interface UsableEvidence {
  sets: number
  /** 횟수형(reps·weight_reps)일 때 세트당 횟수 */
  reps: number | null
  /** 시간형(time)일 때 세트당 목표 시간(초) */
  seconds: number | null
  restSeconds: number
}

/** 근거를 쓸 수 없는 이유. */
export type EvidenceIssue =
  /** 같은 난이도 루틴에 이 운동이 없다(다른 난이도 루틴에만 있는 경우 포함) */
  | 'noEvidence'
  /** 같은 난이도 루틴 항목의 값이 서로 다르다 */
  | 'conflict'
  /** 값이 비어 있거나 운동의 기록 방식(복합 방식 포함)에 필요한 값을 주지 못한다 */
  | 'unsupported'

export type EvidenceResult =
  { ok: true; evidence: UsableEvidence } | { ok: false; issue: EvidenceIssue }

type EvidenceExercise = Pick<Exercise, 'id' | 'difficulty' | 'recordModes'>

function sameObservation(a: LevelObservation, b: LevelObservation): boolean {
  return (
    a.sets === b.sets &&
    a.reps === b.reps &&
    a.seconds === b.seconds &&
    a.restSeconds === b.restSeconds
  )
}

const isPositiveInt = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 1

/**
 * 한 운동의 근거 판정. 운동의 난이도와 같은 난이도 루틴의 관찰값만 본다.
 * 확인 순서: 같은 난이도 관찰값 있음 → 값이 모두 같음 → 값이 완전하고 운동의 기록 방식과 맞음.
 */
export function evidenceFor(
  exercise: EvidenceExercise,
  evidence: LevelEvidence,
): EvidenceResult {
  const observations = evidence.get(exercise.id)?.get(exercise.difficulty) ?? []
  if (observations.length === 0) return { ok: false, issue: 'noEvidence' }
  const first = observations[0]
  if (!observations.every((obs) => sameObservation(obs, first))) {
    return { ok: false, issue: 'conflict' }
  }
  const mode = exercise.recordModes?.default
  const restOk =
    first.restSeconds !== null &&
    Number.isInteger(first.restSeconds) &&
    first.restSeconds >= 0
  if (!isPositiveInt(first.sets) || !restOk) {
    return { ok: false, issue: 'unsupported' }
  }
  const restSeconds = first.restSeconds as number
  if (mode === 'reps' || mode === 'weight_reps') {
    return isPositiveInt(first.reps) && first.seconds === null
      ? {
          ok: true,
          evidence: {
            sets: first.sets,
            reps: first.reps,
            seconds: null,
            restSeconds,
          },
        }
      : { ok: false, issue: 'unsupported' }
  }
  if (mode === 'time') {
    return isPositiveInt(first.seconds) && first.reps === null
      ? {
          ok: true,
          evidence: {
            sets: first.sets,
            reps: null,
            seconds: first.seconds,
            restSeconds,
          },
        }
      : { ok: false, issue: 'unsupported' }
  }
  return { ok: false, issue: 'unsupported' }
}

export const EVIDENCE_ISSUE_TEXT: Record<EvidenceIssue, string> = {
  noEvidence: '같은 난이도의 운동량 기준이 없어요',
  conflict: '운동량 기준이 서로 달라 정할 수 없어요',
  unsupported: '이 기록 방식의 운동량 기준이 없어요',
}
