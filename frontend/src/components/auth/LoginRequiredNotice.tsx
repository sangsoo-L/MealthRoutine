import { Link, useLocation } from 'react-router'
import Icon from '../icons/Icon.tsx'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 비로그인 사용자에게 보여 주는 로그인 안내. 본문 영역을 채우며 AppBar·BottomNav는 AppShell이 그대로 유지한다.
 * 문구는 사용자가 승인한 것이며 스토리보드의 비회원 안내(A02·R01·P01 등)와 다르다.
 *
 * 로그인 링크에는 원래 경로를 state.returnTo로만 전달한다. 로그인 성공 후 복귀 처리는 정해지지 않아 아직 구현하지 않았다.
 */
export default function LoginRequiredNotice() {
  const location = useLocation()

  return (
    // 3.5rem은 AppBar 높이, 2.5rem은 본문 위아래 여백, 마지막 3.5rem은 BottomNav 높이(약)다.
    // break-keep: 한글을 어절 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
    <section
      aria-labelledby="login-required-title"
      className="flex min-h-[calc(100dvh-9.5rem)] flex-col items-center justify-center text-center break-keep wrap-anywhere"
    >
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
