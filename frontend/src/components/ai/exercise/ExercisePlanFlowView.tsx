import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { EVIDENCE_ISSUE_TEXT } from '../../../ai/exercisePlanEvidence.ts'
import {
  DIFFICULTY_CHOICES,
  INITIAL_PLAN_INPUTS,
  MINUTES_CHOICES,
  PART_CHOICES,
  STEP_TITLE,
  TOOL_CHOICES,
  canProceed,
  isComplete,
  nextStep,
  previousStep,
  togglePart,
  toggleTool,
  type PlanInputs,
  type PlanStep,
} from '../../../ai/exercisePlanFlow.ts'
import {
  approxMinutes,
  buildLocalPlan,
  nextRotation,
  validateConditions,
  type PlanItem,
  type PlanResult,
} from '../../../ai/exercisePlanSelect.ts'
import type { LocalPlanSource } from '../../../ai/exercisePlanSource.ts'
import {
  IDLE_REGISTER,
  useExercisePlanRegister,
  type RegisterController,
} from '../../../ai/useExercisePlanRegister.ts'
import {
  ASSUMED_SECONDS_PER_REP,
  ASSUMED_TRANSITION_SECONDS,
} from '../../../exercise/recommend/rules.ts'
import {
  AI_EXHAUSTED_TEXT,
  type AiAccess,
} from '../../../membership/aiAccess.ts'
import { PATH_MEMBERSHIP } from '../../../membership/membership.ts'
import Icon from '../../icons/Icon.tsx'
import {
  composeCard,
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../../exercise/compose/composeStyles.ts'
import PlanRegisterPanel from './PlanRegisterPanel.tsx'

const choiceBase = `flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-control border px-4 text-left text-body ${composeFocusRing}`
const choiceOn = 'border-exercise bg-exercise-soft font-semibold text-exercise'
const choiceOff =
  'border-line bg-surface font-normal text-content hover:border-exercise/40'

const DIFFICULTY_HINT: Record<string, string> = {
  초급: '처음이거나 가볍게 시작해요',
  중급: '기본 운동에 익숙해요',
  고급: '강도 높은 운동도 해 봤어요',
}

/** 운동 한 줄의 세트·횟수·시간·휴식 글자. 값은 시드 루틴 근거 그대로이고 중량은 값을 만들지 않는다. */
function itemDetail(item: PlanItem): string {
  const amount =
    item.recordType === 'time'
      ? `${item.sets}세트 × ${item.seconds}초`
      : `${item.sets}세트 × ${item.reps}회`
  return `${amount} · 세트 사이 휴식 ${item.restSeconds}초`
}

function StepHeader({
  step,
  titleRef,
}: {
  step: Exclude<PlanStep, 'result'>
  titleRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const index = ['difficulty', 'parts', 'tools', 'minutes'].indexOf(step) + 1
  return (
    <div>
      <p
        data-plan-step={step}
        className="text-support leading-snug font-normal tabular-nums text-muted"
      >
        {index} / 4단계
      </p>
      <h2
        ref={titleRef}
        tabIndex={-1}
        className="mt-1 text-section-title leading-snug font-semibold text-content outline-none"
      >
        {STEP_TITLE[step]}
      </h2>
    </div>
  )
}

function NavRow({
  onBack,
  onNext,
  nextLabel,
  nextEnabled,
}: {
  onBack: (() => void) | null
  onNext: () => void
  nextLabel: string
  nextEnabled: boolean
}) {
  return (
    <div className="mt-4 flex gap-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`${composeSecondaryButton} flex-1`}
        >
          이전
        </button>
      ) : null}
      <button
        type="button"
        aria-disabled={!nextEnabled || undefined}
        onClick={() => {
          if (nextEnabled) onNext()
        }}
        className={`${composePrimaryButton} flex-1 aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted`}
      >
        {nextLabel}
      </button>
    </div>
  )
}

