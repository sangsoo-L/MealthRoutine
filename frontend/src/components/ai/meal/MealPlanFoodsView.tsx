import { Link } from 'react-router'
import type {
  MealPlanCandidateCount,
  ServerInfoState,
} from '../../../ai/meal/mealPlanContract.ts'
import {
  describeConditions,
  hasAnyCondition,
  type FoodTypeChoice,
  type MealPlanSelection,
} from '../../../ai/meal/mealPlanFlow.ts'
import { PATH_AI_MEAL_MEALS } from '../../../ai/meal/mealPlanPaths.ts'
import { formatDateLabel } from '../../../exercise/workoutListView.ts'
import type { FoodsState } from '../../../food/useFoods.ts'
import { MEAL_LABEL } from '../../../food/mealModel.ts'
import { FOOD_TYPES, kindsFor } from '../../../pages/foodSearch.ts'
import Icon from '../../icons/Icon.tsx'
import StepHeader, { FlowNotice } from './MealPlanChrome.tsx'
import {
  choiceOff,
  choiceOn,
  disabledButton,
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  planSectionTitle,
  statusBox,
} from './mealPlanStyles.ts'

/**
 * 선택 항목 하나. 눈에 보이는 모양은 라벨이고 실제 조작은 기본 라디오·체크박스라서 화살표·스페이스 같은 키보드 조작을 그대로 지원한다.
 * 선택 여부는 색 외에 "✓" 글자로도 전한다.
 */
