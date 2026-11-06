import type { ReactNode } from 'react'
import Icon from '../icons/Icon.tsx'

/** 배지 종류. 색만으로 뜻을 전하지 않도록 모두 글자가 있고, 회원 전용은 자물쇠도 붙는다. */
type BadgeKind = 'member' | 'soon' | 'soonOnSoft'

const KIND_CLASS: Record<BadgeKind, string> = {
  // 회원 배지는 옅은 파란 카드(bg-brand-soft) 위에 놓이므로 흰 배경을 쓴다. (같은 색이면 알약 모양이 사라져 글자가 안쪽으로 밀려 보인다)
  member: 'bg-surface text-brand',
  soon: 'bg-warning-soft text-warning',
  // 옅은 파란 배너(bg-brand-soft) 위의 제공 예정 표시. 같은 이유로 흰 배경을 쓰고, 배너가 경고문처럼 보이지 않게 경고 색을 쓰지 않는다.
  soonOnSoft: 'bg-surface text-brand',
}

interface LandingBadgeProps {
  kind: BadgeKind
  children: ReactNode
}

/**
 * 이용 조건·제공 상태를 알려 주는 작은 배지. 누를 수 없는 표시이므로 버튼처럼 보이지 않게 테두리 없이 둔다.
 * 자물쇠 아이콘은 글자 옆의 장식이라 보조기기에서는 숨긴다.
 */
export default function LandingBadge({ kind, children }: LandingBadgeProps) {
  return (
    <span
      className={`inline-flex items-center min-h-6 gap-1 rounded-full px-2.5 py-0.5 text-support font-normal ${KIND_CLASS[kind]}`}
    >
      {kind === 'member' ? <Icon name="lock" size={18} /> : null}
      {children}
    </span>
  )
}
