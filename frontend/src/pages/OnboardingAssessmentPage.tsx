import { useMemo } from 'react'
import AssessmentFlow from '../components/onboarding-assessment/AssessmentFlow.tsx'
import AssessmentNotice from '../components/onboarding-assessment/AssessmentNotice.tsx'
import ExperienceBanner from '../components/signup-experience/ExperienceBanner.tsx'
import { ASSESSMENT_TEXT } from '../onboarding-assessment/assessmentLabels.ts'
import { createAssessmentRepository } from '../onboarding-assessment/assessmentSource.ts'
import { useOnboardingSubject } from '../signup-experience/useOnboardingSubject.ts'

/**
 * 운동·식단 이해도 확인(최초 회원가입 후 지식 진단). `/onboarding/assessment`.
 *
 * 화면명세 v5.0에 없는 화면이라 화면 ID는 미정이고, URL은 사용자 지시로 정했다. 정답이 있는 별도의 평가이며
 * A02 초기설문(프로필 설문)·운동·식단 학습 퀴즈(H02)와 데이터·평가·화면을 공유하지 않는다. 의료적 진단이 아니다.
 *
 * 최종 흐름은 A03 회원가입 → P05 → A02 → 이해도 확인 → 결과 → H01 홈이다. 지금은 가입·인증이 완성되지 않아
 * 개발 서버에서만 가입 체험(A03 → 이 화면 → 홈, P05·A02는 건너뜀)으로 이어지고, 로그인한 개발용 계정은 주소로 직접 접근할 수도 있다.
 * 접근 제한은 라우터의 AuthOrExperienceGate가 맡는다(운영 빌드에서는 로그인 안내).
 *
 * 저장 주체(subject)는 로그인한 회원이 우선이고, 없으면 가입 체험이다. 출제·응답·결과는 주체별로 분리되어 서로 읽지 않는다.
 * 출제·채점·결과 저장은 AssessmentRepository가 맡는다. 개발 서버에서는 Mock 저장소를, 운영 빌드에서는 "이용 불가"를 쓴다.
 */
export default function OnboardingAssessmentPage() {
  const subject = useOnboardingSubject()
  const subjectId = subject?.id ?? null
  // 주체가 바뀌면 저장소를 새로 만든다(다른 주체의 출제·응답을 이어 쓰지 않는다).
  const repository = useMemo(
    () => (subjectId === null ? null : createAssessmentRepository(subjectId)),
    [subjectId],
  )

  // 게이트 안에 있어 로그인한 회원이나 가입 체험 중인 사용자에게만 렌더링된다. 주체가 없는 경우는 도달하지 않는다.
  if (subject === null || subjectId === null) return null

  if (repository === null) {
    return (
      <div className="-mx-5 flex min-h-[calc(100dvh-2.5rem)] flex-col px-[20px] break-keep wrap-anywhere">
        <h1 className="sr-only">{ASSESSMENT_TEXT.title}</h1>
        <ExperienceBanner endOnLeave variant="quiet" />
        <AssessmentNotice kind="unavailable" />
      </div>
    )
  }

  // key: 주체가 바뀌면 흐름 상태를 처음부터 다시 만든다.
  return (
    <AssessmentFlow
      key={subjectId}
      repository={repository}
      userId={subjectId}
      experience={subject.kind === 'experience'}
    />
  )
}
