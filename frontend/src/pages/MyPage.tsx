import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { isPinLockedState } from '../body-access/bodyAccessNotice.ts'
import { useBodyReveal } from '../body-access/useBodyReveal.ts'
import { useBodyMeasurementStatus } from '../body-measurements/useBodyMeasurementStatus.ts'
import { useHealthGoal } from '../health-goal/useHealthGoal.ts'
import { useWeightCheck } from '../weight-log/useWeightCheck.ts'
import NotificationBellLink from '../components/notifications/NotificationBellLink.tsx'
import BodyInfoSummary from '../components/mypage/BodyInfoSummary.tsx'
import DevDataNotice from '../components/mypage/DevDataNotice.tsx'
import GrowthSummary from '../components/mypage/GrowthSummary.tsx'
import HealthGoalSummary from '../components/mypage/HealthGoalSummary.tsx'
import MembershipSummary from '../components/mypage/MembershipSummary.tsx'
import PointSummary from '../components/mypage/PointSummary.tsx'
import ProfileHeader from '../components/mypage/ProfileHeader.tsx'
import WeeklyActivity from '../components/mypage/WeeklyActivity.tsx'
import WeightLogSummary from '../components/mypage/WeightLogSummary.tsx'
import { useKnowledgeLevels } from '../mypage/useKnowledgeLevels.ts'
import { useMyPageSummary } from '../mypage/useMyPageSummary.ts'

/**
 * P01 마이페이지. 스토리보드 v5.0의 7개 섹션을 같은 순서로 보여 준다.
 * 프로필 머리글 → 나의 성장(활동 레벨·종합 이해도) → 보유 포인트 → 멤버십 상태 → 이번 주 활동 → 나의 건강 목표 → 나의 신체 정보.
 * 나의 신체 정보 묶음 맨 아래에는 사용자 지시로 "몸무게 기록" 진입점(WeightLogSummary)이 있다(스토리보드에는 없는 구성). 이력이 없는 기존 사용자가
 * 월간 몸무게 기록을 시작하는 곳이며, 몸무게 수치는 받지도 보여 주지도 않는다.
 * 상단 바(AppBar)가 없어서 프로필이 화면의 시작점이다. 화면 제목(h1 "마이페이지")은 AppShell이 보조기기용으로 넣는다.
 *
 * 데이터:
 * - 닉네임·회원 유형은 인증 사용자(useAuth)의 실제 값이다.
 * - 레벨·포인트·주간 활동·건강 목표는 연결된 API가 없어서 "연결 전" 상태로 표시한다(mypage/mypageSource.ts).
 *   개발 서버에서만 값이 생긴다: 개발용 임시 회원(member.free / member.full)의 레벨·포인트, 그리고 `?sample=1`(값 있음) /
 *   `?sample=empty`(비어 있음) 예시. 개발용 값이 있으면 맨 위에 안내 한 줄(DevDataNotice)이 보이고, 구역마다 배지를 붙이지 않는다.
 * - 이해도(운동·식단)는 계정의 이해도 확인 결과를 읽어 하나의 종합 등급으로 보여 준다(mypage/knowledgeSource.ts,
 *   mypage/overallKnowledge.ts). 결과가 없으면 개발용 임시 회원은 초기값, 그 밖의 계정은 "미확인"이다.
 * - 신체 정보는 기본 마스킹이고 등록 여부만 받는다(BodyInfoSummary). 수치는 P05에서 2차 비밀번호를 확인한 뒤의 열람 권한이 있는 동안에만
 *   메모리에서 읽어 보여 주고(useBodyReveal), 숨기기·1분·이 화면을 벗어남·로그아웃·PIN 변경이면 곧바로 다시 가린다.
 *
 * 면: 흰 카드는 나의 성장과 "건강 목표·신체 정보 묶음" 둘뿐이다. 프로필·포인트·이번 주 활동은 카드 없이 바탕 위에 놓고,
 * 멤버십은 옅은 파란 면이다. 섹션 사이는 20px(gap-5)이고 관련 있는 포인트·멤버십만 12px(gap-3)로 묶는다.
 * 로그아웃은 상세 설정(P09, /settings)에 있다. 비회원은 라우터의 AuthGate가 로그인 안내를 보여 주므로 이 화면에 오지 않는다.
 */
export default function MyPage() {
  const { user } = useAuth()
  const summary = useMyPageSummary()
  // 훅은 조건 없이 호출해야 하므로 사용자가 없을 때의 빈 id로 부른다(AuthGate 안이라 실제로는 도달하지 않는다).
  const knowledge = useKnowledgeLevels(user?.id ?? '')
  const body = useBodyMeasurementStatus(user?.id ?? '')
  const goal = useHealthGoal(user?.id ?? '')
  const weight = useWeightCheck(user?.id ?? '')
  // 월간 몸무게 알림에서 들어오면(/mypage#weight-log) 몸무게 기록 섹션의 진입 버튼으로 포커스를 옮긴다.
  const location = useLocation()
  const { hash } = location
  const navigate = useNavigate()
  // P05에서 5회 불일치로 돌아왔다면 잠금 안내를 한 번 보이고 router state는 지운다(새로고침해도 안내가 남지 않게 한다).
  const [lockedNotice] = useState(() => isPinLockedState(location.state))
  useEffect(() => {
    if (isPinLockedState(location.state))
      void navigate(
        { pathname: location.pathname, search: location.search, hash },
        { replace: true, state: null },
      )
  }, [location, hash, navigate])
  const reveal = useBodyReveal(user?.id ?? '')

  // AuthGate 안에 있어 로그인한 회원에게만 렌더링된다. 사용자가 없는 경우는 도달하지 않는다.
  if (!user) return null

  // 개발 서버에서 개발용 값이 화면에 있을 때만 안내를 보인다. 운영 빌드에서는 이 값이 항상 false라 렌더링되지 않는다.
  const knowledgeIsDev =
    knowledge.state.status === 'ready' &&
    (knowledge.state.levels.exercise?.source === 'dev-initial' ||
      knowledge.state.levels.meal?.source === 'dev-initial')
  const showDevNotice =
    import.meta.env.DEV &&
    (summary.sample.level ||
      summary.sample.points ||
      summary.sample.weekly ||
      knowledgeIsDev)

  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      {showDevNotice ? <DevDataNotice /> : null}
      <ProfileHeader
        nickname={user.nickname}
        entitlement={user.entitlement}
        actions={<NotificationBellLink userId={user.id} from="/mypage" />}
      />
      <GrowthSummary
        level={summary.level}
        knowledge={knowledge.state}
        onRetryKnowledge={knowledge.retry}
      />
      <div className="flex flex-col gap-3">
        <PointSummary points={summary.points} />
        <MembershipSummary entitlement={user.entitlement} />
      </div>
      <WeeklyActivity weekly={summary.weekly} />
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        <HealthGoalSummary
          goal={goal.state}
          knowledge={knowledge.state}
          save={goal.save}
          onRetry={goal.reload}
        />
        <BodyInfoSummary
          body={body.state}
          save={body.save}
          reveal={reveal}
          lockedNotice={lockedNotice}
        />
        <WeightLogSummary
          body={body.state}
          weight={weight.state}
          retrying={weight.retrying}
          onRetry={weight.reload}
          log={weight.log}
          notificationSync={weight.notificationSync}
          onRetryNotificationSync={weight.retryNotificationSync}
          focusEntry={hash === '#weight-log'}
        />
      </div>
    </div>
  )
}
