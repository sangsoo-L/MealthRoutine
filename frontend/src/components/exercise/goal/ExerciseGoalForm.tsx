import { useMemo, useRef, useState, type FormEvent } from 'react'
import {
  calculateExerciseGoal,
  beginnerBmiGoals,
  exerciseGoalMode,
  goalPurposes,
  initialGoalDraft,
  PURPOSE_LABEL,
  TIER_LABEL,
  type GoalIssue,
} from '../../../exercise-goal/exerciseGoalPolicy.ts'
import { exerciseGoalMessage } from '../../../exercise-goal/exerciseGoalMessages.ts'
import {
  GoalActivityPicker,
  GoalActivityReference,
} from './GoalActivitySection.tsx'
import type {
  ExerciseGoal,
  ExerciseGoalContext,
  ExerciseGoalDraft,
  ExerciseGoalProfile,
} from '../../../exercise-goal/exerciseGoalTypes.ts'
import {
  goalCard,
  goalFocus,
  goalHeading,
  goalInput,
  goalPrimary,
  goalSecondary,
} from './goalStyles.ts'

const descriptions = {
  lose: '현재 체중의 5% 이내에서 첫 감량 목표를 준비해요.',
  learn: '주 3회, 10분씩 맨몸 운동을 하며 활동량을 알아봐요.',
  maintain: '현재 체중을 기준으로 활동을 이어가요.',
  bulk: '목표 체중과 근력 운동 계획을 직접 정해요.',
}

