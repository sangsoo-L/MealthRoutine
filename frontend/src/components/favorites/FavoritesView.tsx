import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { pickerExerciseMeta } from '../../exercise/exercisePickerSearch.ts'
import type { Exercise } from '../../exercise/exerciseTypes.ts'
import type { ToggleResult } from '../../exercise/favoritesContext.ts'
import {
  formatKcal,
  portionGrams,
  scaleNutrition,
} from '../../food/foodNutrition.ts'
import { recordMealPath } from '../../food/foodPaths.ts'
import type { Food } from '../../food/foodTypes.ts'
import { FAVORITE_MESSAGES } from '../exercise/favoriteMessages.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'

export type FavoritesTab = 'food' | 'exercise'

/** 운동 즐겨찾기 영역의 상태. 비어 있음(ready + items 0건)과 불러오지 못함·연결 전은 서로 다른 안내다. */
export type ExerciseFavoritesSection =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; onRetry: () => void }
  | {
      kind: 'ready'
      items: readonly Exercise[]
      /** 즐겨찾기 id 중 운동 목록에서 찾지 못한 개수 */
      missing: number
    }

/** 음식 즐겨찾기 영역의 상태(운동과 같은 규칙: 비어 있음과 불러오지 못함·연결 전은 다른 안내다). */
export type FoodFavoritesSection =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; onRetry: () => void }
  | {
      kind: 'ready'
      items: readonly Food[]
      /** 즐겨찾기 id 중 음식 목록에서 찾지 못한 개수 */
      missing: number
    }

const TABS: readonly { value: FavoritesTab; label: string }[] = [
  { value: 'food', label: '음식' },
  { value: 'exercise', label: '운동' },
]

const tabId = (tab: FavoritesTab) => `favorites-tab-${tab}`
const panelId = (tab: FavoritesTab) => `favorites-panel-${tab}`

const primaryLink = `flex min-h-11 w-full items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`

/**
 * P07 즐겨찾기 본문. 음식·운동 탭(좌우 방향키·Home·End로 이동, 선택 탭은 밑줄, 운동은 개수 표시)과 목록.
 * - 운동: 이름·난이도·부위·도구, "자세히"(E02, 이 화면을 진입 경로로 넘긴다), 별 버튼(해제). 해제는 저장이 끝난 뒤에만 목록에서 빠지고
 *   결과를 보조기기에 알린다(승인된 즐겨찾기 문구). 실패하면 행 아래에 안내하고 목록은 그대로다.
 * - 음식: 이름(F02로 이동)·분류·1인분 열량(시안 예시 기준 100g), "기록하기"(D02 양 선택 팝업), 별 버튼(해제). 해제 규칙은 운동과 같다. 음식 데이터가 없으면(운영 빌드) "연결 전" 안내다.
 * - 비어 있으면 추가 방법과 찾아보기 버튼을 안내한다. 즐겨찾기 데이터 구조는 바꾸지 않고 읽기와 해제만 한다.
 */
