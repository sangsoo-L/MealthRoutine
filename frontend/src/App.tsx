import { RouterProvider } from 'react-router/dom'
import { router } from './app/router.tsx'
import AuthProvider from './auth/AuthProvider.tsx'
import FavoritesProvider from './exercise/FavoritesProvider.tsx'
import WorkoutDraftProvider from './exercise/WorkoutDraftProvider.tsx'
import FoodFavoritesProvider from './food/FoodFavoritesProvider.tsx'

/**
 * 공유 상태 제공자는 모든 라우트가 덮이도록 RouterProvider 바깥에 둔다.
 * FavoritesProvider·FoodFavoritesProvider(음식 즐겨찾기)·WorkoutDraftProvider는 인증 상태에 의존하므로 AuthProvider 안쪽이어야 하며, 비회원이면 아무것도 조회·저장하지 않는다.
 * WorkoutDraftProvider는 W02(운동 편집)와 W13(운동 선택)이 별도 라우트라 W02가 언마운트되어도 초안이 남도록 앱 수준에 둔다.
 * 내일 운동 계획 초안은 day="tomorrow"인 두 번째 Provider가 따로 맡아 오늘 초안과 상태·임시 저장 키를 공유하지 않는다.
 */
export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <FoodFavoritesProvider>
          <WorkoutDraftProvider>
            <WorkoutDraftProvider day="tomorrow">
              <RouterProvider router={router} />
            </WorkoutDraftProvider>
          </WorkoutDraftProvider>
        </FoodFavoritesProvider>
      </FavoritesProvider>
    </AuthProvider>
  )
}
