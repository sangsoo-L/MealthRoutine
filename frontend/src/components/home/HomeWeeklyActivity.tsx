import { Link } from 'react-router'
import {
  buildWeeklyActivity,
  type DayMark,
  type DomainActivity,
  type DomainWeek,
  type Fact,
  type WeekDayView,
} from '../../home-activity/homeActivity.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import Icon from '../icons/Icon.tsx'
import {
  DOMAIN_TONE,
  focusRing,
  homeCard,
  homeCardTitle,
} from './homeStyles.ts'

/** 이번 주 활동에서 주간 리포트(I05)로 가는 경로. 라우터의 `ai/weekly-report`와 같다. */
const WEEKLY_REPORT_PATH = '/ai/weekly-report'

const WEEKDAY_FULL: Record<string, string> = {
  월: '월요일',
  화: '화요일',
  수: '수요일',
  목: '목요일',
  금: '금요일',
  토: '토요일',
  일: '일요일',
}

type Domain = 'exercise' | 'meal'

const MARK_TEXT: Record<DayMark, string> = {
  recorded: '기록 있음',
  none: '기록 없음',
  future: '',
  unknown: '확인할 수 없음',
}

/** 날짜별 보조기기 설명. 예: "11월 18일 수요일, 오늘, 운동 기록 있음, 식단 기록 없음" */
function dayDescription(day: WeekDayView): string {
  const [, month, dayOfMonth] = day.date.split('-').map(Number)
  const head = `${month}월 ${dayOfMonth}일 ${WEEKDAY_FULL[day.weekday] ?? day.weekday}${day.isToday ? ', 오늘' : ''}`
  if (day.exercise === 'future' && day.meal === 'future')
    return `${head}, 아직 오지 않은 날`
  return `${head}, 운동 ${MARK_TEXT[day.exercise]}, 식단 ${MARK_TEXT[day.meal]}`
}

const DOT = 'block size-3 shrink-0 rounded-full'

/**
 * 하루의 한 영역을 나타내는 작은 원(장식이다. 보조기기에는 날짜별 설명이 대신 전달된다).
 * 기록 있음: 영역 색으로 채움 · 기록 없음: 연한 테두리의 빈 원 · 확인 불가: 점선 테두리의 빈 원(기록 없음과 구분)
 * · 아직 오지 않은 날: 원 대신 옅은 대시(기록을 빠뜨린 것처럼 보이지 않게 한다).
 */
function Dot({ domain, mark }: { domain: Domain; mark: DayMark }) {
  if (mark === 'future')
    return (
      <span
        aria-hidden="true"
        className="flex size-3 shrink-0 items-center justify-center"
      >
        <span className="block h-px w-2 bg-line" />
      </span>
    )
  if (mark === 'recorded')
    return (
      <span
        aria-hidden="true"
        className={`${DOT} ${domain === 'exercise' ? 'bg-exercise' : 'bg-meal'}`}
      />
    )
  if (mark === 'unknown')
    return (
      <span
        aria-hidden="true"
        className={`${DOT} border border-dashed border-muted bg-page`}
      />
    )
  return (
    <span
      aria-hidden="true"
      className={`${DOT} border border-muted/40 bg-surface`}
    />
  )
}

function StatTile({
  domain,
  label,
  emoji,
  week,
  onRetry,
}: {
  domain: Domain
  label: string
  emoji: string
  week: DomainWeek
  onRetry: () => void
}) {
  const tone = DOMAIN_TONE[domain]
  return (
    // 읽는 중·실패·연결 전에도 같은 최소 높이를 지켜 카드 크기가 크게 변하지 않는다.
    <div
      className={`flex min-h-24 flex-col justify-between gap-2 rounded-card px-[16px] py-3 ${tone.tile}`}
    >
      <dt className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded-control bg-surface text-body"
        >
          {emoji}
        </span>
        <span
          className={`text-support leading-snug font-semibold whitespace-nowrap ${tone.label}`}
        >
          {label}
        </span>
      </dt>
      <dd>
        {week.status === 'ready' ? (
          <span className="text-metric leading-none font-semibold text-content">
            {week.recordedDays}
            <span className="ml-0.5 text-support font-normal text-muted">
              일
            </span>
          </span>
        ) : week.status === 'loading' ? (
          <>
            <span
              aria-hidden="true"
              className="block h-7 w-14 animate-pulse rounded-control bg-surface motion-reduce:animate-none"
            />
            <span className="sr-only">불러오는 중</span>
          </>
        ) : week.status === 'unavailable' ? (
          <span className="text-support leading-snug font-normal text-muted">
            기록 기능 연결 전이에요
          </span>
        ) : (
          <span className="flex flex-col items-start gap-1">
            <span className="text-support leading-snug font-normal text-muted">
              기록을 확인하지 못했어요
            </span>
            <button
              type="button"
              onClick={onRetry}
              className={`min-h-11 cursor-pointer rounded-control text-support font-semibold text-brand ${focusRing}`}
            >
              다시 확인
            </button>
          </span>
        )}
      </dd>
    </div>
  )
}

