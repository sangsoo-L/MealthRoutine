import { useRef, useState, type FormEvent } from 'react'
import { parseMeasurement } from '../../../body-measurements/bodyValidation.ts'
import { exerciseGoalMessage } from '../../../exercise-goal/exerciseGoalMessages.ts'
import type { ExerciseGoalProfile } from '../../../exercise-goal/exerciseGoalTypes.ts'
import {
  goalCard,
  goalHeading,
  goalInput,
  goalPrimary,
  goalSecondary,
} from './goalStyles.ts'

export default function GoalProfileForm({
  profile,
  prefill,
  save,
  cancel,
}: {
  profile: ExerciseGoalProfile | null
  prefill?: Partial<ExerciseGoalProfile>
  save: (value: Omit<ExerciseGoalProfile, 'updatedAt'>) => Promise<void>
  cancel: () => void
}) {
  const [age, setAge] = useState(profile ? String(profile.age) : '')
  const [sex, setSex] = useState(profile?.sex ?? '')
  const [height, setHeight] = useState(
    profile
      ? String(profile.heightCm)
      : prefill?.heightCm !== undefined
        ? String(prefill.heightCm)
        : '',
  )
  const [weight, setWeight] = useState(
    profile
      ? String(profile.weightKg)
      : prefill?.weightKg !== undefined
        ? String(prefill.weightKg)
        : '',
  )
  const [error, setError] = useState('')
  const [field, setField] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const parsedHeight = parseMeasurement(height, { min: 100, max: 230 })
    const parsedWeight = parseMeasurement(weight, { min: 25, max: 250 })
    const issue =
      !/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 100
        ? ['goal-profile-age', '나이는 18~100세의 정수로 입력해 주세요.']
        : sex !== 'male' && sex !== 'female'
          ? ['goal-profile-sex', '성별을 선택해 주세요.']
          : !parsedHeight.ok
            ? [
                'goal-profile-height',
                '키는 100~230cm 사이에서 소수점 첫째 자리까지 입력해 주세요.',
              ]
            : !parsedWeight.ok
              ? [
                  'goal-profile-weight',
                  '몸무게는 25~250kg 사이에서 소수점 첫째 자리까지 입력해 주세요.',
                ]
              : null
    if (issue) {
      setError(issue[1])
      setField(issue[0])
      document.getElementById(issue[0])?.focus()
      return
    }
    if (
      !parsedHeight.ok ||
      !parsedWeight.ok ||
      (sex !== 'male' && sex !== 'female')
    )
      return
    pending.current = true
    setBusy(true)
    setError('')
    setField('')
    try {
      await save({
        age: Number(age),
        sex,
        heightCm: parsedHeight.value,
        weightKg: parsedWeight.value,
      })
    } catch (reason) {
      setError(exerciseGoalMessage(reason))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section className={goalCard} aria-labelledby="goal-profile-title">
      <h2 id="goal-profile-title" className={goalHeading}>
        {profile ? '계산에 사용할 정보 수정' : '목표 계산에 필요한 정보'}
      </h2>
      <p className="mt-2 text-support leading-relaxed text-muted">
        성인용 목표를 계산해요. 직접 입력한 정보이며 본인인증 정보는 아니에요.
        기존 키·몸무게를 수정하면 신체 정보에도 반영돼요.
      </p>
      <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="goal-profile-age" className="mb-2 block text-body">
            나이 (세)
          </label>
          <input
            id="goal-profile-age"
            name="age"
            inputMode="numeric"
            autoComplete="off"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            disabled={busy}
            aria-invalid={field === 'goal-profile-age'}
            aria-describedby={
              field === 'goal-profile-age' ? 'goal-profile-error' : undefined
            }
            className={goalInput}
          />
        </div>
        <div>
          <label htmlFor="goal-profile-sex" className="mb-2 block text-body">
            성별
          </label>
          <select
            id="goal-profile-sex"
            name="sex"
            value={sex}
            onChange={(event) => setSex(event.target.value)}
            disabled={busy}
            aria-invalid={field === 'goal-profile-sex'}
            aria-describedby={
              field === 'goal-profile-sex' ? 'goal-profile-error' : undefined
            }
            className={goalInput}
          >
            <option value="">선택해 주세요</option>
            <option value="male">남성</option>
            <option value="female">여성</option>
          </select>
        </div>
        <div>
          <label htmlFor="goal-profile-height" className="mb-2 block text-body">
            키 (cm)
          </label>
          <input
            id="goal-profile-height"
            name="heightCm"
            inputMode="decimal"
            autoComplete="off"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            disabled={busy}
            aria-invalid={field === 'goal-profile-height'}
            aria-describedby={
              field === 'goal-profile-height' ? 'goal-profile-error' : undefined
            }
            className={goalInput}
          />
        </div>
        <div>
          <label htmlFor="goal-profile-weight" className="mb-2 block text-body">
            현재 몸무게 (kg)
          </label>
          <input
            id="goal-profile-weight"
            name="weightKg"
            inputMode="decimal"
            autoComplete="off"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            disabled={busy}
            aria-invalid={field === 'goal-profile-weight'}
            aria-describedby={
              field === 'goal-profile-weight' ? 'goal-profile-error' : undefined
            }
            className={goalInput}
          />
        </div>
        <div aria-live="polite">
          {error ? (
            <p
              id="goal-profile-error"
              role="alert"
              className="text-body leading-relaxed text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={busy} className={goalPrimary}>
          {busy ? '저장하는 중…' : '신체 정보 저장하고 목표 설정하기'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className={goalSecondary}
        >
          취소하고 숨기기
        </button>
      </form>
    </section>
  )
}
