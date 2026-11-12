import { Link, useLocation, useMatches } from 'react-router'
import { getRouteHandle } from '../../app/routeHandle.ts'
import Icon from '../icons/Icon.tsx'
import { SHELL_BACK_HEIGHT_REM, hasShellBack } from '../layout/shellBack.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 비로그인 사용자에게 보여 주는 로그인 안내. 본문 영역을 채우며 BottomNav와 뒤로가기는 AppShell이 그대로 유지한다.
 * 문구는 사용자가 승인한 것이며 스토리보드의 비회원 안내(A02·R01·P01 등)와 다르다.
 *
 * 로그인 링크에는 원래 경로를 state.returnTo로만 전달한다. 로그인 성공 후 복귀 처리는 정해지지 않아 아직 구현하지 않았다.
 */
export default function LoginRequiredNotice() {
  const location = useLocation()
  const matches = useMatches()
  // AppShell이 본문 위에 뒤로가기 한 줄을 그리는 화면(상세 설정 등)에서는 그만큼 높이를 더 뺀다.
  const handle = getRouteHandle(matches.at(-1)?.handle)
  const backRem = hasShellBack(handle) ? SHELL_BACK_HEIGHT_REM : 0
  // 2.5rem은 본문 위아래 여백, 4.5rem은 BottomNav 높이(위 완충 영역 1rem + 탭 막대 3.5rem)이고,
  // 0.125rem은 탭 막대 위 선(1px)과 반올림 여유다. BottomNav 높이를 바꾸면 이 값도 함께 바꾼다(모자라면 한 화면짜리 안내가 세로로 넘친다).
  // 하단 탭을 그리지 않는 화면(handle.focus, AppShell과 같은 기준: 운동 선택 W13 등)에서는 그 높이를 비워 두지 않는다(비워 두면 안내 아래에 빈 공간이 남는다).
  const bottomNavRem = handle.focus === true ? 0 : 4.5 + 0.125
  const reservedRem = 2.5 + bottomNavRem + backRem

  return (
    // break-keep: 한글을 어절 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
    <section
      aria-labelledby="login-required-title"
      style={{ minHeight: `calc(100dvh - ${reservedRem}rem)` }}
      className="flex flex-col items-center justify-center text-center break-keep wrap-anywhere"
    >
      {/* 자체 h1을 가진 화면(handle.ownH1)은 AppShell이 h1을 넣지 않는다. 그 화면 대신 이 안내가 보일 때는 화면 이름을 여기서 대신 알린다. */}
      {handle.ownH1 ? <h1 className="sr-only">{handle.title}</h1> : null}
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon name="lock" size={30} />
      </span>
      <h2
        id="login-required-title"
        className="mt-4 text-app-title leading-snug font-semibold text-content"
      >
        로그인 후 이용할 수 있어요
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        건강 관리 서비스를 이용하려면 로그인이 필요해요.
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <Link
          to="/login"
          state={{ returnTo: location.pathname + location.search }}
          className={`flex min-h-12 items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          로그인하러 가기
        </Link>
        <Link
          to="/home"
          className={`flex min-h-12 items-center justify-center rounded-control border border-muted/40 bg-surface px-4 text-body font-normal text-content transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`}
        >
          홈으로 돌아가기
        </Link>
      </div>
    </section>
  )
}
