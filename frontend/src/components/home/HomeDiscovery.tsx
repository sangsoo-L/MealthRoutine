import {
  HOME_GUIDE_STEPS,
  HOME_GUIDE_TEXT,
  HOME_GUIDE_TOPICS,
} from './homeContent.ts'
import SearchGuideTopic from './SearchGuideTopic.tsx'
import { sectionBand } from './homeStyles.ts'

interface HomeDiscoveryProps {
  /** 맨 아래 마무리 안내 문장. 비회원·회원 홈이 서로 다른 문장을 쓴다 */
  note: string
}

/**
 * v5.0 회원 홈의 "처음이라면 여기부터". 회원 홈(MemberHomePage)이 사용하고, 비회원 랜딩(H01)은 렌더링하지 않는다.
 *
 * "처음이라면 여기부터": 가입 없이 운동·음식 검색을 어떻게 쓰는지 알려 주는 섹션.
 * 검색어 입력 → 조건 선택 → 결과 확인 3단계(실제 순서가 있는 내용이라 번호를 쓴다)와,
 * 운동 검색·음식 검색 각각의 사용법 소개 카드로 구성한다.
 */
export default function HomeDiscovery({ note }: HomeDiscoveryProps) {
  return (
    // 긴 안내 섹션이라 흰 밴드(sectionBand)로 앞뒤 섹션과 면을 나눈다. 안의 검색 예시 카드는 흰 면 위에서 테두리로 구분된다.
    <section aria-labelledby="home-discovery-title" className={sectionBand}>
      <h2
        id="home-discovery-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        처음이라면 여기부터
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
        {HOME_GUIDE_TEXT.lead}
      </p>
      {/*
        순서가 있는 안내라 번호를 쓰되, 원·연결선 없이 "번호 + 단계명"을 작은 라운드 박스 3개로 가로에 놓는다.
        누를 수 있는 진행 표시처럼 보이지 않도록 화살표·강조(현재 단계)·링크를 두지 않는다.
        칸의 최소 폭을 "전체의 1/3"로 두고 바닥값(5.5rem)을 둬서, 글자를 키워 칸이 모자라면 열이 줄어 단계명이 끊기지 않는다.
        (gap-2 = 8px이라 3열 사이 간격은 16px)
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
        {note}
      </p>
    </section>
  )
}
