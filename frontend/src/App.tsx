import { RouterProvider } from 'react-router/dom'
import { router } from './app/router.tsx'
import AuthProvider from './auth/AuthProvider.tsx'
import FavoritesProvider from './exercise/FavoritesProvider.tsx'
import WorkoutDraftProvider from './exercise/WorkoutDraftProvider.tsx'
import FoodFavoritesProvider from './food/FoodFavoritesProvider.tsx'
import MealPlanFlowProvider from './ai/meal/MealPlanFlowProvider.tsx'
import PhotoAnalysisFlowProvider from './photo-analysis/PhotoAnalysisFlowProvider.tsx'

/**
 * 공유 상태 제공자는 모든 라우트가 덮이도록 RouterProvider 바깥에 둔다.
 * FavoritesProvider·FoodFavoritesProvider(음식 즐겨찾기)·WorkoutDraftProvider는 인증 상태에 의존하므로 AuthProvider 안쪽이어야 하며, 비회원이면 아무것도 조회·저장하지 않는다.
 * WorkoutDraftProvider는 W02(운동 편집)와 W13(운동 선택)이 별도 라우트라 W02가 언마운트되어도 초안이 남도록 앱 수준에 둔다.
 * 내일 운동 계획 초안은 day="tomorrow"인 두 번째 Provider가 따로 맡아 오늘 초안과 상태·임시 저장 키를 공유하지 않는다.
 * MealPlanFlowProvider는 AI 식단 플랜(I03~I03-3) 4개 화면의 끼니·음식 조건과 추천 요청 상태를 메모리에만 둔다(경로가 바뀌면 화면이 다시 마운트되므로 앱 수준).
 * PhotoAnalysisFlowProvider는 음식 사진 분석(I04·I04-1)이 공유하는 선택 사진(메모리)과 분석 요청 상태를 같은 이유로 앱 수준에 둔다.
 */
export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <FoodFavoritesProvider>
          <WorkoutDraftProvider>
            <WorkoutDraftProvider day="tomorrow">
              <MealPlanFlowProvider>
                <PhotoAnalysisFlowProvider>
                  <RouterProvider router={router} />
                </PhotoAnalysisFlowProvider>
              </MealPlanFlowProvider>
            </WorkoutDraftProvider>
          </WorkoutDraftProvider>
        </FoodFavoritesProvider>
      </FavoritesProvider>
    </AuthProvider>
  )
}
