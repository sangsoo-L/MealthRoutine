import type {
  DashboardSlot,
  TodayExerciseItem,
  TodayExerciseView,
} from './exerciseDashboardTypes.ts'
import {
  RECORD_TYPES,
  RECORD_TYPE_LABEL,
  type NormalizedItem,
  type NormalizedSet,
  type RecordType,
} from './workoutDraftTypes.ts'
import type { ListQueryResult } from './workoutRepositories.ts'
import type { LocalDate, WorkoutList, WorkoutListItem } from './workoutTypes.ts'
import { isValidRequestId } from './workoutModel.ts'
import { findUnrunnableItems } from './recordMode.ts'

/**
 * 운동 목록 최종 검토(W11)와 W01 오늘의 운동이 함께 쓰는 순수 함수 모음. 저장소·화면에 의존하지 않는다.
 * 표시용 값(view-model)만 만들며 저장 모델(WorkoutList 등)에는 필드를 더하지 않는다.
 */

/** 저장 모델에 목록 이름이 없어서 모든 목록에 같은 표시 문구를 쓴다. 사용자 입력 이름은 받지 않는다. */
export const TODAY_LIST_NAME = '오늘 할 운동 목록'

interface SetValues {
  reps?: number
  weightKg?: number
  targetSeconds?: number
}

const valuesOf = (set: NormalizedSet): SetValues => set as SetValues

/** 모든 세트의 목표가 같은지. */
function allSame(sets: readonly SetValues[]): boolean {
  return sets.every(
    (set) =>
      set.reps === sets[0].reps &&
      set.weightKg === sets[0].weightKg &&
      set.targetSeconds === sets[0].targetSeconds,
  )
}

/** 목표 시간을 말로 표시한다. 예: 45초, 1분, 1분 30초. */
export function formatTargetSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}초`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`
}

/** 목표 시간을 분:초로 표시한다. 예: 0:45, 1:30. */
export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** 횟수의 범위 문구(기존 횟수형 요약과 같은 표기). 모두 같으면 "30회", 다르면 "30~40회". */
function repsRange(values: readonly number[]): string {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? `${min}회` : `${min}~${max}회`
}

/** 값들의 범위 문구. 모두 같으면 한 값, 다르면 "최소~최대". */
function rangeText(
  values: readonly number[],
  format: (value: number) => string,
): string {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? format(min) : `${format(min)}~${format(max)}`
}

/**
 * 한 운동의 세트 목표를 한 줄로 요약한다(W01 오늘의 운동).
 * 모든 세트가 같으면 "동일 목표 × 세트 수", 다르면 세트 수와 범위로 줄인다.
 */
export function describeSets(
  recordType: RecordType,
  sets: readonly NormalizedSet[],
): string {
  const count = sets.length
  if (count === 0) return '세트 없음'
  const values = sets.map(valuesOf)
  const same = allSame(values)
  if (recordType === 'time_reps') {
    // 시간+횟수형: 목표 시간과 목표 횟수를 함께 보인다.
    const times = values.map((value) => value.targetSeconds ?? 0)
    const reps = values.map((value) => value.reps ?? 0)
    if (same) {
      return `${formatTargetSeconds(times[0])} · ${reps[0]}회 × ${count}세트`
    }
    return `${count}세트 · ${rangeText(times, formatTargetSeconds)} · ${repsRange(reps)}`
  }
  if (recordType === 'weight_time') {
    // 중량+시간형: 목표 시간과 (있으면) 목표 중량.
    const times = values.map((value) => value.targetSeconds ?? 0)
    if (same) {
      const weight = values[0].weightKg
      return `${formatTargetSeconds(times[0])}${weight !== undefined ? ` · ${weight} kg` : ''} × ${count}세트`
    }
    return `${count}세트 · ${rangeText(times, formatTargetSeconds)}`
  }
  if (recordType === 'time') {
    const times = values.map((value) => value.targetSeconds ?? 0)
    if (same) return `${formatTargetSeconds(times[0])} × ${count}세트`
    return `${count}세트 · ${formatTargetSeconds(Math.min(...times))}~${formatTargetSeconds(Math.max(...times))}`
  }
  const reps = values.map((value) => value.reps ?? 0)
  if (same) {
    const weight = values[0].weightKg
    return recordType === 'weight' && weight !== undefined
      ? `${reps[0]}회 · ${weight} kg × ${count}세트`
      : `${reps[0]}회 × ${count}세트`
  }
  const min = Math.min(...reps)
  const max = Math.max(...reps)
  return min === max
    ? `${count}세트 · ${min}회`
    : `${count}세트 · ${min}~${max}회`
}

