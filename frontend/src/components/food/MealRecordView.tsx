import { Link } from 'react-router'
import type { Food } from '../../food/foodTypes.ts'
import type { FoodsState } from '../../food/useFoods.ts'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  groupByMeal,
  type MealEntry,
  type MealType,
} from '../../food/mealModel.ts'
import {
  foodSummary,
  incompleteNotice,
  summarizeMeals,
  totalKcalText,
} from '../../food/mealView.ts'
import {
  foodDetailPath,
  PATH_MEAL,
  PATH_MEAL_RECORD,
} from '../../food/foodPaths.ts'
import { PATH_PHOTO } from '../../photo-analysis/photoAnalysisPolicy.ts'
import Icon from '../icons/Icon.tsx'
import FoodFavoriteButton from './FoodFavoriteButton.tsx'
import MealRecordItem, { type MealEditAction } from './MealRecordItem.tsx'
import {
  mealCard,
  mealChip,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

export type FoodPickTab = 'search' | 'favorites'

/**
 * 같은 화면 구성을 쓰는 두 화면: D02 오늘 식단 기록(record)과 D02-1 내일 식단 계획(plan). 구성·동작은 같고 문구와 돌아올 경로만 다르다.
 * 두 화면의 데이터(실제 섭취 기록 / 계획)는 저장소가 서로 달라 한 화면에는 하나만 넘긴다.
 */
export type MealEntryVariant = 'record' | 'plan'

/** 한 날의 항목 조회 상태(useMealRecords·useMealPlans의 상태와 같은 모양). */
export type MealEntriesState<T extends MealEntry> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; records: readonly T[]; skippedCount: number }

/** 음식 검색 결과를 한 번에 보여 줄 최대 개수(서버 음식은 2만 건이 넘는다). */
const SHOWN_FOODS_LIMIT = 50

const COPY = {
  record: {
    chip: '오늘 실제 기록',
    title: '오늘 식단 기록',
    dateLabel: '기록 날짜',
    countLabel: '오늘 기록',
    kcalPrefix: '',
    groupSuffix: '기록',
    emptyMeal: '아직 기록하지 않았어요.',
    cardTitle: '식단 기록 기능을 준비 중이에요',
    cardBody:
      '음식 데이터와 저장 기능이 아직 연결되지 않아 지금은 기록할 수 없어요.',
    listTitle: '오늘 기록한 음식',
    loading: '오늘 기록을 불러오는 중이에요…',
    unavailable: '식단 기록 저장을 준비 중이에요.',
    errorTitle: '오늘 기록을 불러오지 못했어요',
    skipped: (n: number) => `읽을 수 없는 기록 ${n}개를 제외했어요.`,
    saveNote: '등록한 음식은 등록할 때 바로 저장돼요.',
    saveLabel: '오늘 기록 저장',
    fromPath: '/records/meal/record',
  },
  plan: {
    chip: '내일 계획 · 실제 섭취 아님',
    title: '내일 식단 계획',
    dateLabel: '계획 날짜',
    countLabel: '내일 계획',
    kcalPrefix: '예상 ',
    groupSuffix: '계획',
    emptyMeal: '아직 계획하지 않았어요.',
    cardTitle: '식단 계획 기능을 준비 중이에요',
    cardBody:
      '음식 데이터와 저장 기능이 아직 연결되지 않아 지금은 계획할 수 없어요.',
    listTitle: '내일 계획한 음식',
    loading: '내일 계획을 불러오는 중이에요…',
    unavailable: '식단 계획 저장을 준비 중이에요.',
    errorTitle: '내일 계획을 불러오지 못했어요',
    skipped: (n: number) => `읽을 수 없는 계획 ${n}개를 제외했어요.`,
    saveNote:
      '계획한 음식은 등록할 때 바로 저장돼요. 계획은 오늘 섭취량에 합산되지 않아요.',
    // 계획은 음식을 등록·수정·삭제할 때 바로 저장되고(성공 안내도 그때 한다), 이 버튼은 식단 대시보드로 돌아가는 링크일 뿐이라
    // 새로 저장하는 것처럼 보이지 않게 "계획 마치기"로 부른다(사용자 지시로 v5.0 문구 "내일 계획 저장"을 바꿨다).
    saveLabel: '계획 마치기',
    fromPath: '/records/meal/plan',
  },
} as const

const stepBadge =
  'mr-2 inline-flex size-6 items-center justify-center rounded-full bg-meal-soft text-support font-semibold text-meal'

