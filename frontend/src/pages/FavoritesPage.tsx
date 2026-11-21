import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import FavoritesView, {
  type ExerciseFavoritesSection,
  type FavoritesTab,
  type FoodFavoritesSection,
} from '../components/favorites/FavoritesView.tsx'
import { pickFavoriteExercises } from '../exercise/exercisePickerSearch.ts'
import { useFavorites } from '../exercise/favoritesContext.ts'
import { useExerciseCatalog } from '../exercise/useExerciseCatalog.ts'
import { useFoodFavorites } from '../food/foodFavorites.ts'
import { useFoods } from '../food/useFoods.ts'

/**
 * P07 즐겨찾기(`/favorites`, 회원 전용: 라우트의 AuthGate). 즐겨찾기 상태는 앱 공유 상태(FavoritesProvider)를 그대로 쓰고
 * E02·W13과 같은 값이다. 운동 정보는 운동 목록을 한 번 조회해(useExerciseCatalog) id와 맞춘다(운동마다 조회하지 않는다).
 * 음식 즐겨찾기는 운동과 별개의 공유 상태(FoodFavoritesProvider)를 쓰며 F01·F02·D02와 같은 값이다(계정별 분리).
 * 선택한 탭은 주소(`?tab=food`)에 보관한다. 즐겨찾기 저장 구조는 바꾸지 않고 읽기와 해제만 한다.
 */
export default function FavoritesPage() {
  const favorites = useFavorites()
  const catalog = useExerciseCatalog()
  const [params, setParams] = useSearchParams()
  const tab: FavoritesTab = params.get('tab') === 'food' ? 'food' : 'exercise'

  const { status: favoritesStatus, ids, reload: reloadFavorites } = favorites
  const { state: catalogState, reload: reloadCatalog } = catalog

  const exercises = useMemo<ExerciseFavoritesSection>(() => {
    if (favoritesStatus === 'error')
      return { kind: 'error', onRetry: reloadFavorites }
    if (
      favoritesStatus === 'unavailable' ||
      catalogState.status === 'unavailable'
    )
      return { kind: 'unavailable' }
    if (catalogState.status === 'error')
      return { kind: 'error', onRetry: reloadCatalog }
    // guest는 AuthGate가 막아 닿지 않는다(방어로 불러오는 중으로 둔다).
    if (favoritesStatus !== 'ready' || catalogState.status !== 'ready')
      return { kind: 'loading' }
    return {
      kind: 'ready',
      ...pickFavoriteExercises(catalogState.exercises, ids),
    }
  }, [favoritesStatus, ids, catalogState, reloadFavorites, reloadCatalog])

  // 음식 즐겨찾기: 운동과 별개의 공유 상태(FoodFavoritesProvider)와 음식 목록을 id로 맞춘다. 훅이 마운트될 때 처음으로 조회가 시작된다.
  const foodFavorites = useFoodFavorites()
  const foodList = useFoods()
  const {
    status: foodFavoritesStatus,
    ids: foodIds,
    reload: reloadFoodFavorites,
  } = foodFavorites
  const { state: foodListState, reload: reloadFoodList } = foodList

  const foods = useMemo<FoodFavoritesSection>(() => {
    if (foodFavoritesStatus === 'error')
      return { kind: 'error', onRetry: reloadFoodFavorites }
    if (
      foodFavoritesStatus === 'unavailable' ||
      foodListState.status === 'unavailable'
    )
      return { kind: 'unavailable' }
    if (foodListState.status === 'error')
      return { kind: 'error', onRetry: reloadFoodList }
    if (foodFavoritesStatus !== 'ready' || foodListState.status !== 'ready')
      return { kind: 'loading' }
    const items = foodListState.foods.filter((food) => foodIds.has(food.id))
    return { kind: 'ready', items, missing: foodIds.size - items.length }
  }, [
    foodFavoritesStatus,
    foodIds,
    foodListState,
    reloadFoodFavorites,
    reloadFoodList,
  ])

  return (
    <FavoritesView
      tab={tab}
      onTabChange={(next) =>
        setParams(next === 'exercise' ? {} : { tab: next }, { replace: true })
      }
      exercises={exercises}
      savingIds={favorites.savingIds}
      failedIds={favorites.failedIds}
      onRemove={favorites.toggle}
      foods={foods}
      foodSavingIds={foodFavorites.savingIds}
      foodFailedIds={foodFavorites.failedIds}
      onRemoveFood={foodFavorites.toggle}
    />
  )
}
