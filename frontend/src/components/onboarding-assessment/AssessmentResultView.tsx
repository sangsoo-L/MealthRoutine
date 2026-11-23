import type { Ref } from 'react'
import {
  ASSESSMENT_DOMAIN_LABEL,
  ASSESSMENT_LEVEL_LABEL,
  ASSESSMENT_LEVEL_NOTE,
  ASSESSMENT_TEXT,
} from '../../onboarding-assessment/assessmentLabels.ts'
import type {
  AssessmentDomain,
  AssessmentResult,
} from '../../onboarding-assessment/assessmentTypes.ts'
import Icon from '../icons/Icon.tsx'
import MockBadge from './MockBadge.tsx'
import { cardClass } from './assessmentStyles.ts'

interface AssessmentResultViewProps {
  result: AssessmentResult
  headingRef: Ref<HTMLHeadingElement>
  isMock: boolean
}

const DOMAIN_ROWS: ReadonlyArray<{
  domain: AssessmentDomain
  icon: 'dumbbell' | 'utensils'
  tone: string
}> = [
  {
    domain: 'exercise',
    icon: 'dumbbell',
    tone: 'bg-exercise-soft text-exercise',
  },
  { domain: 'meal', icon: 'utensils', tone: 'bg-meal-soft text-meal' },
]

/**
 * 결과 화면. 운동·식단 이해도 단계를 따로 보여 준다.
 * 정답·해설·정답 수는 보여 주지 않는다(결과 데이터에도 없다). 단계는 영문 코드를 한국어 라벨로 바꿔 표시한다.
 * Mock 저장소의 결과는 "개발용 예시 결과"로 표시해 실제 사용자 평가로 오인되지 않게 한다.
 */
export default function AssessmentResultView({
  result,
  headingRef,
  isMock,
}: AssessmentResultViewProps) {
  return (
    <section aria-labelledby="assessment-result-title" className={cardClass}>
      {isMock ? (
        <div className="mb-3">
          <MockBadge>{ASSESSMENT_TEXT.mockResultBadge}</MockBadge>
        </div>
      ) : null}
      <h2
        ref={headingRef}
        id="assessment-result-title"
        tabIndex={-1}
        className="mb-2 text-app-title leading-snug font-semibold text-content focus:outline-none"
      >
        {ASSESSMENT_TEXT.resultHeading}
      </h2>
      <p className="text-body leading-relaxed font-normal text-muted">
        {ASSESSMENT_TEXT.resultBody}
      </p>

      <dl className="mt-5 flex flex-col gap-3">
        {DOMAIN_ROWS.map(({ domain, icon, tone }) => {
          const level = result[domain]
          return (
            <div key={domain} className={`rounded-card p-4 ${tone}`}>
              <dt className="flex items-center gap-2 text-section-title leading-snug font-semibold">
                <Icon name={icon} size={20} />
                {ASSESSMENT_DOMAIN_LABEL[domain]} 이해도
              </dt>
              <dd className="mt-2">
                <span className="block text-metric leading-none font-semibold text-content">
                  {ASSESSMENT_LEVEL_LABEL[level]}
                </span>
                <span className="mt-2 block text-support leading-relaxed font-normal text-muted">
                  {ASSESSMENT_LEVEL_NOTE[level]}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="mt-4 text-support leading-relaxed font-normal text-muted">
        {ASSESSMENT_TEXT.resultNote}
      </p>
    </section>
  )
}
