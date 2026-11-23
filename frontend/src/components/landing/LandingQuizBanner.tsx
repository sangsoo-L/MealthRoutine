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
 * - 제공 예정 표시는 제목 위에 두고, 제목은 서비스 화면의 제목 크기(text-app-title)로 둬 히어로보다 낮은 위계를 갖는다. 일러스트는 글 아래 오른쪽에 작게 둔다.
 * - 일러스트 자리에는 배경·장식을 두지 않는다. 이미지가 로드되기 전에는 배너 면만 보이고, 크기는 비율로 미리 잡아 둔다.
 */
export default function LandingQuizBanner() {
  return (
    <section
      aria-labelledby="landing-quiz-title"
      className="-mx-5 bg-brand-soft px-[20px] py-12"
    >
      <LandingBadge kind="soonOnSoft">{Q.status}</LandingBadge>
      <h2
        id="landing-quiz-title"
        className="mt-3 text-app-title leading-snug font-semibold text-balance text-content"
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
      {IMAGE ? (
        <img
          src={IMAGE.src}
          width={IMAGE.width}
          height={IMAGE.height}
          alt={IMAGE.alt}
          loading="lazy"
          decoding="async"
          className="mt-6 ml-auto aspect-720/455 h-auto w-1/2 max-w-48"
        />
      ) : null}
    </section>
  )
}
