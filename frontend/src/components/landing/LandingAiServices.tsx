import Icon from '../icons/Icon.tsx'
import LandingBadge from './LandingBadge.tsx'
import { LANDING_AI } from './landingContent.ts'

/**
 * AI 코칭 안내. 아직 제공되지 않는 기능이라 히어로·퀴즈 배너보다 조용하게 둔다.
 * 카드 없이 여백으로 묶고, 두 항목은 장식용 아이콘 칩으로 구분한다. 이용 조건·체험·유의 문구는 아래 한 덩어리로 모은다.
 * "제공 예정"을 제목 바로 옆에 표시한다. 눌러서 갈 곳(/ai는 임시 화면)은 두지 않는다.
 * 가짜 AI 결과와 가격은 없다. 이용 조건은 v5.0 명세에서 확인되는 내용만 적는다(근거는 LANDING_AI 주석).
 */
export default function LandingAiServices() {
  return (
    <section
      aria-labelledby="landing-ai-title"
      className="-mx-5 px-[20px] py-12"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2
          id="landing-ai-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          {LANDING_AI.title}
        </h2>
        <LandingBadge kind="soon">{LANDING_AI.badge}</LandingBadge>
      </div>
      <ul className="mt-5 flex flex-col gap-5">
        {LANDING_AI.items.map((item) => (
          <li key={item.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand"
            >
              <Icon name={item.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="flex min-h-[32px] items-center text-body leading-snug font-semibold text-content">
                {item.title}
              </h3>
              <p className="text-body leading-relaxed font-normal text-pretty text-muted">
                {item.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-body leading-relaxed font-normal text-pretty text-muted">
          {LANDING_AI.access}
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
          {LANDING_AI.disclaimer}
        </p>
      </div>
    </section>
  )
}
