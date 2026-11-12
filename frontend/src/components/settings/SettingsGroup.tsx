import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { SettingsMenuGroup } from '../../settings/settingsMenu.ts'
import Icon from '../icons/Icon.tsx'
import { chipClass } from '../mypage/myStyles.ts'
import { rowActionClass, rowBaseClass } from './settingsStyles.ts'

/** 그룹 한 묶음: 소제목 + 행 목록(흰 카드, 행 사이 1px 경계). 행이 목록 항목(li)이라 보조기기가 개수를 읽어 준다. */
export function SettingsList({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="mb-2 px-1 text-support leading-snug font-semibold text-muted"
      >
        {title}
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {children}
      </ul>
    </section>
  )
}

/**
 * 이동 메뉴 행. 경로가 있으면 행 전체가 링크(오른쪽 화살표)이고, 없으면 눌리지 않는 행 + "준비 중" 칩이다.
 * 준비 중 행은 링크·버튼이 아니라서 키보드 포커스를 받지 않고, 칩 글자가 이름과 함께 읽혀 상태가 전달된다.
 */
function MenuRow({ label, to }: { label: string; to: string | null }) {
  if (to === null) {
    return (
      <li>
        <div
          className={`${rowBaseClass} flex-wrap gap-y-1 font-normal text-muted`}
        >
          <span className="min-w-0">{label}</span>
          <span className={`${chipClass} bg-page`}>준비 중</span>
        </div>
      </li>
    )
  }
  return (
    <li>
      <Link to={to} className={`${rowActionClass} font-semibold text-content`}>
        <span className="min-w-0">{label}</span>
        <Icon name="chevron-right" size={18} className="shrink-0 text-muted" />
      </Link>
    </li>
  )
}

export default function SettingsGroup({ group }: { group: SettingsMenuGroup }) {
  return (
    <SettingsList title={group.title}>
      {group.items.map((item) => (
        <MenuRow key={item.label} label={item.label} to={item.to} />
      ))}
    </SettingsList>
  )
}
