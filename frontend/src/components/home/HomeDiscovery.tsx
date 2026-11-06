import {
  HOME_GUIDE_STEPS,
  HOME_GUIDE_TEXT,
  HOME_GUIDE_TOPICS,
} from './homeContent.ts'
import SearchGuideTopic from './SearchGuideTopic.tsx'

/**
 * [H02 재사용 예정] v5.0 회원 홈의 "처음이라면 여기부터". 현재 H01(비로그인 랜딩)은 렌더링하지 않는다.
 *
 * "처음이라면 여기부터": 가입 없이 운동·음식 검색을 어떻게 쓰는지 알려 주는 섹션.
 * 검색어 입력 → 조건 선택 → 결과 확인 3단계(실제 순서가 있는 내용이라 번호를 쓴다)와,
 * 운동 검색·음식 검색 각각의 사용법 소개 카드로 구성한다.
 */
export default function HomeDiscovery() {
  return (
    <section aria-labelledby="home-discovery-title">
      <h2
        id="home-discovery-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        처음이라면 여기부터
      </h2>
      <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
        {HOME_GUIDE_TEXT.lead}
      </p>
      {/* 번호 원을 선으로 이어 "이 순서대로"라는 흐름이 보이게 한다. 선은 장식이라 CSS로만 그린다. */}
      <ol
        aria-label={HOME_GUIDE_TEXT.flowLabel}
        className="mt-4 flex items-start"
      >
        {HOME_GUIDE_STEPS.map((step, index) => (
          <li
            key={step}
            className={`relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center text-support font-normal text-content ${
              index < HOME_GUIDE_STEPS.length - 1
                ? 'after:absolute after:top-3 after:left-1/2 after:h-px after:w-full after:bg-brand/30'
                : ''
            }`}
          >
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-support font-semibold text-surface ring-4 ring-page">
              {index + 1}
            </span>
            <span className="px-1">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-3">
        {HOME_GUIDE_TOPICS.map((topic) => (
          <SearchGuideTopic key={topic.category} topic={topic} />
        ))}
      </div>
      <p className="mt-4 text-support leading-relaxed font-normal text-pretty text-muted">
        {HOME_GUIDE_TEXT.guestNote}
      </p>
    </section>
  )
}
