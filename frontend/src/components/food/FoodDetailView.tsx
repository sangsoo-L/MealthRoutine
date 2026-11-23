import { Link } from 'react-router'
import {
  formatKcal,
  formatMacro,
  macroShare,
  scaleNutrition,
  type ScaledNutrition,
} from '../../food/foodNutrition.ts'
import type { Food, NutrientValue } from '../../food/foodTypes.ts'
import { FOOD_WEIGHT_CHOICES, recordMealPath } from '../../food/foodPaths.ts'
import type { FoodState } from '../../food/useFoods.ts'
import Icon from '../icons/Icon.tsx'
import FoodFavoriteButton from './FoodFavoriteButton.tsx'
import MacroShareBar from './MacroShareBar.tsx'
import {
  mealCard,
  mealChip,
  mealFocusRing,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

const UNKNOWN = '정보 없음'

function Row({
  label,
  per100g,
  selected,
}: {
  label: string
  per100g: string | null
  selected: string | null
}) {
  return (
    <tr className="border-t border-line">
      <th
        scope="row"
        className="py-2 pr-2 text-left text-support leading-snug font-normal text-muted"
      >
        {label}
      </th>
      <td className="py-2 text-right text-body tabular-nums text-content">
        {per100g ?? UNKNOWN}
      </td>
      <td className="py-2 pl-2 text-right text-body font-semibold tabular-nums text-content">
        {selected ?? UNKNOWN}
      </td>
    </tr>
  )
}

/** 루틴이 아닌 음식 상태 안내(불러오는 중·준비 중·불러오지 못함·없는 음식). */
export function FoodStateNotice({
  state,
  onRetry,
}: {
  state: Exclude<FoodState, { status: 'ready' }>
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <h1 className="text-app-title leading-snug font-semibold text-content">
        음식 영양정보
      </h1>
      {state.status === 'loading' ? (
        <p role="status" className={`${mealCard} text-body text-muted`}>
          음식 정보를 불러오는 중이에요…
        </p>
      ) : state.status === 'unavailable' ? (
        <div className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            음식 영양정보를 준비 중이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            음식 데이터가 아직 연결되지 않았어요.
          </p>
        </div>
      ) : state.status === 'error' ? (
        <div role="alert" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            음식 정보를 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 w-full ${mealSecondaryButton}`}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div role="status" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            음식을 찾을 수 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            주소가 올바르지 않거나 없는 음식이에요.
          </p>
        </div>
      )}
      {state.status !== 'loading' ? (
        <Link to="/foods" className={mealSecondaryButton}>
          음식 찾기로
        </Link>
      ) : null}
    </div>
  )
}

/**
 * F02 음식 영양정보와 알레르기 안내 본문. 음식명·분류, 먹은 양(중량) 선택, 선택량 영양정보(열량·3대 영양소 그래프), 100g 기준과 선택량 비교표,
 * 영양정보 확인 기준(출처·환산 방법), 알레르기·원재료 안내 순서다.
 *
 * - 선택량 영양값 = 100g 기준값 × 중량 ÷ 100. 값이 없는 영양소는 "정보 없음"으로 보이고 0으로 바꾸지 않는다. 그래프는 세 값이 모두 있을 때만 그린다.
 * - 알레르기·원재료: 원재료 데이터가 없어 항상 "확인 불가"로 안내하고 안전하다고 표시하지 않는다. 원본의 메모가 있으면 참고로만 보여 준다.
 * - 영양정보의 출처(개발용 예시 데이터)를 보이고 100g 기준값이라 환산하지 않았음을 밝힌다.
 * - 즐겨찾기 별과 식단 기록 아이콘은 음식명 오른쪽에 둔다(회원 전용). 비회원은 로그인 안내 한 줄만 본다.
 * - 목표 대비 비율은 식단 목표 설정(D01-4)이 없어 보여 주지 않고 준비 중임을 알린다.
 */
export default function FoodDetailView({
  food,
  grams,
  onGramsChange,
  isMember,
}: {
  food: Food
  grams: number
  onGramsChange: (grams: number) => void
  isMember: boolean
}) {
  const scaled: ScaledNutrition = scaleNutrition(food.per100g, grams)
  const share = macroShare([scaled])
  const per = food.per100g
  const macroLine = (value: NutrientValue) => formatMacro(value)
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {food.category ? (
              <p className="text-support leading-snug font-normal text-meal">
                {food.category}
              </p>
            ) : null}
            <h1 className="text-app-title leading-snug font-semibold text-content">
              {food.name}
            </h1>
          </div>
          {isMember ? (
            <div className="flex shrink-0 items-start gap-2">
              <FoodFavoriteButton foodId={food.id} foodName={food.name} />
              <Link
                to={recordMealPath({ food: food.id })}
                state={{ from: `/foods/${encodeURIComponent(food.id)}` }}
                aria-label={`식단에 기록: ${food.name}`}
                className={`flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:border-meal/40 hover:text-meal ${mealFocusRing}`}
              >
                <Icon name="clipboard-plus" size={21} />
              </Link>
            </div>
          ) : null}
        </div>
        <p className="mt-2">
          <span className={mealChip}>{food.source.label}</span>
        </p>
      </header>

      <section aria-labelledby="food-amount-title" className={mealCard}>
        <h2 id="food-amount-title" className={mealSectionTitle}>
          먹은 양과 영양정보
        </h2>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          먹은 양을 선택해 영양정보를 확인하세요.
        </p>
        <div
          role="group"
          aria-label="먹은 양(중량)"
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {FOOD_WEIGHT_CHOICES.map((choice) => {
            const selected = choice === grams
            return (
              <button
                key={choice}
                type="button"
                aria-pressed={selected}
                onClick={() => onGramsChange(choice)}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-body ${mealFocusRing} ${
                  selected
                    ? 'border-meal bg-meal-soft font-semibold text-meal'
                    : 'border-line bg-surface font-normal text-muted hover:text-content'
                }`}
              >
                {choice}g
              </button>
            )
          })}
        </div>
        <div className="mt-4 rounded-control bg-page p-3" aria-live="polite">
          <p className="text-support leading-snug font-normal text-muted">
            선택량 영양정보 · {grams}g
          </p>
          <p
            data-food-kcal
            className="mt-1 text-metric leading-none font-semibold tabular-nums text-content"
          >
            {scaled.kcal !== null ? Math.round(scaled.kcal) : UNKNOWN}
            {scaled.kcal !== null ? (
              <span className="ml-1 text-body font-normal text-muted">
                kcal / {grams}g
              </span>
            ) : null}
          </p>
        </div>
        <div className="mt-4">
          {share ? (
            <MacroShareBar share={share} />
          ) : (
            <p className="text-support leading-relaxed font-normal text-muted">
              탄수화물·단백질·지방 정보가 모두 있어야 비율 그래프를 보여 드려요.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="food-compare-title" className={mealCard}>
        <h2 id="food-compare-title" className={mealSectionTitle}>
          100g 기준과 선택량 비교
        </h2>
        <table className="mt-2 w-full">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                영양소
              </th>
              <th
                scope="col"
                className="py-1 text-right text-support leading-snug font-normal text-muted"
              >
                100g 기준
              </th>
              <th
                scope="col"
                className="py-1 pl-2 text-right text-support leading-snug font-normal text-muted"
              >
                선택량({grams}g)
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="열량"
              per100g={formatKcal(per.kcal)}
              selected={formatKcal(scaled.kcal)}
            />
            <Row
              label="탄수화물"
              per100g={macroLine(per.carb)}
              selected={macroLine(scaled.carb)}
            />
            <Row
              label="단백질"
              per100g={macroLine(per.protein)}
              selected={macroLine(scaled.protein)}
            />
            <Row
              label="지방"
              per100g={macroLine(per.fat)}
              selected={macroLine(scaled.fat)}
            />
          </tbody>
        </table>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          당류·나트륨·식이섬유는 현재 데이터에 없어 표시하지 않아요.
        </p>
      </section>

      <section
        aria-labelledby="food-basis-title"
        className="rounded-card border border-line bg-page p-4"
      >
        <h2 id="food-basis-title" className={mealSectionTitle}>
          영양정보 확인 기준
        </h2>
        <ul
          role="list"
          className="mt-2 flex list-none flex-col gap-1.5 text-support leading-relaxed font-normal text-content"
        >
          <li>출처: {food.source.label}. 실제 운영 데이터가 아니에요.</li>
          <li>
            영양값은 100g 기준 값이에요. 선택한 양의 영양값은 100g 기준값 × 중량
            ÷ 100으로 계산해요(100g 기준 원본이라 따로 환산하지 않았어요).
          </li>
          <li>값이 없는 영양소는 0이 아니라 “정보 없음”으로 보여요.</li>
        </ul>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          목표 대비 비율은 식단 목표 설정이 준비되면 보여 드려요.
        </p>
      </section>

      <section aria-labelledby="food-allergy-title" className={mealCard}>
        <h2 id="food-allergy-title" className={mealSectionTitle}>
          알레르기·원재료 안내
        </h2>
        <p className="mt-2 text-body leading-relaxed font-semibold text-content">
          원재료 정보가 없어 알레르기를 확인할 수 없어요(확인 불가)
        </p>
        {food.allergyNote ? (
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            원본 메모(참고용): {food.allergyNote}
          </p>
        ) : null}
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          이 안내는 안전을 보증하지 않아요. 알레르기가 있다면 포장이나 판매처의
          원재료 표시를 꼭 확인해 주세요.
        </p>
      </section>

      {!isMember ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          로그인하면 즐겨찾기에 추가하고 식단에 기록할 수 있어요.
        </p>
      ) : null}
    </div>
  )
}