/**
 * 로그인 홈(H01)의 "이번 주 나의 활동". 홈에서 가장 중요한 카드로 맨 위(필수 안내 카드 다음)에 둔다.
 *
 * 구성: 제목·주간 날짜 범위 → 운동·식단 기록일 요약 카드 2개 → "이번 주 기록" 7일 활동 트래커(범례 포함) → 구분선 아래 주간 리포트 링크.
 * - 수치는 "기록이 있는 날짜 수"다(같은 날 여러 건도 1일). 집계 기준은 homeActivity.ts에 있고 이 컴포넌트는 표시만 바꾼다.
 * - 운동과 식단은 독립이다. 한쪽만 읽어도 그쪽 수치는 보이고 다른 쪽은 읽는 중·연결 전·확인 실패로 따로 표시한다.
 *   읽지 못한 영역은 0일이 아니다. 읽는 중에는 같은 크기의 자리 표시가 보인다.
 * - 트래커는 날짜마다 요일·날짜·원 두 개(왼쪽 운동, 오른쪽 식단)를 둔다. 기록 있음은 영역 색으로 채우고, 없다고 확인되면 빈 원,
 *   확인 불가는 점선 원, 아직 오지 않은 날은 원 대신 옅은 대시다. 오늘만 연한 블루 배경과 블루 글자로 은은하게 강조한다.
 *   색만으로 전하지 않도록 범례에 "운동"·"식단" 글자를 두고, 날짜별 상태는 보조기기용 글로 전달한다(원은 장식).
 * - 좁은 화면에서는 날짜 숫자를 감추고, 극히 좁으면(카드 안쪽 폭 8rem 미만) 7열 대신 4열×2행으로 재배치한다(컨테이너 쿼리).
 * - 아래 링크는 주간 리포트(I05)로 간다. 이 요약과 I05의 집계 기준은 같지 않을 수 있어 같은 수치라고 안내하지 않는다.
 *   "이전"이 홈으로 돌아오도록 진입 경로(state.from)를 알린다.
 */
export default function HomeWeeklyActivity({
  today,
  exercise,
  meal,
  onRetryExercise,
  onRetryMeal,
}: {
  today: LocalDate
  exercise: Fact<DomainActivity>
  meal: Fact<DomainActivity>
  onRetryExercise: () => void
  onRetryMeal: () => void
}) {
  const view = buildWeeklyActivity(today, exercise, meal)
  return (
    <section
      aria-labelledby="home-week-title"
      data-home-weekly=""
      className={homeCard}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="home-week-title" className={homeCardTitle}>
          이번 주 나의 활동
        </h2>
        {view ? (
          <p className="text-support leading-snug font-normal text-muted">
            {view.rangeLabel}
          </p>
        ) : null}
      </div>
      {view ? (
        <>
          <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(8rem,100%),1fr))] gap-3">
            <StatTile
              domain="exercise"
              label="운동 기록일"
              emoji="💪"
              week={view.exercise}
              onRetry={onRetryExercise}
            />
            <StatTile
              domain="meal"
              label="식단 기록일"
              emoji="🍽️"
              week={view.meal}
              onRetry={onRetryMeal}
            />
          </dl>
          <div className="@container mt-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h3 className="text-support leading-snug font-semibold text-content">
                이번 주 기록
              </h3>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-support leading-snug font-normal text-muted">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden="true" className={`${DOT} bg-exercise`} />
                  운동
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span aria-hidden="true" className={`${DOT} bg-meal`} />
                  식단
                </span>
              </p>
            </div>
            <ol
              aria-label="이번 주 요일별 기록"
              className="mt-3 grid grid-cols-7 gap-1 @max-[8rem]:grid-cols-4 @max-[8rem]:gap-y-2"
            >
              {view.days.map((day) => {
                const future = day.exercise === 'future'
                const weekdayTone = day.isToday
                  ? 'font-semibold text-brand'
                  : future
                    ? 'font-normal text-muted/60'
                    : 'font-normal text-muted'
                const dateTone = day.isToday
                  ? 'font-semibold text-brand'
                  : future
                    ? 'font-normal text-muted/60'
                    : 'font-semibold text-content'
                return (
                  <li
                    key={day.date}
                    className={`flex flex-col items-center gap-1 rounded-control py-2 ${day.isToday ? 'bg-brand-soft' : ''}`}
                  >
                    <span className="sr-only">{dayDescription(day)}</span>
                    <span
                      aria-hidden="true"
                      className={`text-support leading-snug ${weekdayTone}`}
                    >
                      {day.weekday}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`hidden text-body leading-snug @min-[14rem]:block ${dateTone}`}
                    >
                      {day.dayOfMonth}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-1"
                    >
                      <Dot domain="exercise" mark={day.exercise} />
                      <Dot domain="meal" mark={day.meal} />
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </>
      ) : (
        <p className="mt-3 text-body leading-relaxed font-normal text-muted">
          이번 주를 확인할 수 없어요.
        </p>
      )}
      <Link
        to={WEEKLY_REPORT_PATH}
        state={{ from: '/home' }}
        className={`mt-4 -mb-2 flex min-h-12 items-center justify-between gap-3 border-t border-line pt-1 text-body font-semibold text-brand ${focusRing}`}
      >
        <span className="min-w-0">주간 활동 자세히 보기</span>
        <Icon name="chevron-right" size={18} className="shrink-0" />
      </Link>
    </section>
  )
}
