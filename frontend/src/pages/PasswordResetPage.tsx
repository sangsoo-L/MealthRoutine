import { Link, useLocation, useMatches } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { getRouteHandle } from '../app/routeHandle.ts'
import { createPasswordResetSource } from '../auth/passwordReset.ts'
import { safeReturnTo } from '../auth/returnTo.ts'
import { AuthBody, AuthFrame, AuthHero } from '../components/auth/AuthParts.tsx'
import PasswordResetForm from '../components/auth/PasswordResetForm.tsx'
import { secondaryLinkClass } from '../components/auth/authStyles.ts'
import BackLink from '../components/layout/BackLink.tsx'

/** 서버 연결은 화면이 만들 때 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createPasswordResetSource()

/**
 * A04 비밀번호 재설정(`/password/reset`, 비회원 포함 누구나). 가입 이메일로 재설정 안내를 요청하는 화면이다.
 * 실제 메일 발송·계정 조회·비밀번호 변경은 하지 않으며(서버 담당), 서버 연결 전에는 "연결 전"을 알린다. 계정 존재 여부는 다루지 않는다.
 * 로그인(A01)에서 들어오고, "로그인으로 돌아가기"와 상단 이전은 로그인으로 간다. 로그인 안내에서 온 복귀 경로(returnTo)는
 * 검증된 앱 내부 경로일 때만 로그인으로 이어서 넘긴다. 화면 제목(h1)은 AppShell이 보조기기용으로 넣는다.
 */
export default function PasswordResetPage() {
  const matches = useMatches()
  const location = useLocation()
  usePageTitle('비밀번호 재설정')
  const parent = getRouteHandle(matches.at(-1)?.handle).parent ?? null
  const returnTo = safeReturnTo(location.state)
  const loginState = returnTo ? { returnTo } : undefined

  return (
    <AuthFrame>
      <div className="px-5 pt-2">
        <BackLink parent={parent} />
      </div>
      <AuthHero
        plain
        title={
          <>
            비밀번호를
            <br />
            다시 설정할 수 있어요
          </>
        }
        description="가입할 때 사용한 이메일을 입력해 주세요."
      />
      <AuthBody>
        <section aria-labelledby="reset-form-title">
          <h3 id="reset-form-title" className="sr-only">
            이메일 확인
          </h3>
          <PasswordResetForm source={SOURCE} />
        </section>
        <div className="mt-8">
          <Link
            to="/login"
            state={loginState}
            data-reset-back=""
            className={secondaryLinkClass}
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </AuthBody>
    </AuthFrame>
  )
}
