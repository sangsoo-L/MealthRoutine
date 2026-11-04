import { Link } from 'react-router'

interface PagePlaceholderProps {
  screenId: string
  name: string
}

/**
 * 대표 경로 임시 화면. 정식 화면 구현 전까지 모든 대표 경로가 공유한다.
 */
export default function PagePlaceholder({
  screenId,
  name,
}: PagePlaceholderProps) {
  return (
    <section>
      <p className="text-section-title font-semibold">
        {screenId} · {name}
      </p>
      <p className="mt-1 text-support font-normal text-muted">임시 화면</p>
    </section>
  )
}

/**
 * 존재하지 않는 URL의 임시 최소 처리.
 * 404 정식 디자인은 미확정이므로 확정 후 교체한다.
 */
export function NotFoundPlaceholder() {
  return (
    <section>
      <p className="text-body font-normal">
        요청하신 페이지를 찾을 수 없습니다.
      </p>
      <Link
        to="/"
        className="mt-3 inline-flex min-h-11 items-center text-body font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        홈으로 이동
      </Link>
    </section>
  )
}
