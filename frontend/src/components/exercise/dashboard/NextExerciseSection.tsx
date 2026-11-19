import { Link } from 'react-router'
import type { PendingOnlySlot } from '../../../exercise/exerciseDashboardTypes.ts'
import { PATH_MY_EXERCISE } from '../../../exercise/myExercise.ts'
import type { WorkoutPlansState } from '../../../exercise/useWorkoutPlans.ts'
import {
  formatDateLabel,
  summarizeItems,
} from '../../../exercise/workoutListView.ts'
import { tomorrowOf } from '../../../exercise/workoutPlanModel.ts'
import type { LocalDate } from '../../../exercise/workoutTypes.ts'
import Icon from '../../icons/Icon.tsx'
import {
  PendingBadge,
  SlotError,
  dashboardFocusRing,
  dashboardSectionTitle,
} from './DashboardParts.tsx'

/** W01이 내일 운동 계획 항목에 쓰는 값. 계획 저장소가 없으면(운영 빌드·개발용 예시) 넘기지 않고 기존 "준비 중" 항목을 그대로 둔다. */
export interface NextPlanInfo {
  state: WorkoutPlansState
  today: LocalDate
  onRetry: () => void
}

const PATH_PLAN_COMPOSE = '/records/exercise/compose?day=tomorrow'
const PATH_DASHBOARD = '/records/exercise'

const rowLink = `flex min-h-11 shrink-0 items-center gap-1 px-2 text-support font-semibold text-exercise ${dashboardFocusRing}`

/**
 * "내일 운동 계획" 항목. 계획이 없으면 계획 만들기(W02, day=tomorrow), 있으면 요약과 "계획 보기"(W10의 내일 계획 영역)를 보인다.
 * 내일 계획은 오늘의 운동·운동 기록·통계와 별개라는 점을 글자로 함께 알린다. 계획 날짜가 오늘이 된 계획은 자동으로 시작되지 않는다는 안내만 덧붙인다.
 */
function TomorrowPlanRow({ plan }: { plan: NextPlanInfo }) {
  const { state, today } = plan
  const plans = state.status === 'ready' ? state.plans : []
  const tomorrowPlan =
    plans.find((item) => item.planDate === tomorrowOf(today)) ?? null
  const arrived = plans.some((item) => item.planDate <= today)
  const summary = tomorrowPlan ? summarizeItems(tomorrowPlan.items) : null
  return (
    <li
      data-next-plan
      className="flex items-start justify-between gap-3 pt-3 not-last:pb-3"
    >
      <div className="min-w-0">
        <h3 className="text-body font-semibold text-content">내일 운동 계획</h3>
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          {state.status === 'loading'
            ? '불러오는 중이에요…'
            : state.status === 'error'
              ? '내일 계획을 불러오지 못했어요.'
              : tomorrowPlan && summary
                ? `${formatDateLabel(tomorrowPlan.planDate)} · 운동 ${summary.exerciseCount}개 · 총 ${summary.setCount}세트 (오늘 운동 기록과 별개)`
                : '내일 할 운동 목록을 미리 구성해요. 오늘 운동 기록과 별개로 저장돼요.'}
        </p>
        {arrived ? (
          <p className="mt-1 text-support leading-relaxed font-normal break-keep text-warning">
            예정일이 된 계획이 있어요. 자동으로 시작되지 않아요. 나의 운동에서
            확인해 주세요.
          </p>
        ) : null}
      </div>
      {state.status === 'error' ? (
        <button
          type="button"
          onClick={(event) => {
            // 다시 불러오는 동안 버튼이 사라지므로 감싼 영역(tabIndex=-1)으로 포커스를 먼저 옮긴다.
            event.currentTarget.closest<HTMLElement>('section')?.focus()
            plan.onRetry()
          }}
          className={`cursor-pointer ${rowLink}`}
        >
          다시 시도
        </button>
      ) : state.status === 'ready' ? (
        tomorrowPlan ? (
          <Link
            to={PATH_MY_EXERCISE}
            state={{ from: PATH_DASHBOARD }}
            className={rowLink}
          >
            계획 보기
            <Icon name="chevron-right" size={18} />
          </Link>
        ) : (
          <Link
            to={PATH_PLAN_COMPOSE}
            state={{ from: PATH_DASHBOARD }}
            className={rowLink}
          >
            계획 만들기
            <Icon name="chevron-right" size={18} />
          </Link>
        )
      ) : null}
    </li>
  )
}

