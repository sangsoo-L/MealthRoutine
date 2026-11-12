import {
  activityEnergyReference,
  BEGINNER_BODYWEIGHT_ACTIVITIES,
  beginnerLossPlan,
  type BeginnerBodyweightActivityId,
} from '../../../exercise-goal/exerciseGoalActivity.ts'
import type { ExerciseGoal } from '../../../exercise-goal/exerciseGoalTypes.ts'
import { goalFocus } from './goalStyles.ts'

export function GoalActivityPicker({
  value,
  disabled,
  invalid,
  onChange,
}: {
  value: BeginnerBodyweightActivityId | ''
  disabled: boolean
  invalid: boolean
  onChange: (value: BeginnerBodyweightActivityId) => void
}) {
  return (
    <fieldset
      id="goal-activityId"
      tabIndex={-1}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={
        invalid
          ? 'exercise-goal-errors goal-activity-hint'
          : 'goal-activity-hint'
      }
      className={`mt-5 rounded-control ${goalFocus}`}
    >
      <legend className="mb-3 text-body font-semibold text-content">
        어떤 맨몸 운동을 할까요?
      </legend>
      <div className="flex flex-col gap-2">
        {BEGINNER_BODYWEIGHT_ACTIVITIES.map((activity) => (
          <label
            key={activity.id}
            className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-card border p-3 ${value === activity.id ? 'border-exercise bg-exercise-soft' : 'border-line bg-surface'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-exercise`}
          >
            <input
              type="radio"
              name="goalActivity"
              value={activity.id}
              checked={value === activity.id}
              onChange={() => onChange(activity.id)}
              className="mt-1 size-4 shrink-0 accent-exercise"
            />
            <span className="min-w-0">
              <span className="block text-body font-semibold text-content">
                {activity.label}
              </span>
              <span className="mt-1 block text-support leading-relaxed text-muted">
                {activity.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p
        id="goal-activity-hint"
        className="mt-2 text-support leading-relaxed text-muted"
      >
        선택한 종류와 운동 시간으로 4주 활동량 참고값을 계산해요.
      </p>
    </fieldset>
  )
}

export function GoalActivityReference({ goal }: { goal: ExerciseGoal }) {
  const reference = activityEnergyReference(
    goal.profile.weightKg,
    goal.daysPerWeek,
    goal.minutesPerSession,
    goal.activityId,
  )
  if (!reference) return null
  const equivalent =
    reference.energyEquivalentKg < 0.01
      ? '0.01 미만'
      : reference.energyEquivalentKg.toFixed(2)
  const lossPlan =
    goal.purpose === 'lose'
      ? beginnerLossPlan(goal.context, goal.profile.age)
      : []
  return (
    <div className="mt-4 space-y-3 border-t border-exercise/20 pt-4">
      {lossPlan.length > 0 ? (
        <div>
          <h3 className="text-body font-semibold text-content">
            맨몸 운동 시작 계획
          </h3>
          <ol className="mt-2 space-y-2 text-support leading-relaxed text-content">
            {lossPlan.map((step, index) => (
              <li key={step.minutesPerSession}>
                {index === 0 ? '시작' : '익숙해진 뒤'}: 주 {step.daysPerWeek}회
                · 1회 {step.minutesPerSession}분 · 주 {step.weeklyMinutes}분
              </li>
            ))}
          </ol>
          <p className="mt-2 text-support leading-relaxed text-muted">
            운동 사이에 회복일을 두고 무리가 없을 때 시간을 늘려요. 저장하는
            계획은 시작 단계이며 자동으로 늘어나지 않아요.
          </p>
        </div>
      ) : null}
      <div>
        <h3 className="text-body font-semibold text-content">
          {reference.weeks}주 활동량 참고값
        </h3>
        <p className="mt-1 text-support text-muted">
          {reference.activity.label} · 주 {goal.daysPerWeek}회 · 1회{' '}
          {goal.minutesPerSession}분
        </p>
        <dl className="mt-3 space-y-2 text-body tabular-nums">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>주간 추가 소모 에너지</dt>
            <dd>약 {Math.round(reference.weeklyNetKcal)} kcal</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt>{reference.weeks}주 추가 소모 에너지</dt>
            <dd>약 {Math.round(reference.periodNetKcal)} kcal</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 font-semibold text-exercise">
            <dt>에너지의 체중 환산량</dt>
            <dd>약 {equivalent} kg</dd>
          </div>
        </dl>
        <p className="mt-3 text-support leading-relaxed text-muted">
          휴식 대비 추가 에너지를 단순 환산한 값이며 실제 감량 예측이 아니에요.
          실제 감량은 0kg일 수도 있고, 식사·대사·수분 변화에 따라 달라져요. 이
          값을 목표 체중에서 자동으로 빼지 않아요.
        </p>
        <p className="mt-2 text-support leading-relaxed text-muted">
          매번 {goal.minutesPerSession}분 전체를 선택한 강도로 운동하고, 기존
          활동을 줄이거나 식사량을 늘리지 않는 가정이에요. 쉬는 시간이 포함되면
          참고 소모량은 줄어들어요.
        </p>
      </div>
      <details>
        <summary
          className={`min-h-11 cursor-pointer rounded-control py-3 text-support font-semibold text-exercise ${goalFocus}`}
        >
          활동량 계산 기준
        </summary>
        <div className="space-y-2 text-support leading-relaxed text-muted">
          <p>
            운동 분류 평균 {reference.activity.met.toFixed(1)} MET를 사용해요.
            추가 소모 에너지 = (MET − 1) × 현재 체중 × 운동 시간(시간)이에요.
            휴식 때 쓰는 에너지를 중복 계산하지 않아요.
          </p>
          <p>
            4주 에너지를 7,700 kcal/kg으로 나눈 산술 환산값이에요. 이 단순
            환산은 장기 체중 예측에 쓸 수 없으며 나이·성별·체성분에 따른
            개인차를 반영한 대사 모델이 아니에요.
          </p>
          <p>
            <a
              href="https://pacompendium.com/conditioning-exercise/"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${goalFocus}`}
            >
              2024 Compendium 운동 강도 기준
            </a>
            {' · '}
            <a
              href="https://pmc.ncbi.nlm.nih.gov/articles/PMC4024447/"
              target="_blank"
              rel="noopener noreferrer"
              className={`underline ${goalFocus}`}
            >
              열량 환산과 실제 체중 변화의 차이
            </a>
          </p>
        </div>
      </details>
    </div>
  )
}
