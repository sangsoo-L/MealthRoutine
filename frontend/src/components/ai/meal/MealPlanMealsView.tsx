import { Link } from 'react-router'
import type {
  MealPlanNutrients,
  MealPlanTargets,
  ServerInfoState,
} from '../../../ai/meal/mealPlanContract.ts'
import {
  allMealsSelected,
  isMealsComplete,
  type MealPlanSelection,
} from '../../../ai/meal/mealPlanFlow.ts'
import { PATH_AI_MEAL } from '../../../ai/meal/mealPlanPaths.ts'
import type { LocalDate } from '../../../exercise/workoutTypes.ts'
import { formatDateLabel } from '../../../exercise/workoutListView.ts'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  type MealType,
} from '../../../food/mealModel.ts'
import StepHeader, { FlowNotice } from './MealPlanChrome.tsx'
import {
  choiceOff,
  choiceOn,
  choiceRow,
  mealCard,
  mealPrimaryButton,
  mealSecondaryButton,
  statusBox,
} from './mealPlanStyles.ts'

/** 값과 단위를 함께 다룬다: 서버가 주지 않은 값(null)은 0이 아니라 단위 없이 "정보 없음"이다. */
const amount = (value: number | null, unit: string) =>
  value === null ? '정보 없음' : `${value.toLocaleString()}${unit}`

/** 서버가 준 끼니 목표량을 글자로. 없는 값은 0이 아니라 "정보 없음"이다. */
function targetLine(target: MealPlanNutrients): string {
  return `${amount(target.kcal, ' kcal')} · 탄수화물 ${amount(target.carbG, 'g')} · 단백질 ${amount(target.proteinG, 'g')} · 지방 ${amount(target.fatG, 'g')}`
}

/** 끼니 하나의 목표량 글자. 서버 값이 없으면 계산하지 않고 상태를 알린다. */
function targetText(
  meal: MealType,
  targets: ServerInfoState<MealPlanTargets>,
): string {
  if (targets.status === 'unavailable') return '목표량 연결 대기'
  if (targets.status === 'loading') return '목표량을 불러오는 중이에요'
  if (targets.status === 'error') return '목표량을 불러오지 못했어요'
  const found = targets.value.meals.find((item) => item.meal === meal)
  return found ? targetLine(found.target) : '목표량 정보 없음'
}

/**
 * I03-1 AI 식단 플랜 · 끼니 선택(`/ai/meal/meals`). 내일 추천받을 끼니를 아침·점심·저녁에서 여러 개 고른다(최소 1개).
 * 끼니별 목표량은 서버가 준 값만 보여 준다(`targets`). 30·40·30% 같은 배분을 프론트엔드가 계산하지 않으며, 값이 없으면 "연결 대기"다.
 * 선택은 Provider에 있어 이전 단계로 갔다 와도 유지된다. 끼니를 고르지 않으면 다음 단계로 갈 수 없다(aria-disabled, 이유를 글자로 알림).
 */
export default function MealPlanMealsView({
  tomorrow,
  selection,
  targets,
  notice,
  devSearch = '',
  onToggleMeal,
  onToggleAll,
  onDismissNotice,
  onNext,
}: {
  /** 지금 기준 내일 날짜(기기 로컬). */
  tomorrow: LocalDate
  selection: MealPlanSelection
  targets: ServerInfoState<MealPlanTargets>
  notice: string | null
  devSearch?: string
  onToggleMeal: (meal: MealType) => void
  onToggleAll: () => void
  onDismissNotice: () => void
  onNext: () => void
}) {
  const complete = isMealsComplete(selection)
  const all = allMealsSelected(selection)
  const summaryId = 'plan-meals-summary'
  return (
    <>
      <StepHeader
        step="meals"
        title={
          <>
            어느 끼니를
            <br />
            준비할까요?
          </>
        }
        description="한 끼부터 하루 식단까지, 필요한 끼니만 골라 주세요."
        focusTitle
      />
      <FlowNotice notice={notice} onDismiss={onDismissNotice} />

      <section
        aria-labelledby="plan-meals-title"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="plan-meals-title"
            data-plan-date={tomorrow}
            className="text-section-title leading-snug font-semibold text-content"
          >
            내일 · {formatDateLabel(tomorrow)}
          </h2>
          <button
            type="button"
            data-plan-meal-all=""
            onClick={onToggleAll}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-control border px-3 text-body ${all ? choiceOn : choiceOff}`}
          >
            {all ? '전체 해제' : '세 끼 모두 선택'}
          </button>
        </div>
        <ul role="list" className="flex flex-col gap-2">
          {MEAL_TYPES.map((meal) => {
            const on = selection.meals.includes(meal)
            return (
              <li key={meal}>
                <button
                  type="button"
                  aria-pressed={on}
                  data-plan-meal={meal}
                  onClick={() => onToggleMeal(meal)}
                  className={`${choiceRow} ${on ? choiceOn : choiceOff}`}
                >
                  <span className="min-w-0">
                    <span className="block text-body leading-snug font-semibold">
                      {MEAL_LABEL[meal]}
                    </span>
                    <span
                      data-plan-meal-target={meal}
                      className="block text-support leading-snug font-normal text-muted"
                    >
                      {targetText(meal, targets)}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-body">
                    {on ? '✓' : '＋'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="plan-meals-sum-title" className={mealCard}>
        <h2
          id="plan-meals-sum-title"
          className="text-support leading-snug font-semibold text-muted"
        >
          선택한 끼니
        </h2>
        <p
          id={summaryId}
          data-plan-meals-summary=""
          className="mt-1 text-body leading-relaxed font-semibold text-content"
        >
          {selection.meals.length > 0
            ? `${selection.meals.map((meal) => MEAL_LABEL[meal]).join(' · ')} ${selection.meals.length}끼를 골랐어요.`
            : '추천받을 끼니를 하나 이상 골라 주세요.'}
        </p>
        <p className={`mt-2 ${statusBox}`}>
          끼니당 목표 열량은 다음 단계에서 직접 입력할 수 있어요.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-plan-next=""
          aria-disabled={!complete || undefined}
          aria-describedby={complete ? undefined : summaryId}
          onClick={() => {
            if (complete) onNext()
          }}
          className={`${mealPrimaryButton}`}
        >
          음식 조건 선택하기
        </button>
        <Link
          to={`${PATH_AI_MEAL}${devSearch}`}
          data-plan-back=""
          className={mealSecondaryButton}
        >
          이전
        </Link>
      </div>
    </>
  )
}
