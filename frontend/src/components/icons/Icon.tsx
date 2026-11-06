import { useId, type SVGProps } from 'react'
import { ICON_NODES } from './iconNodes.tsx'
import type { IconName, IconSize } from './iconTypes.ts'

/** 규격은 Icon이 고정하므로 호출하는 쪽에서 덮어쓸 수 없게 props에서 뺀다. */
type FixedSvgProps =
  | 'children'
  | 'name'
  | 'viewBox'
  | 'width'
  | 'height'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'strokeLinecap'
  | 'strokeLinejoin'
  | 'role'
  | 'aria-hidden'
  | 'aria-labelledby'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, FixedSvgProps> {
  name: IconName
  /** 표시 크기(px). 기본 21 */
  size?: IconSize
  /**
   * 있으면 의미 있는 이미지(role="img" + <title>)로, 없으면 장식(aria-hidden)으로 처리한다.
   * 텍스트 라벨이 이미 있거나 아이콘만 있는 컨트롤은 아이콘이 아니라 컨트롤(버튼·링크)에 이름을 준다.
   */
  title?: string
  /** 채움 상태(예: 활성 즐겨찾기 star). currentColor로 채운다. */
  filled?: boolean
}

/**
 * 공통 SVG 아이콘. 24×24 격자, 획 두께 1.7, 둥근 선 끝, 색은 부모의 글자색(currentColor)을 따른다.
 * 색은 text-brand·text-muted 같은 토큰 클래스를 부모나 className으로 지정한다.
 */
export default function Icon({
  name,
  size = 21,
  title,
  filled = false,
  ...rest
}: IconProps) {
  const titleId = useId()

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {ICON_NODES[name]}
    </svg>
  )
}
