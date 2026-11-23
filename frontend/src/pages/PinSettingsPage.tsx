import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import PinSettingsView from '../components/pin-settings/PinSettingsView.tsx'
import { useBackNavigation } from '../components/layout/useBackTarget.ts'
import {
  safePinReturn,
  type PinReturn,
  type PinSettingsMode,
} from '../pin-settings/pinSettingsPolicy.ts'

const TITLE: Record<PinSettingsMode, string> = {
  register: '2차 비밀번호 등록',
  change: '2차 비밀번호 변경',
}

/**
 * P11 2차 비밀번호 등록(`/settings/pin/register`) · P12 2차 비밀번호 변경(`/settings/pin/change`).
 * 회원 전용(AuthGate)이며 상세 설정(P09)에서 들어온다. 실제 인증·저장은 서버 몫이고 이 화면은 입력 UI다.
 * 개발 서버에서만 기존 개발용 PIN 저장소(W01-1·D01-4와 공유)에 등록·변경하고, 운영 빌드에서는 연결 전 안내만 보인다.
 * 화면 제목(h1)은 이 화면이 그리고(라우트 handle.ownH1), 뒤로가기("이전")는 AppShell이 상세 설정으로 그린다.
 *
 * 복귀: 기본은 상세 설정(P09)·마이페이지다. P05(신체 정보 확인)처럼 허용된 화면(`PIN_RETURN_PATHS`)이 `state.from`으로 알려 주면
 * 취소·완료 링크가 그 화면으로 돌아간다. 허용 목록 밖의 값(외부 주소·알 수 없는 경로)은 무시하고 기본 복귀를 쓴다.
 */
export default function PinSettingsPage({ mode }: { mode: PinSettingsMode }) {
  const { user } = useAuth()
  usePageTitle(TITLE[mode])
  const back = useBackNavigation('/settings')
  const entry = safePinReturn(back?.to)
  // 기본(상세 설정)과 같은 곳이면 기본 흐름이다.
  const returnTo: PinReturn | null =
    entry && entry !== '/settings' ? { to: entry, state: back?.state } : null
  // 계정이 바뀌면 입력·상태를 새로 시작한다.
  return user ? (
    <PinSettingsView
      key={`${user.id}:${mode}`}
      ownerId={user.id}
      mode={mode}
      returnTo={returnTo}
    />
  ) : null
}