export default function ExerciseGoalForm({
  context,
  profile,
  saved,
  save,
  editProfile,
  cancel,
}: {
  context: ExerciseGoalContext
  profile: ExerciseGoalProfile
  saved: ExerciseGoal | null
  save: (draft: ExerciseGoalDraft) => Promise<void>
  editProfile: () => void
  cancel: () => void
}) {
  const [draft, setDraft] = useState(() =>
    initialGoalDraft(context, profile, saved),
  )
  const [issues, setIssues] = useState<readonly GoalIssue[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const mode = exerciseGoalMode(context.exerciseTier)
  const bmiGoals = beginnerBmiGoals(profile)
  const usesActivity =
    mode === 'simple' && (draft.purpose === 'learn' || draft.purpose === 'lose')
  const previousLearningNeedsReview =
    mode === 'simple' &&
    saved?.purpose === 'learn' &&
    (saved.calculationVersion ?? 1) < 4
  const previousLossNeedsReview =
    mode === 'simple' &&
    saved?.mode === 'simple' &&
    saved.purpose === 'lose' &&
    (saved.calculationVersion ?? 1) < 3 &&
    saved.targetWeightKg < bmiGoals.lossTargetWeightKg
  const calculation = useMemo(
    () => calculateExerciseGoal(draft, context, profile),
    [draft, context, profile],
  )
  function update(field: keyof ExerciseGoalDraft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setIssues([])
    setError('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    if (!calculation.ok) {
      setIssues(calculation.issues)
      document.getElementById(`goal-${calculation.issues[0].field}`)?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await save(draft)
    } catch (reason) {
      setError(exerciseGoalMessage(reason))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const hasIssue = (field: keyof ExerciseGoalDraft) =>
    issues.some((issue) => issue.field === field)
  return (
    <div className="flex flex-col gap-5">
      {saved ? (
        <section className={goalCard} aria-labelledby="goal-current-title">
          <h2 id="goal-current-title" className={goalHeading}>
            현재 설정된 목표
          </h2>
          <p className="mt-2 text-body font-semibold tabular-nums text-content">
            {PURPOSE_LABEL[saved.purpose]} ·{' '}
            {saved.purpose === 'learn' && saved.calculationVersion === 4
              ? '운동 습관 만들기'
              : `${saved.targetWeightKg.toFixed(1)} kg`}
          </p>
          <p className="mt-1 text-support text-muted">
            주 {saved.daysPerWeek}회 · 1회 {saved.minutesPerSession}분
          </p>
          {previousLossNeedsReview ? (
            <p
              role="note"
              className="mt-3 text-support leading-relaxed text-muted"
            >
              이전 계산 기준으로 저장된 목표예요. 첫 감량 폭을 줄였으니 아래의
              1차 목표를 확인해 주세요. 다시 저장하기 전까지 기존 목표는 바뀌지
              않아요.
            </p>
          ) : null}
          {previousLearningNeedsReview ? (
            <p
              role="note"
              className="mt-3 text-support leading-relaxed text-muted"
            >
              운동 알아가기의 계산 기준이 바뀌었어요. 아래에서 운동 종류를
              선택하면 기존 BMI 차감 대신 4주 활동량 참고값을 확인할 수 있어요.
              저장하기 전까지 기존 목표는 바뀌지 않아요.
            </p>
          ) : null}
        </section>
      ) : null}
      <section aria-labelledby="goal-body-summary" className={goalCard}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="goal-body-summary" className={goalHeading}>
            계산에 사용하는 정보
          </h2>
          <button
            type="button"
            onClick={editProfile}
            disabled={busy}
            className={`min-h-11 rounded-control px-2 text-support font-semibold text-exercise ${goalFocus}`}
          >
            정보 수정
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-body">
          <div>
            <dt className="text-support text-muted">나이</dt>
            <dd className="mt-1 font-semibold">{profile.age}세</dd>
          </div>
          <div>
            <dt className="text-support text-muted">성별</dt>
            <dd className="mt-1 font-semibold">
              {profile.sex === 'male' ? '남성' : '여성'}
            </dd>
          </div>
          <div>
            <dt className="text-support text-muted">키</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {profile.heightCm} cm
            </dd>
          </div>
          <div>
            <dt className="text-support text-muted">현재 몸무게</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {profile.weightKg} kg
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-body font-semibold tabular-nums text-content">
          현재 BMI {bmiGoals.currentBmi.toFixed(2)}
        </p>
        <p className="mt-1 text-support leading-relaxed text-muted">
          BMI는 키와 몸무게로 계산해요. 나이는 성인 적용 여부를 확인하는 데
          사용해요.
        </p>
      </section>
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <section
          className={goalCard}
          aria-labelledby="exercise-goal-form-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="exercise-goal-form-title" className={goalHeading}>
              {mode === 'simple'
                ? '어떤 목표로 시작할까요?'
                : '나에게 맞게 목표를 조절해요'}
            </h2>
            <span className="rounded-full bg-exercise-soft px-3 py-1 text-support font-semibold text-exercise">
              {context.exerciseTier
                ? TIER_LABEL[context.exerciseTier]
                : '이해도 미확인'}{' '}
              · {mode === 'simple' ? '간편 설정' : '직접 설정'}
            </span>
          </div>
          <p className="mt-2 text-support leading-relaxed text-muted">
            {mode === 'simple'
              ? '목적 하나를 고르면 시작 목표를 준비해요.'
              : '목표 체중과 운동 횟수·시간을 직접 정해 주세요.'}
          </p>
          <fieldset
            id="goal-purpose"
            tabIndex={-1}
            aria-invalid={hasIssue('purpose')}
            aria-describedby={
              hasIssue('purpose') ? 'exercise-goal-errors' : undefined
            }
            className={`mt-4 rounded-control ${goalFocus}`}
            disabled={busy}
          >
            <legend className="mb-3 text-body font-semibold text-content">
              운동 목적
            </legend>
            <div className="flex flex-col gap-2">
              {goalPurposes(mode, profile).map((purpose) => (
                <label
                  key={purpose}
                  className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 ${draft.purpose === purpose ? 'border-exercise bg-exercise-soft' : 'border-line bg-surface'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-exercise`}
                >
                  <input
                    type="radio"
                    name="exercisePurpose"
                    value={purpose}
                    checked={draft.purpose === purpose}
                    onChange={() => update('purpose', purpose)}
                    className="mt-1 size-4 shrink-0 accent-exercise"
                  />
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-content">
                      {PURPOSE_LABEL[purpose]}
                    </span>
                    <span className="mt-1 block text-support leading-relaxed text-muted">
                      {purpose === 'lose' && mode === 'detailed'
                        ? '목표 체중과 운동 계획을 직접 정해요.'
                        : descriptions[purpose]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {!bmiGoals.canMaintain ? (
            <p
              role="note"
              className="mt-3 text-support leading-relaxed text-muted"
            >
              체중 유지는 BMI 18.5 이상~23 미만의 참고 범위에서만 표시해요.
              BMI만으로 실제 체중 유지 능력을 판단하지는 않아요.
            </p>
          ) : null}
          {mode === 'simple' && !bmiGoals.canLose ? (
            <p
              role="note"
              className="mt-3 text-support leading-relaxed text-muted"
            >
              현재 체중에서 학습 목표보다 감량 폭이 큰 참고 목표를 정할 수 없어
              체중 감량 선택지는 표시하지 않아요.
            </p>
          ) : null}
          {usesActivity ? (
            <GoalActivityPicker
              value={draft.activityId ?? ''}
              disabled={busy}
              invalid={hasIssue('activityId')}
              onChange={(value) => update('activityId', value)}
            />
          ) : null}
          {mode === 'detailed' ? (
            <fieldset disabled={busy} className="mt-5 flex flex-col gap-4">
              <legend className="mb-3 text-body font-semibold text-content">
                세부 목표
              </legend>
              <div>
                <label
                  htmlFor="goal-targetWeightKg"
                  className="mb-2 block text-body"
                >
                  목표 몸무게 (kg)
                </label>
                <input
                  id="goal-targetWeightKg"
                  name="targetWeightKg"
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.targetWeightKg}
                  onChange={(event) =>
                    update('targetWeightKg', event.target.value)
                  }
                  aria-invalid={hasIssue('targetWeightKg')}
                  aria-describedby={
                    hasIssue('targetWeightKg')
                      ? 'exercise-goal-errors'
                      : 'goal-weight-hint'
                  }
                  className={goalInput}
                />
                <p
                  id="goal-weight-hint"
                  className="mt-1 text-support leading-relaxed text-muted"
                >
                  0.1kg 단위로 입력해요. 벌크업 체중 증가가 근육 증가량을
                  뜻하지는 않아요.
                </p>
              </div>
              <div>
                <label
                  htmlFor="goal-daysPerWeek"
                  className="mb-2 block text-body"
                >
                  주간 운동 횟수
                </label>
                <select
                  id="goal-daysPerWeek"
                  name="daysPerWeek"
                  value={draft.daysPerWeek}
                  onChange={(event) =>
                    update('daysPerWeek', event.target.value)
                  }
                  aria-invalid={hasIssue('daysPerWeek')}
                  aria-describedby={
                    hasIssue('daysPerWeek') ? 'exercise-goal-errors' : undefined
                  }
                  className={goalInput}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                    <option key={days} value={days}>
                      주 {days}회
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="goal-minutesPerSession"
                  className="mb-2 block text-body"
                >
                  회당 운동 시간 (분)
                </label>
                <input
                  id="goal-minutesPerSession"
                  name="minutesPerSession"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft.minutesPerSession}
                  onChange={(event) =>
                    update('minutesPerSession', event.target.value)
                  }
                  aria-invalid={hasIssue('minutesPerSession')}
                  aria-describedby={
                    hasIssue('minutesPerSession')
                      ? 'exercise-goal-errors'
                      : 'goal-minutes-hint'
                  }
                  className={goalInput}
                />
                <p
                  id="goal-minutes-hint"
                  className="mt-1 text-support text-muted"
                >
                  5~180분 사이에서 5분 단위로 조절해요.
                </p>
              </div>
            </fieldset>
          ) : null}
        </section>
        <section
          className="rounded-card bg-exercise-soft p-4"
          aria-labelledby="goal-preview-title"
        >
          <h2 id="goal-preview-title" className={goalHeading}>
            {mode === 'simple' && draft.purpose === 'lose'
              ? '저장할 1차 감량 목표'
              : mode === 'simple' && draft.purpose === 'learn'
                ? '운동 알아가기 활동량'
                : '저장할 목표 확인'}
          </h2>
          <div aria-live="polite" aria-atomic="true" className="mt-3">
            {calculation.ok ? (
              <>
                <p className="text-support text-muted">
                  {PURPOSE_LABEL[calculation.goal.purpose]}
                </p>
                {mode === 'simple' && draft.purpose === 'learn' ? (
                  <p className="mt-2 text-body leading-relaxed text-content">
                    목표는 주 3회·10분의 운동 습관 만들기예요. 체중 기준은 현재{' '}
                    {profile.weightKg.toFixed(1)} kg으로 두고, 활동량의 에너지
                    환산값을 따로 확인해요.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-metric font-semibold tabular-nums text-exercise">
                      {calculation.goal.targetWeightKg.toFixed(1)}{' '}
                      <span className="text-body">kg</span>
                    </p>
                    <p className="mt-1 text-support leading-relaxed tabular-nums text-muted">
                      현재 {profile.weightKg.toFixed(1)} kg → 참고 목표{' '}
                      {calculation.goal.targetWeightKg.toFixed(1)} kg
                    </p>
                    {mode === 'simple' ? (
                      <p className="mt-1 text-support tabular-nums text-muted">
                        참고 감량 차이{' '}
                        {Math.max(
                          0,
                          profile.weightKg - calculation.goal.targetWeightKg,
                        ).toFixed(1)}{' '}
                        kg
                      </p>
                    ) : null}
                  </>
                )}
                <p className="mt-2 text-body font-semibold text-content">
                  주 {calculation.goal.daysPerWeek}회 · 1회{' '}
                  {calculation.goal.minutesPerSession}분
                </p>
                <p className="mt-1 text-support text-muted">
                  주간 시작 계획 {calculation.goal.weeklyMinutes}분
                </p>
                {mode === 'simple' ? (
                  <p className="mt-3 text-support leading-relaxed text-muted">
                    {draft.purpose === 'lose'
                      ? '현재 체중에서 최대 5% 감량하는 1차 참고 목표예요. 고정 BMI 체중까지 한 번에 감량하도록 제안하지 않아요. 달성 기간이나 실제 감량량을 예측한 값은 아니며, 다음 목표는 변화와 건강 상태를 확인한 뒤 다시 정해요.'
                      : draft.purpose === 'learn'
                        ? '주 3회, 회당 10분으로 시작해요. 선택한 맨몸 운동의 4주 에너지 환산값이며, 운동만으로 감량할 체중을 예측한 값은 아니에요.'
                        : '현재 체중을 기준으로 활동을 이어가는 목표예요.'}
                  </p>
                ) : null}
                {usesActivity ? (
                  <GoalActivityReference goal={calculation.goal} />
                ) : null}
              </>
            ) : (
              <p className="text-body leading-relaxed text-muted">
                {draft.purpose
                  ? calculation.issues[0].message
                  : '목적을 고르면 체중과 시작 계획을 확인할 수 있어요.'}
              </p>
            )}
          </div>
          <details className="mt-4 border-t border-exercise/20 pt-3">
            <summary
              className={`min-h-11 cursor-pointer rounded-control py-3 text-support font-semibold text-exercise ${goalFocus}`}
            >
              목표가 정해지는 기준
            </summary>
            <div className="mt-2 space-y-2 text-support leading-relaxed text-muted">
              <p>
                건강 목표의 관리 비중은 시작 계획의 참고값이에요. 운동 강도나
                개인에게 최적인 운동량을 뜻하지 않아요.
              </p>
              <p>
                한국 성인 정상 BMI 참고 범위는 18.5 이상~23 미만이에요. 간편
                설정의 첫 감량 목표는 현재 체중의 5% 이내로 제한해요. 기존 BMI
                19.25 기준 체중은 자동 목표를 그보다 낮추지 않는 제한값으로만
                사용하며, 개인이 도달해야 할 최종 체중을 뜻하지 않아요. 자동
                참고 목표는 소수점 첫째 자리로 올림하고 추가 감량을 자동으로
                적용하지 않아요.
              </p>
              <p>
                체중 감량의 횟수·시간은 초급 시작 예시이며 목표 체중에서 역산한
                처방이 아니에요. 식단 중심은 회당 15분, 그 외는 20분부터 주
                3회로 시작해요. 65세 이상이거나 이해도 미확인이면 10분부터
                시작해요. 익숙해지면 회당 30분까지 천천히 늘리는 예시를
                제공해요.
              </p>
              <p>
                주 30분의 운동만으로 실제 체중 변화를 계산할 수는 없어요. 실제
                변화는 식사·운동 강도·건강 상태 등에 따라 달라져요. 목표 차이가
                크면 전문가와 단계별 목표를 정해 주세요.
              </p>
              <p>
                일반적인 중강도 유산소 활동 주 150분과 근력 운동 주 2일 이상은
                서로 다른 활동 기준이에요. 이 맨몸 운동 계획만으로 유산소 기준을
                채웠다고 계산하지 않아요.{' '}
                <a
                  href="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${goalFocus}`}
                >
                  성인 활동 기준 보기
                </a>
              </p>
              <p>
                임신·수유 중이거나 질환을 치료 중이라면 자동 체중 목표를
                사용하기 전에 의료진과 상의해 주세요. 이 화면은 진단이나 운동
                처방을 제공하지 않아요.
              </p>
              <p>
                <a
                  href="https://www.who.int/initiatives/behealthy/physical-activity"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${goalFocus}`}
                >
                  WHO 신체활동 안내
                </a>{' '}
                ·{' '}
                <a
                  href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10088549/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${goalFocus}`}
                >
                  대한비만학회 성인 BMI 기준
                </a>
              </p>
            </div>
          </details>
        </section>
        <div aria-live="polite">
          {issues.length > 0 ? (
            <ul
              id="exercise-goal-errors"
              role="alert"
              className="list-inside list-disc text-body leading-relaxed text-danger"
            >
              {issues.map((issue) => (
                <li key={issue.field}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="mt-2 text-body leading-relaxed text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <p className="text-support leading-relaxed text-muted">
          {saved
            ? '저장하기 전까지 현재 목표는 바뀌지 않아요.'
            : '저장을 완료해야 운동 목표에 반영돼요.'}
        </p>
        <button type="submit" disabled={busy} className={goalPrimary}>
          {busy ? '저장하는 중…' : '이 목표로 저장하기'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={goalSecondary}
        >
          취소하고 돌아가기
        </button>
      </form>
    </div>
  )
}
