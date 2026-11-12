import { Link } from 'react-router'
import {
  MY_DESTINATIONS,
  type MyDestination,
} from '../../mypage/destinations.ts'
import type {
  OptionalSlot,
  WeeklyActivityData,
} from '../../mypage/mypageTypes.ts'
import Icon from '../icons/Icon.tsx'
import type { IconName } from '../icons/iconTypes.ts'
import Metric from './Metric.tsx'
import { focusRing, sectionTitleClass } from './myStyles.ts'

interface WeeklyActivityProps {
  weekly: OptionalSlot<WeeklyActivityData>
}

type TileTone = 'exercise' | 'meal' | 'brand'

/** 도메인 색은 타일 면과 항목 이름에만 쓴다. 이름과 아이콘이 함께 있어 색만으로 구분하지 않는다. */
const TONE_CLASS: Record<TileTone, string> = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
  brand: 'bg-brand-soft text-brand',
}

interface ActivityTileProps {
  tone: TileTone
  icon: IconName
  label: string
  unit: string
  value: number
  destination: MyDestination
}

/**
 * 활동 수치 타일(값이 있을 때만 그린다). 목적지 경로가 있으면 타일 전체가 링크이고, 없으면 눌리지 않는 정보 타일이다.
 */
function ActivityTile({
  tone,
  icon,
  label,
  unit,
  value,
  destination,
}: ActivityTileProps) {
  const body = (
    <>
      <span className="flex items-center gap-1 text-support leading-snug font-semibold">
        <Icon name={icon} size={18} />
        {label}
      </span>
      <Metric value={value} unit={unit} missingLabel="" />
    </>
  )
  const base = `flex min-h-20 flex-col justify-between gap-2 rounded-card p-3 ${TONE_CLASS[tone]}`

  return destination.to === null ? (
    <div className={base}>{body}</div>
  ) : (
    <Link
      to={destination.to}
      className={`${base} transition-colors hover:brightness-95 motion-reduce:transition-none ${focusRing}`}
    >
      {body}
    </Link>
  )
}

/** 값이 없는 세 가지 상태의 문구. 서로 다른 상태를 같은 문구로 뭉뚱그리지 않는다. */
const EMPTY_TEXT = {
  /** API가 연결되지 않아 알 수 없다 */
  unavailable: '아직 연결된 활동 기록이 없어요.',
  /** 연결됐고 이번 주 기록이 0건이다 */
  empty: '이번 주 활동 기록이 아직 없어요.',
  /** 불러오는 중 문제가 생겼다 */
  error: '활동 기록을 불러오지 못했어요.',
} as const

/**
 * P01 섹션 5. 이번 주 활동: 운동 횟수, 식단 끼수, 주간 점수.
 *
 * - 값이 있으면 간결한 3열 타일(운동 인디고 · 식단 앰버 · 주간 점수 브랜드 블루)이다. 폭이 모자라면(작은 화면·글자 확대) 2열, 1열로 줄어
 *   수치와 단위가 잘리지 않는다.
 * - 값이 없으면 큰 타일 세 개를 반복하지 않고 한 줄 빈 상태만 보인다. 연결 전(unavailable)·기록 0건(empty)·불러오기 실패(error)는
 *   문구가 서로 다르다. 기록이나 점수를 임의로 만들지 않는다.
 * - 제목은 "이번 주 활동"만 둔다. 주차·날짜 범위는 백엔드 주간 리포트 기준이 정해진 뒤에 붙인다.
 * - 이동(W10·D03·I05)은 화면이 없어 타일은 정보만 보여 준다(경로가 채워지면 타일이 링크가 된다).
 */
export default function WeeklyActivity({ weekly }: WeeklyActivityProps) {
  return (
    <section aria-labelledby="my-week-title">
      <h2 id="my-week-title" className={sectionTitleClass}>
        이번 주 활동
      </h2>
      {weekly.state === 'ready' ? (
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(max(5.5rem,calc((100%-16px)/3)),1fr))] gap-2">
          <ActivityTile
            tone="exercise"
            icon="dumbbell"
            label="운동"
            unit="회"
            value={weekly.data.exerciseCount}
            destination={MY_DESTINATIONS.weeklyExercise}
          />
          <ActivityTile
            tone="meal"
            icon="utensils"
            label="식단"
            unit="끼"
            value={weekly.data.mealCount}
            destination={MY_DESTINATIONS.weeklyMeal}
          />
          <ActivityTile
            tone="brand"
            icon="chart"
            label="주간 점수"
            unit="점"
            value={weekly.data.score}
            destination={MY_DESTINATIONS.weeklyScore}
          />
        </div>
      ) : (
        <p
          role={weekly.state === 'error' ? 'alert' : undefined}
          className="mt-2.5 rounded-card bg-surface px-4 py-3 text-body leading-snug font-normal text-muted"
        >
          {EMPTY_TEXT[weekly.state]}
        </p>
      )}
    </section>
  )
}
