interface MockBadgeProps {
  children: string
}

/**
 * 개발용 Mock 표시. Mock 문항·결과가 실제 사용자 데이터로 오인되지 않도록 Mock 저장소를 쓸 때만 붙인다.
 * Mock은 개발 서버에서만 켜지므로(onboarding-assessment/assessmentSource.ts) 운영에서는 렌더링되지 않는다.
 */
export default function MockBadge({ children }: MockBadgeProps) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-control bg-warning-soft px-1.5 py-0.5 text-support leading-snug font-semibold text-warning">
      {children}
    </span>
  )
}
