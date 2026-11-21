import { Link } from 'react-router'
import { focusRing } from './homeStyles.ts'

/**
 * [미사용] 이전 비회원 홈의 로그인 안내(임시 승인 안내). 랜딩 헤더의 "로그인"이 대체했다. 삭제 여부는 사용자 확인 대기.
 *
 * 로그인 유도 안내. 스토리보드에 없는, 사용자가 승인한 임시 안내다.
 * 인증 상태가 없어 항상 보여 준다. 인증 API가 연결되면 비로그인일 때만 표시한다.
 * 히어로의 "무료로 시작하기"가 주 행동이므로 이 안내는 테두리만 있는 보조 버튼으로 한 단계 낮춘다.
 */
export default function HomeLoginBanner() {
  return (
    <section
      aria-labelledby="home-login-banner-title"
      // px-[16px]: 글자 확대(rem 기준)에도 좌우 안쪽 여백이 커져 본문 폭을 잠식하지 않게 고정한다.
      className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-card border border-line bg-surface px-[16px] py-4"
    >
      <div className="min-w-0 flex-1 basis-36">
        <h2
          id="home-login-banner-title"
          className="text-body leading-snug font-semibold text-balance text-content"
        >
          로그인하고 건강 관리를 시작해 보세요
        </h2>
        <p className="mt-1 text-support leading-relaxed font-normal text-pretty text-muted">
          운동과 식단을 기록하고 나에게 맞는 건강 관리 서비스를 이용할 수
          있어요.
        </p>
      </div>
      <Link
        to="/login"
        className={`flex min-h-11 shrink-0 items-center justify-center rounded-control border border-brand px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`}
      >
        로그인하러 가기
      </Link>
    </section>
  )
}
