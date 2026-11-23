import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import SettingsAccountActions from '../components/settings/SettingsAccountActions.tsx'
import ProfileSettingsView from '../components/settings/profile/ProfileSettingsView.tsx'
import { createProfileSource } from '../profile/profile.ts'
import { useProfile } from '../profile/useProfile.ts'

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createProfileSource()

function ProfileContent({
  account,
  cancelTo,
}: {
  account: { nickname: string; email: string }
  cancelTo: string
}) {
  const { state, reload } = useProfile(SOURCE)
  return (
    <ProfileSettingsView
      account={account}
      state={state}
      onRetry={reload}
      source={SOURCE}
      cancelTo={cancelTo}
    />
  )
}

/**
 * P02 프로필과 개인정보 설정(`/settings/profile`, 회원 전용). 닉네임·계정 이메일은 로그인한 계정의 값이고, 나머지 개인정보는 서버가 주는
 * 값만 읽기 전용으로 보인다(서버 연결 전에는 "연결 전", 서버가 값을 주지 않으면 "등록된 정보 없음"). 저장은 서버 연결 전에는 비활성이며
 * 저장됐다는 표시를 만들지 않는다. 신체 정보는 다루지 않는다(P01·P05·P06). 상위 화면은 상세 설정(P09)이고 화면이 h1을 직접 가진다.
 * 계정이 바뀌면 key로 새로 시작해 이전 사용자의 입력·조회 상태가 남지 않는다. 하단에 계정 관리(로그아웃·회원 탈퇴 준비 중)를 둔다(명세).
 */
export default function ProfileSettingsPage() {
  const { user } = useAuth()
  usePageTitle('프로필과 개인정보 설정')
  const cancelTo = useBackTarget('/settings') ?? '/settings'
  if (!user) return null
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileContent
        key={user.id}
        account={{ nickname: user.nickname, email: user.email }}
        cancelTo={cancelTo}
      />
      <SettingsAccountActions />
    </div>
  )
}
