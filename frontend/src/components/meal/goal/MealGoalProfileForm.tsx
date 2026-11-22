import { useRef, useState, type FormEvent } from 'react'
import { mealGoalMessage } from '../../../meal-goal/mealGoalMessages.ts'
import {
  MEAL_GOAL_ADULT_AGE,
  MEAL_GOAL_MAX_AGE,
  MEAL_GOAL_MIN_AGE,
} from '../../../meal-goal/mealGoalPolicy.ts'
import type { FormProfile } from '../../../meal-goal/useMealGoalForm.ts'
import {
  parseProfileDraft,
  type ProfileDraft,
  type ProfileField,
} from '../../../meal-goal/mealGoalValidation.ts'
import {
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'
import { goalCard, goalHeading, goalInput } from './mealGoalStyles.ts'

const FIELD_ID: Record<ProfileField, string> = {
  age: 'meal-goal-profile-age',
  sex: 'meal-goal-profile-sex',
  height: 'meal-goal-profile-height',
  weight: 'meal-goal-profile-weight',
}

/**
 * 식단 목표 계산에 쓰는 신체 정보 입력. 기존 값(운동 목표 프로필·신체 정보)이 있으면 채워 두고, 없는 값은 사용자가 직접 입력한다.
 * 입력한 정보는 본인인증으로 확인된 값이 아니다. 성별은 남성·여성 두 값만 받고 추정하지 않는다.
 * 18세 이상의 정보는 기존 PIN 보호 신체 정보에 저장되고(키·몸무게는 신체 정보에도 반영), 14~17세 정보는 저장하지 않고 이 화면에서만 쓴다.
 */
export default function MealGoalProfileForm({
  profile,
  prefill,
  initialDraft,
  onDraftChange,
  save,
  cancel,
}: {
  profile: FormProfile | null
  prefill?: { heightCm?: number; weightKg?: number }
  /** 열람 시간이 끝나 폼이 다시 열릴 때 이어서 쓰는 입력값 */
  initialDraft?: ProfileDraft
  /** 입력값이 바뀔 때마다 알린다(바깥에서 보관해 재인증 뒤에도 입력을 유지한다). */
  onDraftChange?: (draft: ProfileDraft) => void
  save: (value: {
    age: number
    sex: 'male' | 'female'
    heightCm: number
    weightKg: number
  }) => Promise<void>
  cancel: () => void
}) {
  const initial = (value: number | undefined) =>
    value === undefined ? '' : String(value)
  const [values, setValues] = useState<ProfileDraft>(
    () =>
      initialDraft ?? {
        age: profile ? String(profile.age) : '',
        sex: profile?.sex ?? '',
        height: profile ? String(profile.heightCm) : initial(prefill?.heightCm),
        weight: profile ? String(profile.weightKg) : initial(prefill?.weightKg),
      },
  )
  const { age, sex, height, weight } = values
  const change = (patch: Partial<ProfileDraft>) => {
    const next = { ...values, ...patch }
    setValues(next)
    onDraftChange?.(next)
  }
  const [error, setError] = useState('')
  const [field, setField] = useState<ProfileField | ''>('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const parsed = parseProfileDraft({ age, sex, height, weight })
    if (!parsed.ok) {
      setError(parsed.message)
      setField(parsed.field)
      document.getElementById(FIELD_ID[parsed.field])?.focus()
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    setField('')
    try {
      await save(parsed.value)
    } catch (reason) {
      setError(mealGoalMessage(reason))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const describedBy = (name: ProfileField) =>
    field === name ? 'meal-goal-profile-error' : undefined

  return (
    <section className={goalCard} aria-labelledby="meal-goal-profile-title">
      <h2 id="meal-goal-profile-title" className={goalHeading}>
        {profile ? '계산에 쓰는 정보 수정' : '목표 계산에 필요한 정보'}
      </h2>
      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
        직접 입력한 정보이며 본인인증 정보는 아니에요. {MEAL_GOAL_ADULT_AGE}세
        이상의 정보는 비밀번호로 보호되는 신체 정보에 저장돼요. 기존 키·몸무게를
        고치면 신체 정보에도 반영돼요.
      </p>
      <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <label
            htmlFor={FIELD_ID.age}
            className="mb-2 block text-body text-content"
          >
            나이 (세)
          </label>
          <input
            id={FIELD_ID.age}
            name="age"
            inputMode="numeric"
            autoComplete="off"
            value={age}
            onChange={(e) => change({ age: e.target.value })}
            disabled={busy}
            aria-invalid={field === 'age'}
            aria-describedby={describedBy('age')}
            className={goalInput}
          />
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {MEAL_GOAL_MIN_AGE}~{MEAL_GOAL_MAX_AGE}세까지 입력할 수 있어요.
            {MEAL_GOAL_MIN_AGE}~{MEAL_GOAL_ADULT_AGE - 1}세에는 성인용 자동 열량
            계산을 적용하지 않아요.
          </p>
        </div>
        <div>
          <label
            htmlFor={FIELD_ID.sex}
            className="mb-2 block text-body text-content"
          >
            성별
          </label>
          <select
            id={FIELD_ID.sex}
            name="sex"
            value={sex}
            onChange={(e) => change({ sex: e.target.value })}
            disabled={busy}
            aria-invalid={field === 'sex'}
            aria-describedby={describedBy('sex')}
            className={goalInput}
          >
            <option value="">선택해 주세요</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={FIELD_ID.height}
            className="mb-2 block text-body text-content"
          >
            키 (cm)
          </label>
          <input
            id={FIELD_ID.height}
            name="heightCm"
            inputMode="decimal"
            autoComplete="off"
            value={height}
            onChange={(e) => change({ height: e.target.value })}
            disabled={busy}
            aria-invalid={field === 'height'}
            aria-describedby={describedBy('height')}
            className={goalInput}
          />
        </div>
        <div>
          <label
            htmlFor={FIELD_ID.weight}
            className="mb-2 block text-body text-content"
          >
            현재 몸무게 (kg)
          </label>
          <input
            id={FIELD_ID.weight}
            name="weightKg"
            inputMode="decimal"
            autoComplete="off"
            value={weight}
            onChange={(e) => change({ weight: e.target.value })}
            disabled={busy}
            aria-invalid={field === 'weight'}
            aria-describedby={describedBy('weight')}
            className={goalInput}
          />
        </div>
        <div aria-live="polite">
          {error ? (
            <p
              id="meal-goal-profile-error"
              role="alert"
              className="text-body leading-relaxed text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={busy} className={mealPrimaryButton}>
          {busy ? '저장하는 중…' : '신체 정보 확인하기'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={`w-full ${mealSecondaryButton}`}
        >
          취소하고 숨기기
        </button>
      </form>
    </section>
  )
}
