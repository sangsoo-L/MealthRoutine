import { Link } from 'react-router'
import { HOME_QUIZ } from './homeContent.ts'
import { focusRing } from './homeStyles.ts'

const cardClass = `flex w-full flex-wrap items-center gap-x-3 gap-y-4 rounded-card border border-brand/20 bg-brand-soft px-[16px] py-4 text-left ${focusRing}`

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
      </span>
    </span>
    {QUIZ_ART}
  </>
)

/**
 * 회원 홈(MemberHomePage)의 퀴즈 카드. 비회원 랜딩(H01)은 이 컴포넌트 대신 landing/LandingQuizBanner로 퀴즈를 소개한다.
 *
 * "운동·식단 알아가기 퀴즈" 카드(v5.0 H01). 주 행동(히어로)을 가리지 않도록 브랜드 블루로 채우지 않고
 * 연한 면과 테두리로 표현한다.
 *
 * 이동할 오늘의 퀴즈(H02)의 경로가 아직 정해지지 않아(`HOME_QUIZ.to`가 null) 지금은 비활성 버튼이다.
 * 눌러도 이동·안내·모달이 없고, 바로가기의 "커뮤니티"와 같은 방식으로 흐리게 보여 이동할 수 있는 것처럼 보이지 않게 한다.
 * 경로가 확정되면 `HOME_QUIZ.to`만 채우면 링크로 바뀐다. 퀴즈 기능과 H02 화면은 이 작업의 범위가 아니다.
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
    <button
      type="button"
      aria-disabled="true"
      className={`${cardClass} cursor-not-allowed opacity-60`}
    >
      {content}
    </button>
  )
}
