import { Link } from 'react-router'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

interface AppBarProps {
  title: string
  parent: string | null
}

/**
 * 상단 앱바. 좌측 뒤로가기, 중앙 제목, 우측 고객지원 링크.
 * 뒤로가기는 history가 아니라 `parent` 경로로 이동한다.
 */
export default function AppBar({ title, parent }: AppBarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center border-b border-line bg-surface">
      {parent ? (
        <Link
          to={parent}
          aria-label="상위 화면으로 돌아가기"
          className={`flex min-h-11 w-11 items-center justify-center text-app-title font-normal text-content ${focusRing}`}
        >
          <span aria-hidden="true">‹</span>
        </Link>
      ) : (
        // 제목이 항상 가운데에 오도록 뒤로가기 자리를 비워 둔다.
        <span className="w-11" aria-hidden="true" />
      )}
      <h1 className="flex-1 truncate text-center text-section-title font-semibold text-content">
        {title}
      </h1>
      <Link
        to="/support"
        aria-label="고객지원"
        className={`flex min-h-11 w-11 items-center justify-center text-section-title font-normal text-content ${focusRing}`}
      >
        <span aria-hidden="true">?</span>
      </Link>
    </header>
  )
}
