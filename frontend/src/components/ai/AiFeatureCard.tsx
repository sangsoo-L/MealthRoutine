import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import {
  STATUS_LABEL,
  effectiveStatus,
  type AiFeature,
  type AiFeatureTone,
} from './aiIntroContent.ts'
import { aiCard, aiFocusRing } from './aiStyles.ts'

/** 기능별 아이콘 칸 색(운동 인디고·식단 오렌지·사진 브랜드 블루·리포트 중립). 이름·아이콘·상태 글자도 함께 있어 색만으로 구분하지 않는다. */
const TONE: Record<AiFeatureTone, string> = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
  brand: 'bg-brand-soft text-brand',
  neutral: 'bg-page text-content',
}

/**
 * AI 기능 카드 하나(회원 홈·비회원 랜딩 공용). 제공 상태를 배지 글자("이용 가능"·"준비 중")로 알리고, 눌러서 갈 곳이 있는 기능만 링크를 둔다.
 * - member: 기능의 링크를 그대로 보여 준다(운동 플랜 안내 I02, 주간 리포트 I05).
 * - guest: 공개 화면(I02)만 링크로 두고, 회원 전용 화면(I05)은 링크 대신 "로그인 후 이용할 수 있어요"를 적는다.
 * 눌 수 없는 기능(준비 중)에는 버튼이나 링크가 없다.
 */
export default function AiFeatureCard({
  feature,
  audience,
  loginNote,
  state,
}: {
  feature: AiFeature
  audience: 'member' | 'guest'
  /** 비회원이 볼 회원 전용 기능의 안내 글자 */
  loginNote: string
  /** 이동할 때 "이전"이 돌아올 화면(state.from) */
  state: { from: string }
}) {
  const status = effectiveStatus(feature, audience)
  const links = (feature.links ?? []).filter(
    (link) => audience === 'member' || !link.memberOnly,
  )
  // 비회원에게는 회원 전용 화면만 있는 기능에만 "로그인 후 이용" 안내를 적는다(공개 링크가 있는 기능은 그 링크로 충분하다).
  const guestLocked =
    audience === 'guest' &&
    status === 'available' &&
    (feature.links ?? []).some((link) => link.memberOnly)
  return (
    <li data-ai-feature={feature.key} data-ai-status={status}>
      <article aria-labelledby={`ai-feature-${feature.key}`} className={aiCard}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`flex size-10 shrink-0 items-center justify-center rounded-control ${TONE[feature.tone]}`}
          >
            <Icon name={feature.icon} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <h3
                id={`ai-feature-${feature.key}`}
                className="text-body leading-snug font-semibold text-content"
              >
                {feature.title}
              </h3>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-support leading-snug font-semibold ${status === 'available' || status === 'local' ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-page text-muted'}`}
              >
                {STATUS_LABEL[status]}
              </span>
            </div>
            <p className="mt-1 text-body leading-relaxed font-normal text-content">
              {feature.summary}
            </p>
            <p className="mt-2 text-support leading-relaxed font-normal text-muted">
              {feature.access}
            </p>
            {links.map((link, index) => (
              <Link
                key={link.to}
                to={link.to}
                state={state}
                className={`flex min-h-11 items-center justify-between gap-2 border-t border-line text-body font-semibold text-brand ${index === 0 ? 'mt-2' : ''} ${index === links.length - 1 ? '-mb-1' : ''} ${aiFocusRing}`}
              >
                {link.label}
                <Icon name="chevron-right" size={18} />
              </Link>
            ))}
            {guestLocked ? (
              <p
                data-ai-login-note=""
                className="mt-2 border-t border-line pt-2 text-support leading-relaxed font-semibold text-brand"
              >
                {loginNote}
              </p>
            ) : null}
          </div>
        </div>
      </article>
    </li>
  )
}
