import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import SignupPinView from '../components/pin-settings/SignupPinView.tsx'

/**
 * P05 가입 설정 모드(`/signup/pin`). 회원가입(A03) 다음 단계에서 신체 정보 보호용 2차 비밀번호 6자리를 설정·확인하는 화면이다.
 * 비회원도 열 수 있다(가입 단계). 실제 가입·등록은 서버가 정해지기 전이라 이 화면은 입력 UI와 흐름 이동만 맡고, 번호는 저장하지 않는다.
 * 화면 제목(h1)은 이 화면이 그리고(라우트 handle.ownH1), 가입과 같이 하단 탭은 없다. 돌아가는 길은 폼의 "이전"(→ 회원가입)이다.
 */
export default function SignupPinPage() {
  usePageTitle('2차 비밀번호 설정')
  const { user } = useAuth()
  return (
    <div className="mx-auto w-full max-w-md pt-2 pb-6">
      <SignupPinView member={user !== null} />
    </div>
  )
}