function Choice({
  kind,
  name,
  label,
  checked,
  onChange,
  describedBy,
}: {
  kind: 'radio' | 'checkbox'
  name: string
  label: string
  checked: boolean
  onChange: () => void
  describedBy?: string
}) {
  return (
    <label className="relative block">
      <input
        type={kind}
        name={name}
        checked={checked}
        onChange={onChange}
        aria-describedby={describedBy}
        className="peer sr-only"
      />
      <span
        className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-control border px-4 py-2 text-body peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-meal ${checked ? choiceOn : choiceOff}`}
      >
        <span className="min-w-0 wrap-break-word">{label}</span>
        <span aria-hidden="true" className="shrink-0">
          {checked ? '✓' : ''}
        </span>
      </span>
    </label>
  )
}

function CandidateCount({
  candidates,
}: {
  candidates: ServerInfoState<MealPlanCandidateCount>
}) {
  let text: string
  if (candidates.status === 'unavailable') {
    text =
      '계산 가능한 후보 수는 서버가 연결된 뒤에 확인할 수 있어요. 지금은 조건에 맞는 후보가 있는지 알 수 없어요.'
  } else if (candidates.status === 'loading') {
    text = '후보 수를 확인하는 중이에요…'
  } else if (candidates.status === 'error') {
    text = '후보 수를 확인하지 못했어요. 그래도 조건은 그대로 유지돼요.'
  } else if (candidates.value.count === 0) {
    text = '조건에 맞는 후보가 없어요. 조건을 바꿔 보세요.'
  } else {
    text = `계산 가능한 후보 ${candidates.value.count.toLocaleString()}개`
  }
  return (
    <section
      aria-labelledby="plan-candidates-title"
      data-plan-candidates={candidates.status}
      className={mealCard}
    >
      <h2 id="plan-candidates-title" className={planSectionTitle}>
        추천 후보
      </h2>
      <p
        role="status"
        className="mt-2 text-body leading-relaxed font-normal text-muted"
      >
        {text}
      </p>
    </section>
  )
}

/** 제외 음식 선택 영역. 음식 목록 조회 상태를 구분하고, 없는 데이터를 만들어 채우지 않는다. */
function ExcludedFoods({
  foods,
  excludedIds,
  onToggle,
  onRetry,
}: {
  foods: FoodsState
  excludedIds: readonly string[]
  onToggle: (foodId: string) => void
  onRetry: () => void
}) {
  if (foods.status === 'loading') {
    return (
      <p role="status" className={statusBox}>
        음식 목록을 불러오는 중이에요…
      </p>
    )
  }
  if (foods.status === 'unavailable') {
    return (
      <p data-plan-foods-state="unavailable" className={statusBox}>
        음식 데이터가 연결되기 전이라 빼고 싶은 음식을 고를 수 없어요.
      </p>
    )
  }
  if (foods.status === 'error') {
    return (
      <div role="alert" className={statusBox}>
        음식 목록을 불러오지 못했어요.
        <button
          type="button"
          onClick={onRetry}
          className={`mt-2 w-full ${mealSecondaryButton}`}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (foods.foods.length === 0) {
    return <p className={statusBox}>고를 수 있는 음식이 없어요.</p>
  }
  return (
    <ul role="list" className="flex flex-col gap-2">
      {foods.foods.map((food) => (
        <li key={food.id}>
          <Choice
            kind="checkbox"
            name="plan-excluded"
            label={food.name}
            checked={excludedIds.includes(food.id)}
            onChange={() => onToggle(food.id)}
            describedBy={`plan-excluded-source-${food.id}`}
          />
          <span
            id={`plan-excluded-source-${food.id}`}
            className="mt-0.5 block px-1 text-support leading-snug font-normal text-muted"
          >
            {food.source.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * I03-2 AI 식단 플랜 · 음식 조건 설정(`/ai/meal/foods`). F01과 같은 식품 구분(단일)·음식 종류(여러 개)와 제외 음식(여러 개)으로 후보를 좁힌다.
 * - 식품 구분을 바꾸면 새 구분에 맞지 않는 음식 종류는 풀리고 그 사실을 알린다(충돌 안내). 초기화는 조건만 비운다(끼니 선택은 유지).
 * - 후보 수·추천 가능 여부는 서버가 계산할 값이다. 음식 데이터(개발용 예시 4개)로 후보를 세지 않고 `candidates`가 없으면 "연결 대기"다.
 *   후보가 0개라고 서버가 알려 준 경우에만 추천 생성을 막는다.
 * - 선택한 조건은 Provider에 있어 이전 단계로 갔다 와도 유지된다. 제외 음식 목록은 F01과 같은 음식 조회(`useFoods`)를 읽기만 한다.
 */
export default function MealPlanFoodsView({
  selection,
  foods,
  candidates,
  notice,
  devSearch = '',
  onSetType,
  onToggleKind,
  onToggleExcluded,
  onReset,
  onRetryFoods,
  onDismissNotice,
  onNext,
}: {
  selection: MealPlanSelection
  foods: FoodsState
  candidates: ServerInfoState<MealPlanCandidateCount>
  notice: string | null
  devSearch?: string
  onSetType: (value: FoodTypeChoice) => void
  onToggleKind: (kind: string) => void
  onToggleExcluded: (foodId: string) => void
  onReset: () => void
  onRetryFoods: () => void
  onDismissNotice: () => void
  onNext: () => void
}) {
  const { conditions, meals, targetDate } = selection
  const kinds = kindsFor(conditions.type)
  const foodNameOf = (id: string) =>
    foods.status === 'ready'
      ? (foods.foods.find((food) => food.id === id)?.name ?? null)
      : null
  const summary = describeConditions(conditions, foodNameOf)
  const noCandidates =
    candidates.status === 'ready' && candidates.value.count === 0
  const touched = hasAnyCondition(conditions)
  const nextBlockedId = 'plan-foods-blocked'
  return (
    <>
      <StepHeader
        step="foods"
        title={
          <>
            어떤 음식으로
            <br />
            채울까요?
          </>
        }
        description="음식 종류와 제외할 음식을 정하면, 그 안에서 먹을 양을 맞춰요."
        focusTitle
      />
      <FlowNotice notice={notice} onDismiss={onDismissNotice} />

      <p
        data-plan-meals={meals.join(',')}
        className="rounded-control bg-meal-soft px-3 py-2 text-body leading-relaxed font-semibold text-meal"
      >
        {targetDate ? `${formatDateLabel(targetDate)} · ` : ''}
        {meals.map((meal) => MEAL_LABEL[meal]).join(' · ')}
      </p>

      <section
        aria-labelledby="plan-conditions-title"
        data-plan-conditions=""
        className={`${mealCard} flex flex-col gap-4`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="plan-conditions-title" className={planSectionTitle}>
            음식 조건
          </h2>
          <button
            type="button"
            data-plan-reset=""
            aria-disabled={!touched || undefined}
            onClick={() => {
              if (touched) onReset()
            }}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line bg-surface px-3 text-body font-semibold text-content ${mealFocusRing} ${disabledButton}`}
          >
            초기화
          </button>
        </div>

        <fieldset className="min-w-0">
          <legend className="text-body leading-snug font-semibold text-content">
            식품 구분
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 min-[18rem]:grid-cols-2">
            <Choice
              kind="radio"
              name="plan-food-type"
              label="전체"
              checked={conditions.type === null}
              onChange={() => onSetType(null)}
            />
            {FOOD_TYPES.map((type) => (
              <Choice
                key={type}
                kind="radio"
                name="plan-food-type"
                label={type}
                checked={conditions.type === type}
                onChange={() => onSetType(type)}
              />
            ))}
          </div>
        </fieldset>

        <details data-plan-kinds="" className="group min-w-0">
          <summary
            className={`flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-x-3 rounded-control border border-line px-4 py-2 text-body ${mealFocusRing}`}
          >
            <span className="font-semibold text-content">음식 종류</span>
            <span className="min-w-0 text-support font-normal wrap-break-word text-muted">
              {summary.kinds === '전체' ? '전체 종류' : summary.kinds}
            </span>
            <Icon
              name="chevron-down"
              size={18}
              className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <fieldset className="mt-2 min-w-0">
            <legend className="sr-only">음식 종류(여러 개 선택)</legend>
            <div className="grid grid-cols-1 gap-2 min-[18rem]:grid-cols-2">
              {kinds.map((kind) => (
                <Choice
                  key={kind}
                  kind="checkbox"
                  name="plan-food-kind"
                  label={kind}
                  checked={conditions.kinds.includes(kind)}
                  onChange={() => onToggleKind(kind)}
                />
              ))}
            </div>
          </fieldset>
        </details>

        <details data-plan-excluded="" className="group min-w-0">
          <summary
            className={`flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-x-3 rounded-control border border-line px-4 py-2 text-body ${mealFocusRing}`}
          >
            <span className="font-semibold text-content">빼고 싶은 음식</span>
            <span className="text-support font-normal text-muted">
              {conditions.excludedFoodIds.length}개 선택
            </span>
            <Icon
              name="chevron-down"
              size={18}
              className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            제외한 음식은 추천에 넣지 않아요.
          </p>
          <div className="mt-2">
            <ExcludedFoods
              foods={foods}
              excludedIds={conditions.excludedFoodIds}
              onToggle={onToggleExcluded}
              onRetry={onRetryFoods}
            />
          </div>
        </details>
      </section>

      <CandidateCount candidates={candidates} />

      <section
        aria-labelledby="plan-summary-title"
        data-plan-summary=""
        className={mealCard}
      >
        <h2 id="plan-summary-title" className={planSectionTitle}>
          선택한 조건
        </h2>
        <dl className="mt-2 flex flex-col gap-1.5 text-body leading-snug">
          {[
            ['식품 구분', summary.type],
            ['음식 종류', summary.kinds],
            ['제외 음식', summary.excluded],
          ].map(([term, value]) => (
            <div key={term} className="flex flex-wrap gap-x-2">
              <dt className="font-normal text-muted">{term}</dt>
              <dd className="min-w-0 font-semibold wrap-break-word text-content">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {!touched ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            조건 없이 모든 음식에서 추천받아요.
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-plan-next=""
          aria-disabled={noCandidates || undefined}
          aria-describedby={noCandidates ? nextBlockedId : undefined}
          onClick={() => {
            if (!noCandidates) onNext()
          }}
          className={`${mealPrimaryButton}`}
        >
          추천 생성
        </button>
        {noCandidates ? (
          <p
            id={nextBlockedId}
            className="text-support leading-relaxed font-semibold text-danger"
          >
            후보가 없어서 추천을 만들 수 없어요. 조건을 바꿔 주세요.
          </p>
        ) : null}
        <p className="text-support leading-relaxed font-normal text-muted">
          추천은 서버가 연결된 뒤에만 만들어져요. 지금은 연결 전이라 누르면 연결
          전 안내가 나오고, 이용 횟수는 쓰이지 않아요.
        </p>
        <Link
          to={`${PATH_AI_MEAL_MEALS}${devSearch}`}
          data-plan-back=""
          className={mealSecondaryButton}
        >
          이전
        </Link>
      </div>
    </>
  )
}
