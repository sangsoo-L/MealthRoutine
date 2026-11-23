import { Link } from 'react-router'
import {
  todayStatusOf,
  type DomainActivity,
  type Fact,
  type TodayStatus,
} from '../../home-activity/homeActivity.ts'
import { DOMAIN_TONE, homeCard, homeCardTitle } from './homeStyles.ts'

const ROWS = [
  {
    domain: 'exercise',
    label: '운동',
    emoji: '💪',
    to: '/records/exercise',
  },
  {
    domain: 'meal',
    label: '식단',
    emoji: '🍽️',
    to: '/records/meal',
  },
] as const

/** 한 줄의 상태 문구와 오른쪽 이동 문구. 기록이 없다고 확인된 경우에만 "아직 기록이 없어요"를 쓴다. */
function rowText(status: TodayStatus): { text: string; action: string } {
  switch (status.status) {
    case 'some':
      return { text: `오늘 ${status.count}건 기록했어요`, action: '상세 보기' }
    case 'none':
      return { text: '아직 기록이 없어요', action: '기록하기' }
    case 'loading':
      return { text: '확인하는 중이에요', action: '기록하기' }
    case 'unavailable':
      return { text: '기록 기능 연결 전이에요', action: '둘러보기' }
    default:
      return { text: '기록을 확인하지 못했어요', action: '기록하기' }
  }
}

/**
 * 로그인 홈(H01)의 "오늘의 기록". 운동과 식단을 한 줄씩 구분해 오늘의 상태를 보여 주고 기록 화면으로 보낸다(행 전체가 링크).
 *
 * - 상태는 홈이 한 번 읽은 기록(useHomeActivity)에서 가져온다. 이 컴포넌트가 따로 조회하지 않는다.
 * - 기록이 있으면 "오늘 N건 기록했어요"와 "상세 보기", 없다고 확인되면 "아직 기록이 없어요"와 "기록하기"다.
 *   읽는 중·연결 전·조회 실패·읽을 수 없는 기록이 있을 때는 "기록 없음"이라고 하지 않는다.
 * - 이번 주 나의 활동은 주간 요약이고 이 영역은 오늘 하루의 확인·이동이다. 구분은 아이콘과 "운동"·"식단" 글자로도 한다.
 */
export default function HomeTodayRecords({
  exercise,
  meal,
}: {
  exercise: Fact<DomainActivity>
  meal: Fact<DomainActivity>
}) {
  const status = {
    exercise: todayStatusOf(exercise),
    meal: todayStatusOf(meal),
  }
  return (
    <section
      aria-labelledby="home-today-title"
      data-home-today=""
      className={homeCard}
    >
      <h2 id="home-today-title" className={homeCardTitle}>
        오늘의 기록
      </h2>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {ROWS.map((row) => {
          const { text, action } = rowText(status[row.domain])
          const tone = DOMAIN_TONE[row.domain]
          return (
            <li key={row.domain}>
              <Link
                to={row.to}
                // 윤곽선이 줄 위아래 구분선에 가려지지 않도록 안쪽으로 그린다. 폭이 모자라면(글자 확대·160px) 줄이 바뀌어 글이 한 글자씩 쌓이지 않는다.
                className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-app-title ${tone.tile}`}
                >
                  {row.emoji}
                </span>
                <span className="min-w-0 flex-1 basis-32">
                  <span
                    className={`block text-support leading-snug font-semibold ${tone.label}`}
                  >
                    {row.label}
                  </span>
                  <span className="block text-body leading-snug font-normal text-content">
                    {text}
                  </span>
                </span>
                <span className="shrink-0 text-support font-normal text-brand">
                  {action} <span aria-hidden="true">›</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
