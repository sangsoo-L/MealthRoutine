import { Link } from 'react-router'
import { focusRing } from '../home/homeStyles.ts'
import { LANDING_FOOTER } from './landingContent.ts'

/**
 * 푸터. 서비스 이름, 한 줄 소개, 지금 갈 수 있는 경로만 둔다. 고객지원은 임시 화면이라 "화면 준비 중"을 함께 표시한다.
 * 개인정보처리방침·이용약관·운영 정보 화면은 아직 없어 링크를 만들지 않았다(배포 전 준비 항목).
 * 본문 좌우·아래 여백을 -mx-5·-mb-5로 넘어 화면 폭 끝까지 펼친다. (AppShell 본문 여백이 바뀌면 함께 확인)
 * 바로 위 가입 CTA의 진한 파란 면과 색이 이미 구분되므로 위쪽 테두리는 두지 않는다.
 */
export default function LandingFooter() {
  return (
    <footer className="-mx-5 -mb-5 bg-surface px-[20px] py-6">
      <p className="text-body font-semibold text-content">
        {LANDING_FOOTER.brand}
      </p>
      <p className="mt-1 text-body leading-relaxed font-normal text-muted">
        {LANDING_FOOTER.description}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4">
        {LANDING_FOOTER.links.map((link) => (
          <li key={link.to} className="flex flex-wrap items-center gap-x-2">
            <Link
              to={link.to}
              className={`-ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-control px-1 text-body font-normal text-muted underline underline-offset-2 hover:text-brand ${focusRing}`}
            >
              {link.label}
            </Link>
            <span className="text-support font-normal text-muted">
              {link.status}
            </span>
          </li>
        ))}
      </ul>
    </footer>
  )
}