// ─── W11 슬라이드 ──────────────────────────────────────────

/** 세트 목표 슬라이드 한 장. */
export interface SetSlide {
  key: string
  /** 예: "모든 세트 동일", "2세트" */
  heading: string
  /** 강조하는 목표 수치 */
  main: string
  /** 수치의 단위 */
  unit: string
  /** 중량형의 중량 등 보조 값 */
  extra: string | null
  /** 동일 목표 슬라이드에서 세트 수(× N세트). 세트별 슬라이드면 null */
  repeat: number | null
  /** 보조기기가 읽는 전체 문장 */
  spoken: string
}

function slideOf(
  recordType: RecordType,
  set: SetValues,
  key: string,
  heading: string,
  repeat: number | null,
): SetSlide {
  const times = repeat === null ? '' : `, ${repeat}세트`
  if (recordType === 'time_reps' || recordType === 'weight_time') {
    const seconds = set.targetSeconds ?? 0
    const extra =
      recordType === 'time_reps'
        ? `${set.reps ?? 0}회`
        : set.weightKg !== undefined
          ? `${set.weightKg} kg`
          : '중량 미입력'
    return {
      key,
      heading,
      main: formatClock(seconds),
      unit: '분:초',
      extra,
      repeat,
      spoken: `${heading}, 목표 시간 ${formatTargetSeconds(seconds)}, ${recordType === 'time_reps' ? `목표 ${set.reps ?? 0}회` : extra}${times}`,
    }
  }
  if (recordType === 'time') {
    const seconds = set.targetSeconds ?? 0
    return {
      key,
      heading,
      main: formatClock(seconds),
      unit: '분:초',
      extra: null,
      repeat,
      spoken: `${heading}, 목표 시간 ${formatTargetSeconds(seconds)}${times}`,
    }
  }
  const reps = set.reps ?? 0
  const extra =
    recordType === 'weight'
      ? set.weightKg !== undefined
        ? `${set.weightKg} kg`
        : '중량 미입력'
      : null
  return {
    key,
    heading,
    main: String(reps),
    unit: '회',
    extra,
    repeat,
    spoken: `${heading}, 목표 ${reps}회${extra ? `, ${extra}` : ''}${times}`,
  }
}

/** 한 운동의 슬라이드. 모든 세트가 같으면 한 장으로 "동일 목표 × 세트"를 보여 준다. */
export function buildSetSlides(
  recordType: RecordType,
  sets: readonly NormalizedSet[],
): SetSlide[] {
  const values = sets.map(valuesOf)
  if (values.length === 0) return []
  if (allSame(values)) {
    return [
      slideOf(recordType, values[0], 'same', '모든 세트 동일', values.length),
    ]
  }
  return values.map((value, index) =>
    slideOf(recordType, value, `set-${index}`, `${index + 1}세트`, null),
  )
}

export interface ListSummary {
  exerciseCount: number
  setCount: number
  /** 포함된 기록 방식(시간형·중량형·횟수형 순서) */
  recordTypes: RecordType[]
}

export function summarizeItems(
  items: readonly { recordType: RecordType; sets: readonly unknown[] }[],
): ListSummary {
  return {
    exerciseCount: items.length,
    setCount: items.reduce((sum, item) => sum + item.sets.length, 0),
    recordTypes: RECORD_TYPES.filter((type) =>
      items.some((item) => item.recordType === type),
    ),
  }
}

// ─── 저장 목록 ─────────────────────────────────────────────

/** 정규화된 초안 운동을 저장 모양(WorkoutListItem)으로 바꾼다. 저장소의 buildWorkoutList와 같은 규칙이라 구성 비교에 쓴다. */
export function toListItems(
  items: readonly NormalizedItem[],
): WorkoutListItem[] {
  return items.map((item) => ({
    exerciseId: item.exerciseId,
    exerciseNameSnapshot: item.name,
    recordType: item.recordType,
    sets: item.sets.map((set) => ({ ...set })),
  }))
}

/**
 * 해당 날짜의 목록 중 가장 최근에 저장한 목록(오늘의 목록). 다른 날짜의 목록은 쓰지 않는다.
 * 저장 시각이 같으면 id 순으로 정해 항상 같은 결과를 낸다. 목록을 지우거나 고치지 않는다.
 */
