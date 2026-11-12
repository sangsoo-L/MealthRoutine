import { useState } from 'react'
import { FOCUS_LABEL } from '../../health-goal/goalPolicy.ts'
import type {
  HealthGoalInput,
  HealthGoalState,
  HealthManagementGoal,
} from '../../health-goal/goalTypes.ts'
import type { KnowledgeState } from '../../mypage/mypageTypes.ts'
import HealthGoalSheet from '../health-goal/HealthGoalSheet.tsx'
import RatioBar from '../health-goal/RatioBar.tsx'
import { focusRing, sectionTitleClass } from './myStyles.ts'

interface HealthGoalSummaryProps {
  goal: HealthGoalState
  knowledge: KnowledgeState
  save: (input: HealthGoalInput) => Promise<unknown>
  onRetry: () => void
}

const buttonClass = `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control px-4 text-body leading-snug font-semibold transition-colors motion-reduce:transition-none ${focusRing}`

/**
 * P01 섹션 6. 나의 건강 목표: 운동·식단 관리 비중(운동 중심 · 식단 중심 · 균형 관리)을 확인하고 설정·변경한다.
 *
 * - 목표가 없으면 "목표 설정하기", 있으면 관리 방향과 "운동 70% · 식단 30%"와 비율 막대, "목표 변경"이 보인다. 설정·변경은 같은 화면
 *   위의 바텀시트(HealthGoalSheet)이고 라우트를 늘리지 않는다. 저장이 끝나면 이 영역이 새 값으로 바뀐다.
 * - 값이 없는 세 상태는 문구가 다르다: 불러오는 중 · 불러오지 못함(다시 시도) · 연결 전(조회·저장 수단이 없어 설정 버튼도 없다).
 *   "목표 없음"은 조회가 끝나고 실제로 저장된 목표가 없을 때만이다.
 * - 이해도 등급이 바뀌어도 저장된 목표를 자동으로 바꾸지 않는다(변경은 사용자가 시트에서 직접 한다).
 */
export default function HealthGoalSummary({
  goal,
  knowledge,
  save,
  onRetry,
}: HealthGoalSummaryProps) {
  // 시트를 열 때의 목표를 기억한다. 저장 직후 목표가 바뀌어도 닫히는 동안 시트의 제목·내용이 바뀌지 않는다.
  const [sheet, setSheet] = useState<{
    goal: HealthManagementGoal | null
  } | null>(null)

  let body
  if (goal.status === 'loading') {
    body = (
      <p
        role="status"
        className="text-body leading-snug font-normal text-muted"
      >
        불러오는 중이에요.
      </p>
    )
  } else if (goal.status === 'error') {
    body = (
      <div role="alert">
        <p className="text-body leading-snug font-normal text-danger">
          건강 목표를 불러오지 못했어요.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`${buttonClass} -ml-4 text-brand hover:text-brand-hover`}
        >
          다시 시도
        </button>
      </div>
    )
  } else if (goal.status === 'unavailable') {
    body = (
      <p className="text-body leading-snug font-normal text-muted">
        건강 목표 정보를 아직 불러올 수 없어요.
      </p>
    )
  } else if (goal.goal === null) {
    body = (
      <>
        <p className="text-body leading-relaxed font-normal text-muted">
          어떤 방식으로 건강관리를 시작하고 싶으세요?
        </p>
        <button
          type="button"
          onClick={() => setSheet({ goal: null })}
          className={`${buttonClass} mt-3 w-full bg-brand text-surface hover:bg-brand-hover`}
        >
          목표 설정하기
        </button>
      </>
    )
  } else {
    const current = goal.goal
    body = (
      <>
        <p className="text-section-title leading-snug font-semibold text-content">
          {FOCUS_LABEL[current.focus]}
        </p>
        <p className="mt-0.5 text-body leading-snug font-normal text-muted tabular-nums">
          운동 {current.exerciseRatio}% · 식단 {current.mealRatio}%
        </p>
        <div className="mt-2.5">
          <RatioBar exerciseRatio={current.exerciseRatio} />
        </div>
        <button
          type="button"
          onClick={() => setSheet({ goal: current })}
          className={`${buttonClass} -ml-4 mt-1 text-brand hover:text-brand-hover`}
        >
          목표 변경
        </button>
      </>
    )
  }

  return (
    <section aria-labelledby="my-goal-title" className="p-4">
      <h2 id="my-goal-title" className={sectionTitleClass}>
        나의 건강 목표
      </h2>
      <div className="mt-2.5">{body}</div>

      {sheet ? (
        <HealthGoalSheet
          goal={sheet.goal}
          knowledge={knowledge}
          save={save}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </section>
  )
}