/** D02의 음식 목록 한 줄(검색·즐겨찾기 탭 공용). 이름·분류·100g 열량과 "선택"(양 선택 팝업), 회원은 즐겨찾기 별. */
function FoodPickRow({
  food,
  onPick,
  disabled,
  fromPath,
}: {
  food: Food
  onPick: () => void
  disabled: boolean
  fromPath: string
}) {
  return (
    <li
      data-food-pick={food.id}
      className="flex items-start gap-2 rounded-card border border-line bg-surface p-4"
    >
      <div className="min-w-0 flex-1">
        <p className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
          {food.name}
        </p>
        <p className="mt-0.5 text-support leading-snug font-normal tabular-nums text-muted">
          {food.category ? `${food.category} · ` : ''}100g 기준{' '}
          {food.per100g.kcal !== null
            ? `${food.per100g.kcal}kcal`
            : '열량 정보 없음'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-disabled={disabled || undefined}
            aria-label={`선택: ${food.name}`}
            onClick={() => {
              if (!disabled) onPick()
            }}
            className={`${mealSecondaryButton} px-3`}
          >
            선택
          </button>
          <Link
            to={foodDetailPath(food.id)}
            state={{ from: fromPath }}
            className={`inline-flex min-h-11 items-center text-support font-semibold text-muted underline underline-offset-2 hover:text-meal ${mealFocusRing}`}
          >
            영양정보<span className="sr-only">: {food.name}</span>
          </Link>
        </div>
      </div>
      <FoodFavoriteButton foodId={food.id} foodName={food.name} />
    </li>
  )
}

/** 기록(또는 계획) 영역의 한 끼니 묶음. */
function MealGroup({
  meal,
  count,
  suffix,
  emptyText,
  children,
}: {
  meal: MealType
  count: number
  suffix: string
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={`${MEAL_LABEL[meal]} ${suffix}`}
      className="flex flex-col gap-2"
    >
      <h3 className="text-body leading-snug font-semibold text-content">
        {MEAL_LABEL[meal]}{' '}
        <span className="text-support font-normal tabular-nums text-muted">
          {count}개
        </span>
      </h3>
      {count === 0 ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          {emptyText}
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {children}
        </ul>
      )}
    </section>
  )
}

/**
 * D02 오늘 식단 기록(variant="record")과 D02-1 내일 식단 계획(variant="plan") 본문. 끼니 선택 → 음식 등록(음식 검색·즐겨찾기 탭) → 오늘 기록 목록(수정·삭제) → 하단 고정 저장 영역 순서다.
 * 음식을 고르면 양 선택 팝업(페이지가 연다)에서 적게·보통·많이를 골라 등록한다. 등록한 음식은 등록하는 순간 저장되고, 하단의 "오늘 기록 저장"은
 * 저장된 기록을 확인하고 식단 대시보드로 돌아간다. 음식 데이터·저장소가 없으면(운영 빌드) 등록하지 않고 준비 중임을 알린다.
 */
