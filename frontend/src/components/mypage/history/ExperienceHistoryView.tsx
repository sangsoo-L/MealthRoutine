import { Link } from 'react-router'
import {
  PATH_EXPERIENCE_HISTORY,
  experienceAmountLabel,
  type ExperienceHistoryState,
} from '../../../growth-history/experienceHistory.ts'
import { groupByDay, timeLabel } from '../../../growth-history/historyState.ts'
import type { ActivityLevel, Slot } from '../../../mypage/mypageTypes.ts'
import Icon from '../../icons/Icon.tsx'
import { cardClass, focusRing, sectionTitleClass } from '../myStyles.ts'
import { DayGroups, HistoryEmpty, HistoryNotice } from './HistoryParts.tsx'

/** P15 레벨 안내 경로(P14 ↔ P15 상호 이동). */
const PATH_LEVEL_GUIDE = '/mypage/level'

const TEXT = {
  loading: '경험치 내역을 불러오는 중이에요…',
  unavailableTitle: '경험치 내역을 아직 볼 수 없어요',
  unavailableBody:
    '경험치 기능이 서버에 연결되기 전이에요. 내역이 없다는 뜻이 아니에요.',
  errorTitle: '경험치 내역을 불러오지 못했어요',
  errorBody: '내역이 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.',
} as const

const sub = 'text-support leading-snug font-normal text-muted'

/** 현재 활동 레벨 요약. 서버·기존 출처가 준 값만 보이고, 알 수 없으면 줄표와 "연결 전"이다(수치를 만들지 않는다). */
function LevelSummary({ level }: { level: Slot<ActivityLevel> }) {
  if (level.state !== 'ready')
    return (
      <>
        <p className="mt-1 text-metric leading-none font-semibold text-muted">
          <span aria-hidden="true">Lv.–</span>
          <span className="sr-only">활동 레벨 연결 전</span>
        </p>
        <p className={`mt-1 ${sub}`}>연결 전</p>
      </>
    )
  const { level: lv, progress } = level.data
  const remaining = progress
    ? Math.max(0, progress.nextLevelExperience - progress.experience)
    : null
  return (
    <>
      <p className="mt-1 text-metric leading-none font-semibold text-brand tabular-nums">
        Lv.{lv}
      </p>
      {progress && remaining !== null ? (
        <p className={`mt-1 tabular-nums ${sub}`}>
          현재 {progress.experience.toLocaleString('ko-KR')} EXP · 다음 레벨까지{' '}
          {remaining.toLocaleString('ko-KR')} EXP
        </p>
      ) : null}
    </>
  )
}

/**
 * P14 경험치 내역(화면명세 v5.0: 현재 활동 레벨·EXP 요약 · 일자별 활동·적립량 · 레벨 안내 P15).
 *
 * - 현재 활동 레벨은 마이페이지(P01)와 같은 기존 출처의 값이다(개발 서버의 개발용 값은 호출한 화면이 안내한다). 진행값(EXP)은 정책이 없어 없으면 보이지 않는다.
 *   서버가 준 합계가 있을 때만 "총 적립"을 보이고 이 앱이 합계를 계산하지 않는다.
 * - 내역은 서버가 준 것만 날짜별(최신순)로 보인다: 활동·시각·적립량("+N EXP"). 조회 중·서버 연결 전·조회 실패·내역 없음을 구분하며 가짜·예시 내역은 없다.
 * - 경험치는 포인트와 별도이고 지급·승급 정책은 정해지지 않았다는 안내를 항상 보인다. 경험치를 적립·차감하는 기능은 없다.
 */
export default function ExperienceHistoryView({
  level,
  state,
  onRetry,
}: {
  level: Slot<ActivityLevel>
  state: ExperienceHistoryState
  onRetry: () => void
}) {
  const total = state.status === 'ready' ? state.data.total : null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          경험치 내역
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          현재 레벨 경험치의 적립 날짜·활동·적립량을 확인해요.
        </p>
      </header>

      <section aria-labelledby="exp-summary-title" className={cardClass}>
        <h2 id="exp-summary-title" className={sectionTitleClass}>
          현재 활동 레벨
        </h2>
        <LevelSummary level={level} />
        {total !== null ? (
          <p data-history-total="" className={`mt-2 tabular-nums ${sub}`}>
            총 적립{' '}
            <span className="font-semibold text-content">
              {total.toLocaleString('ko-KR')} EXP
            </span>
          </p>
        ) : null}
      </section>

      {state.status === 'loading' ||
      state.status === 'unavailable' ||
      state.status === 'error' ? (
        <HistoryNotice status={state.status} text={TEXT} onRetry={onRetry} />
      ) : null}
      {state.status === 'empty' ? (
        <HistoryEmpty kind="empty" title="아직 경험치 내역이 없어요">
          활동으로 경험치를 얻으면 이곳에 날짜별로 쌓여요.
        </HistoryEmpty>
      ) : null}
      {state.status === 'ready' ? (
        <DayGroups
          label="경험치 적립 내역"
          groups={groupByDay(state.data.entries).map((group) => ({
            day: group.day,
            items: group.entries.map((entry) => (
              <div
                key={entry.id}
                data-experience-entry={entry.id}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-body leading-snug font-normal wrap-break-word text-content">
                    {entry.activity}
                  </p>
                  {timeLabel(entry.occurredAt) ? (
                    <p className={`mt-0.5 tabular-nums ${sub}`}>
                      {timeLabel(entry.occurredAt)}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-body leading-snug font-semibold whitespace-nowrap text-brand tabular-nums">
                  {experienceAmountLabel(entry.amount)}
                </p>
              </div>
            )),
          }))}
        />
      ) : null}

      <section
        aria-labelledby="exp-guide-title"
        className="rounded-card border border-line bg-page p-4"
      >
        <h2 id="exp-guide-title" className={sectionTitleClass}>
          알아두세요
        </h2>
        <ul className="mt-2 flex flex-col gap-1">
          <li className="text-body leading-relaxed font-normal text-content">
            경험치는 활동 레벨을 정하는 값이고, 포인트와 따로 관리돼요.
          </li>
          <li className="text-body leading-relaxed font-normal text-content">
            경험치 지급과 레벨이 오르는 기준은 아직 정해지지 않았어요.
          </li>
        </ul>
        <Link
          to={PATH_LEVEL_GUIDE}
          state={{ from: PATH_EXPERIENCE_HISTORY }}
          data-experience-guide-link=""
          className={`mt-1 inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          레벨 안내 보기
          <Icon name="chevron-right" size={18} />
        </Link>
      </section>
    </div>
  )
}
