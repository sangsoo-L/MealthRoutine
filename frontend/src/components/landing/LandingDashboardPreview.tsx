import Icon from '../icons/Icon.tsx'
import { LANDING_PREVIEW } from './landingContent.ts'

const P = LANDING_PREVIEW

const TONE = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
} as const

/**
 * 히어로의 "운동도 식단도, 한곳에" 카드. 운동 기록과 식단 기록이 서비스의 두 축임을 보여 주는 정적 소개 콘텐츠다.
 *
 * - 사용자 데이터·API·DB 조회와 무관하다. 기록처럼 보이는 수치·그래프를 넣지 않고, 상태·입력·링크·버튼이 없다.
 * - 각 축은 아이콘 칩과 라벨 한 줄이다. 색은 칩에서 운동·식단의 의미만 더하고, 뜻은 라벨 글자가 전한다.
 * - 2열이고, 글자를 확대해 폭이 모자라면 한 줄씩 쌓인다. 높이를 고정하지 않아 내용이 잘리지 않는다.
 * - 칩은 px로 고정한다. 아이콘이 px 고정이라, 칩이 글자 확대를 따라 커지면 아이콘만 작아 보인다.
 * - 세로 구분선은 각 항목 왼쪽 간격의 가운데에 그린다. 목록을 overflow-clip으로 자르므로 첫 열의 선은 잘려 보이지 않고,
 *   1열로 쌓여도 구분선이 어긋나 남지 않는다.
 * - 전용 아이콘이 없어 두 축 모두 기록을 뜻하는 clipboard-check를 쓴다. 아이콘은 장식이다.
 */
export default function LandingDashboardPreview() {
  return (
    <div className="rounded-card border border-line bg-surface px-[20px] py-5 text-content">
      <h2 className="text-section-title leading-snug font-semibold text-content">
        {P.title}
      </h2>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(6.5rem,100%),1fr))] gap-x-6 gap-y-3 overflow-clip">
        {P.summaries.map((item) => (
          <li
            key={item.label}
            className="relative flex items-center gap-2 before:absolute before:inset-y-0 before:-left-3 before:w-px before:bg-line"
          >
            <span
              aria-hidden="true"
              className={`flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-control ${TONE[item.tone]}`}
            >
              <Icon name="clipboard-check" size={20} />
            </span>
            <p className="min-w-0 text-body leading-snug font-normal text-content">
              {item.label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
