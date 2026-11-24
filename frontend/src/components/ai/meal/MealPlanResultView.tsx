import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type {
  MealPlanItem,
  MealPlanNutrients,
  MealPlanResult,
  PlanRequestState,
} from '../../../ai/meal/mealPlanContract.ts'
import {
  describeConditions,
  type MealPlanSelection,
} from '../../../ai/meal/mealPlanFlow.ts'
import { PATH_AI_MEAL_FOODS } from '../../../ai/meal/mealPlanPaths.ts'
import { formatDateLabel } from '../../../exercise/workoutListView.ts'
import { MEAL_LABEL, type MealType } from '../../../food/mealModel.ts'
import { PATH_MEAL_PLAN } from '../../../food/foodPaths.ts'
import StepHeader from './MealPlanChrome.tsx'
import {
  choiceOff,
  choiceOn,
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  planSectionTitle,
  statusBox,
} from './mealPlanStyles.ts'

const TITLE: Record<PlanRequestState['status'], string> = {
  idle: '추천을 요청해 주세요',
  preparing: '요청을 준비하고 있어요',
  analyzing: '내일 식단을 구성하고 있어요',
  empty: '추천 조건을 다시 살펴볼까요?',
  error: '추천을 받지 못했어요',
  unavailable: 'AI 식단 추천은 연결 전이에요',
  ready: '먹을 양까지 확인해 주세요',
}

const fixed = (value: number | null, unit: string) =>
  value === null ? '정보 없음' : `${value.toLocaleString()}${unit}`

