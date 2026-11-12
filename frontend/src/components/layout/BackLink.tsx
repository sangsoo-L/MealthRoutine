import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import { useBackNavigation } from './useBackTarget.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 본문 안의 간결한 뒤로가기("이전"). 상단 바(AppBar)가 없으므로 상위 화면이 있는 상세 화면이 본문 맨 위에 둔다.
 * 목적지는 useBackTarget 규칙을 따른다: 진입한 화면(state.from)을 알면 그곳, 모르면 정의된 상위 화면(parent)이다.
 * 진입한 화면이 자기 "이전"을 되돌려 받으려고 맡겨 둔 state(state.fromState)가 있으면 목적지에 그대로 넘긴다(없으면 넘기지 않아 동작이 같다).
 * parent가 없으면 아무것도 그리지 않는다. 눈에 보이는 "이전"이 이름에 들어 있도록 aria-label도 "이전"으로 시작한다.
 * 왼쪽 음수 여백으로 44px 터치 영역 안의 아이콘이 본문 왼쪽 기준선(20px) 근처에 오게 한다.
 */
export default function BackLink({ parent }: { parent: string | null }) {
  const back = useBackNavigation(parent)
  if (!back) return null
  return (
    <Link
      to={back.to}
      state={back.state}
      aria-label="이전 화면으로 돌아가기"
      className={`-ml-2.5 inline-flex min-h-11 items-center gap-1 rounded-control px-2.5 text-body leading-snug font-normal text-content transition-colors hover:text-brand motion-reduce:transition-none ${focusRing}`}
    >
      <Icon name="arrow-left" size={20} />
      <span>이전</span>
    </Link>
  )
}