/**
 * 주간 리포트(I05) 항목. 운동·식단 기록을 함께 보여 주는 통합 리포트로 가는 링크다(운동 전용 리포트가 아니다).
 * 기본 리포트는 AI 없이 기록 수로 계산하는 무료 기능이라 AI 분석처럼 쓰지 않는다. 돌아오면 W01이다(진입 경로를 state.from으로 넘긴다).
 */
function WeeklyReportRow({ to }: { to: string }) {
  return (
    <li
      data-next-report
      className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pt-3 not-last:pb-3"
    >
      {/* 아주 좁은 화면에서는 링크가 아래 줄로 내려가 가로로 넘치지 않는다. */}
      <div className="min-w-0 flex-1 basis-32">
        <h3 className="text-body font-semibold text-content">주간 리포트</h3>
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          운동·식단 기록으로 한 주를 돌아봐요. 기록 수로 계산하고 AI를 쓰지
          않아요.
        </p>
      </div>
      <Link to={to} state={{ from: PATH_DASHBOARD }} className={rowLink}>
        주간 리포트 보기
        <Icon name="chevron-right" size={18} />
      </Link>
    </li>
  )
}

/** 후속 기능은 펼쳐 볼 수 있는 안내에 보존한다. 미구현 화면으로 이동하지 않는다. */
export default function NextExerciseSection({
  slot,
  onRetry,
  plan,
  reportTo,
}: {
  slot: PendingOnlySlot
  onRetry: () => void
  /** 내일 운동 계획 조회 값. 없으면 "내일 운동 계획"은 기존처럼 준비 중이다. */
  plan?: NextPlanInfo
  /** 주간 리포트(I05) 경로. 없으면(개발용 예시 `?sample=`) 주간 리포트는 기존처럼 준비 중 항목으로 둔다. */
  reportTo?: string
}) {
  const planReady = plan !== undefined && plan.state.status !== 'unavailable'
  return (
    <details className="group">
      <summary
        className={`flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden ${dashboardFocusRing}`}
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-page text-muted"
        >
          <Icon name="calendar-plus" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${dashboardSectionTitle}`}>
            다음 운동 준비하기
          </span>
          {/* 접힌 상태에서도 무엇이 준비 중인지 알 수 있게 항목별 상태를 함께 적는다(펼치지 않아도 동작하지 않는 기능을 기대하지 않게). */}
          <span className="mt-1 block text-support leading-relaxed font-normal break-keep text-muted">
            {reportTo
              ? planReady
                ? '내일 운동 계획 · 주간 리포트'
                : '내일 운동 계획(준비 중) · 주간 리포트'
              : planReady
                ? '내일 운동 계획 · 주간 리포트(준비 중)'
                : '내일 운동 계획 · 주간 리포트 모두 준비 중'}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={20}
          className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-line px-4 pb-4">
        {slot.status === 'error' ? (
          <div className="mt-3">
            <SlotError
              title="다음 운동 정보를 불러오지 못했어요"
              onRetry={onRetry}
            />
          </div>
        ) : slot.status === 'loading' ? (
          <p role="status" className="mt-3 text-support font-normal text-muted">
            불러오는 중이에요…
          </p>
        ) : (
          <ul role="list" className="divide-y divide-line">
            {plan && planReady ? <TomorrowPlanRow plan={plan} /> : null}
            {reportTo ? <WeeklyReportRow to={reportTo} /> : null}
            {[
              ...(planReady
                ? []
                : [
                    {
                      title: '내일 운동 계획',
                      body: '내일 할 운동 목록을 미리 구성해요.',
                    },
                  ]),
              ...(reportTo
                ? []
                : [
                    {
                      title: '주간 리포트',
                      body: '기록을 바탕으로 한 주를 돌아봐요.',
                    },
                  ]),
            ].map((row) => (
              <li
                key={row.title}
                className="flex items-start justify-between gap-3 pt-3 not-last:pb-3"
              >
                <div className="min-w-0">
                  <h3 className="text-body font-semibold text-content">
                    {row.title}
                  </h3>
                  <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                    {row.body}
                  </p>
                </div>
                <PendingBadge />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