/** 서버가 준 영양 값을 그대로 글자로. 없는 값은 0이 아니라 "정보 없음"이다(합산·환산하지 않는다). */
function Nutrients({
  nutrients,
  hideUnset = false,
}: {
  nutrients: MealPlanNutrients | null
  hideUnset?: boolean
}) {
  if (nutrients === null) {
    return <p className="text-support font-normal text-muted">영양정보 없음</p>
  }
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-support leading-snug">
      {[
        ['열량', fixed(nutrients.kcal, ' kcal')],
        ['탄수화물', fixed(nutrients.carbG, 'g')],
        ['단백질', fixed(nutrients.proteinG, 'g')],
        ['지방', fixed(nutrients.fatG, 'g')],
      ]
        .filter(
          ([term, value]) =>
            !hideUnset || term === '열량' || value !== '정보 없음',
        )
        .map(([term, value]) => (
          <div key={term} className="flex flex-wrap gap-x-1.5">
            <dt className="font-normal text-muted">{term}</dt>
            <dd className="font-semibold tabular-nums text-content">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

function ItemCard({ item }: { item: MealPlanItem }) {
  const amount =
    item.quantity === null
      ? '양 정보 없음'
      : `${item.quantity.toLocaleString()}${item.unit ?? ''}`
  return (
    <article
      data-plan-item={item.foodId}
      className="flex flex-col gap-2 rounded-control border border-line bg-surface p-3"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="min-w-0 text-body leading-snug font-semibold wrap-break-word text-content">
          {item.foodName}
        </h3>
        <span className="text-support font-normal text-muted">{amount}</span>
      </header>
      <Nutrients nutrients={item.nutrients} />
      {item.reason ? (
        <p className="text-support leading-relaxed font-normal text-content">
          <strong className="font-semibold">추천 근거 </strong>
          {item.reason}
        </p>
      ) : null}
      {item.allergenNotes ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          원재료·알레르기: {item.allergenNotes}
        </p>
      ) : null}
    </article>
  )
}

/** 결과가 있을 때: 끼니 전환과 끼니별 음식. 서버가 준 값만 그리며 합계도 서버 값만 쓴다. */
function ResultMeals({ result }: { result: MealPlanResult }) {
  const [active, setActive] = useState<MealType | null>(null)
  const meal =
    result.meals.find((item) => item.meal === active) ?? result.meals[0]
  const targetKcal = meal.target?.kcal
  const totalKcal = meal.totals?.kcal
  // 서버가 반환한 두 열량의 표시용 차이만 계산한다. 영양 합계는 서버 값 그대로 사용한다.
  const difference =
    targetKcal != null && totalKcal != null
      ? Number((totalKcal - targetKcal).toFixed(2))
      : null
  return (
    <section
      aria-labelledby="plan-result-title"
      data-plan-result={result.requestId}
      className={`${mealCard} flex flex-col gap-3`}
    >
      <h2
        id="plan-result-title"
        tabIndex={-1}
        className={`${planSectionTitle} focus:outline-none`}
      >
        {formatDateLabel(result.targetDate)} 추천
      </h2>
      <div
        role="group"
        aria-label="끼니별 추천"
        className="flex flex-wrap gap-2"
      >
        {result.meals.map((item) => (
          <button
            key={item.meal}
            type="button"
            aria-pressed={item.meal === meal.meal}
            onClick={() => setActive(item.meal)}
            className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-control border px-3 text-body ${mealFocusRing} ${item.meal === meal.meal ? choiceOn : choiceOff}`}
          >
            {MEAL_LABEL[item.meal]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-support leading-snug">
        <p className="font-normal text-muted">끼니 목표 열량</p>
        <Nutrients nutrients={meal.target} hideUnset />
        <p className="mt-1 font-normal text-muted">추천 합계 · 서버 값</p>
        <Nutrients nutrients={meal.totals} />
        {difference !== null ? (
          <p
            className="text-support font-normal text-muted"
            data-plan-calorie-difference=""
          >
            {difference === 0
              ? '목표 열량과 일치'
              : `목표 대비 ${Math.abs(difference).toLocaleString()} kcal ${difference > 0 ? '초과' : '부족'}`}
          </p>
        ) : null}
      </div>
      {meal.warnings?.length ? (
        <ul
          role="list"
          aria-label="서버 안내"
          className="flex flex-col gap-1 rounded-control bg-warning-soft px-3 py-2 text-support text-warning"
        >
          {meal.warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {meal.items.length === 0 ? (
        <p className={statusBox}>이 끼니의 추천 음식 정보가 없어요.</p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {meal.items.map((item, index) => (
            <li key={`${item.foodId}-${index}`}>
              <ItemCard item={item} />
            </li>
          ))}
        </ul>
      )}
      <p
        role="note"
        className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
      >
        {meal.items.some((item) => !item.allergenNotes)
          ? '일부 또는 전체 음식의 원재료·알레르기 정보를 확인할 수 없어요. 안전하다는 뜻이 아니니 제품별 원재료와 알레르기 정보를 직접 확인해 주세요.'
          : '제품별 원재료와 알레르기 정보를 꼭 확인해 주세요.'}
      </p>
    </section>
  )
}

/** 상태 안내 칸. 오류·결과 없음·연결 전은 상태가 바뀔 때 이 칸으로 포커스를 옮겨 읽어 준다. */
function StatusPanel({
  request,
  devSearch,
  onRequest,
  onCancel,
  onRetry,
  onLeave,
}: {
  request: PlanRequestState
  devSearch: string
  onLeave: () => void
  onRequest: () => void
  onCancel: () => void
  onRetry: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const status = request.status
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (status === 'error' || status === 'empty' || status === 'unavailable') {
      ref.current?.focus({ preventScroll: true })
    }
  }, [status])

  if (status === 'ready') return null

  const common = `${mealCard} flex flex-col gap-3 focus:outline-none`
  if (status === 'analyzing' || status === 'preparing') {
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="status"
        aria-busy="true"
        data-plan-state={status}
        className={common}
      >
        <p className="text-body leading-relaxed font-normal text-content">
          {status === 'preparing'
            ? '추천 요청을 준비하고 있어요…'
            : '서버에서 조건에 맞는 식단을 분석하고 있어요…'}
        </p>
        {status === 'analyzing' ? (
          <button
            type="button"
            data-plan-cancel=""
            onClick={onCancel}
            className={mealSecondaryButton}
          >
            취소하고 조건으로 돌아가기
          </button>
        ) : null}
      </div>
    )
  }
  if (status === 'idle') {
    return (
      <div ref={ref} tabIndex={-1} data-plan-state="idle" className={common}>
        <p className="text-body leading-relaxed font-normal text-content">
          고른 끼니와 음식 조건을 확인했어요. 아래 버튼을 눌러야 추천을
          요청해요.
        </p>
        <button
          type="button"
          data-plan-request=""
          onClick={onRequest}
          className={mealPrimaryButton}
        >
          추천 요청하기
        </button>
      </div>
    )
  }
  const copy: Record<'empty' | 'error' | 'unavailable', string> = {
    empty:
      '조건에 맞게 계산할 수 있는 음식이 충분하지 않아요. 조건을 바꿔 다시 시도해 보세요. 이번 요청은 이용 횟수를 쓰지 않았어요.',
    error:
      '추천을 받지 못했어요. 입력한 조건은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
    unavailable:
      'AI 식단 추천이 아직 서버에 연결되지 않았어요. 추천 결과를 만들지 않았고 이용 횟수도 쓰지 않았어요. 연결되면 같은 조건으로 요청할 수 있어요.',
  }
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={status === 'error' ? 'alert' : 'status'}
      data-plan-state={status}
      className={common}
    >
      <p className="text-body leading-relaxed font-normal text-content">
        {copy[status]}
      </p>
      <div className="flex flex-col gap-2">
        {status === 'empty' || status === 'error' ? (
          <button
            type="button"
            data-plan-retry=""
            onClick={onRetry}
            className={mealPrimaryButton}
          >
            다시 요청하기
          </button>
        ) : null}
        <Link
          to={`${PATH_AI_MEAL_FOODS}${devSearch}`}
          data-plan-change=""
          onClick={onLeave}
          className={mealSecondaryButton}
        >
          조건 변경하기
        </Link>
      </div>
    </div>
  )
}

/**
 * I03-3 AI 식단 플랜 · 추천·등록(`/ai/meal/plan`). 요청 상태(요청 전·준비·분석 중·결과 없음·오류·연결 전·결과 있음)를 구분해 그린다.
 * - 서버 연결이 없으면 "연결 전"을 알릴 뿐 결과·합계·영양정보를 만들지 않는다. 개발용 고정 추천 결과도 없다.
 * - 결과가 있을 때도 서버가 준 값(항목·영양·합계)만 그리고, 없는 값은 0이 아니라 "정보 없음"이다. 항목을 더하거나 환산하지 않는다.
 * - 내일 식단 계획 등록은 API와 등록 정책이 정해질 때까지 열지 않는다: 등록 버튼·원재료 확인 체크는 막혀 있고, 등록 완료를 알리지 않는다.
 *   기존 내일 식단 계획(D02-1)과 저장소는 건드리지 않는다.
 */
export default function MealPlanResultView({
  selection,
  request,
  foodNameOf,
  devSearch = '',
  onRequest,
  onCancel,
  onRetry,
  onLeave,
}: {
  selection: MealPlanSelection
  request: PlanRequestState
  foodNameOf: (foodId: string) => string | null
  /** 이전 단계로 이동할 때 이어 갈 개발 검증 상태 검색 문자열(실제 흐름에서는 빈 문자열). */
  devSearch?: string
  onRequest: () => void
  onCancel: () => void
  onRetry: () => void
  /** 이전·조건 변경으로 이 화면을 떠날 때(진행 중 요청이 있으면 취소한다). */
  onLeave: () => void
}) {
  const { conditions, meals, targetDate } = selection
  const summary = describeConditions(conditions, foodNameOf)
  const registerNoteId = 'plan-register-note'
  // 분석 중이던 요청이 결과로 바뀌면 결과 제목으로 포커스를 옮겨 도착을 알린다(분석 중 안내가 사라지면서 포커스가 빠지는 것도 막는다).
  const previousStatus = useRef(request.status)
  useEffect(() => {
    const before = previousStatus.current
    previousStatus.current = request.status
    if (
      request.status === 'ready' &&
      (before === 'analyzing' || before === 'preparing')
    ) {
      document
        .getElementById('plan-result-title')
        ?.focus({ preventScroll: true })
    }
  }, [request.status])
  return (
    <>
      <StepHeader
        step="plan"
        title={TITLE[request.status]}
        focusTitle
        documentTitle="AI 식단 플랜 · 추천 확인"
      />

      <section
        aria-labelledby="plan-request-title"
        data-plan-request-summary=""
        className={mealCard}
      >
        <h2 id="plan-request-title" className={planSectionTitle}>
          요청한 조건
        </h2>
        <dl className="mt-2 flex flex-col gap-1.5 text-body leading-snug">
          {[
            [
              '날짜·끼니',
              `${targetDate ? `${formatDateLabel(targetDate)} · ` : ''}${meals.map((meal) => MEAL_LABEL[meal]).join(' · ')}`,
            ],
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
      </section>

      <StatusPanel
        request={request}
        devSearch={devSearch}
        onLeave={onLeave}
        onRequest={onRequest}
        onCancel={onCancel}
        onRetry={onRetry}
      />

      {request.status === 'ready' ? (
        <ResultMeals key={request.result.requestId} result={request.result} />
      ) : null}

      <section
        aria-labelledby="plan-register-title"
        data-plan-register=""
        className={`${mealCard} flex flex-col gap-3`}
      >
        <h2 id="plan-register-title" className={planSectionTitle}>
          내일 식단 계획에 등록
        </h2>
        <label className="flex min-h-11 items-start gap-3 text-body leading-snug font-normal text-muted">
          <input
            type="checkbox"
            disabled
            aria-describedby={registerNoteId}
            className="mt-0.5 size-5 shrink-0"
          />
          추천 음식의 원재료를 확인했어요
        </label>
        <button
          type="button"
          data-plan-register-button=""
          aria-disabled="true"
          aria-describedby={registerNoteId}
          className={`${mealPrimaryButton}`}
        >
          내일 식단으로 등록
        </button>
        <p id={registerNoteId} className={statusBox}>
          등록은 서버 연결과 등록 기준이 정해지면 열려요. 지금은 등록되지 않고,
          기존 내일 식단 계획에도 아무것도 추가하지 않아요.
        </p>
        <Link
          to={PATH_MEAL_PLAN}
          data-plan-d021=""
          className={mealSecondaryButton}
        >
          내일 식단 계획 화면으로 가기
        </Link>
      </section>

      <Link
        to={`${PATH_AI_MEAL_FOODS}${devSearch}`}
        data-plan-back=""
        onClick={onLeave}
        className={mealSecondaryButton}
      >
        이전
      </Link>
    </>
  )
}
