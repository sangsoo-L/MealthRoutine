import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type {
  ActivityLevel,
  KnowledgeState,
  Slot,
} from '../../mypage/mypageTypes.ts'
import {
  ASSESSMENT_LEVEL_LABEL,
  ASSESSMENT_LEVEL_NOTE,
} from '../../onboarding-assessment/assessmentLabels.ts'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'

const TIERS = ['beginner', 'intermediate', 'advanced'] as const

function exerciseTierText(knowledge: KnowledgeState): string {
  if (knowledge.status === 'loading') return '확인 중'
  if (knowledge.status !== 'ready') return '연결 전'
  const entry = knowledge.levels.exercise
  return entry ? ASSESSMENT_LEVEL_LABEL[entry.tier] : '미확인'
}

function Section({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  const id = `level-section-${number}`
  return (
    <section aria-labelledby={id} className={cardClass}>
      <h2
        id={id}
        className="flex items-center gap-2 text-section-title leading-snug font-semibold text-content"
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-support font-semibold text-brand"
        >
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-2 text-body leading-relaxed font-normal text-content">
        {children}
      </div>
    </section>
  )
}

/**
 * P15 레벨 안내 본문. 운동 이해도(초보·중급·고급)·활동 레벨·경험치(EXP)와 포인트의 차이를 설명한다.
 * - "내 현재 상태"는 마이페이지(P01)와 같은 값(활동 레벨, 운동 이해도)이며 값이 없으면 "연결 전"·"미확인"으로 둔다.
 * - 경험치 적립 활동·기준, 포인트 지급 기준, 자동 승급은 정책이 확정되지 않았고 구현되어 있지 않다. 적립·승급이 동작하는 것처럼 쓰지 않고,
 *   명세의 예시 수치(320 EXP 등)는 실제 값이 아니므로 어디에도 표시하지 않는다.
 * - 이해도 표기는 앱 전체와 같은 초보·중급·고급이다(명세 P15의 초보/중수/고수와 다르다. 앱의 표기 통일 지시를 따랐다).
 */
export default function LevelGuideView({
  level,
  knowledge,
}: {
  level: Slot<ActivityLevel>
  knowledge: KnowledgeState
}) {
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          레벨 안내
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          운동 이해도, 활동 레벨, 경험치와 포인트가 어떻게 다른지 알려 드려요.
        </p>
      </header>

      <section aria-labelledby="level-current-title" className={cardClass}>
        <h2
          id="level-current-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          내 현재 상태
        </h2>
        <dl className="mt-3 grid grid-cols-2 divide-x divide-line rounded-control bg-page py-3">
          <div className="px-3">
            <dt className="text-support font-normal text-muted">운동 이해도</dt>
            <dd className="mt-1 text-section-title font-semibold text-content">
              {exerciseTierText(knowledge)}
            </dd>
          </div>
          <div className="px-3">
            <dt className="text-support font-normal text-muted">활동 레벨</dt>
            <dd className="mt-1 text-section-title font-semibold tabular-nums text-content">
              {level.state === 'ready' ? `Lv.${level.data.level}` : '연결 전'}
            </dd>
          </div>
        </dl>
      </section>

      <Section number={1} title="운동 이해도: 초보·중급·고급">
        <p>
          운동·식단 이해도 확인 결과로 정해지는 단계예요. 단계에 따라 안내하는
          모습이 달라져요.
        </p>
        <ul role="list" className="mt-3 flex flex-col gap-2">
          {TIERS.map((tier) => (
            <li
              key={tier}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
            >
              <span className={`${chipClass} bg-page`}>
                {ASSESSMENT_LEVEL_LABEL[tier]}
              </span>
              <span className="min-w-0 text-support leading-snug text-muted">
                {ASSESSMENT_LEVEL_NOTE[tier]}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section number={2} title="활동 레벨">
        <p>
          활동 레벨(Lv.)은 이해도와 다른 값이에요. 서로 계산하거나 대신하지
          않아요.
        </p>
      </Section>

      <Section number={3} title="경험치(EXP)와 포인트">
        <p>
          경험치는 활동 레벨을 정하는 값이고, 포인트는 따로 관리되는 값이에요.
          두 값은 서로 다르게 쓰여요.
        </p>
      </Section>

      <section
        aria-labelledby="level-notice-title"
        className="rounded-card border border-line bg-page p-4"
      >
        <h2
          id="level-notice-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          아직 정해지지 않았어요
        </h2>
        <p className="mt-2 text-body leading-relaxed font-normal text-content">
          경험치를 쌓는 활동과 기준, 포인트 지급 기준, 레벨이 오르는 조건은 아직
          정해지지 않았어요. 지금은 경험치가 쌓이거나 포인트가 지급되지 않고
          레벨도 자동으로 오르지 않아요. 정해지면 이 화면에서 안내해요.
        </p>
      </section>

      <Link
        to="/mypage"
        className={`flex min-h-11 w-full items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`}
      >
        마이페이지로
      </Link>
    </div>
  )
}
