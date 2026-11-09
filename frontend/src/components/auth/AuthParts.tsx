import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { revealClass, secondaryLinkClass } from './authStyles.ts'

/**
 * 로그인·회원가입 공통 틀. AppShell 본문의 여백을 상쇄해 흰 배경을 채운다. 3.5rem은 AppBar 높이(h-14)다.
 * appBar가 false이면(AppBar를 그리지 않는 화면) 그 높이를 빼지 않고 화면 전체 높이를 채운다.
 * break-keep: 한글을 단어(어절) 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
 */
export function AuthFrame({
  children,
  appBar = true,
}: {
  children: ReactNode
  appBar?: boolean
}) {
  return (
    <div
      className={`-mx-5 -my-5 flex ${appBar ? 'min-h-[calc(100vh-3.5rem)]' : 'min-h-screen'} flex-col bg-surface break-keep wrap-anywhere`}
    >
      {children}
    </div>
  )
}

interface AuthHeroProps {
  title: ReactNode
  description: ReactNode
  /** true이면 brand-soft 그라데이션 없이 흰 면 위에 놓는다(로그인). 기본은 그라데이션(회원가입). */
  plain?: boolean
}

/** 두 화면의 상단 브랜드 영역. 제목·설명을 같은 규칙으로 놓는다. */
export function AuthHero({ title, description, plain = false }: AuthHeroProps) {
  return (
    <section
      className={
        plain
          ? 'px-5 pt-8 pb-2'
          : 'bg-linear-to-b from-brand-soft to-surface px-5 pt-6 pb-2'
      }
    >
      <h2 className="text-app-title leading-snug font-semibold text-content">
        {title}
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {description}
      </p>
    </section>
  )
}

/** 히어로 아래 본문 영역. 좌우 20px(앱 규칙)과 아래 여백을 맡는다. */
export function AuthBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 px-5 pt-6 pb-8">{children}</div>
}

interface AuthSwitchCardProps {
  prompt: string
  hint?: string
  to: string
  linkLabel: string
  /** 링크 끝의 장식 기호. 보조기기에는 읽히지 않는다. */
  arrow: string
}

/**
 * 하단 화면 전환 안내 블록(로그인 → 회원가입, 회원가입 → 로그인). 두 화면이 같은 모양을 쓴다.
 * 안쪽 여백은 글자 확대에 따라 커지지 않게 px로 고정한다.
 */
export function AuthSwitchCard({
  prompt,
  hint,
  to,
  linkLabel,
  arrow,
}: AuthSwitchCardProps) {
  return (
    <div className="mt-8 rounded-card bg-brand-soft px-[16px] py-[20px] text-center">
      <p className="text-section-title font-semibold text-content">{prompt}</p>
      {hint ? (
        <p className="mt-1 text-support font-normal text-muted">{hint}</p>
      ) : null}
      <Link to={to} className={`mt-4 ${secondaryLinkClass}`}>
        {linkLabel} <span aria-hidden="true">{arrow}</span>
      </Link>
    </div>
  )
}

interface StepProgressProps {
  steps: ReadonlyArray<{ step: number; label: string }>
  current: number
}

/**
 * 회원가입 진행 표시. "지금 몇 번째 화면인가"만 보여 주며 입력·검증이 끝났다는 뜻이 아니다.
 * 눌러서 이동하는 컨트롤이 아니라서 링크·버튼을 두지 않는다. 현재 단계는 aria-current="step"과 색·막대로 구분한다.
 */
export function StepProgress({ steps, current }: StepProgressProps) {
  return (
    <ol
      role="list"
      aria-label="회원가입 단계"
      className="grid grid-cols-3 gap-2"
    >
      {steps.map(({ step, label }) => {
        const isCurrent = step === current
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className="min-w-0"
          >
            <span
              aria-hidden="true"
              className={`block h-1 rounded-full ${step <= current ? 'bg-brand' : 'bg-line'}`}
            />
            <span
              className={`mt-2 block text-support leading-snug font-normal ${isCurrent ? 'text-brand' : 'text-muted'}`}
            >
              <span aria-hidden="true">{String(step).padStart(2, '0')} </span>
              <span className="sr-only">{step}단계 </span>
              {label}
              {isCurrent ? <span className="sr-only"> (현재 단계)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 순차 등장하는 필드를 감싼다. animate가 true일 때만 등장 전환을 적용한다.
 * 단계에 들어온 직후 처음 그려지는 필드는 전환하지 않고(화면 전환과 겹치지 않게), 그 뒤 사용자의 입력으로 나타나는 필드만 전환한다.
 */
export function Reveal({
  animate,
  children,
}: {
  animate: boolean
  children: ReactNode
}) {
  return <div className={animate ? revealClass : undefined}>{children}</div>
}
