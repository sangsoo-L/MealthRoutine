import { Link } from 'react-router'
import Icon from '../../icons/Icon.tsx'
import { dashboardFocusRing } from './DashboardParts.tsx'

/**
 * 운동/식단 대시보드 전환(스토리보드 W01 왼쪽 위 2분할 토글). 운동이 선택된 상태이고 식단을 누르면 `/records/exercise`·`/records/meal` 경로 그대로 이동한다.
 * 보이는 글자는 "운동"·"식단"으로 짧게 두고 보조기기 이름에는 "대시보드"를 덧붙인다.
 * 현재 화면은 aria-current="page"와 굵은 글씨로도 구분한다. 전체 너비를 사용해 두 이동 영역을 넉넉하게 둔다.
 * 하단 탭의 "기록" 활성 상태는 라우트 정보(handle.tab)가 맡으며 이 컴포넌트와 무관하다.
 */
export default function ExerciseMealSwitch() {
  return (
    <nav
      aria-label="운동·식단 대시보드 전환"
      className="grid grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1"
    >
      <Link
        to="/records/exercise"
        aria-current="page"
        className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control bg-exercise px-4 text-body font-semibold text-surface ${dashboardFocusRing}`}
      >
        <Icon name="dumbbell" size={20} />
        <span>운동</span>
        <span className="sr-only"> 대시보드</span>
      </Link>
      <Link
        to="/records/meal"
        className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control px-4 text-body font-normal text-muted transition-colors hover:bg-page hover:text-content motion-reduce:transition-none ${dashboardFocusRing}`}
      >
        <Icon name="utensils" size={20} />
        식단<span className="sr-only"> 대시보드</span>
      </Link>
    </nav>
  )
}
