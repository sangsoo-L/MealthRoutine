import {
  HOME_GUIDE_STEPS,
  HOME_GUIDE_TEXT,
  HOME_GUIDE_TOPICS,
} from '../home/homeContent.ts'
import SearchGuideTopic from '../home/SearchGuideTopic.tsx'
import LandingSectionHeader from './LandingSectionHeader.tsx'
import { LANDING_EXPLORE, LANDING_EXPLORE_ID } from './landingContent.ts'

/**
 * 비회원 탐색("가입 없이 둘러보기"). 운동 찾기·음식 찾기 사용법을 미리 보여 주고, 비회원에게 열려 있는 두 검색 화면으로 보낸다.
 * 로그인 홈에서 옮겨 온 "검색 튜토리얼"(검색어 입력 → 조건 선택 → 결과 확인 3단계와 운동·음식 검색 미리보기)을 이 섹션에 통합했다.
 * 예전의 "운동 찾기·음식 찾기" 타일 두 개는 같은 두 화면으로 가는 링크라 미리보기 카드의 시작하기 버튼과 겹쳐 없앴다(경로는 그대로다).
 *
 * - 헤더와 히어로의 "둘러보기" 앵커가 도착하는 곳이다. 앵커가 이 섹션으로 포커스를 옮기므로 tabIndex={-1}을 둔다.
 *   Tab 순서에는 들어가지 않고, 코드로만 받는 포커스라 윤곽선을 그리지 않는다(다음 Tab의 첫 링크에서 보인다).
 * - 미리보기의 검색어·조건·결과는 기능 설명용 예시이며 실제 검색 결과가 아니다(카드 안에 "검색 화면 미리보기 · 예시"라고 밝힌다).
 *   미리보기는 눌러 볼 수 없는 그림이고, 눌리는 것은 각 카드의 "시작하기" 링크뿐이다. 두 화면은 정식 화면이라 상태 문구가 없다.
 * - 앞 섹션과 구분되는 흰 전면 띠다. 카드(SearchGuideTopic)는 폭이 모자라면 안에서 줄을 바꾸고 가로 스크롤이 생기지 않는다.
 */
export default function LandingExplore() {
  return (
    <section
      id={LANDING_EXPLORE_ID}
      aria-labelledby="landing-explore-title"
      tabIndex={-1}
      className="-mx-5 scroll-mt-4 bg-surface px-[20px] py-12 outline-none"
    >
      <LandingSectionHeader
        id="landing-explore-title"
        title={LANDING_EXPLORE.title}
        description={HOME_GUIDE_TEXT.lead}
      />
      {/*
        순서가 있는 안내라 번호를 쓰되, 원·연결선 없이 "번호 + 단계명"을 작은 라운드 박스 3개로 가로에 놓는다.
        누를 수 있는 진행 표시처럼 보이지 않도록 화살표·강조·링크를 두지 않는다.
        칸의 최소 폭을 "전체의 1/3"로 두고 바닥값(5.5rem)을 둬서, 글자를 키워 칸이 모자라면 열이 줄어 단계명이 끊기지 않는다.
      */}
      <ol
        aria-label={HOME_GUIDE_TEXT.flowLabel}
        className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(max(5.5rem,calc((100%-16px)/3)),1fr))] gap-2"
      >
        {HOME_GUIDE_STEPS.map((step, index) => (
          <li
            key={step}
            className="flex flex-wrap items-baseline justify-center gap-x-1.5 rounded-control bg-brand-soft px-2 py-2.5 text-center text-support leading-snug font-normal text-content"
          >
            <span className="font-semibold text-brand">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-col gap-4">
        {HOME_GUIDE_TOPICS.map((topic) => (
          <SearchGuideTopic key={topic.category} topic={topic} />
        ))}
      </div>
      <p className="mt-5 text-support leading-relaxed font-normal text-pretty text-muted">
        {HOME_GUIDE_TEXT.guestNote}
      </p>
    </section>
  )
}
