import { ENTITLEMENT_LABEL } from '../../auth/entitlements.ts'
import type { Entitlement } from '../../auth/authTypes.ts'
import { MY_DESTINATIONS } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import MyLink from './MyLink.tsx'
import { sectionTitleClass } from './myStyles.ts'

interface MembershipSummaryProps {
  entitlement: Entitlement
}

/**
 * P01 섹션 4. 멤버십 상태. 인증 사용자의 회원 유형(entitlement)을 그대로 보여 주는 실제 값이다.
 *
 * - 라벨은 기존 ENTITLEMENT_LABEL(일반·운동·식단·종합)을 쓰고 유형별 권한 구분은 기존 정책(auth/entitlements.ts)을 따른다.
 * - 회원 유형과 이용 상태 한 줄만 보여 주는 낮은 면이다. 일반/멤버십은 왕관 아이콘 면의 색과 글자로 구분한다.
 * - 가격·결제 주기·혜택·AI 체험 잔여 횟수는 정책이 확정되지 않아 표시하지 않는다. 가격을 보여 주지 않으므로 "정책 확정 전"
 *   안내도 두지 않는다.
 * - 멤버십 보기·관리(P03)는 화면이 생겨 경로가 채워지면 오른쪽에 링크로 나타난다(MyLink). 지금은 그리지 않는다.
 */
export default function MembershipSummary({
  entitlement,
}: MembershipSummaryProps) {
  const paid = entitlement !== 'free'

  return (
    <section
      aria-labelledby="my-membership-title"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card bg-brand-soft px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-control ${
            paid ? 'bg-brand text-surface' : 'bg-surface text-brand'
          }`}
        >
          <Icon name="crown" />
        </span>
        <div className="min-w-0">
          <h2 id="my-membership-title" className={sectionTitleClass}>
            {ENTITLEMENT_LABEL[entitlement]}
          </h2>
          <p className="text-support leading-snug font-normal text-muted">
            {paid ? '멤버십 이용 중' : '멤버십으로 AI 기능을 마음껏'}
          </p>
        </div>
      </div>
      <MyLink destination={MY_DESTINATIONS.membership}>
        {paid ? '멤버십 관리' : '멤버십 보기'}
      </MyLink>
    </section>
  )
}
