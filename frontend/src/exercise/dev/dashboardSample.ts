import type { ExerciseDashboardSlots } from '../exerciseDashboardTypes.ts'
import {
  dashboardWeek,
  selectRecentRecords,
  selectWeeklyExercise,
} from '../dashboardSelectors.ts'
import { toLocalDate } from '../workoutModel.ts'
import {
  DEV_CATALOG_VERSION,
  WORKOUT_SCHEMA_VERSION,
  type WorkoutRecord,
} from '../workoutTypes.ts'

/**
 * [개발 전용] 운동 대시보드(W01)의 상태별 화면 확인용 예시. 개발 서버에서만 불러온다(exerciseDashboardSource.ts가 import.meta.env.DEV로 동적 import).
 * 운영 빌드에는 포함되지 않는다. 실제 운동 기록이 아니며 어디에도 저장하지 않고 저장소를 호출하지도 않는다. 주소에 `?sample=<이름>`을 붙였을 때만 쓴다.
 *
 * 이름: loading·error·empty·before·after·filled·multiple·boundary·partial-error·partial-unavailable·corrupt·corrupt-only·long.
 * 운동 이름과 수치는 화면 확인용 가짜 값이며 운동 마스터 Mock과 관계가 없다.
 */

export const SAMPLE_NOTICE =
  '개발용 예시 화면이에요. 실제 운동 기록이 아니며 저장되지 않아요.'

const UNAVAILABLE_TAIL = {
  weekly: { status: 'unavailable' },
  recent: { status: 'unavailable' },
  statistics: { status: 'unavailable' },
  next: { status: 'unavailable' },
} as const

const SAMPLES: Record<string, ExerciseDashboardSlots> = {
  loading: {
    weekly: { status: 'loading' },
    recent: { status: 'loading' },
    goal: { status: 'loading' },
    today: { status: 'loading' },
    routines: { status: 'loading' },
    statistics: { status: 'loading' },
    next: { status: 'loading' },
  },
  error: {
    weekly: { status: 'error' },
    recent: { status: 'error' },
    goal: { status: 'error' },
    today: { status: 'error' },
    routines: { status: 'error' },
    statistics: { status: 'error' },
    next: { status: 'error' },
  },
  empty: {
    goal: { status: 'empty' },
    today: { status: 'empty' },
    routines: { status: 'empty' },
    ...UNAVAILABLE_TAIL,
  },
  before: {
    goal: { status: 'empty' },
    today: {
      status: 'ready',
      data: {
        phase: 'planned',
        listName: '가볍게 시작하는 전신 운동',
        exerciseCount: 2,
        setCount: 3,
        items: [
          {
            name: '덤벨 스쿼트',
            detail: '10회 · 8 kg × 2세트',
            trailing: '중량형',
          },
          { name: '월 푸시업', detail: '15회 × 1세트', trailing: '횟수형' },
        ],
      },
    },
    routines: { status: 'ready', data: { count: 2 } },
    ...UNAVAILABLE_TAIL,
  },
  after: {
    goal: {
      status: 'ready',
      data: { summary: '주 3회 · 1회 30분의 시작 계획' },
    },
    today: {
      status: 'ready',
      data: {
        phase: 'completed',
        exerciseCount: 2,
        setCount: 3,
        durationLabel: null,
        items: [
          {
            name: '덤벨 스쿼트',
            detail: '20회 수행 · 8 kg',
            trailing: '2세트 ✓',
          },
          { name: '월 푸시업', detail: '15회 수행', trailing: '1세트 ✓' },
        ],
      },
    },
    routines: { status: 'ready', data: { count: 2 } },
    ...UNAVAILABLE_TAIL,
  },
}

function offsetDate(date: string, offset: number): string {
  const day = new Date(`${date}T12:00:00`)
  day.setDate(day.getDate() + offset)
  return toLocalDate(day)
}

