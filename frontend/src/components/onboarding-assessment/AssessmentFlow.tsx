import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link } from 'react-router'
import { ASSESSMENT_TEXT } from '../../onboarding-assessment/assessmentLabels.ts'
import type { AssessmentRepository } from '../../onboarding-assessment/assessmentRepository.ts'
import { useAssessmentFlow } from '../../onboarding-assessment/useAssessmentFlow.ts'
import { endSignupExperienceOnLeave } from '../../signup-experience/signupExperience.ts'
import ExperienceBanner from '../signup-experience/ExperienceBanner.tsx'
import AssessmentIntro from './AssessmentIntro.tsx'
import AssessmentNav from './AssessmentNav.tsx'
import AssessmentNotice from './AssessmentNotice.tsx'
import AssessmentProgress from './AssessmentProgress.tsx'
import AssessmentQuestionView from './AssessmentQuestionView.tsx'
import AssessmentResultView from './AssessmentResultView.tsx'
import { primaryButtonClass } from './assessmentStyles.ts'

interface AssessmentFlowProps {
  repository: AssessmentRepository
  /** 임시 데이터를 저장하는 주체 ID(로그인한 회원 ID 또는 가입 체험 ID) */
  userId: string
  /** true이면 개발용 가입 체험 중이다. 결과를 확인하고 홈으로 갈 때 체험을 끝내 임시 데이터를 지운다. */
  experience: boolean
}

/**
 * 운동·식단 이해도 확인의 화면 흐름: 안내 → 문항(4개) → 결과.
 * 이미 완료한 응시는 안내·문항 없이 바로 결과만 보여 준다. 응답이 일부 있는 채로 새로고침하면 안내를 건너뛰고 그 문항으로 돌아간다.
 *
 * 포커스: 사용자가 안내→문항, 문항 이동, 결과 확인을 했을 때만 새 제목으로 포커스를 옮겨 화면 전환을 알린다.
 * 처음 열 때와 새로고침 복구 때는 포커스를 가져가지 않는다(SurveyPage와 같은 규칙).
 *
 * 가로 여백은 px로 고정한다(-mx-5 px-[20px]): 본문 여백(rem)을 되찾은 뒤 20px를 다시 둔다. 글자를 200%로 키워도 본문 폭이 줄지 않게 한다.
 * AppShell 본문의 위아래 여백(1.25rem×2)을 뺀 높이를 채워 하단 버튼을 아래에 둔다. 이 라우트는 AppBar를 그리지 않으므로(hideAppBar) AppBar 높이는 빼지 않는다.
 */
export default function AssessmentFlow({
  repository,
  userId,
  experience,
}: AssessmentFlowProps) {
  const flow = useAssessmentFlow(repository, userId)
  const [direction, setDirection] = useState<'next' | 'back'>('next')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const movedRef = useRef(false)
  const isMock = repository.kind === 'mock'

  // 출제가 비어 있으면(문항 0개) 화면을 그릴 수 없으므로 불러오기 오류와 같이 안내한다.
  const emptySession =
    flow.status === 'ready' &&
    flow.attempt?.state === 'open' &&
    flow.total === 0
  const view = emptySession
    ? 'error'
    : flow.status !== 'ready'
      ? flow.status
      : flow.attempt?.state === 'completed'
        ? 'result'
        : flow.started
          ? 'question'
          : 'intro'

  useEffect(() => {
    if (movedRef.current) headingRef.current?.focus()
  }, [view, flow.index])

  function handleStart() {
    movedRef.current = true
    flow.start()
  }

  function handlePrevious() {
    movedRef.current = true
    setDirection('back')
    flow.goTo(flow.index - 1)
  }

  /**
   * 홈으로 가기. 가입 체험 중이면 이 화면을 떠날 때 체험이 끝나도록 예약한다(실제 종료는 접근 게이트가 사라질 때).
   * 이동은 링크가 그대로 처리하고, 이동이 반영되기 전에 체험을 지우지 않아 접근 제한 안내가 깜빡이지 않는다.
   * 새 탭 열기 같은 수정 키 클릭은 예약하지 않는다(체험이 남아 있고 체험 종료 버튼으로 끝낼 수 있다).
   */
  function handleGoHome(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !experience ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    endSignupExperienceOnLeave()
  }

  function handleNext() {
    movedRef.current = true
    if (flow.index === flow.total - 1) {
      flow.submit()
      return
    }
    setDirection('next')
    flow.goTo(flow.index + 1)
  }

  return (
    <div className="-mx-5 flex min-h-[calc(100dvh-2.5rem)] flex-col px-[20px] break-keep wrap-anywhere">
      {/* 이 화면은 자체 h1(handle.ownH1)을 가진다. 보조기기용이라 눈에는 보이지 않는다. */}
      <h1 className="sr-only">{ASSESSMENT_TEXT.title}</h1>
      {/* 개발용 가입 체험 중일 때만 보인다(그 외에는 렌더링되지 않는다). 안내·문제 화면을 방해하지 않도록 조용한 형태다. */}
      <ExperienceBanner endOnLeave variant="quiet" />
      {view === 'loading' || view === 'error' ? (
        <AssessmentNotice kind={view} onRetry={flow.reload} />
      ) : null}

      {view === 'intro' ? (
        <>
          {flow.restarted ? (
            <p
              role="status"
              className="mb-4 rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content"
            >
              {ASSESSMENT_TEXT.restarted}
            </p>
          ) : null}
          <AssessmentIntro
            headingRef={headingRef}
            isMock={isMock}
            total={flow.total}
          />
          <div className="mt-auto flex pt-5">
            <button
              type="button"
              onClick={handleStart}
              className={primaryButtonClass}
            >
              {ASSESSMENT_TEXT.start} <span aria-hidden="true">→</span>
            </button>
          </div>
        </>
      ) : null}

      {view === 'question' && flow.question ? (
        <>
          <AssessmentProgress current={flow.index + 1} total={flow.total} />
          <AssessmentQuestionView
            question={flow.question}
            selectedChoiceId={flow.answers[flow.question.id]}
            direction={direction}
            headingRef={headingRef}
            isMock={isMock}
            disabled={flow.submitting}
            onSelect={(choiceId) => {
              if (flow.question) flow.select(flow.question.id, choiceId)
            }}
          />
          <AssessmentNav
            index={flow.index}
            total={flow.total}
            answered={flow.currentAnswered}
            submitting={flow.submitting}
            submitFailed={flow.submitFailed}
            onPrevious={handlePrevious}
            onNext={handleNext}
          />
        </>
      ) : null}

      {view === 'result' && flow.attempt?.state === 'completed' ? (
        <>
          <AssessmentResultView
            result={flow.attempt.result}
            headingRef={headingRef}
            isMock={isMock}
          />
          <div className="mt-auto flex pt-5">
            <Link
              to="/home"
              onClick={handleGoHome}
              className={primaryButtonClass}
            >
              {ASSESSMENT_TEXT.goHome}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}
