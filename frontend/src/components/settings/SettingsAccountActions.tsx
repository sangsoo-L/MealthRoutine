import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/authContext.ts'
import { chipClass } from '../mypage/myStyles.ts'
import { SettingsList } from './SettingsGroup.tsx'
import { rowActionClass, rowBaseClass } from './settingsStyles.ts'

/**
 * 계정 관리 그룹: 로그아웃(동작함), 회원 탈퇴(준비 중). 화면명세 v5.0 P09의 "로그아웃 / 회원 탈퇴(준비 중)".
 *
 * - 로그아웃은 인증 상태와 계정별 임시 데이터를 지우고(useAuth().logout) 홈(비회원 H01)으로 이동한다. 서버 세션을 끊는
 *   API는 아직 연결되지 않았다. (P01 맨 아래의 임시 로그아웃 버튼이 이 화면으로 옮겨졌다.)
 * - 회원 탈퇴는 실제 API와 정책이 없어 누를 수 없는 "준비 중" 행이다. 눌러서 성공한 것처럼 보이는 동작을 만들지 않는다.
 * - 개발용 로그인 안내는 개발 서버(import.meta.env.DEV)에서만 보인다. 운영 빌드에서는 개발용 로그인이 동작하지 않는다.
 */
export default function SettingsAccountActions() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/home', { replace: true })
  }

  return (
    <div className="flex flex-col gap-3">
      <SettingsList title="계정 관리">
        <li>
          <button
            type="button"
            onClick={handleLogout}
            className={`${rowActionClass} font-semibold text-content`}
          >
            로그아웃
          </button>
        </li>
        <li>
          <div
            className={`${rowBaseClass} flex-wrap gap-y-1 font-normal text-muted`}
          >
            <span className="min-w-0">회원 탈퇴</span>
            <span className={`${chipClass} bg-page`}>준비 중</span>
          </div>
        </li>
      </SettingsList>
      {import.meta.env.DEV ? (
        <p className="rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content">
          개발용 로그인이에요. 실제 인증은 아니에요.
        </p>
      ) : null}
    </div>
  )
}
