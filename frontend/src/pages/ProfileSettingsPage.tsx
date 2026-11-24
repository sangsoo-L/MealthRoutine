import { useCallback, useRef, useState } from 'react'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import type { AuthUser } from '../auth/authTypes.ts'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import SettingsAccountActions from '../components/settings/SettingsAccountActions.tsx'
import ProfileSettingsView from '../components/settings/profile/ProfileSettingsView.tsx'
import { createProfileSource, createReadGate } from '../profile/profile.ts'
import { useProfile } from '../profile/useProfile.ts'

/** 서버 연결은 한 번 정한다(실제 서버 모드는 서버 구현, 모의 로그인 모드는 null = 연결 전). */
const SOURCE = createProfileSource()

function ProfileContent({
  user,
  cancelTo,
}: {
  user: AuthUser
  cancelTo: string
}) {
  const { beginNicknameSave } = useAuth()
  // PR #29 P2-03: 같은 회원 ID의 새 로그인 작업을 닉네임 문자열이 아니라 로그인 작업 표식으로 알아챈다.
  // 표식은 판정(isCurrent)에만 쓰고 commit은 부르지 않는다. 자기 저장 성공(commit)은 같은 작업이라 표식이 그대로다.
  const [marker, setMarker] = useState(() => beginNicknameSave())
  const [loginEpoch, setLoginEpoch] = useState(0)
  const [seenUser, setSeenUser] = useState(user)
  if (seenUser !== user) {
    setSeenUser(user)
    if (!marker?.isCurrent()) {
      setMarker(beginNicknameSave())
      setLoginEpoch((n) => n + 1)
    }
  }
  // 화면이 저장 성공을 반영할 때마다 올린다. 그 전에 시작한 조회는 오래된 값일 수 있어 버린다.
  const saveVersion = useRef(0)
  const onSaved = useCallback(() => {
    saveVersion.current += 1
  }, [])
  // 조회를 시작할 때 불린다(렌더 중이 아님): 그때의 로그인 작업 표식과 저장 버전을 잡는다.
  // 저장 버전은 편집기가 저장 성공을 반영할 때 함께 올리는 값(편집기의 saveVersion 상태와 같은 횟수)이다.
  const beginRead = useCallback(
    () => createReadGate(beginNicknameSave, () => saveVersion.current)(),
    [beginNicknameSave],
  )
  const { state, reload } = useProfile(SOURCE, {
    beginRead,
    resetKey: loginEpoch,
  })
  return (
    <ProfileSettingsView
      account={{ nickname: user.nickname, email: user.email }}
      state={state}
      onRetry={reload}
      source={SOURCE}
      cancelTo={cancelTo}
      // 저장을 시작할 때 지금 로그인 작업에 묶인 표식을 받는다. 그 사이 로그인이 바뀌면 화면·로그인 정보 모두 반영하지 않는다(F3-R1·C1·C2).
      beginSave={beginNicknameSave}
      loginEpoch={loginEpoch}
      onSaved={onSaved}
    />
  )
}

/**
 * P02 프로필과 개인정보 설정(`/settings/profile`, 회원 전용). 닉네임·계정 이메일은 로그인한 계정의 값이고, 나머지 개인정보는 서버가 주는
 * 값만 읽기 전용으로 보인다(서버 연결 전에는 "연결 전", 서버가 값을 주지 않으면 "등록된 정보 없음"). 닉네임 저장은 실제 서버 모드에서만 되고,
 * 서버가 저장하면 로그인 정보의 닉네임도 바뀐다(F3-D3). 모의 로그인 모드에서는 저장이 비활성이며 저장됐다는 표시를 만들지 않는다. 신체 정보는 다루지 않는다(P01·P05·P06). 상위 화면은 상세 설정(P09)이고 화면이 h1을 직접 가진다.
 * 계정이 바뀌면 key로 새로 시작해 이전 사용자의 입력·조회 상태가 남지 않는다. 같은 계정의 재로그인은 새로 마운트하지 않고
 * 프로필을 다시 읽고 편집기의 저장 기준을 맞춘다(미저장 입력은 보존, PR #29 P2-03). 하단에 계정 관리(로그아웃·회원 탈퇴 준비 중)를 둔다(명세).
 */
export default function ProfileSettingsPage() {
  const { user } = useAuth()
  usePageTitle('프로필과 개인정보 설정')
  const cancelTo = useBackTarget('/settings') ?? '/settings'
  if (!user) return null
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ProfileContent key={user.id} user={user} cancelTo={cancelTo} />
      <SettingsAccountActions />
    </div>
  )
}
