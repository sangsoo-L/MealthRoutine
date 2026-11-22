import { Link } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { composeSecondaryButton } from '../components/exercise/compose/composeStyles.ts'
import {
  DashboardSection,
  SlotError,
  SlotLoading,
  dashboardSectionTitle,
} from '../components/exercise/dashboard/DashboardParts.tsx'
import PreviousListCard from '../components/exercise/previous/PreviousListCard.tsx'
import Icon from '../components/icons/Icon.tsx'
import { PATH_MY_EXERCISE } from '../exercise/myExercise.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { usePreviousLists } from '../exercise/usePreviousLists.ts'
import { formatDateLabel } from '../exercise/workoutListView.ts'

const TITLE_ID = 'previous-lists-title'

function PreviousBody() {
  const today = useLocalToday()
  const { user } = useAuth()
  const { slot, reload } = usePreviousLists(user?.id ?? null, today)
  const view = slot.status === 'ready' ? slot.data : null
  const hasLists = view !== null && view.listCount > 0
  const allCorrupt = view !== null && view.listCount === 0

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          이전 운동 리스트
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          지난 날짜에 구성한 운동과 세트별 목표를 확인해요. 이 화면은 당시 운동
          계획이에요.
        </p>
      </header>
      <DashboardSection labelId={TITLE_ID}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span id={TITLE_ID} className="sr-only">
            날짜별 운동 목록
          </span>
          {hasLists ? (
            <span className="text-support font-normal tabular-nums text-muted">
              전체 {view.listCount}개 목록 · 최근 날짜순
            </span>
          ) : null}
        </div>
        {slot.status === 'loading' ? (
          <SlotLoading label="이전 운동 리스트를 불러오는 중이에요…" />
        ) : slot.status === 'error' ? (
          <SlotError
            title="이전 운동 리스트를 불러오지 못했어요"
            onRetry={reload}
          />
        ) : hasLists ? (
          <div className="flex flex-col gap-6">
            {view.groups.map((group) => {
              const headingId = `previous-date-${group.date}`
              return (
                <section key={group.date} aria-labelledby={headingId}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id={headingId} className={dashboardSectionTitle}>
                      <time dateTime={group.date}>
                        {formatDateLabel(group.date)}
                      </time>
                    </h2>
                    <span className="text-support font-normal tabular-nums text-muted">
                      {group.lists.length}개 목록
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.lists.map((list) => (
                      <PreviousListCard key={list.id} list={list} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-exercise"
            >
              <Icon name="clipboard" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-body leading-snug font-semibold text-content">
                {allCorrupt
                  ? '운동 목록을 확인할 수 없어요'
                  : slot.status === 'unavailable'
                    ? '이전 운동 리스트를 준비 중이에요'
                    : '이전 운동 리스트가 없어요'}
              </p>
              <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
                {allCorrupt
                  ? '목록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'
                  : slot.status === 'unavailable'
                    ? '이 환경에서는 저장된 운동 목록을 볼 수 없어요.'
                    : '지난 날짜의 운동 목록이 여기에 모여요. 오늘의 운동은 나의 운동에서 확인할 수 있어요.'}
              </p>
            </div>
          </div>
        )}
        {view && view.skippedCount > 0 ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            읽을 수 없는 목록 {view.skippedCount}개를 제외했어요.
          </p>
        ) : null}
        {view && view.recordsUnavailable && hasLists ? (
          <p
            role="status"
            className="mt-2 text-support leading-relaxed font-normal text-muted"
          >
            저장한 수행 기록을 확인하지 못해 기록 보기는 보이지 않아요.
          </p>
        ) : null}
      </DashboardSection>
      <Link
        to={PATH_MY_EXERCISE}
        className={`w-full ${composeSecondaryButton}`}
      >
        나의 운동으로 돌아가기
      </Link>
    </div>
  )
}

/** W16 이전 운동 리스트: 지난 날짜에 구성한 운동 계획 목록(읽기 전용). 회원 전용(라우트의 AuthGate). */
export default function ExercisePreviousPage() {
  const { user } = useAuth()
  return <PreviousBody key={user?.id ?? ''} />
}
