import type { Ref } from 'react'
import { ASSESSMENT_TEXT } from '../../onboarding-assessment/assessmentLabels.ts'
import MockBadge from './MockBadge.tsx'

interface AssessmentIntroProps {
  headingRef: Ref<HTMLHeadingElement>
  isMock: boolean
  /** 이번 출제의 문항 수 */
  total: number
}

/**
 * 시작 안내. 모바일 앱 온보딩처럼 한 가지에 집중하는 구성이다: 큰 제목 → 짧은 설명 → 보조 정보, 그리고 아래의 시작 버튼.
 * (레이아웃과 UX 원칙만 참고했다. 카드·테두리·아이콘 같은 장식은 두지 않고 여백으로 구분한다.)
 *
 * - 제목은 타입 스케일에서 가장 큰 text-metric(26/600)을 쓴다. 새 글자 크기를 만들지 않았다. 더 큰 제목이 필요하면 토큰 추가를 먼저 확인한다.
 * - 제목은 줄 단위 블록이라 화면 폭이 좁거나 글자를 키우면 각 줄이 어절 단위로 자연스럽게 줄바꿈된다(강제 줄바꿈 없음).
 * - 설명은 본문(14/400)에 넉넉한 행간이고, 보조 정보는 12/400으로 더 작게 둔다.
 * - 시험처럼 느껴지지 않도록 "정답을 몰라도 괜찮아요"를 분명히 밝힌다. 점수나 판정을 약속하는 문구는 쓰지 않는다.
 * - Mock 저장소일 때만 작은 "개발용 예시" 표시를 제목 위에 둔다(실제 사용자 데이터로 오인되지 않게).
 * 시작 버튼은 이 컴포넌트가 아니라 AssessmentFlow가 화면 아래에 둔다(위치·동작 변경 없음).
 */
export default function AssessmentIntro({
  headingRef,
  isMock,
  total,
}: AssessmentIntroProps) {
  return (
    <section aria-labelledby="assessment-intro-title" className="pt-8">
      {isMock ? (
        <div className="mb-4">
          <MockBadge>{ASSESSMENT_TEXT.mockBadge}</MockBadge>
        </div>
      ) : null}
      <h2
        ref={headingRef}
        id="assessment-intro-title"
        tabIndex={-1}
        className="text-metric leading-snug font-semibold text-content focus:outline-none"
      >
        {ASSESSMENT_TEXT.introTitleLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h2>
      <div className="mt-6 flex flex-col gap-4 text-body leading-relaxed font-normal text-muted">
        <p>{ASSESSMENT_TEXT.introLead(total)}</p>
        <p>{ASSESSMENT_TEXT.introReassure}</p>
      </div>
      <p className="mt-8 text-support leading-relaxed font-normal text-muted">
        {ASSESSMENT_TEXT.introMeta(total)}
      </p>
    </section>
  )
}
