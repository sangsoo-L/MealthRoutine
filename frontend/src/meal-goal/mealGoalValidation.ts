import { parseMeasurement } from '../body-measurements/bodyValidation.ts'
import { isIsoTimestamp } from '../exercise/workoutModel.ts'
import {
  MEAL_GOAL_MAX_AGE,
  MEAL_GOAL_MIN_AGE,
  isActivity,
  isLevel,
  isPurpose,
  type MealGoalFormMode,
} from './mealGoalPolicy.ts'
import type { MealGoal, MealGoalInput, MealGoalRatio } from './mealGoalTypes.ts'

/**
 * 식단 목표의 **구조** 검증(순수 함수). 형식·허용 집합·비율 합계·저장값 손상만 본다.
 *
 * 열량의 하한·상한, 기초대사량 기준, 저체중 감량 제한, 목적별 탄단지 비율처럼 영양 정책이 필요한 검증은 여기서 하지 않는다
 * (전문가 검증 전이라 기준이 없다). 그 대신 계산 정책이 검증되지 않았으면 저장을 막는다(mealGoalPolicy.isPolicyVerified).
 * 구조 검증을 통과했다고 그 값이 건강에 적합하다는 뜻이 아니다.
 */

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

/** 비율이 정수 %이고 0 이상이며 합이 100인가. */
export function validRatio(value: unknown): value is MealGoalRatio {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    isInt(r.carb) &&
    isInt(r.protein) &&
    isInt(r.fat) &&
    r.carb >= 0 &&
    r.protein >= 0 &&
    r.fat >= 0 &&
    r.carb + r.protein + r.fat === 100
  )
}

/** 저장 요청(MealGoalInput)의 구조가 올바른가. 올바르지 않으면 null이 아니라 false다. */
export function validGoalInput(value: unknown): value is MealGoalInput {
  if (typeof value !== 'object' || value === null) return false
  const g = value as Record<string, unknown>
  const basis = g.basis as Record<string, unknown> | null | undefined
  return (
    g.v === 1 &&
    isInt(g.calculationVersion) &&
    g.calculationVersion >= 1 &&
    (g.source === 'calculated' || g.source === 'custom') &&
    isPurpose(g.purpose) &&
    (g.level === null || isLevel(g.level)) &&
    (g.activity === null || isActivity(g.activity)) &&
    isInt(g.kcal) &&
    g.kcal > 0 &&
    validRatio(g.ratio) &&
    typeof basis === 'object' &&
    basis !== null &&
    isIsoTimestamp(basis.profileUpdatedAt)
  )
}

/** 저장된 값을 읽어 목표로 바꾼다. 구조가 조금이라도 어긋나면 일부만 살리지 않고 null(손상)이다. */
export function parseMealGoal(raw: unknown): MealGoal | null {
  if (!validGoalInput(raw)) return null
  const g = raw as unknown as Record<string, unknown>
  if (!isInt(g.revision) || g.revision < 1 || !isIsoTimestamp(g.updatedAt))
    return null
  return {
    v: 1,
    calculationVersion: g.calculationVersion as number,
    source: g.source as MealGoal['source'],
    purpose: g.purpose as MealGoal['purpose'],
    level: g.level as MealGoal['level'],
    activity: g.activity as MealGoal['activity'],
    kcal: g.kcal as number,
    ratio: { ...(g.ratio as MealGoalRatio) },
    basis: {
      profileUpdatedAt: (g.basis as { profileUpdatedAt: string })
        .profileUpdatedAt,
    },
    revision: g.revision,
    updatedAt: g.updatedAt,
  }
}

// ── 폼 입력 검증 ─────────────────────────────────────────

export interface GoalDraft {
  purpose: string
  activity: string
  /** 고급 직접 조정 입력(문자열 그대로) */
  kcal: string
  carb: string
  protein: string
  fat: string
}

export const EMPTY_DRAFT: GoalDraft = {
  purpose: '',
  activity: '',
  kcal: '',
  carb: '',
  protein: '',
  fat: '',
}

export type DraftField =
  'purpose' | 'activity' | 'kcal' | 'carb' | 'protein' | 'fat' | 'ratio'

export interface DraftIssue {
  field: DraftField
  message: string
}

const DIGITS = /^\d+$/

