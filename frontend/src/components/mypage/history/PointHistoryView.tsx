import { useState } from 'react'
import { groupByDay, timeLabel } from '../../../growth-history/historyState.ts'
import {
  POINT_FILTERS,
  POINT_FILTER_LABEL,
  filterPointEntries,
  pointAmountLabel,
  pointFilterCounts,
  type PointFilter,
  type PointHistoryState,
} from '../../../growth-history/pointHistory.ts'
import type { PointBalance, Slot } from '../../../mypage/mypageTypes.ts'
import { cardClass, focusRing, sectionTitleClass } from '../myStyles.ts'
import Metric from '../Metric.tsx'
import { DayGroups, HistoryEmpty, HistoryNotice } from './HistoryParts.tsx'

const TEXT = {
  loading: '포인트 내역을 불러오는 중이에요…',
  unavailableTitle: '포인트 내역을 아직 볼 수 없어요',
  unavailableBody:
    '포인트 기능이 서버에 연결되기 전이에요. 내역이 없다는 뜻이 아니에요.',
  errorTitle: '포인트 내역을 불러오지 못했어요',
  errorBody: '내역이 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.',
} as const

const sub = 'text-support leading-snug font-normal text-muted'

/** 합계 한 칸. 서버가 준 값이 없으면 숫자를 만들지 않고 상태 글자("연결 전"·"확인 전")를 보인다. */
function Total({
  name,
  value,
  fallback,
}: {
  name: string
  value: number | null
  fallback: string
}) {
  return (
    <div className="min-w-0 flex-1 basis-28" data-point-total={name}>
      <dt className={sub}>{name}</dt>
      <dd className="mt-0.5 text-body leading-snug font-semibold text-content tabular-nums">
        {value === null ? (
          <span className="font-normal text-muted">{fallback}</span>
        ) : (
          `${value.toLocaleString('ko-KR')} P`
        )}
      </dd>
    </div>
  )
}

/**
 * P16 포인트 내역(화면명세 v5.0: 보유 포인트·총 적립·총 사용 · 전체·적립·사용 필터와 건수 · 날짜별 최신순 목록 · 포인트와 경험치 별도 관리 안내).
 *
 * - 보유 포인트는 마이페이지(P01)와 같은 기존 출처의 값이다(개발 서버의 개발용 값은 호출한 화면이 안내한다). 알 수 없으면 줄표와 "연결 전"이다(0으로 채우지 않는다).
 *   총 적립·총 사용은 서버가 준 값만 보이고 이 앱이 내역을 더해 계산하지 않는다(없으면 "연결 전"·"확인 전").
 * - 내역은 서버가 준 것만 날짜별(최신순)로 보인다: 유형(적립·사용)·시각·사유·변동 포인트(부호)·거래 후 잔액(서버 값일 때만). 필터는 건수를 함께 보이고
 *   필터를 바꿔도 보유 포인트·합계는 그대로다. 조회 중·서버 연결 전·조회 실패·내역 없음·선택 유형 내역 없음을 구분하며 가짜·예시 내역은 없다.
 * - 포인트 적립 기준·사용처·유효기간은 정해지지 않았다는 안내와 경험치와 별도라는 안내를 보인다. 포인트를 적립·차감·사용하는 기능은 없다.
 */
export default function PointHistoryView({
  points,
  state,
  onRetry,
  initialFilter = 'all',
}: {
  points: Slot<PointBalance>
  state: PointHistoryState
  onRetry: () => void
  initialFilter?: PointFilter
}) {
  const [filter, setFilter] = useState<PointFilter>(initialFilter)
  const ready = state.status === 'ready' ? state.data : null
  const totals = ready?.totals ?? null
  const counts = ready ? pointFilterCounts(ready.entries) : null
  const shown = ready ? filterPointEntries(ready.entries, filter) : []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          포인트 내역
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          현재 보유 포인트와 적립·사용 내역의 날짜·사유·변동량을 확인해요.
        </p>
      </header>

      <section aria-labelledby="point-summary-title" className={cardClass}>
        <h2 id="point-summary-title" className={sectionTitleClass}>
          보유 포인트
        </h2>
        <div className="mt-2">
          <Metric
            value={points.state === 'ready' ? points.data.balance : null}
            unit="P"
            missingLabel="연결 전"
          />
          {points.state === 'ready' ? null : (
            <p className={`mt-1 ${sub}`}>아직 연결되지 않았어요</p>
          )}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
          <Total
            name="총 적립"
            value={totals?.earned ?? null}
            fallback={ready ? '확인 전' : '연결 전'}
          />
          <Total
            name="총 사용"
            value={totals?.used ?? null}
            fallback={ready ? '확인 전' : '연결 전'}
          />
        </dl>
      </section>

      <p
        data-point-policy=""
        className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
      >
        포인트 적립 기준·사용처·유효기간은 아직 정해지지 않았어요. 정해지면 이
        화면에서 안내해요.
      </p>

      {state.status === 'loading' ||
      state.status === 'unavailable' ||
      state.status === 'error' ? (
        <HistoryNotice status={state.status} text={TEXT} onRetry={onRetry} />
      ) : null}
      {state.status === 'empty' ? (
        <HistoryEmpty kind="empty" title="아직 포인트 내역이 없어요">
          포인트가 쌓이거나 쓰이면 이곳에 날짜별로 보여요.
        </HistoryEmpty>
      ) : null}
      {ready && counts ? (
        <>
          <div
            role="group"
            aria-label="유형별 보기"
            className="flex flex-wrap gap-2"
          >
            {POINT_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                data-point-filter={value}
                onClick={() => setFilter(value)}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-body ${focusRing} ${filter === value ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line bg-surface font-normal text-content'}`}
              >
                {POINT_FILTER_LABEL[value]}
                <span className="tabular-nums">{counts[value]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <HistoryEmpty kind="filtered" title="이 유형의 내역이 없어요">
              다른 유형을 선택해 보세요. 보유 포인트와 합계는 전체 기준
              그대로예요.
            </HistoryEmpty>
          ) : (
            <DayGroups
              label="포인트 내역"
              groups={groupByDay(shown).map((group) => ({
                day: group.day,
                items: group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    data-point-entry={entry.id}
                    data-point-kind={entry.kind}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className={sub}>
                        <span className="font-semibold text-content">
                          {entry.kind === 'earn' ? '적립' : '사용'}
                        </span>
                        {timeLabel(entry.occurredAt) ? (
                          <span className="tabular-nums">
                            {' '}
                            · {timeLabel(entry.occurredAt)}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-body leading-snug font-normal wrap-break-word text-content">
                        {entry.reason}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-body leading-snug font-semibold whitespace-nowrap tabular-nums ${entry.kind === 'earn' ? 'text-brand' : 'text-content'}`}
                      >
                        {pointAmountLabel(entry)}
                      </p>
                      {entry.balanceAfter !== null ? (
                        <p className={`mt-0.5 tabular-nums ${sub}`}>
                          잔액 {entry.balanceAfter.toLocaleString('ko-KR')} P
                        </p>
                      ) : null}
                    </div>
                  </div>
                )),
              }))}
            />
          )}
        </>
      ) : null}

      <section
        aria-labelledby="point-guide-title"
        className="rounded-card border border-line bg-page p-4"
      >
        <h2 id="point-guide-title" className={sectionTitleClass}>
          알아두세요
        </h2>
        <p className="mt-2 text-body leading-relaxed font-normal text-content">
          포인트는 경험치와 따로 관리돼요. 두 값은 서로 계산하거나 바꿀 수
          없어요.
        </p>
      </section>
    </div>
  )
}
