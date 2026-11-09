import { Link } from 'react-router'
import { TABS, type TabKey } from '../../app/routeHandle.ts'
import Icon from '../icons/Icon.tsx'

// 포커스 윤곽선은 링크 안쪽으로 그린다(-outline-offset-2): 탭 막대가 화면 맨 아래에 붙어 있어서 바깥으로 그리면 아래쪽 선이 화면 밖으로 잘린다.
// 링크 안은 "아이콘 래퍼 + 글자"를 세로로 쌓은 한 그룹이다(flex-col, items-center, justify-center).
// 아이콘마다 선 모양이 달라도 래퍼(size-6 = 24px)가 같은 자리를 차지하고, 간격은 gap-1(4px)로 명시한다. 예전 gap-0.5(2px)보다 보이는 간격이 약 2px 넓다.
// 높이는 min-h-14(56px) 안에서 그룹이 세로 중앙에 놓이며, rem이라 글자를 키우면 내용 기준으로 함께 커져 잘리지 않는다.
const baseClass =
  'flex min-h-14 flex-col items-center justify-center gap-1 py-1 text-support font-normal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand'
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
      // 탭 위쪽의 완충 영역: nav 위아래 8px(py-2)를 흰 배경(bg-surface)으로 비워 두어, 여백부터 메뉴까지 하나의 흰 바로 보인다.
      // 상단 선(border-t)은 바 맨 위에 있어서 본문과 탭을 가르고, 탭은 sticky라 스크롤 중에도 본문 위에서 이 선과 여백이 함께 따라다닌다.
      // 높이를 바꾸려면 py-2만 바꾼다. 문서 흐름 안에 있어 페이지 맨 끝에서는 본문 하단 패딩에 더해진 여백이 된다.
      className="sticky bottom-0 z-10 border-t border-line bg-surface py-2"
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
                {/* 텍스트 라벨이 있으므로 아이콘은 장식(aria-hidden)이다. 색은 링크의 text-brand/text-muted를 따른다. */}
                {/* 래퍼는 모든 메뉴가 같은 크기(24px, size-6 = 1.5rem)다. rem이라 글자를 키우면 아이콘도 함께 커진다. */}
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <Icon name={tab.icon} className="size-full" />
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
