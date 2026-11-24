import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import { useBackNavigation } from '../components/layout/useBackTarget.ts'
import PinVerifyView from '../components/pin-settings/PinVerifyView.tsx'
import {
  BODY_UNLOCK_RETURN_PATH,
  safePinReturn,
} from '../pin-settings/pinSettingsPolicy.ts'

/**
 * P05 신체 정보 확인(`/mypage/body/unlock`). 가입 설정 모드(`/signup/pin`)는 이 화면에 없다(백엔드 인증 계약 확정 전까지 보류).
 * 회원 전용(AuthGate)이며 마이페이지(P01)의 "2차 비밀번호로 신체 정보 보기"에서 들어온다.
 * 모의 모드는 개발용 PIN 저장소, 실제 모드는 서버 PIN 확인(F5)을 쓰고, 성공하면 열람 표지를 앱 수준 메모리에 넣고 P01로 돌아간다.
 * 화면 제목(h1)은 이 화면이 그리고(라우트 handle.ownH1), 뒤로가기("이전")는 AppShell이 그린다.
 *
 * 취소가 돌아갈 곳은 `state.from`이 허용 목록(`PIN_RETURN_PATHS`)의 경로일 때 그곳이고, 아니면 마이페이지다.
 */
export default function PinVerifyPage() {
  const { user } = useAuth()
  usePageTitle('신체 정보 확인')
  const back = useBackNavigation(BODY_UNLOCK_RETURN_PATH)
  const cancelTo = safePinReturn(back?.to) ?? BODY_UNLOCK_RETURN_PATH
  // 계정이 바뀌면 입력·상태를 새로 시작한다.
  return user ? (
    <PinVerifyView key={user.id} ownerId={user.id} cancelTo={cancelTo} />
  ) : null
}
