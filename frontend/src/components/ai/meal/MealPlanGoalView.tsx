import { Link } from 'react-router'
import {
  PATH_AI_MEAL,
  PATH_AI_MEAL_MEALS,
} from '../../../ai/meal/mealPlanPaths.ts'
import { PATH_MEAL_GOAL } from '../../../meal-goal/mealGoalPaths.ts'
import {
  PURPOSE_LABEL,
  isPolicyVerified,
} from '../../../meal-goal/mealGoalPolicy.ts'
import type { MealGoal } from '../../../meal-goal/mealGoalTypes.ts'
import Icon from '../../icons/Icon.tsx'
import StepHeader from './MealPlanChrome.tsx'
import {
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  planChip,
  planSectionTitle,
  statusBox,
} from './mealPlanStyles.ts'

/** 목표의 에너지 비율 막대·범례 한 줄. 색 구분은 기존 토큰(식단·브랜드·경고)이며 이름·비율을 글자로 함께 쓴다. */
const MACROS = [
  { key: 'carb', label: '탄수화물', bar: 'bg-meal' },
  { key: 'protein', label: '단백질', bar: 'bg-brand' },
  { key: 'fat', label: '지방', bar: 'bg-warning' },
] as const

/**
 * I03 AI 식단 플랜 · 목표 확인(`/ai/meal`). 저장된 식단 목표와 알레르기 정보 상태를 확인하고 끼니 선택(I03-1)으로 간다.
 * 표시 규칙(프론트엔드는 계산하지 않는다):
 * - 목표 열량·에너지 비율은 저장된 값을 그대로 보여 준다. 탄단지 g은 서버가 계산해 줄 값이라 "연결 대기"로 둔다(환산하지 않는다).
 * - 계산 기준이 검증되지 않은 목표(isPolicyVerified가 false)는 그 사실을 함께 알린다. 검증된 값으로 보이지 않게 한다.
 * - 알레르기 정보는 아직 불러올 수 없어서 "연결 전"이다. 정보가 없다는 뜻("알레르기 없음")으로 쓰지 않고 안전 여부를 판정하지 않는다.
 */
export default function MealPlanGoalView({
  goal,
  devSearch = '',
}: {
  goal: MealGoal
  devSearch?: string
}) {
  const verified = isPolicyVerified(goal.calculationVersion)
  return (
    <>
      <StepHeader
        step="goal"
        title={
          <>
            먹을 음식과 양까지,
            <br />
            내일 식단을 준비해요
          </>
        }
        description="음식 검색과 같은 영양정보를 바탕으로 끼니별 구성을 제안해요."
        documentTitle="AI 식단 플랜 · 목표 확인"
      />

      <section
        aria-labelledby="plan-goal-title"
        data-plan-goal=""
        className={mealCard}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="plan-goal-title"
            className="text-support leading-snug font-semibold text-muted"
          >
            나의 식단 목표
          </h2>
          {!verified ? (
            <span data-plan-goal-unverified="" className={planChip}>
              계산 기준 검증 전
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <strong className="text-metric leading-none font-semibold tabular-nums text-content">
            하루 {goal.kcal.toLocaleString()} kcal
          </strong>
          <span className="rounded-full bg-meal-soft px-3 py-1 text-support leading-snug font-semibold text-meal">
            {PURPOSE_LABEL[goal.purpose]}
          </span>
        </div>
        {!verified ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            이 목표는 계산 기준이 전문가 검증을 마치기 전의 값이에요. 추천의
            확정된 기준으로 쓰지 않고, 서버에서 확인한 값이 연결되면 그 값을
            따라요.
          </p>
        ) : null}
        <div
          role="img"
          aria-label={`목표 열량 비율 탄수화물 ${goal.ratio.carb}%, 단백질 ${goal.ratio.protein}%, 지방 ${goal.ratio.fat}%`}
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-line"
        >
          {MACROS.map((macro) =>
            goal.ratio[macro.key] > 0 ? (
              <span
                key={macro.key}
                className={macro.bar}
                style={{ width: `${goal.ratio[macro.key]}%` }}
              />
            ) : null,
          )}
        </div>
        <ul role="list" className="mt-3 flex flex-col gap-1.5">
          {MACROS.map((macro) => (
            <li
              key={macro.key}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body leading-snug"
            >
              <span
                aria-hidden="true"
                className={`size-2.5 shrink-0 rounded-full ${macro.bar}`}
              />
              <span className="font-normal text-content">{macro.label}</span>
              <span className="font-semibold tabular-nums text-content">
                {goal.ratio[macro.key]}%
              </span>
              <span
                data-plan-macro-grams={macro.key}
                className="text-support font-normal text-muted"
              >
                · g 목표량 연결 대기
              </span>
            </li>
          ))}
        </ul>
        <Link
          to={PATH_MEAL_GOAL}
          state={{ from: PATH_AI_MEAL }}
          data-plan-goal-edit=""
          className={`mt-3 flex min-h-11 items-center justify-between gap-2 border-t border-line text-body font-semibold text-meal ${mealFocusRing}`}
        >
          식단 목표 다시 정하기
          <Icon name="chevron-right" size={18} />
        </Link>
      </section>

      <section aria-labelledby="plan-principle-title" className={mealCard}>
        <h2 id="plan-principle-title" className={planSectionTitle}>
          이렇게 추천해요
        </h2>
        <ul
          role="list"
          className="mt-2 flex flex-col gap-2 text-body leading-relaxed font-normal text-content"
        >
          <li>등록된 음식 가운데 조건에 맞는 음식을 찾아요.</li>
          <li>먹을 양에 맞춰 열량과 영양소를 서버에서 계산해요.</li>
        </ul>
        <details
          data-plan-source=""
          className="mt-3 rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
        >
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal">
            음식 데이터와 영양정보 출처
          </summary>
          <ul role="list" className="flex flex-col gap-1.5 pb-2">
            <li>음식 검색(F01)과 같은 음식 데이터를 쓰도록 준비하고 있어요.</li>
            <li>
              영양값은 음식의 기준 영양값과 먹을 양으로 계산해요. AI가 영양값을
              새로 만들지 않아요.
            </li>
            <li>
              데이터 출처·식품 코드·기준일은 서버가 연결된 뒤 음식마다 확인할 수
              있어요. 지금은 연결 전이에요.
            </li>
          </ul>
        </details>
      </section>

      <section
        aria-labelledby="plan-allergy-title"
        data-plan-allergy=""
        className={mealCard}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="plan-allergy-title" className={planSectionTitle}>
            알레르기 정보
          </h2>
          <span className={planChip}>연결 전</span>
        </div>
        <p className={`mt-2 ${statusBox}`}>
          알레르기 정보를 아직 불러올 수 없어요. 정보를 확인해야 해요.
          알레르기가 없다는 뜻이 아니에요.
        </p>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          프로필 관리(P02)는 준비 중이라 지금은 수정할 수 없어요. 성분표만으로
          알레르기 안전성을 판단할 수 없으니, 추천을 받은 뒤에도 원재료를 꼭
          확인해 주세요.
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Link
          to={`${PATH_AI_MEAL_MEALS}${devSearch}`}
          data-plan-next=""
          className={mealPrimaryButton}
        >
          추천받을 끼니 선택하기
        </Link>
        <p className="text-support leading-relaxed font-normal text-muted">
          추천 결과와 이용 가능 횟수는 서버가 연결된 뒤에 확인할 수 있어요.
          지금은 끼니와 음식 조건까지 미리 골라 볼 수 있어요.
        </p>
      </div>
    </>
  )
}