export function selectTodayList(
  lists: readonly WorkoutList[],
  date: LocalDate,
): WorkoutList | null {
  let latest: WorkoutList | null = null
  for (const list of lists) {
    if (list.plannedDate !== date) continue
    if (
      latest === null ||
      list.createdAt > latest.createdAt ||
      (list.createdAt === latest.createdAt && list.id > latest.id)
    ) {
      latest = list
    }
  }
  return latest
}

/** 저장된 목록을 W01 오늘의 운동 표시 값으로 바꾼다. */
export function todayViewFromList(
  list: WorkoutList,
  skippedCount = 0,
): Extract<TodayExerciseView, { phase: 'planned' }> {
  const items: TodayExerciseItem[] = list.items.map((item) => ({
    name: item.exerciseNameSnapshot,
    detail: describeSets(item.recordType, item.sets),
    trailing: RECORD_TYPE_LABEL[item.recordType],
  }))
  const summary = summarizeItems(list.items)
  // 진행(W14)·결과(W15)가 아직 처리하지 못하는 복합 기록 방식이 있으면 운동 시작을 막아야 한다(W01이 시작 버튼을 막는 기준).
  const startBlocked = findUnrunnableItems(list.items).length > 0
  return {
    phase: 'planned',
    listName: TODAY_LIST_NAME,
    exerciseCount: summary.exerciseCount,
    setCount: summary.setCount,
    items,
    listId: list.id,
    plannedDate: list.plannedDate,
    ...(startBlocked ? { startBlocked } : {}),
    ...(skippedCount > 0 ? { skippedCount } : {}),
  }
}

/**
 * 오늘 날짜 목록 조회 결과를 W01 영역 상태로 바꾼다.
 * - 유효한 오늘 목록이 있으면 ready(손상 행이 있으면 개수를 함께 알린다).
 * - 유효한 목록이 없고 손상 행만 있으면 비어 있다고 말하지 않고 error로 둔다(저장값을 지우거나 고치지 않는다).
 * - 아무것도 없으면 empty.
 */
export function todaySlotFromLists(
  result: ListQueryResult<WorkoutList>,
  today: LocalDate,
): DashboardSlot<TodayExerciseView> {
  const latest = selectTodayList(result.items, today)
  if (latest) {
    return {
      status: 'ready',
      data: todayViewFromList(latest, result.skippedCount),
    }
  }
  return result.skippedCount > 0 ? { status: 'error' } : { status: 'empty' }
}

// ─── 저장 요청 ID와 날짜 ───────────────────────────────────

/**
 * 저장 요청 ID(승인된 A' 방식): `w11-<YYYYMMDD>-<초안 updatedAt의 영문·숫자>`.
 * - 같은 날짜·초안 버전은 항상 같은 ID라서 실패·응답 유실·새로고침 뒤 재시도가 목록을 두 번 만들지 않는다.
 * - 초안을 고치면(updatedAt이 바뀜) 새 ID, 날짜가 바뀌어도 새 ID다.
 * - 사용자 식별 정보와 운동 내용은 넣지 않는다. 저장소의 유일 제약은 계정별이다.
 * 형식에 맞는 ID를 만들 수 없으면 null이다.
 */
export function makeSaveRequestId(
  date: LocalDate,
  draftUpdatedAt: string,
): string | null {
  const version = draftUpdatedAt.replace(/[^0-9A-Za-z]/g, '')
  if (version === '') return null
  const id = `w11-${date.replace(/-/g, '')}-${version}`
  return isValidRequestId(id) ? id : null
}

/**
 * 저장에 성공한 뒤 초안을 비워도 되는지. 저장한 초안 버전과 지금 초안 버전이 같을 때만이다(그 사이 초안이 바뀌었다면 비우지 않는다).
 */
export function shouldClearDraft(
  currentUpdatedAt: string,
  savedUpdatedAt: string,
): boolean {
  return currentUpdatedAt === savedUpdatedAt
}

const dateLabelFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

/** 로컬 날짜를 "11월 13일 (금)"처럼 표시한다. 형식이 올바르지 않으면 입력을 그대로 돌려준다. */
export function formatDateLabel(date: LocalDate): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return dateLabelFormat.format(new Date(year, month - 1, day, 12))
}
