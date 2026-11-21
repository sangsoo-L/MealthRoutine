import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { focusRingOnBrand } from '../home/homeStyles.ts'

interface LandingCtaLinkProps {
  to: string
  children: ReactNode
  /** 바깥 여백처럼 놓이는 자리에 따라 달라지는 값 */
  className?: string
}

/**
 * 브랜드 면 위의 주요 가입 버튼(히어로·마지막 CTA 공통). 흰 면으로 첫눈에 보이게 하고, 포커스 표시는 파란 면용을 쓴다.
 */
export default function LandingCtaLink({
  to,
  children,
  className = '',
}: LandingCtaLinkProps) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-12 items-center justify-center rounded-control bg-surface px-6 text-body font-semibold text-brand transition hover:bg-brand-soft motion-safe:active:scale-[0.98] motion-reduce:transition-none ${focusRingOnBrand} ${className}`}
    >
      {children}
    </Link>
  )
}
