import { Link } from 'react-router'
import logoMarkUrl from '../../assets/images/logo/mealthroutine-logo-mark-header.webp'
import Icon from '../icons/Icon.tsx'
import { useBackTarget } from './useBackTarget.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

interface AppBarProps {
  title: string
  parent: string | null
  /** true이면 제목 글자 대신 MealthRoutine 로고를 보이고 고객지원 링크를 숨긴다(회원 홈·로그인 전용) */
  brand?: boolean
}

/**
 * 상단 앱바. 좌측 뒤로가기, 중앙 제목, 우측 고객지원 링크.
 * 뒤로가기는 history가 아니라 `parent` 경로로 이동한다.
 *
 * `brand`(회원 홈)일 때는 제목 자리에 공식 로고 파생 이미지(랜딩 헤더와 같은 파일)와 서비스 이름을 둔다.
 * 로고는 옆의 글자가 이름을 대신하므로 장식(alt="")이고, 종횡비를 지키도록 높이만 정한다(h-7 = 28px).
 * 글자와 색은 랜딩 헤더의 브랜드 라벨과 같다(600, brand). 화면 제목(h1)은 이 자리가 그대로 맡아 이름이 "MealthRoutine"이 된다.
 * 좌우에 빈 자리를 두지 않고 고정 20px 여백(px)만 둔다: 빈 자리가 글자 확대와 함께 커지면 이름이 잘리기 때문이다. 폭이 모자라면(글자 200%) 이름이 로고 아래 줄로 내려가고 앱바가 높아진다.
 * 이 모드에서는 이동할 곳이 없어 로고에 링크를 두지 않는다.
 * 뒤로가기(parent)가 있는 화면(로그인)은 오른쪽에 같은 폭(w-11)의 빈 자리를 두어 로고가 정확히 가운데에 오게 하고, 앱바 좌우 여백은 뒤로가기 버튼이 대신해 0으로 둔다.
 * 이때 h1이 로고 이름만 남으면 화면 이름이 사라지므로, 화면 이름(title)을 sr-only로 덧붙인다.
 */
export default function AppBar({ title, parent, brand = false }: AppBarProps) {
  const backTo = useBackTarget(parent)
  return (
    <header
      className={`sticky top-0 z-10 flex items-center border-b border-line bg-surface ${
        brand ? `min-h-14 py-1 ${parent ? 'px-0' : 'px-[20px]'}` : 'h-14'
      }`}
    >
      {backTo ? (
        <Link
          to={backTo}
          aria-label="상위 화면으로 돌아가기"
          className={`flex min-h-11 w-11 items-center justify-center text-app-title font-normal text-content ${focusRing}`}
        >
          <span aria-hidden="true">‹</span>
        </Link>
      ) : brand ? null : (
        // 제목이 항상 가운데에 오도록 뒤로가기 자리를 비워 둔다.
        <span className="w-11" aria-hidden="true" />
      )}
      {brand ? (
        <h1 className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 text-section-title font-semibold text-brand">
          <img
            src={logoMarkUrl}
            width={240}
            height={163}
            alt=""
            decoding="async"
            className="h-7 w-auto shrink-0"
          />
          <span className="min-w-0">MealthRoutine</span>
          {parent ? <span className="sr-only">{title}</span> : null}
        </h1>
      ) : (
        <h1 className="flex-1 truncate text-center text-section-title font-semibold text-content">
          {title}
        </h1>
      )}
      {brand ? (
        parent ? (
          // 로고가 가운데에 오도록 뒤로가기와 같은 폭의 빈 자리를 둔다.
          <span className="w-11" aria-hidden="true" />
        ) : null
      ) : (
        <Link
          to="/support"
          aria-label="고객지원"
          className={`flex min-h-11 w-11 items-center justify-center text-content ${focusRing}`}
        >
          {/* 아이콘만 있는 링크라서 이름은 링크의 aria-label이 담당하고 아이콘은 장식이다. */}
          <Icon name="help" />
        </Link>
      )}
    </header>
  )
}