export function ResultView({
  plan,
  notice,
  onReroll,
  onEdit,
  register = IDLE_REGISTER,
}: {
  plan: PlanResult
  notice: string | null
  onReroll: () => void
  onEdit: () => void
  /** 목록 등록 동작. 없으면 등록할 수 없는 상태(비활성)로 그린다. */
  register?: RegisterController
}) {
  const c = plan.conditions
  const minutes = approxMinutes(plan.totalSeconds)
  return (
    <div className="flex flex-col gap-4" data-plan-status={plan.status}>
      {c ? (
        <ul role="list" aria-label="고른 조건" className="flex flex-wrap gap-2">
          {[
            c.difficulty,
            c.parts.join(' · '),
            c.tools.join(' · '),
            `${c.minutes}분 이내`,
          ].map((label) => (
            <li
              key={label}
              className="rounded-full border border-line bg-surface px-3 py-1 text-support leading-snug font-semibold text-content"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      {plan.status === 'ok' ? (
        <section aria-labelledby="plan-items-title" className={composeCard}>
          <h2 id="plan-items-title" className={composeSectionTitle}>
            추천 운동 목록 예시
          </h2>
          <ol role="list" className="mt-3 flex flex-col gap-2">
            {plan.items.map((item, index) => (
              <li
                key={item.exerciseId}
                data-plan-item={item.exerciseId}
                className="flex items-start gap-3 rounded-control border border-line bg-surface px-3 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-support leading-none font-semibold tabular-nums text-exercise"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-snug font-semibold text-content">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block text-support leading-snug font-normal tabular-nums text-muted">
                    {item.category} · {item.tools.join(', ')}
                  </span>
                  <span className="mt-0.5 block text-support leading-snug font-normal tabular-nums text-content">
                    {itemDetail(item)}
                  </span>
                  {item.needsWeight ? (
                    <span
                      data-needs-weight=""
                      className="mt-1 inline-block rounded-full bg-page px-2.5 py-0.5 text-support leading-snug font-semibold text-muted"
                    >
                      중량은 직접 입력해요
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          <div
            data-plan-total=""
            className="mt-3 rounded-control bg-exercise-soft px-3 py-2"
          >
            <p className="text-body leading-snug font-semibold text-exercise">
              예상 총 소요 시간 약 {minutes}분
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              세트 사이 휴식과 운동 사이 전환을 포함한 추정이며 고른{' '}
              {plan.conditions?.minutes}분 이내예요. 횟수는 1회에 약{' '}
              {ASSUMED_SECONDS_PER_REP}초, 운동 사이 전환은{' '}
              {ASSUMED_TRANSITION_SECONDS}초로 계산했고 실제 시간과 다를 수
              있어요. 중량은 자동으로 정하지 않아요.
            </p>
          </div>
          {plan.notSelectedCount > 0 ? (
            <p
              data-plan-more=""
              className="mt-3 text-support leading-relaxed font-normal text-muted"
            >
              조건에 맞는 다른 운동이 {plan.notSelectedCount}개 더 있어요. 다시
              추천을 누르면 다른 구성을 볼 수 있어요.
            </p>
          ) : null}
        </section>
      ) : (
        <section
          aria-labelledby="plan-empty-title"
          data-plan-empty={plan.status}
          className={composeCard}
        >
          <h2 id="plan-empty-title" className={composeSectionTitle}>
            {plan.status === 'noCandidates'
              ? '조건에 맞는 운동이 없어요'
              : plan.status === 'noPlannable'
                ? '목록에 넣을 수 있는 운동이 없어요'
                : plan.status === 'timeShort'
                  ? '고른 시간 안에 들어가는 운동이 없어요'
                  : '조건을 확인할 수 없어요'}
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {plan.status === 'noCandidates'
              ? '난이도·부위·도구를 모두 만족하는 운동이 카탈로그에 없어요. 조건은 자동으로 바꾸지 않았어요. 조건을 수정해 다시 골라 주세요.'
              : plan.status === 'noPlannable'
                ? '조건에 맞는 운동은 있지만 같은 난이도의 운동량 기준이 없어 목록에 넣지 않았어요. 아래 후보를 참고하고 조건을 수정해 보세요.'
                : plan.status === 'timeShort'
                  ? '운동량 기준이 있는 운동은 있지만 고른 시간 안에 들어가지 않아요. 더 긴 시간을 골라 보세요.'
                  : '조건을 다시 골라 주세요.'}
          </p>
        </section>
      )}

      {plan.excluded.length > 0 ? (
        <section
          aria-labelledby="plan-excluded-title"
          data-plan-excluded=""
          className={composeCard}
        >
          <h2 id="plan-excluded-title" className={composeSectionTitle}>
            운동량 기준이 없어 목록에 넣지 않은 후보 {plan.excluded.length}개
          </h2>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            이름과 부위만 알려 드려요. 근거 없는 세트·횟수·시간은 만들지 않아요.
          </p>
          <ul role="list" className="mt-3 flex flex-col gap-2">
            {plan.excluded.map((item) => (
              <li
                key={item.exerciseId}
                data-excluded-item={item.exerciseId}
                className="flex items-start justify-between gap-3 text-body leading-snug font-normal text-content"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{item.name}</span>
                  <span className="block text-support text-muted">
                    {item.category} · {item.tools.join(', ')}
                  </span>
                </span>
                <span className="max-w-[45%] shrink-0 text-right text-support leading-snug text-muted">
                  {EVIDENCE_ISSUE_TEXT[item.reason]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p
            data-plan-notice=""
            className="rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise"
          >
            {notice}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-disabled={plan.status !== 'ok' || undefined}
          onClick={() => {
            if (plan.status === 'ok') onReroll()
          }}
          className={`${composeSecondaryButton} aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted`}
        >
          다시 추천
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={composeSecondaryButton}
        >
          조건 수정
        </button>
      </div>

      <PlanRegisterPanel plan={plan} register={register} />
    </div>
  )
}

/**
 * I02-1 AI 운동 플랜 · 조건 선택과 추천(`/ai/exercise/plan`, 회원 전용) 본문. 난이도 → 부위 → 도구 → 시간 4단계를 한 번에 한 질문으로 받고,
 * 같은 난이도 시드 루틴의 운동량 근거로 만든 **로컬 예시** 목록을 보여 준다(실제 AI 추천이 아니다). 이전 단계로 돌아가도 선택값을 유지한다.
 * 결과의 "목록 등록"은 추천을 기존 운동 초안으로 바꿔 오늘/내일 목록으로 등록하고 운동 목록 편집(W02)으로 보낸다(저장은 W02·W11의 기존 절차).
 * 접근 상태(access)는 서버가 확인한 통합 AI 사용량에서만 나온다. 서버 미연결(unknown)에서도 로컬 예시는 AI 요청이 아니라 그대로 열리고,
 * 서버가 확인한 잔여가 0(exhausted)이면 새 요청을 제한하는 안내만 보인다. 남은 횟수 숫자를 만들거나 권한 검증을 한 것처럼 표현하지 않는다.
 */
export default function ExercisePlanFlowView({
  access,
  source,
}: {
  access: AiAccess
  /** 추천에 쓸 운동 데이터. 없으면(운영 빌드 등) 준비 중으로 안내한다. */
  source: LocalPlanSource | null
}) {
  const [step, setStep] = useState<PlanStep>('difficulty')
  const [inputs, setInputs] = useState<PlanInputs>(INITIAL_PLAN_INPUTS)
  const [plan, setPlan] = useState<PlanResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  // 훅 순서를 지키려고 아래의 조기 반환보다 먼저 부른다.
  const register = useExercisePlanRegister(plan, source)

  // 단계가 바뀌면 새 제목으로 포커스를 옮겨 보조기기가 읽게 한다(처음 열 때는 옮기지 않는다).
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    if (step === 'result') resultRef.current?.focus()
    else titleRef.current?.focus()
  }, [step])

  const header = (
    <header>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          AI 운동 플랜
        </h1>
        <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-semibold text-exercise">
          로컬 예시
        </span>
      </div>
      <p
        role="note"
        data-local-example-note=""
        className="mt-3 rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise"
      >
        실제 AI가 만든 추천이 아니에요. 기존 운동 데이터와 시드 루틴의 운동량
        기준으로 구성한 예시예요.
      </p>
    </header>
  )

  if (source === null) {
    return (
      <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
        {header}
        <section className={composeCard} data-plan-unavailable="">
          <h2 className={composeSectionTitle}>준비 중이에요</h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            추천에 쓸 운동 데이터가 아직 연결되지 않아 지금은 이용할 수 없어요.
          </p>
        </section>
      </div>
    )
  }

  if (access === 'exhausted') {
    return (
      <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
        {header}
        <section
          role="status"
          className={composeCard}
          data-plan-access="exhausted"
        >
          <h2 className={composeSectionTitle}>{AI_EXHAUSTED_TEXT.title}</h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {AI_EXHAUSTED_TEXT.body}
          </p>
          <Link
            to={PATH_MEMBERSHIP}
            state={{ from: '/ai/exercise/plan' }}
            className={`mt-3 ${composeSecondaryButton}`}
          >
            {AI_EXHAUSTED_TEXT.link}
          </Link>
          <Link to="/ai/exercise" className={`mt-2 ${composeSecondaryButton}`}>
            AI 운동 플랜 안내로 돌아가기
          </Link>
        </section>
      </div>
    )
  }

  function build(rotation: number, base: PlanInputs): PlanResult {
    return buildLocalPlan({
      conditions: base,
      rotation,
      exercises: (source as LocalPlanSource).exercises,
      evidence: (source as LocalPlanSource).evidence,
    })
  }

  function showResult(base: PlanInputs) {
    if (!validateConditions(base).ok) return
    setPlan(build(0, base))
    setNotice(null)
    setStep('result')
  }

  function reroll() {
    if (!plan || plan.status !== 'ok') return
    const input = {
      conditions: inputs,
      exercises: source!.exercises,
      evidence: source!.evidence,
    }
    const rotation = nextRotation(input, plan)
    if (rotation === null) {
      setNotice('바꿀 수 있는 다른 구성이 없어요. 조건을 수정해 보세요.')
      return
    }
    setPlan(build(rotation, inputs))
    setNotice('다른 구성으로 바꿨어요.')
  }

  const current = step === 'result' ? null : step
  const back = current ? previousStep(current) : null

  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      {header}

      {current === 'difficulty' ? (
        <section aria-label="난이도 선택" className={composeCard}>
          <StepHeader step="difficulty" titleRef={titleRef} />
          <div
            role="group"
            aria-label="난이도"
            className="mt-3 flex flex-col gap-2"
          >
            {DIFFICULTY_CHOICES.map((value) => {
              const on = inputs.difficulty === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  data-choice={value}
                  onClick={() => {
                    // 단일 선택은 고르면 바로 다음 단계로 간다.
                    setInputs({ ...inputs, difficulty: value })
                    setStep(nextStep('difficulty'))
                  }}
                  className={`${choiceBase} ${on ? choiceOn : choiceOff}`}
                >
                  <span>
                    <span className="block">{value}</span>
                    <span className="block text-support font-normal text-muted">
                      {DIFFICULTY_HINT[value]}
                    </span>
                  </span>
                  {on ? <Icon name="clipboard-check" size={20} /> : null}
                </button>
              )
            })}
          </div>
          {inputs.difficulty ? (
            <NavRow
              onBack={null}
              onNext={() => setStep(nextStep('difficulty'))}
              nextLabel="다음"
              nextEnabled
            />
          ) : null}
        </section>
      ) : null}

      {current === 'parts' ? (
        <section aria-label="운동 부위 선택" className={composeCard}>
          <StepHeader step="parts" titleRef={titleRef} />
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            하나 이상 골라요. 고른 부위를 돌아가며 구성해요.
          </p>
          <div
            role="group"
            aria-label="운동 부위"
            className="mt-3 grid grid-cols-2 gap-2"
          >
            {PART_CHOICES.map((value) => {
              const on = inputs.parts.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  data-choice={value}
                  onClick={() =>
                    setInputs({
                      ...inputs,
                      parts: togglePart(inputs.parts, value),
                    })
                  }
                  className={`${choiceBase} ${on ? choiceOn : choiceOff}`}
                >
                  {value}
                  {on ? <Icon name="clipboard-check" size={20} /> : null}
                </button>
              )
            })}
          </div>
          {inputs.parts.length === 0 ? (
            <p
              role="status"
              data-hint="parts"
              className="mt-2 text-support leading-relaxed font-normal text-muted"
            >
              부위를 하나 이상 골라 주세요.
            </p>
          ) : null}
          <NavRow
            onBack={() => back && setStep(back)}
            onNext={() => setStep(nextStep('parts'))}
            nextLabel="다음"
            nextEnabled={canProceed('parts', inputs)}
          />
        </section>
      ) : null}

      {current === 'tools' ? (
        <section aria-label="운동 도구 선택" className={composeCard}>
          <StepHeader step="tools" titleRef={titleRef} />
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            하나 이상 골라요. 고른 도구만 쓰는 운동으로 구성해요. 맨몸 운동도
            원하면 &lsquo;맨몸&rsquo;을 직접 골라 주세요.
          </p>
          <div
            role="group"
            aria-label="운동 도구"
            className="mt-3 grid grid-cols-2 gap-2"
          >
            {TOOL_CHOICES.map((value) => {
              const on = inputs.tools.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  data-choice={value}
                  onClick={() =>
                    setInputs({
                      ...inputs,
                      tools: toggleTool(inputs.tools, value),
                    })
                  }
                  className={`${choiceBase} ${on ? choiceOn : choiceOff}`}
                >
                  {value}
                  {on ? <Icon name="clipboard-check" size={20} /> : null}
                </button>
              )
            })}
          </div>
          {inputs.tools.length === 0 ? (
            <p
              role="status"
              data-hint="tools"
              className="mt-2 text-support leading-relaxed font-normal text-muted"
            >
              도구를 하나 이상 골라 주세요.
            </p>
          ) : null}
          <NavRow
            onBack={() => back && setStep(back)}
            onNext={() => setStep(nextStep('tools'))}
            nextLabel="다음"
            nextEnabled={canProceed('tools', inputs)}
          />
        </section>
      ) : null}

      {current === 'minutes' ? (
        <section aria-label="운동 시간 선택" className={composeCard}>
          <StepHeader step="minutes" titleRef={titleRef} />
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            휴식과 운동 사이 전환을 포함한 시간 상한이에요. 시간을 채우려고
            운동을 더하지 않아요.
          </p>
          <div
            role="group"
            aria-label="운동 시간"
            className="mt-3 flex flex-col gap-2"
          >
            {MINUTES_CHOICES.map((value) => {
              const on = inputs.minutes === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  data-choice={String(value)}
                  onClick={() => {
                    const next = { ...inputs, minutes: value }
                    setInputs(next)
                    showResult(next)
                  }}
                  className={`${choiceBase} ${on ? choiceOn : choiceOff}`}
                >
                  <span className="tabular-nums">{value}분</span>
                  {on ? <Icon name="clipboard-check" size={20} /> : null}
                </button>
              )
            })}
          </div>
          <NavRow
            onBack={() => back && setStep(back)}
            onNext={() => showResult(inputs)}
            nextLabel="추천 보기"
            nextEnabled={isComplete(inputs)}
          />
        </section>
      ) : null}

      {step === 'result' && plan ? (
        <section
          aria-labelledby="plan-result-title"
          className="flex flex-col gap-3"
        >
          <h2
            id="plan-result-title"
            ref={resultRef}
            tabIndex={-1}
            className="text-section-title leading-snug font-semibold text-content outline-none"
          >
            로컬 예시 추천 결과
          </h2>
          <ResultView
            plan={plan}
            notice={notice}
            onReroll={reroll}
            register={register}
            onEdit={() => {
              setPlan(null)
              setNotice(null)
              setStep('difficulty')
            }}
          />
        </section>
      ) : null}
    </div>
  )
}
