import { useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import MealPortionSheet from '../components/food/MealPortionSheet.tsx'
import MealRecordView, {
  type FoodPickTab,
} from '../components/food/MealRecordView.tsx'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import { toLocalDate } from '../exercise/workoutModel.ts'
import { useFoodFavorites } from '../food/foodFavorites.ts'
import { portionLabel, type Portion } from '../food/foodNutrition.ts'
import type { Food } from '../food/foodTypes.ts'
import {
  MEAL_LABEL,
  mealTypeFromParam,
  type MealRecord,
  type MealType,
} from '../food/mealModel.ts'
import { createMealRecordRepository } from '../food/mealSource.ts'
import { useFoods } from '../food/useFoods.ts'
import { useMealRecords } from '../food/useMealRecords.ts'

/** 저장 요청 식별자(영문·숫자·`-`·`_`). 같은 내용을 다시 보내는 재시도(응답 유실·연타)는 같은 식별자를 쓴다. */
function newRequestId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `d02-${Date.now().toString(36)}-${random}`
}

function saveErrorText(error: unknown): string {
  if (isWorkoutStoreError(error)) {
    if (error.code === 'revisionMismatch') {
      return '다른 곳에서 이 기록이 바뀌어 저장하지 않았어요. 화면을 새로 열어 다시 시도해 주세요.'
    }
    if (error.code === 'requestConflict') {
      return '같은 저장 요청에 다른 내용이 있어 저장하지 않았어요. 다시 시도해 주세요.'
    }
    if (error.reason === 'notFound') {
      return '이 기록을 찾을 수 없어요. 이미 삭제되었을 수 있어요.'
    }
    if (error.reason === 'validation') {
      return '저장할 수 없는 값이 있어요. 입력을 확인해 주세요.'
    }
    if (error.reason === 'unavailable') {
      return '이 환경에서는 식단 기록을 저장할 수 없어요.'
    }
  }
  return '식단 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

type Picker = { mode: 'new'; food: Food } | { mode: 'edit'; record: MealRecord }

/**
 * D02 오늘 식단 기록(`/records/meal/record`). 끼니 선택 → 음식 검색·즐겨찾기 → 양 선택 팝업 → 등록의 흐름이며, 오늘 기록한 음식을 수정·삭제한다.
 * 기록 날짜는 이 화면을 연 시점의 기기 날짜(오늘)다. 음식·끼니는 `?food=`·`?meal=`로, 수정은 `?edit=`(기록 id)로 미리 열 수 있다.
 * 등록은 저장소가 있고 음식 데이터가 연결된 경우에만 가능하다(운영 빌드는 준비 중 안내). 영양값은 음식 값을 저장 당시 스냅샷으로 보관한다.
 */
export default function MealRecordPage() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [localDate] = useState(() => toLocalDate(new Date()))
  const foods = useFoods()
  const favorites = useFoodFavorites()
  const records = useMealRecords(userId, localDate)
  const repository = useMemo(
    () => (userId ? createMealRecordRepository(userId) : null),
    [userId],
  )

  const [meal, setMeal] = useState<MealType | null>(() =>
    mealTypeFromParam(params.get('meal') ?? undefined),
  )
  const [tab, setTab] = useState<FoodPickTab>('search')
  const [query, setQuery] = useState('')
  const [picker, setPicker] = useState<Picker | null>(null)
  const [paramDismissed, setParamDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const request = useRef<{ signature: string; id: string } | null>(null)
  const busyRef = useRef(false)

  // URL의 ?food=·?edit=로 미리 열리는 팝업(닫거나 저장하면 다시 열리지 않는다).
  const foodParam = params.get('food')
  const editParam = params.get('edit')
  const paramFood =
    !paramDismissed && foodParam && foods.state.status === 'ready'
      ? (foods.state.foods.find((food) => food.id === foodParam) ?? null)
      : null
  const paramRecord =
    !paramDismissed && editParam && records.state.status === 'ready'
      ? (records.state.records.find((record) => record.id === editParam) ??
        null)
      : null
  const active: Picker | null =
    picker ??
    (paramRecord
      ? { mode: 'edit', record: paramRecord }
      : paramFood
        ? { mode: 'new', food: paramFood }
        : null)

  const canRecord = repository !== null && foods.state.status === 'ready'

  function dismissParams() {
    setParamDismissed(true)
    if (params.has('food') || params.has('edit')) {
      const next = new URLSearchParams(params)
      next.delete('food')
      next.delete('edit')
      setParams(next, { replace: true, state: location.state })
    }
  }

  function closePicker() {
    setPicker(null)
    setSheetError(null)
    request.current = null
    dismissParams()
  }

  function startPick(food: Food) {
    setNotice(null)
    setSheetError(null)
    request.current = null
    setPicker({ mode: 'new', food })
  }

  function startEdit(record: MealRecord) {
    setNotice(null)
    setSheetError(null)
    setDeleteTargetId(null)
    setPicker({ mode: 'edit', record })
  }

  async function submit(portion: Portion) {
    if (!active || !repository || !userId || busyRef.current) return
    if (active.mode === 'new' && meal === null) return
    busyRef.current = true
    setBusy(true)
    setSheetError(null)
    try {
      if (active.mode === 'new') {
        const target = meal as MealType
        const signature = `${localDate}|${target}|${active.food.id}|${portion}`
        if (request.current?.signature !== signature) {
          request.current = { signature, id: newRequestId() }
        }
        const result = await repository.create({
          requestId: request.current.id,
          localDate,
          mealType: target,
          food: active.food,
          portion,
        })
        setNotice(
          `${MEAL_LABEL[result.record.mealType]}에 “${result.record.foodName}”을(를) 등록했어요 (${portionLabel(result.record.portion, result.record.weightGrams)}).`,
        )
      } else {
        const updated = await repository.update(active.record.id, {
          expectedRevision: active.record.revision,
          portion,
        })
        setNotice(
          `“${updated.foodName}”의 양을 ${portionLabel(updated.portion, updated.weightGrams)}(으)로 수정했어요.`,
        )
      }
      request.current = null
      setPicker(null)
      dismissParams()
      records.reload()
    } catch (error) {
      setSheetError(saveErrorText(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function confirmDelete(record: MealRecord) {
    if (!repository || busyRef.current) return
    busyRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await repository.delete(record.id, {
        expectedRevision: record.revision,
      })
      setNotice(`“${record.foodName}” 기록을 삭제했어요.`)
      setDeleteTargetId(null)
      records.reload()
    } catch (error) {
      if (isWorkoutStoreError(error) && error.reason === 'notFound') {
        // 이미 지워진 기록이다. 목록만 새로 읽는다.
        setNotice(`“${record.foodName}” 기록은 이미 삭제되어 있어요.`)
        setDeleteTargetId(null)
        records.reload()
      } else {
        setDeleteError(saveErrorText(error))
      }
    } finally {
      busyRef.current = false
      setDeleting(false)
    }
  }

  const favoriteIds = favorites.ids
  const paramNotFound =
    !paramDismissed &&
    ((editParam && records.state.status === 'ready' && !paramRecord) ||
      (foodParam && foods.state.status === 'ready' && !paramFood))

  return (
    <>
      <MealRecordView
        localDate={localDate}
        meal={meal}
        onMealChange={setMeal}
        tab={tab}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        foods={foods.state}
        favoriteIds={favoriteIds}
        favoritesStatus={favorites.status}
        records={records.state}
        canRecord={canRecord}
        notice={
          notice ??
          (paramNotFound
            ? '요청한 음식이나 기록을 찾을 수 없어요. 아래에서 직접 골라 주세요.'
            : null)
        }
        onPick={startPick}
        onEditRecord={startEdit}
        deleteTargetId={deleteTargetId}
        deleting={deleting}
        deleteError={deleteError}
        onAskDelete={(record) => {
          setNotice(null)
          setDeleteError(null)
          setDeleteTargetId(record.id)
        }}
        onConfirmDelete={(record) => void confirmDelete(record)}
        onCancelDelete={() => {
          setDeleteTargetId(null)
          setDeleteError(null)
        }}
        onRetryFoods={foods.reload}
        onRetryRecords={records.reload}
      />
      {active ? (
        <MealPortionSheet
          key={
            active.mode === 'new' ? `new-${active.food.id}` : active.record.id
          }
          mode={active.mode}
          foodName={
            active.mode === 'new' ? active.food.name : active.record.foodName
          }
          per100g={
            active.mode === 'new'
              ? active.food.per100g
              : active.record.nutritionSnapshot
          }
          initialPortion={
            active.mode === 'new' ? 'normal' : active.record.portion
          }
          meal={active.mode === 'new' ? meal : active.record.mealType}
          onMealChange={active.mode === 'new' ? setMeal : undefined}
          busy={busy}
          error={sheetError}
          onSubmit={(portion) => void submit(portion)}
          onClose={closePicker}
        />
      ) : null}
    </>
  )
}