export default function FavoritesView({
  tab,
  onTabChange,
  exercises,
  savingIds,
  failedIds,
  onRemove,
  foods,
  foodSavingIds,
  foodFailedIds,
  onRemoveFood,
}: {
  tab: FavoritesTab
  onTabChange: (tab: FavoritesTab) => void
  exercises: ExerciseFavoritesSection
  /** 해제 저장이 진행 중인 운동 id */
  savingIds: ReadonlySet<string>
  /** 직전 해제 저장이 실패한 운동 id */
  failedIds: ReadonlySet<string>
  /** 별 버튼. 저장 결과를 돌려준다(성공해야 목록에서 빠진다). */
  onRemove: (exerciseId: string) => Promise<ToggleResult>
  foods: FoodFavoritesSection
  /** 해제 저장이 진행 중인 음식 id */
  foodSavingIds: ReadonlySet<string>
  /** 직전 해제 저장이 실패한 음식 id */
  foodFailedIds: ReadonlySet<string>
  onRemoveFood: (foodId: string) => Promise<ToggleResult>
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<FavoritesTab, HTMLButtonElement>>>({})
  const [announce, setAnnounce] = useState('')

  const exerciseCount =
    exercises.kind === 'ready' ? exercises.items.length : null
  const foodCount = foods.kind === 'ready' ? foods.items.length : null

  function moveTab(next: FavoritesTab) {
    onTabChange(next)
    tabRefs.current[next]?.focus()
  }

  function handleTabKey(event: KeyboardEvent, index: number) {
    let target: number | null = null
    if (event.key === 'ArrowRight') target = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft')
      target = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = TABS.length - 1
    if (target === null) return
    event.preventDefault()
    moveTab(TABS[target].value)
  }

  async function remove(exercise: Exercise) {
    setAnnounce('')
    const result = await onRemove(exercise.id)
    if (result === 'removed') {
      setAnnounce(FAVORITE_MESSAGES.removed)
      // 눌렀던 별 버튼이 사라지므로 포커스가 문서 처음으로 빠지지 않게 목록 영역으로 옮긴다.
      panelRef.current?.focus()
    }
  }

  async function removeFood(food: Food) {
    setAnnounce('')
    const result = await onRemoveFood(food.id)
    if (result === 'removed') {
      setAnnounce(FAVORITE_MESSAGES.removed)
      panelRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          즐겨찾기
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          즐겨찾기한 음식과 운동을 한곳에서 확인하고 바로 기록하거나 자세히
          보고, 필요 없으면 해제해요.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="즐겨찾기 분류"
        className="flex border-b border-line"
      >
        {TABS.map((item, index) => {
          const selected = item.value === tab
          return (
            <button
              key={item.value}
              ref={(node) => {
                if (node) tabRefs.current[item.value] = node
              }}
              type="button"
              role="tab"
              id={tabId(item.value)}
              aria-selected={selected}
              aria-controls={panelId(item.value)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTabChange(item.value)}
              onKeyDown={(event) => handleTabKey(event, index)}
              className={`-mb-px flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-4 text-body leading-snug ${focusRing} ${
                selected
                  ? 'border-brand font-semibold text-brand'
                  : 'border-transparent font-normal text-muted hover:text-content'
              }`}
            >
              {item.label}
              {(item.value === 'exercise' ? exerciseCount : foodCount) !==
              null ? (
                <span
                  className={`${chipClass} ${selected ? 'border-brand/40 text-brand' : ''} tabular-nums`}
                >
                  <span className="sr-only">개수 </span>
                  {item.value === 'exercise' ? exerciseCount : foodCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {TABS.map((item) => (
        <div
          key={item.value}
          ref={item.value === tab ? panelRef : undefined}
          role="tabpanel"
          id={panelId(item.value)}
          aria-labelledby={tabId(item.value)}
          hidden={item.value !== tab}
          tabIndex={-1}
          className="outline-none"
        >
          {item.value !== tab ? null : item.value === 'food' ? (
            <FoodPanel
              section={foods}
              savingIds={foodSavingIds}
              failedIds={foodFailedIds}
              onRemove={removeFood}
            />
          ) : (
            <ExercisePanel
              section={exercises}
              savingIds={savingIds}
              failedIds={failedIds}
              onRemove={remove}
            />
          )}
        </div>
      ))}

      {/* 해제 결과를 알리는 보이지 않는 안내(눌렀던 버튼이 사라져도 읽힌다) */}
      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  )
}

function FoodPanel({
  section,
  savingIds,
  failedIds,
  onRemove,
}: {
  section: FoodFavoritesSection
  savingIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
  onRemove: (food: Food) => void
}) {
  if (section.kind === 'loading') {
    return (
      <p role="status" className={`${cardClass} text-body text-muted`}>
        즐겨찾기를 불러오는 중이에요…
      </p>
    )
  }
  if (section.kind === 'unavailable') {
    return (
      <div className={cardClass}>
        <p className="text-body leading-snug font-semibold text-content">
          음식 즐겨찾기는 연결 전이에요
        </p>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          음식 데이터가 아직 연결되지 않아 즐겨찾기를 보여 드릴 수 없어요.
        </p>
        <Link to="/foods" className={`mt-3 ${primaryLink}`}>
          음식 찾아보기
        </Link>
      </div>
    )
  }
  if (section.kind === 'error') {
    return (
      <div role="alert" className={cardClass}>
        <p className="text-body leading-snug font-semibold text-content">
          즐겨찾기를 불러오지 못했어요
        </p>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={section.onRetry}
          className={`mt-3 cursor-pointer ${primaryLink}`}
        >
          다시 시도
        </button>
      </div>
    )
  }
  const { items, missing } = section
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <div className={cardClass}>
          <p className="text-body leading-snug font-semibold text-content">
            즐겨찾기한 음식이 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            음식 검색 결과나 음식 상세 화면의 별 버튼을 누르면 이곳에 모여요.
          </p>
          <Link to="/foods" className={`mt-3 ${primaryLink}`}>
            음식 찾아보기
          </Link>
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {items.map((food) => {
            const saving = savingIds.has(food.id)
            // 1인분 열량: 시안 예시 기준(보통 = 100g)으로 환산한 값이다. 열량 정보가 없으면 0이 아니라 "열량 정보 없음"이다.
            const kcal = formatKcal(
              scaleNutrition(food.per100g, portionGrams('normal')).kcal,
            )
            return (
              <li key={food.id} data-favorite-food={food.id}>
                <div className="rounded-card border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-control bg-meal-soft text-meal"
                    >
                      <Icon name="utensils" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/foods/${encodeURIComponent(food.id)}`}
                        state={{ from: '/favorites?tab=food' }}
                        className={`text-section-title leading-snug font-semibold text-content underline-offset-2 hover:underline ${focusRing}`}
                      >
                        {food.name}
                      </Link>
                      <p className="mt-0.5 text-support leading-snug font-normal text-muted">
                        {food.category ? `${food.category} · ` : ''}
                        1인분 {kcal ?? '열량 정보 없음'}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`즐겨찾기 해제: ${food.name}`}
                      aria-disabled={saving || undefined}
                      onClick={() => {
                        if (!saving) onRemove(food)
                      }}
                      className={`-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-meal bg-meal-soft text-meal ${
                        saving ? 'cursor-wait opacity-60' : 'cursor-pointer'
                      } ${focusRing}`}
                    >
                      <Icon name="star" size={21} filled />
                    </button>
                  </div>
                  <Link
                    to={recordMealPath({ food: food.id })}
                    state={{ from: '/favorites?tab=food' }}
                    className={`mt-3 ${primaryLink}`}
                  >
                    기록하기
                    <span className="sr-only">: {food.name}</span>
                  </Link>
                  {failedIds.has(food.id) ? (
                    <p
                      role="alert"
                      className="mt-2 text-support leading-relaxed font-normal text-danger"
                    >
                      {FAVORITE_MESSAGES.saveFailed}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {missing > 0 ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          음식 목록에서 찾지 못한 즐겨찾기 {missing}개는 보이지 않아요.
        </p>
      ) : null}
    </div>
  )
}

function ExercisePanel({
  section,
  savingIds,
  failedIds,
  onRemove,
}: {
  section: ExerciseFavoritesSection
  savingIds: ReadonlySet<string>
  failedIds: ReadonlySet<string>
  onRemove: (exercise: Exercise) => void
}) {
  if (section.kind === 'loading') {
    return (
      <p role="status" className={`${cardClass} text-body text-muted`}>
        즐겨찾기를 불러오는 중이에요…
      </p>
    )
  }
  if (section.kind === 'unavailable') {
    return (
      <div className={cardClass}>
        <p className="text-body leading-relaxed font-normal text-content">
          {FAVORITE_MESSAGES.unavailable}
        </p>
      </div>
    )
  }
  if (section.kind === 'error') {
    return (
      <div role="alert" className={cardClass}>
        <p className="text-body leading-snug font-semibold text-content">
          즐겨찾기를 불러오지 못했어요
        </p>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={section.onRetry}
          className={`mt-3 cursor-pointer ${primaryLink}`}
        >
          다시 시도
        </button>
      </div>
    )
  }

  const { items, missing } = section
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <div className={cardClass}>
          <p className="text-body leading-snug font-semibold text-content">
            즐겨찾기한 운동이 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            운동 상세 화면의 별 버튼을 누르면 이곳에 모여요.
          </p>
          <Link to="/exercises" className={`mt-3 ${primaryLink}`}>
            운동 찾아보기
          </Link>
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-3">
          {items.map((exercise) => {
            const meta = pickerExerciseMeta(exercise)
            const saving = savingIds.has(exercise.id)
            return (
              <li key={exercise.id} data-favorite-item>
                <div className="rounded-card border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-control bg-exercise-soft text-exercise"
                    >
                      <Icon name="dumbbell" size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-section-title leading-snug font-semibold text-content">
                        {exercise.name}
                      </p>
                      {meta !== '' ? (
                        <p className="mt-0.5 text-support leading-snug font-normal text-muted">
                          {meta}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`즐겨찾기 해제: ${exercise.name}`}
                      aria-disabled={saving || undefined}
                      onClick={() => {
                        if (!saving) onRemove(exercise)
                      }}
                      className={`-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full border border-exercise bg-exercise-soft text-exercise ${
                        saving ? 'cursor-wait opacity-60' : 'cursor-pointer'
                      } ${focusRing}`}
                    >
                      <Icon name="star" size={21} filled />
                    </button>
                  </div>
                  <Link
                    to={`/exercises/${encodeURIComponent(exercise.id)}`}
                    state={{ from: '/favorites' }}
                    className={`mt-3 ${primaryLink}`}
                  >
                    자세히
                    <span className="sr-only">: {exercise.name}</span>
                  </Link>
                  {failedIds.has(exercise.id) ? (
                    <p
                      role="alert"
                      className="mt-2 text-support leading-relaxed font-normal text-danger"
                    >
                      {FAVORITE_MESSAGES.saveFailed}
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {missing > 0 ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          운동 목록에서 찾지 못한 즐겨찾기 {missing}개는 보이지 않아요.
        </p>
      ) : null}
    </div>
  )
}
