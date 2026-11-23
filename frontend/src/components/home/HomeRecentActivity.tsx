import { Link } from 'react-router'
import type { RecentActivityView } from '../../home-activity/homeActivity.ts'
import {
  DOMAIN_TONE,
  focusRing,
  homeCard,
  homeCardTitle,
} from './homeStyles.ts'

const KIND = {
  exercise: { label: '운동', emoji: '💪' },
  meal: { label: '식단', emoji: '🍽️' },
} as const

const rowFocus =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'

/**
 * 로그인 홈(H01)의 "최근 활동". 최근에 남긴 운동·식단 기록을 합쳐 최신순 최대 3건을 보여 준다(정렬 기준은 homeActivity.ts).
 *
 * - 기록은 홈이 한 번 읽은 결과(useHomeActivity)에서 가져온다. 이 컴포넌트가 따로 조회하지 않는다.
 * - 각 줄은 기존 상세 화면으로 간다: 운동은 완료 기록의 읽기 전용 결과(W15), 식단은 끼니 상세(오늘)·이전 식단 상세(지난 날짜).
 *   기록에 세션 id가 없으면 운동 기록 목록(W10)으로 보낸다(없는 경로를 만들지 않는다).
 * - 기록이 없다고 확인된 경우에만 "아직 남긴 활동이 없어요."를 보인다. 읽는 중은 같은 크기의 자리 표시, 연결 전·조회 실패는 따로 안내한다.
 *   한 영역만 읽지 못하면 읽은 기록은 보여 주고 일부를 불러오지 못했다고 알린다.
 */
export default function HomeRecentActivity({
  view,
  onRetry,
}: {
  view: RecentActivityView
  onRetry: () => void
}) {
  return (
    <section
      aria-labelledby="home-recent-title"
      data-home-recent=""
      className={homeCard}
    >
      <h2 id="home-recent-title" className={homeCardTitle}>
        최근 활동
      </h2>
      {view.status === 'ready' ? (
        <>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {view.items.map((item) => {
              const tone = DOMAIN_TONE[item.kind]
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    to={item.to}
                    state={{ from: '/home' }}
                    data-recent-kind={item.kind}
                    className={`flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 ${rowFocus}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-app-title ${tone.tile}`}
                    >
                      {KIND[item.kind].emoji}
                    </span>
                    <span className="min-w-0 flex-1 basis-28">
                      <span
                        className={`block text-support leading-snug font-semibold ${tone.label}`}
                      >
                        {KIND[item.kind].label}
                      </span>
                      <span className="block text-body leading-snug font-semibold text-content">
                        {item.title}
                      </span>
                      <span className="block text-support leading-snug font-normal text-muted">
                        {item.meta}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-muted"
                    >
                      ›
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {view.missing.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
              <p className="text-support leading-snug font-normal text-muted">
                일부 기록은 불러오지 못했어요.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className={`min-h-11 cursor-pointer rounded-control text-support font-semibold text-brand ${focusRing}`}
              >
                다시 확인
              </button>
            </div>
          ) : null}
        </>
      ) : view.status === 'loading' ? (
        <div
          role="status"
          className="mt-3 flex min-h-16 flex-col justify-center gap-2 border-t border-line pt-3"
        >
          <span
            aria-hidden="true"
            className="h-4 w-2/3 animate-pulse rounded-control bg-line motion-reduce:animate-none"
          />
          <span
            aria-hidden="true"
            className="h-3 w-1/3 animate-pulse rounded-control bg-line motion-reduce:animate-none"
          />
          <span className="sr-only">최근 활동을 불러오는 중이에요.</span>
        </div>
      ) : view.status === 'empty' ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-body leading-snug font-semibold text-content">
            아직 남긴 활동이 없어요.
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            운동이나 식단을 기록하면 이곳에서 확인할 수 있어요.
          </p>
        </div>
      ) : view.status === 'unavailable' ? (
        <p className="mt-3 border-t border-line pt-3 text-body leading-relaxed font-normal text-muted">
          기록 기능이 연결되면 이곳에서 최근 활동을 확인할 수 있어요.
        </p>
      ) : (
        <div className="mt-3 border-t border-line pt-3">
          <p
            role="alert"
            className="text-body leading-relaxed font-normal text-muted"
          >
            최근 활동을 불러오지 못했어요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-1 min-h-11 cursor-pointer rounded-control text-support font-semibold text-brand ${focusRing}`}
          >
            다시 확인
          </button>
        </div>
      )}
    </section>
  )
}
