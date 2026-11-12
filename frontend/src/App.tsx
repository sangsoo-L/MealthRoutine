import { RouterProvider } from 'react-router/dom'
import { router } from './app/router.tsx'
import AuthProvider from './auth/AuthProvider.tsx'
import FavoritesProvider from './exercise/FavoritesProvider.tsx'
import WorkoutDraftProvider from './exercise/WorkoutDraftProvider.tsx'

/**
 * 공유 상태 제공자는 모든 라우트가 덮이도록 RouterProvider 바깥에 둔다.
 * FavoritesProvider·WorkoutDraftProvider는 인증 상태에 의존하므로 AuthProvider 안쪽이어야 하며, 비회원이면 아무것도 조회·저장하지 않는다.
 * WorkoutDraftProvider는 W02(운동 편집)와 W13(운동 선택)이 별도 라우트라 W02가 언마운트되어도 초안이 남도록 앱 수준에 둔다.
 */
export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <WorkoutDraftProvider>
          <RouterProvider router={router} />
        </WorkoutDraftProvider>
      </FavoritesProvider>
    </AuthProvider>
  )
}
