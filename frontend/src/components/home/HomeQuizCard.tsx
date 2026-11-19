import { Link } from 'react-router'
import { HOME_QUIZ } from './homeContent.ts'
import { focusRing } from './homeStyles.ts'

const cardClass = `flex w-full flex-wrap items-center gap-x-3 gap-y-4 rounded-card border border-brand/20 bg-brand-soft px-[20px] py-5 text-left ${focusRing}`

/**
 * 장식 그림: 살짝 기울인 "오늘의 상식" 카드와 두 이모지. 순수 장식이라 보조기기에서는 숨긴다.
 * 크기를 rem으로 두어 글자 확대 때 안의 글자와 함께 커진다(px로 고정하면 확대된 글자가 카드를 넘친다).
 * 기울임은 정지 상태의 배치일 뿐 움직임이 아니다.
 */
const QUIZ_ART = (
  <span
    aria-hidden="true"
    className="relative ml-auto flex h-28 w-28 shrink-0 items-center justify-center"
  >
    <span className="flex h-24 w-20 rotate-6 flex-col items-center justify-center rounded-card border border-brand/20 bg-surface">
      <span className="text-support font-normal text-muted">
        {HOME_QUIZ.artLabel}
      </span>
      <b className="text-metric leading-none font-semibold text-brand">Q</b>
      <i className="mt-1 text-support font-normal text-brand not-italic">
        {HOME_QUIZ.artProgress}
      </i>
    </span>
    <span className="absolute top-0 left-0 -rotate-12 text-app-title">💪</span>
    <span className="absolute right-0 bottom-0 rotate-12 text-app-title">
      🍽️
    </span>
  </span>
)

const content = (
  <>
    <span className="block min-w-0 flex-1 basis-40">
      <span className="block text-support font-normal text-brand">
        {HOME_QUIZ.kicker}
      </span>
      <strong className="mt-1 block text-section-title leading-snug font-semibold text-content">
        {HOME_QUIZ.title}
      </strong>
      <span className="mt-1 block text-body leading-relaxed font-normal text-muted">
        {HOME_QUIZ.descriptionLines[0]}
        <br />
        {HOME_QUIZ.descriptionLines[1]}
      </span>
      <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-support font-normal text-brand">
          {HOME_QUIZ.audience}
        </span>
        <small className="rounded-full border border-brand/20 bg-surface px-2 py-0.5 text-support font-normal text-content">
          {HOME_QUIZ.frequency}
        </small>
        {HOME_QUIZ.to ? null : (
          <small className="rounded-full bg-surface px-2 py-0.5 text-support font-normal text-muted">
            준비 중
          </small>
        )}
      </span>
    </span>
    {QUIZ_ART}
  </>
)

/**
 * 회원 홈(MemberHomePage)의 퀴즈 카드. 비회원 랜딩(H01)은 이 컴포넌트 대신 landing/LandingQuizBanner로 퀴즈를 소개한다.
 *
 * "운동·식단 알아가기 퀴즈" 카드(v5.0 H01). 주 행동(바로가기)을 가리지 않도록 브랜드 블루로 채우지 않고
 * 연한 면과 테두리로 표현한다.
 *
 * 오늘의 퀴즈(H02, `/quiz`)로 가는 링크다(`HOME_QUIZ.to`). 오늘의 퀴즈를 이미 마쳤으면 회원 홈(MemberHomePage)이 이 카드를 그리지 않는다.
 * `HOME_QUIZ.to`가 null이면(경로가 없을 때의 대비) 누를 수 없는 소개 카드가 되어 "준비 중"을 글자로 함께 표시한다.
 */
export default function HomeQuizCard() {
  if (HOME_QUIZ.to) {
    return (
      <Link
        to={HOME_QUIZ.to}
        className={`${cardClass} transition-colors hover:border-brand/40 motion-reduce:transition-none`}
      >
        {content}
      </Link>
    )
  }
  return (
    <section aria-label="운동·식단 알아가기 퀴즈" className={cardClass}>
      {content}
    </section>
  )
}
