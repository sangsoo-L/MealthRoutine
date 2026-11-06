import LandingBadge from './LandingBadge.tsx'
import { LANDING_QUIZ } from './landingContent.ts'
import { LANDING_IMAGES } from './landingImages.ts'

const Q = LANDING_QUIZ
const IMAGE = LANDING_IMAGES.quiz

/**
 * 건강 상식 퀴즈 소개 배너. 회원용 하루 한 문제 퀴즈(H02)를 알리는 정적인 프로모션 영역이다.
 *
 * - 누를 수 없다: 링크·버튼·포인터 커서·호버 효과·tabIndex·aria-live가 없고, 문제·선택지·해설도 없다.
 *   보상·기간·인원처럼 실제 이벤트로 오해할 내용도 쓰지 않는다. 아직 없는 서비스이므로 "제공 예정"을 함께 표시한다.
 * - 본문 좌우 여백을 -mx-5로 넘어 전면 띠로 펼친다. 안쪽 여백은 글자 확대에 따라 커지지 않도록 px로 고정한다.
 * - 글은 전체 폭을 쓰고, 아래 행에서 상태 표시와 일러스트를 비대칭으로 놓는다. 폭이 모자라면 일러스트가 다음 줄로 내려간다.
 * - 일러스트 자리에는 배경·장식을 두지 않는다. 이미지가 로드되기 전에는 배너 면만 보이고, 크기는 비율로 미리 잡아 둔다.
 */
export default function LandingQuizBanner() {
  return (
    <section
      aria-labelledby="landing-quiz-title"
      className="-mx-5 bg-brand-soft px-[20px] pt-12 pb-8"
    >
      <p className="text-body leading-snug font-normal text-brand">
        {Q.eyebrow}
      </p>
      <h2
        id="landing-quiz-title"
        className="mt-2 text-metric leading-tight font-semibold text-balance text-content"
      >
        {Q.titleLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h2>
      <p className="mt-3 text-body leading-relaxed font-normal text-pretty text-muted">
        {Q.description}
      </p>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-3 gap-y-4">
        <LandingBadge kind="soonOnSoft">{Q.status}</LandingBadge>
        {IMAGE ? (
          <img
            src={IMAGE.src}
            width={IMAGE.width}
            height={IMAGE.height}
            alt={IMAGE.alt}
            loading="lazy"
            decoding="async"
            className="ml-auto aspect-720/455 h-auto w-3/5 max-w-60 shrink-0"
          />
        ) : null}
      </div>
    </section>
  )
}