/** 비율 입력 세 칸의 합(숫자가 아닌 칸은 0으로 센다). 화면의 "합계 N%" 표시용이다. */
export function ratioTotal(draft: GoalDraft): number {
  const n = (text: string) =>
    DIGITS.test(text.trim()) ? Number(text.trim()) : 0
  return n(draft.carb) + n(draft.protein) + n(draft.fat)
}

/**
 * 폼 입력의 구조 검증. 문제를 모두 모아 돌려준다(첫 문제 순서가 화면의 포커스 순서다).
 * 활동량은 중급 폼에서만, 직접 조정(열량·비율)은 고급 폼에서만 검사한다.
 */
export function validateDraft(
  draft: GoalDraft,
  mode: MealGoalFormMode,
): readonly DraftIssue[] {
  const issues: DraftIssue[] = []
  if (!isPurpose(draft.purpose)) {
    issues.push({ field: 'purpose', message: '목적을 하나 골라 주세요.' })
  }
  if (mode === 'activity' && !isActivity(draft.activity)) {
    issues.push({ field: 'activity', message: '평소 활동량을 골라 주세요.' })
  }
  if (mode === 'advanced') {
    if (!DIGITS.test(draft.kcal.trim()) || Number(draft.kcal.trim()) <= 0) {
      issues.push({
        field: 'kcal',
        message: '하루 열량은 0보다 큰 정수(kcal)로 입력해 주세요.',
      })
    }
    for (const [field, label] of [
      ['carb', '탄수화물'],
      ['protein', '단백질'],
      ['fat', '지방'],
    ] as const) {
      if (!DIGITS.test(draft[field].trim())) {
        issues.push({
          field,
          message: `${label} 비율은 0 이상의 정수(%)로 입력해 주세요.`,
        })
      }
    }
    if (
      !issues.some(
        (i) => i.field === 'carb' || i.field === 'protein' || i.field === 'fat',
      ) &&
      ratioTotal(draft) !== 100
    ) {
      issues.push({
        field: 'ratio',
        message: `탄수화물·단백질·지방 비율의 합은 100%여야 해요. 지금은 ${ratioTotal(draft)}%예요.`,
      })
    }
  }
  return issues
}

// ── 신체 정보 입력 검증 ───────────────────────────────────

export interface ProfileDraft {
  age: string
  sex: string
  height: string
  weight: string
}

export type ProfileField = 'age' | 'sex' | 'height' | 'weight'

export type ProfileParse =
  | {
      ok: true
      value: {
        age: number
        sex: 'male' | 'female'
        heightCm: number
        weightKg: number
      }
    }
  | { ok: false; field: ProfileField; message: string }

/** 나이·성별·키·몸무게 입력을 검증한다. 나이는 14~100세 정수, 성별은 male/female만 받고 추정하지 않는다. */
export function parseProfileDraft(draft: ProfileDraft): ProfileParse {
  const age = draft.age.trim()
  if (
    !DIGITS.test(age) ||
    Number(age) < MEAL_GOAL_MIN_AGE ||
    Number(age) > MEAL_GOAL_MAX_AGE
  ) {
    return {
      ok: false,
      field: 'age',
      message: `나이는 ${MEAL_GOAL_MIN_AGE}~${MEAL_GOAL_MAX_AGE}세의 정수로 입력해 주세요.`,
    }
  }
  if (draft.sex !== 'male' && draft.sex !== 'female') {
    return { ok: false, field: 'sex', message: '성별을 선택해 주세요.' }
  }
  const height = parseMeasurement(draft.height, { min: 100, max: 230 })
  if (!height.ok) {
    return {
      ok: false,
      field: 'height',
      message: '키는 100~230cm 사이에서 소수점 첫째 자리까지 입력해 주세요.',
    }
  }
  const weight = parseMeasurement(draft.weight, { min: 25, max: 250 })
  if (!weight.ok) {
    return {
      ok: false,
      field: 'weight',
      message: '몸무게는 25~250kg 사이에서 소수점 첫째 자리까지 입력해 주세요.',
    }
  }
  return {
    ok: true,
    value: {
      age: Number(age),
      sex: draft.sex,
      heightCm: height.value,
      weightKg: weight.value,
    },
  }
}