export default function MealRecordView<T extends MealEntry>({
  variant = 'record',
  localDate,
  meal,
  onMealChange,
  tab,
  onTabChange,
  query,
  onQueryChange,
  foods,
  favoriteIds,
  favoritesStatus,
  records,
  canRecord,
  notice,
  onPick,
  onEditRecord,
  deleteTargetId,
  deleting,
  deleteError,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onRetryFoods,
  onRetryRecords,
}: {
  variant?: MealEntryVariant
  /** 기록 날짜(D02) 또는 계획 날짜(D02-1) */
  localDate: string
  meal: MealType | null
  onMealChange: (meal: MealType) => void
  tab: FoodPickTab
  onTabChange: (tab: FoodPickTab) => void
  query: string
  onQueryChange: (query: string) => void
  foods: FoodsState
  favoriteIds: ReadonlySet<string>
  favoritesStatus: 'guest' | 'loading' | 'unavailable' | 'error' | 'ready'
  records: MealEntriesState<T>
  /** 음식 등록이 가능한가(음식 데이터와 저장소가 모두 있다). */
  canRecord: boolean
  /** 직전 동작의 결과 안내(등록·수정·삭제). */
  notice: string | null
  onPick: (food: Food) => void
  onEditRecord: (record: T) => void
  deleteTargetId: string | null
  deleting: boolean
  deleteError: string | null
  onAskDelete: (record: T) => void
  onConfirmDelete: (record: T) => void
  onCancelDelete: () => void
  onRetryFoods: () => void
  onRetryRecords: () => void
}) {
  const copy = COPY[variant]
  // 개발용 예시 음식이면 출처 라벨을 그대로 밝힌다. 문구를 소스에 고정하지 않고 음식 데이터의 라벨을 쓰므로 운영 빌드에는 이 안내가 들어가지 않는다.
  const devSourceLabel =
    foods.status === 'ready'
      ? (foods.foods.find((food) => food.source.kind === 'dev-sample')?.source
          .label ?? null)
      : null
  const list = records.status === 'ready' ? records.records : []
  const summary = summarizeMeals(list)
  const grouped = groupByMeal(list)
  const needle = query.trim().toLowerCase()
  const shownFoods =
    foods.status === 'ready'
      ? foods.foods
          .filter(
            (food) =>
              (tab === 'search' || favoriteIds.has(food.id)) &&
              (needle === '' || food.name.toLowerCase().includes(needle)),
          )
          .slice(0, SHOWN_FOODS_LIMIT)
      : []

  const editFor = (record: T): MealEditAction => ({
    type: 'button',
    onClick: () => onEditRecord(record),
  })

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <p className="mb-1">
          <span className={mealChip}>{copy.chip}</span>
        </p>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {copy.title}
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-muted">
          {copy.dateLabel} {localDate}
          {records.status === 'ready'
            ? ` · ${copy.countLabel} ${summary.totals.recordCount}개 · ${copy.kcalPrefix}${totalKcalText(summary.totals)}`
            : ''}
        </p>
        {variant === 'record' ? (
          // 명세 D02 path: "사진 → I04". 사진 음식 분석(AI)으로 가는 진입 링크이며 직접 기록은 그대로 이 화면에서 한다.
          <Link
            to={PATH_PHOTO}
            state={{ from: PATH_MEAL_RECORD }}
            data-photo-entry=""
            className={`mt-3 gap-2 ${mealSecondaryButton}`}
          >
            <Icon name="camera" size={18} />
            사진으로 식단 기록하기
          </Link>
        ) : null}
      </header>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-meal-soft px-3 py-2 text-support leading-relaxed font-semibold text-meal"
          >
            {notice}
          </p>
        ) : null}
      </div>

      {!canRecord ? (
        <div className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            {copy.cardTitle}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {copy.cardBody}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="meal-step-1">
        <h2 id="meal-step-1" className={mealSectionTitle}>
          <span aria-hidden="true" className={stepBadge}>
            1
          </span>
          끼니 선택
        </h2>
        <div
          role="radiogroup"
          aria-label="끼니"
          className="mt-3 grid grid-cols-3 gap-2"
        >
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={meal === type}
              onClick={() => onMealChange(type)}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-body ${mealFocusRing} ${
                meal === type
                  ? 'border-meal bg-meal-soft font-semibold text-meal'
                  : 'border-line bg-surface font-normal text-muted hover:text-content'
              }`}
            >
              {MEAL_LABEL[type]}
            </button>
          ))}
        </div>
        {meal === null ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            음식을 등록할 끼니를 먼저 골라 주세요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="meal-step-2">
        <h2 id="meal-step-2" className={mealSectionTitle}>
          <span aria-hidden="true" className={stepBadge}>
            2
          </span>
          음식 등록
        </h2>
        <div
          role="tablist"
          aria-label="음식 찾는 방법"
          className="mt-3 flex border-b border-line"
        >
          {(
            [
              ['search', '음식 검색'],
              ['favorites', '즐겨찾기'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => onTabChange(value)}
              className={`-mb-px flex min-h-11 flex-1 cursor-pointer items-center justify-center border-b-2 px-4 text-body ${mealFocusRing} ${
                tab === value
                  ? 'border-meal font-semibold text-meal'
                  : 'border-transparent font-normal text-muted hover:text-content'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor="meal-food-query" className="sr-only">
              음식 이름 검색
            </label>
            <input
              id="meal-food-query"
              type="search"
              value={query}
              autoComplete="off"
              spellCheck={false}
              maxLength={50}
              placeholder="음식 이름을 검색해 보세요"
              onChange={(event) => onQueryChange(event.target.value)}
              className="h-12 w-full rounded-full border border-muted/75 bg-surface px-4 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-meal focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-meal"
            />
          </div>
          {foods.status === 'loading' ? (
            <p role="status" className={`${mealCard} text-body text-muted`}>
              음식을 불러오는 중이에요…
            </p>
          ) : foods.status === 'unavailable' ? (
            <div className={mealCard}>
              <p className="text-body leading-snug font-semibold text-content">
                음식 검색을 준비하고 있어요
              </p>
              <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                음식 데이터가 아직 연결되지 않았어요.
              </p>
            </div>
          ) : foods.status === 'error' ? (
            <div role="alert" className={mealCard}>
              <p className="text-body leading-snug font-semibold text-content">
                음식을 불러오지 못했어요
              </p>
              <button
                type="button"
                onClick={onRetryFoods}
                className={`mt-3 w-full ${mealSecondaryButton}`}
              >
                다시 시도
              </button>
            </div>
          ) : tab === 'favorites' && favoritesStatus === 'loading' ? (
            <p role="status" className={`${mealCard} text-body text-muted`}>
              즐겨찾기를 불러오는 중이에요…
            </p>
          ) : tab === 'favorites' && favoritesStatus === 'unavailable' ? (
            <p className={`${mealCard} text-body text-muted`}>
              즐겨찾기 기능을 준비하고 있어요.
            </p>
          ) : tab === 'favorites' && favoritesStatus === 'error' ? (
            <p role="alert" className={`${mealCard} text-body text-danger`}>
              즐겨찾기를 불러오지 못했어요.
            </p>
          ) : shownFoods.length === 0 ? (
            <div role="status" className={mealCard}>
              <p className="text-body leading-snug font-semibold text-content">
                {tab === 'favorites' && needle === ''
                  ? '즐겨찾기한 음식이 없어요'
                  : '검색 결과가 없어요'}
              </p>
              <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                {tab === 'favorites' && needle === ''
                  ? '음식 검색에서 별을 눌러 즐겨찾기에 추가해 보세요.'
                  : '다른 검색어로 찾아보세요.'}
              </p>
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-3">
              {shownFoods.map((food) => (
                <FoodPickRow
                  key={food.id}
                  food={food}
                  disabled={!canRecord}
                  onPick={() => onPick(food)}
                  fromPath={copy.fromPath}
                />
              ))}
            </ul>
          )}
          {devSourceLabel ? (
            <p className="text-support leading-relaxed font-normal text-muted">
              음식 정보 출처: {devSourceLabel}. 실제 운영 데이터가 아니에요.
            </p>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="meal-today-title"
        className="flex flex-col gap-4"
      >
        <h2 id="meal-today-title" className={mealSectionTitle}>
          {copy.listTitle}
        </h2>
        {records.status === 'loading' ? (
          <p role="status" className={`${mealCard} text-body text-muted`}>
            {copy.loading}
          </p>
        ) : records.status === 'unavailable' ? (
          <p className={`${mealCard} text-body text-muted`}>
            {copy.unavailable}
          </p>
        ) : records.status === 'error' ? (
          <div role="alert" className={mealCard}>
            <p className="text-body leading-snug font-semibold text-content">
              {copy.errorTitle}
            </p>
            <button
              type="button"
              onClick={onRetryRecords}
              className={`mt-3 w-full ${mealSecondaryButton}`}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {MEAL_TYPES.map((type) => (
              <MealGroup
                key={type}
                meal={type}
                count={grouped[type].length}
                suffix={copy.groupSuffix}
                emptyText={copy.emptyMeal}
              >
                {grouped[type].map((record) => (
                  <MealRecordItem
                    key={record.id}
                    record={record}
                    edit={editFor(record)}
                    onDelete={() => onAskDelete(record)}
                    confirmingDelete={deleteTargetId === record.id}
                    deleting={deleting}
                    deleteError={
                      deleteTargetId === record.id ? deleteError : null
                    }
                    onConfirmDelete={() => onConfirmDelete(record)}
                    onCancelDelete={onCancelDelete}
                  />
                ))}
              </MealGroup>
            ))}
            {incompleteNotice(summary.totals) ? (
              <p className="text-support leading-relaxed font-normal text-muted">
                {incompleteNotice(summary.totals)}
              </p>
            ) : null}
            {records.skippedCount > 0 ? (
              <p className="text-support leading-relaxed font-normal text-muted">
                {copy.skipped(records.skippedCount)}
              </p>
            ) : null}
          </>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface px-5 py-3">
        <p className="mb-2 text-support leading-snug font-normal text-muted">
          {MEAL_TYPES.map(
            (type) => `${MEAL_LABEL[type]} ${grouped[type].length}개`,
          ).join(' · ')}
          {foodSummary(list) !== '' ? ` · ${foodSummary(list)}` : ''} ·{' '}
          {copy.saveNote}
        </p>
        <Link to={PATH_MEAL} className={mealPrimaryButton}>
          {copy.saveLabel}
        </Link>
      </div>
    </div>
  )
}
