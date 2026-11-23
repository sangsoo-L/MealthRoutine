import { Link } from 'react-router'
import { ENTITLEMENT_LABEL } from '../../auth/entitlements.ts'
import type { Entitlement } from '../../auth/authTypes.ts'
import { MY_DESTINATIONS, MY_PAGE_PATH } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import { focusRing, sectionTitleClass } from './myStyles.ts'

interface MembershipSummaryProps {
  entitlement: Entitlement
}

/**
 * P01 섹션 4. 멤버십 상태. 인증 사용자의 멤버십 유형(entitlement: 일반·베이직·프로)을 그대로 보여 주는 값이다(표시 전용, AI 사용 권한이 아니다).
 *
 * - 라벨은 ENTITLEMENT_LABEL(일반·베이직·프로)을 쓴다. 운동·식단·종합 멤버십 구분은 없고, AI 사용 가능 여부와 잔여 횟수는 서버가 확인한 사용량(P03)이 기준이다.
 * - 회원 유형과 이용 상태 한 줄만 보여 주는 낮은 면이다. 일반/멤버십은 왕관 아이콘 면의 색과 글자로 구분한다.
 * - 가격·결제 주기·혜택·AI 체험 잔여 횟수는 정책이 확정되지 않아 표시하지 않는다. 가격을 보여 주지 않으므로 "정책 확정 전"
 *   안내도 두지 않는다.
 * - 멤버십 보기·관리는 P03 멤버십과 결제 관리(`/settings/membership`)로 가는 링크다. 진입한 곳(P01)으로 돌아오게 알린다.
 *   구독 상태·결제는 P03가 서버 연결 전이라고 안내한다(여기서는 회원 유형만 보인다).
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
            {paid ? '멤버십 이용 중' : 'AI 사용 횟수와 멤버십 확인'}
          </p>
        </div>
      </div>
      {MY_DESTINATIONS.membership.to !== null ? (
        <Link
          to={MY_DESTINATIONS.membership.to}
          state={{ from: MY_PAGE_PATH }}
          data-membership-link=""
          className={`inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand transition-colors hover:text-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          {paid ? '멤버십 관리' : '멤버십 보기'}
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : null}
    </section>
  )
}
