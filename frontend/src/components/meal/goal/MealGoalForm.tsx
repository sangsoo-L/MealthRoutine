import { useMemo, useRef, useState, type FormEvent } from 'react'
import {
  NOT_CALCULABLE_MESSAGE,
  SAVE_BLOCK_MESSAGE,
  calculateMealGoal,
  decideSave,
  type CalculatedGoal,
  type CalculationResult,
} from '../../../meal-goal/mealGoalCalculation.ts'
import { mealGoalMessage } from '../../../meal-goal/mealGoalMessages.ts'
import {
  ACTIVITIES,
  ACTIVITY_LABEL,
  CURRENT_POLICY_VERSION,
  LEVEL_LABEL,
  PURPOSES,
  PURPOSE_HINT,
  PURPOSE_LABEL,
  findPolicy,
  isActivity,
  isPurpose,
  mealGoalFormMode,
  type MealGoalPolicyInfo,
} from '../../../meal-goal/mealGoalPolicy.ts'
import type {
  MealGoal,
  MealGoalInput,
  MealGoalLevel,
} from '../../../meal-goal/mealGoalTypes.ts'
import {
  EMPTY_DRAFT,
  ratioTotal,
  validateDraft,
  type DraftField,
  type GoalDraft,
} from '../../../meal-goal/mealGoalValidation.ts'
import type { FormProfile } from '../../../meal-goal/useMealGoalForm.ts'
import type { KnowledgeSource } from '../../../mypage/mypageTypes.ts'
import {
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'
import { goalCard, goalHeading, goalInput } from './mealGoalStyles.ts'

const PENDING_POLICY: MealGoalPolicyInfo = findPolicy(
  CURRENT_POLICY_VERSION,
) ?? { version: CURRENT_POLICY_VERSION, status: 'pendingExpertReview' }

const radioCard =
  'flex min-h-12 cursor-pointer items-start gap-3 rounded-control border border-line bg-surface px-4 py-3 text-left peer-checked:border-meal peer-checked:bg-meal-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-meal'

const FIELD_FOCUS_ID: Record<DraftField, string> = {
  purpose: 'meal-goal-purpose-lose',
  activity: 'meal-goal-activity-sedentary',
  kcal: 'meal-goal-kcal',
  carb: 'meal-goal-carb',
  protein: 'meal-goal-protein',
  fat: 'meal-goal-fat',
  ratio: 'meal-goal-carb',
}

function draftFromGoal(
  goal: MealGoal | null,
  level: MealGoalLevel | null,
): GoalDraft {
  if (!goal) return EMPTY_DRAFT
  const advanced = mealGoalFormMode(level) === 'advanced'
  return {
    purpose: goal.purpose,
    activity: goal.activity ?? '',
    kcal: advanced ? String(goal.kcal) : '',
    carb: advanced ? String(goal.ratio.carb) : '',
    protein: advanced ? String(goal.ratio.protein) : '',
    fat: advanced ? String(goal.ratio.fat) : '',
  }
}

function ExampleCard({
  example,
  kind,
}: {
  example: CalculatedGoal
  kind: 'example' | 'result'
}) {
  const parts = [
    ['carb', '탄수화물'],
    ['protein', '단백질'],
    ['fat', '지방'],
  ] as const
  return (
    <div data-meal-goal-calc={kind} className="flex flex-col gap-2">
      {kind === 'example' ? (
        <p
          role="note"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-semibold text-warning"
        >
          검증되지 않은 시안 계산 예시 · 개발 환경에서만 보여요. 권장 열량이
          아니고 저장되지 않아요.
        </p>
      ) : null}
      <p className="text-metric leading-none font-semibold tabular-nums text-content">
        하루 {example.kcal.toLocaleString()} kcal
        {kind === 'example' ? (
          <span className="ml-2 text-support font-normal text-muted">
            (예시)
          </span>
        ) : null}
      </p>
      <ul role="list" className="flex flex-col gap-1">
        {parts.map(([key, label]) => (
          <li
            key={key}
            className="text-body leading-snug font-normal tabular-nums text-content"
          >
            {label} <b className="font-semibold">{example.ratio[key]}%</b> ·{' '}
            {example.grams[key]}g
          </li>
        ))}
      </ul>
      <p className="text-support leading-relaxed font-normal text-muted">
        {example.activityChosen
          ? `평소 활동량: ${ACTIVITY_LABEL[example.activity]}.`
          : `활동량은 묻지 않아 “${ACTIVITY_LABEL[example.activity]}”로 가정한 값이에요.`}{' '}
        그램은 반올림해서 합이 열량과 정확히 맞지 않을 수 있어요. 의료·영양
        상담을 대신하지 않아요.
      </p>
    </div>
  )
}

function Preview({
  result,
  mode,
}: {
  result: CalculationResult
  mode: ReturnType<typeof mealGoalFormMode>
}) {
  if (result.status === 'insufficientInput') {
    const text = result.missing.includes('purpose')
      ? '목적을 고르면 계산 결과를 확인할 수 있어요.'
      : result.missing.includes('activity')
        ? '평소 활동량을 고르면 계산 결과를 확인할 수 있어요.'
        : '신체 정보를 입력하면 계산 결과를 확인할 수 있어요.'
    return (
      <p className="text-body leading-relaxed font-normal text-muted">{text}</p>
    )
  }
  if (result.status === 'notCalculable') {
    return (
      <p
        role="status"
        data-meal-goal-calc="notCalculable"
        className="text-body leading-relaxed font-normal text-muted"
      >
        {NOT_CALCULABLE_MESSAGE[result.reason]}
      </p>
    )
  }
  if (result.status === 'policyPending') {
    return (
      <p
        role="status"
        data-meal-goal-calc="policyPending"
        className="text-body leading-relaxed font-normal text-muted"
      >
        목표 계산 기준을 전문가가 검증하고 있어요. 검증이 끝나기 전에는 계산
        결과를 보여 드리지 않아요.
        {mode === 'advanced' ? ' 직접 조정한 값도 저장할 수 없어요.' : ''}
      </p>
    )
  }
  if (result.status === 'devExample')
    return <ExampleCard example={result.example} kind="example" />
  return <ExampleCard example={result.result} kind="result" />
}

/**
 * D01-4 식단 목표 입력 폼. 목적(필수) → 식단 이해도에 따른 추가 입력 → 계산 결과 확인 → 취소·저장 순서다.
 * - 초급·이해도 미확인: 목적만. 중급: 목적 + 평소 활동량. 고급: 목적 + 목표 열량·탄단지 비율 직접 조정.
 * - 입력은 구조만 검증한다(필수·정수·비율 합 100). 열량 하한·상한 같은 영양 정책 검증은 하지 않는다(전문가 검증 대기).
 * - **계산 정책이 검증되지 않아 저장 버튼은 항상 비활성이다.** 개발 환경에서는 "검증되지 않은 시안 계산 예시"를 보여 줄 수 있지만 저장하거나 권장값으로 쓰지 않는다.
 */
export default function MealGoalForm({
  level,
  levelSource,
  profile,
  existing,
  policy = PENDING_POLICY,
  allowDevExample = import.meta.env.DEV,
  initialDraft,
  onDraftChange,
  save,
  editProfile,
  cancel,
}: {
  level: MealGoalLevel | null
  levelSource: KnowledgeSource | null
  profile: FormProfile
  existing: MealGoal | null
  policy?: MealGoalPolicyInfo
  allowDevExample?: boolean
  /** 열람 시간이 끝나 폼이 다시 열릴 때 이어서 쓰는 입력값(없으면 기존 목표에서 시작). */
  initialDraft?: GoalDraft
  /** 입력값이 바뀔 때마다 알린다(바깥에서 보관해 재인증 뒤에도 입력을 유지한다). */
  onDraftChange?: (draft: GoalDraft) => void
  save: (goal: MealGoalInput) => Promise<void>
  editProfile: () => void
  cancel: () => void
}) {
  const mode = mealGoalFormMode(level)
  const [draft, setDraft] = useState<GoalDraft>(
    () => initialDraft ?? draftFromGoal(existing, level),
  )
  const [issues, setIssues] = useState<ReturnType<typeof validateDraft>>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  const calcProfile = useMemo(
    () => ({
      age: profile.age,
      sex: profile.sex,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
    }),
    [profile],
  )
  const calculate = (next: GoalDraft) =>
    calculateMealGoal(
      {
        purpose: isPurpose(next.purpose) ? next.purpose : null,
        level,
        activity: isActivity(next.activity) ? next.activity : null,
        profile: calcProfile,
      },
      { allowDevExample, policy },
    )
  const result = calculate(draft)
  const policyVerified = policy.status === 'verified'
  const decision = decideSave({
    draft,
    level,
    profile: calcProfile,
    profileUpdatedAt: profile.persisted ? profile.updatedAt : null,
    policy,
  })
  const issueFor = (field: DraftField) =>
    issues.find((issue) => issue.field === field)?.message

  function changeDraft(next: GoalDraft) {
    setDraft(next)
    onDraftChange?.(next)
    setIssues([])
    setMessage('')
  }
  function update(patch: Partial<GoalDraft>) {
    changeDraft({ ...draft, ...patch })
  }
  /** 고급 폼에서 목적·활동량을 바꾸면 계산 결과로 직접 조정 칸을 다시 채운다(시안과 같다). 예시가 없으면 비워 둔다. */
  function choosePurpose(purpose: string) {
    const next = { ...draft, purpose }
    if (mode === 'advanced') {
      const calc = calculate(next)
      const example =
        calc.status === 'devExample'
          ? calc.example
          : calc.status === 'verified'
            ? calc.result
            : null
      if (example) {
        next.kcal = String(example.kcal)
        next.carb = String(example.ratio.carb)
        next.protein = String(example.ratio.protein)
        next.fat = String(example.ratio.fat)
      } else {
        next.kcal = ''
        next.carb = ''
        next.protein = ''
        next.fat = ''
      }
    }
    changeDraft(next)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const found = validateDraft(draft, mode)
    if (found.length > 0) {
      setIssues(found)
      setMessage('')
      document.getElementById(FIELD_FOCUS_ID[found[0].field])?.focus()
      return
    }
    if (!decision.ok) {
      setIssues([])
      setMessage(SAVE_BLOCK_MESSAGE[decision.reason])
      return
    }
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      await save(decision.goal)
    } catch (reason) {
      setMessage(mealGoalMessage(reason))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const total = ratioTotal(draft)
  const blockedText = !decision.ok
    ? SAVE_BLOCK_MESSAGE[
        // 입력이 아직 비어 있어도 저장이 막힌 가장 큰 이유(검증 대기)를 먼저 알린다.
        policyVerified ? decision.reason : 'policyPending'
      ]
    : ''

  return (
    <form
      noValidate
      onSubmit={submit}
      data-meal-goal-form={mode}
      className="flex min-w-0 flex-col gap-5"
    >
      <section className={goalCard} aria-labelledby="meal-goal-level-title">
        <h2 id="meal-goal-level-title" className={goalHeading}>
          식단 이해도
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-meal-soft px-3 py-1 text-support leading-snug font-semibold text-meal">
            {level ? LEVEL_LABEL[level] : '미확인'}
          </span>
        </div>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          {level === null
            ? '이해도 결과가 없어 간편 입력을 제공해요. 초급으로 저장하거나 평가하지 않아요.'
            : levelSource === 'dev-initial'
              ? '이해도는 개발용 초기값이에요. 응시 결과가 있으면 그 결과를 우선해요.'
              : '회원가입 후 이해도 확인 결과에 맞춰 입력 항목이 달라져요.'}
        </p>
      </section>

      <section className={goalCard} aria-labelledby="meal-goal-profile-summary">
        <div className="flex items-start justify-between gap-3">
          <h2 id="meal-goal-profile-summary" className={goalHeading}>
            계산에 쓰는 내 정보
          </h2>
          <button
            type="button"
            onClick={editProfile}
            className="min-h-11 shrink-0 cursor-pointer rounded-control px-2 text-support font-semibold text-meal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal"
          >
            수정
          </button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-body tabular-nums">
          <div>
            <dt className="text-support text-muted">나이</dt>
            <dd className="font-semibold text-content">{profile.age}세</dd>
          </div>
          <div>
            <dt className="text-support text-muted">성별</dt>
            <dd className="font-semibold text-content">
              {profile.sex === 'male' ? '남성' : '여성'}
            </dd>
          </div>
          <div>
            <dt className="text-support text-muted">키</dt>
            <dd className="font-semibold text-content">
              {profile.heightCm} cm
            </dd>
          </div>
          <div>
            <dt className="text-support text-muted">몸무게</dt>
            <dd className="font-semibold text-content">
              {profile.weightKg} kg
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-support leading-relaxed font-normal text-muted">
          직접 입력한 정보이며 본인인증 정보는 아니에요.
          {profile.persisted
            ? ''
            : ' 이 나이의 정보는 저장하지 않고 이 화면에서만 써요.'}
        </p>
      </section>

      <section className={goalCard}>
        <fieldset
          className="min-w-0 border-0 p-0"
          aria-describedby={
            issueFor('purpose') ? 'meal-goal-purpose-error' : undefined
          }
        >
          <legend className={goalHeading}>
            {mode === 'advanced'
              ? '기준이 될 목적'
              : '어떤 목표로 식단을 관리할까요?'}
          </legend>
          <div className="mt-3 flex flex-col gap-2">
            {PURPOSES.map((value) => (
              <label key={value} className="relative block">
                <input
                  type="radio"
                  name="goalPurpose"
                  id={`meal-goal-purpose-${value}`}
                  value={value}
                  checked={draft.purpose === value}
                  onChange={() => choosePurpose(value)}
                  className="peer sr-only"
                />
                <span className={radioCard}>
                  <span className="min-w-0">
                    <span className="block text-body leading-snug font-semibold text-content">
                      {PURPOSE_LABEL[value]}
                    </span>
                    <span className="block text-support leading-relaxed font-normal text-muted">
                      {PURPOSE_HINT[value]}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          {issueFor('purpose') ? (
            <p
              id="meal-goal-purpose-error"
              role="alert"
              className="mt-2 text-body leading-relaxed text-danger"
            >
              {issueFor('purpose')}
            </p>
          ) : null}
        </fieldset>

        {mode === 'activity' ? (
          <fieldset
            className="mt-5 min-w-0 border-0 p-0"
            aria-describedby={
              issueFor('activity') ? 'meal-goal-activity-error' : undefined
            }
          >
            <legend className={goalHeading}>평소 활동량</legend>
            <div className="mt-3 flex flex-col gap-2">
              {ACTIVITIES.map((value) => (
                <label key={value} className="relative block">
                  <input
                    type="radio"
                    name="goalActivity"
                    id={`meal-goal-activity-${value}`}
                    value={value}
                    checked={draft.activity === value}
                    onChange={() => update({ activity: value })}
                    className="peer sr-only"
                  />
                  <span className={radioCard}>
                    <span className="text-body leading-snug font-normal text-content">
                      {ACTIVITY_LABEL[value]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {issueFor('activity') ? (
              <p
                id="meal-goal-activity-error"
                role="alert"
                className="mt-2 text-body leading-relaxed text-danger"
              >
                {issueFor('activity')}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {mode === 'advanced' ? (
          <fieldset className="mt-5 min-w-0 border-0 p-0">
            <legend className={goalHeading}>직접 조정</legend>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              목적을 고르면 계산 결과로 채워져요(계산 예시가 없으면 비어
              있어요). 열량의 허용 범위 기준은 검증 전이라 값의 적정성은
              판정하지 않아요.
            </p>
            <div className="mt-3">
              <label
                htmlFor="meal-goal-kcal"
                className="mb-2 block text-body text-content"
              >
                하루 열량 (kcal)
              </label>
              <input
                id="meal-goal-kcal"
                name="goalKcal"
                inputMode="numeric"
                autoComplete="off"
                value={draft.kcal}
                onChange={(e) => update({ kcal: e.target.value })}
                aria-invalid={!!issueFor('kcal')}
                aria-describedby={
                  issueFor('kcal') ? 'meal-goal-kcal-error' : undefined
                }
                className={goalInput}
              />
              {issueFor('kcal') ? (
                <p
                  id="meal-goal-kcal-error"
                  role="alert"
                  className="mt-1 text-body leading-relaxed text-danger"
                >
                  {issueFor('kcal')}
                </p>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2">
              {(
                [
                  ['carb', '탄수화물 (%)'],
                  ['protein', '단백질 (%)'],
                  ['fat', '지방 (%)'],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="min-w-0">
                  <label
                    htmlFor={`meal-goal-${field}`}
                    className="mb-2 block text-support text-content"
                  >
                    {label}
                  </label>
                  <input
                    id={`meal-goal-${field}`}
                    name={`goal-${field}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft[field]}
                    onChange={(e) => update({ [field]: e.target.value })}
                    aria-invalid={!!issueFor(field) || !!issueFor('ratio')}
                    aria-describedby={
                      issueFor(field)
                        ? `meal-goal-${field}-error`
                        : 'meal-goal-ratio-total'
                    }
                    className={goalInput}
                  />
                  {issueFor(field) ? (
                    <p
                      id={`meal-goal-${field}-error`}
                      role="alert"
                      className="mt-1 text-support leading-relaxed text-danger"
                    >
                      {issueFor(field)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p
              id="meal-goal-ratio-total"
              aria-live="polite"
              data-ratio-total={total}
              className={`mt-2 text-support leading-relaxed tabular-nums ${total === 100 ? 'font-normal text-muted' : 'font-semibold text-danger'}`}
            >
              비율 합계 {total}%{total === 100 ? '' : ' · 합이 100%여야 해요'}
            </p>
            {issueFor('ratio') ? (
              <p
                role="alert"
                className="mt-1 text-body leading-relaxed text-danger"
              >
                {issueFor('ratio')}
              </p>
            ) : null}
          </fieldset>
        ) : null}
      </section>

      <section className={goalCard} aria-labelledby="meal-goal-confirm-title">
        <h2 id="meal-goal-confirm-title" className={goalHeading}>
          {mode === 'advanced' ? '목표 확인' : '추천 목표 확인'}
        </h2>
        <div className="mt-3" aria-live="polite">
          <Preview result={result} mode={mode} />
        </div>
      </section>

      <div aria-live="polite">
        {message ? (
          <p role="alert" className="text-body leading-relaxed text-danger">
            {message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          data-meal-goal-save=""
          // 검증 전 정책에서는 비활성으로 알리지만, 눌러도 저장하지 않고 입력 오류와 이유만 안내한다(submit이 저장 결정을 다시 확인한다).
          aria-disabled={!policyVerified || busy || undefined}
          aria-describedby="meal-goal-save-note"
          className={mealPrimaryButton}
        >
          {busy ? '저장하는 중…' : '이 목표로 시작하기'}
        </button>
        <p
          id="meal-goal-save-note"
          data-meal-goal-save-note=""
          className="text-support leading-relaxed font-normal text-muted"
        >
          {blockedText || '입력한 내용으로 목표를 저장해요.'}
        </p>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={`w-full ${mealSecondaryButton}`}
        >
          취소
        </button>
      </div>
    </form>
  )
}