/** 표시 검증용 완료 기록. 저장소를 열거나 실제 기록을 생성하지 않는다. */
function sampleRecord(
  id: string,
  date: string,
  measuredMs: number | null = null,
): WorkoutRecord {
  const startedAt = new Date(`${date}T18:00:00`).toISOString()
  const completedAt = new Date(`${date}T18:15:00`).toISOString()
  return {
    id,
    ownerId: 'dashboard-sample',
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    sessionId: `session-${id}`,
    sourceListId: `list-${id}`,
    plannedDate: date,
    performedDate: date,
    startedAt,
    completedAt,
    createdAt: completedAt,
    catalogVersion: DEV_CATALOG_VERSION,
    exercises: [
      {
        exerciseId: 'sample-squat',
        exerciseNameSnapshot: '덤벨 스쿼트',
        recordType: 'weight',
        plannedSetCount: 2,
        completedSets: [1, 2].map((setNumber) => ({
          setNumber,
          target: { reps: 10, weightKg: 8 },
          actualReps: 10,
          actualWeightKg: 8,
          measuredMs: null,
        })),
      },
      measuredMs === null
        ? {
            exerciseId: 'sample-pushup',
            exerciseNameSnapshot: '월 푸시업',
            recordType: 'reps',
            plannedSetCount: 1,
            completedSets: [
              {
                setNumber: 1,
                target: { reps: 15 },
                actualReps: 15,
                measuredMs: null,
              },
            ],
          }
        : {
            exerciseId: 'sample-plank',
            exerciseNameSnapshot: '플랭크',
            recordType: 'time',
            plannedSetCount: 1,
            completedSets: [
              { setNumber: 1, target: { targetSeconds: 60 }, measuredMs },
            ],
          },
    ],
    totals: {
      exerciseCount: 2,
      completedSetCount: 3,
      plannedSetCount: 3,
      measuredMs,
    },
  }
}

export function getSample(
  name: string,
  today: string,
): ExerciseDashboardSlots | null {
  const knownNames = [
    'loading',
    'error',
    'empty',
    'before',
    'after',
    'filled',
    'multiple',
    'boundary',
    'partial-error',
    'partial-unavailable',
    'corrupt',
    'corrupt-only',
    'long',
  ]
  if (!knownNames.includes(name)) return null
  if (name === 'loading' || name === 'error') return SAMPLES[name]
  const base =
    SAMPLES[name === 'empty' ? 'empty' : name === 'before' ? 'before' : 'after']
  let records =
    name === 'empty' || name === 'corrupt-only'
      ? []
      : [
          sampleRecord('sample-current', today),
          sampleRecord('sample-previous', offsetDate(today, -2), 76_000),
          sampleRecord('sample-older', offsetDate(today, -4)),
        ]
  if (name === 'before')
    records = records.filter((record) => record.performedDate < today)
  if (name === 'multiple')
    records = [0, 1, 2].map((index) => {
      const record = sampleRecord(`sample-same-day-${index}`, today)
      return {
        ...record,
        completedAt: new Date(
          Date.parse(record.completedAt) + index * 3_600_000,
        ).toISOString(),
      }
    })
  if (name === 'boundary') {
    const monday = dashboardWeek(today).from
    const sunday = sampleRecord('sample-sunday', offsetDate(monday, -1))
    const completedAt = new Date(`${monday}T00:20:00`).toISOString()
    records = [
      {
        ...sunday,
        startedAt: new Date(`${sunday.performedDate}T23:50:00`).toISOString(),
        completedAt,
        createdAt: completedAt,
      },
      sampleRecord('sample-monday', monday),
    ]
  }
  if (name === 'long')
    records = records.map((record) => ({
      ...record,
      exercises: record.exercises.map((exercise) => ({
        ...exercise,
        exerciseNameSnapshot:
          '아주 긴 운동 이름과 세부 수행 방식이 함께 저장된 덤벨 스쿼트 동작 확인용 예시',
      })),
    }))
  const skipped = name === 'corrupt' || name === 'corrupt-only' ? 2 : 0
  return {
    ...base,
    ...(name === 'corrupt-only'
      ? { today: { status: 'unavailable' as const } }
      : {}),
    weekly: {
      status: 'ready',
      data: selectWeeklyExercise(records, today, skipped),
    },
    recent:
      name === 'partial-error'
        ? { status: 'error' }
        : name === 'partial-unavailable'
          ? { status: 'unavailable' }
          : { status: 'ready', data: selectRecentRecords(records, 3, skipped) },
  }
}
