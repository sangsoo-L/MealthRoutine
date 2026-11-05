import { Link } from 'react-router'
import { TABS, type TabKey } from '../../app/routeHandle.ts'

const baseClass =
  'flex min-h-11 flex-col items-center justify-center py-1 text-support font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const activeClass = `${baseClass} text-brand`
const inactiveClass = `${baseClass} text-muted`

interface BottomNavProps {
  activeTab: TabKey | null
}

/**
 * 하단 탭 내비게이션. 활성 탭은 URL 접두사가 아니라 `activeTab`(handle.tab)으로 판단한다.
 */
export default function BottomNav({ activeTab }: BottomNavProps) {
  return (
    <nav
      aria-label="밀스루틴 주요 메뉴"
      className="sticky bottom-0 z-10 border-t border-line bg-surface"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <li key={tab.key}>
              <Link
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={isActive ? activeClass : inactiveClass}
              >
                <span aria-hidden="true" className="text-section-title">
                  {tab.glyph}
                </span>
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
