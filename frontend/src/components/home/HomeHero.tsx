import { Link } from 'react-router'
import { focusRingOnBrand } from './homeStyles.ts'

/** 장식용 이모지 타일. 보조기기에서는 숨기고, 순수 장식이라 매번 새로 만들 필요가 없어 모듈 상수로 둔다. */
const HERO_ART = (
  <div aria-hidden="true" className="flex shrink-0 flex-col gap-2">
    <span className="flex h-14 w-14 items-center justify-center rounded-card border border-surface/25 bg-surface/15 text-metric">
      💪
    </span>
    <span className="-ml-5 flex h-14 w-14 items-center justify-center rounded-card border border-surface/25 bg-surface/15 text-metric">
      🍽️
    </span>
  </div>
)

/**
 * 히어로 배경의 장식 원 두 개(우상단 큰 원, 우하단 작은 원). 색은 기존 토큰 surface의 투명도(10%, 5%)만 쓴다.
 * 요소(span)를 겹치지 않고 배경 그라디언트로 그린다: 카드 밖으로 걸치는 요소가 없어 가로 넘침이 생기지 않고,
 * 보조기기가 읽을 대상도 없으며 DOM 노드도 늘지 않는다. 원 크기는 글자 확대와 무관하게 px로 고정한다.
 */
const HERO_RINGS =
  'bg-[radial-gradient(circle_at_calc(100%-32px)_32px,color-mix(in_srgb,var(--color-surface)_10%,transparent)_88px,transparent_88px),radial-gradient(circle_at_calc(100%-64px)_calc(100%+8px),color-mix(in_srgb,var(--color-surface)_5%,transparent)_72px,transparent_72px)]'

/**
 * [미사용] 이전 비회원 홈의 히어로. 비로그인 랜딩의 landing/LandingHero가 대체했다. 삭제 여부는 사용자 확인 대기.
 *
 * 비회원 홈의 브랜드 히어로. 홈에서 유일하게 브랜드 블루로 채운 면이라 시선이 가장 먼저 닿는다.
 * 화면의 주 행동(무료 시작, A03 회원가입)을 이 안에 둔다. 폭이 모자라면(글자 확대 등) 장식이 아래로 내려간다.
 * 배경의 두 원은 장식이다. 움직이지 않고 색도 기존 토큰(brand, surface)의 투명도만 쓴다.
 */
export default function HomeHero() {
  return (
    <section
      aria-labelledby="home-hero-title"
      // px-[20px]: 카드 좌우 안쪽 여백만 글자 확대에 따라 커지지 않게 고정한다. rem 여백(px-5)이면 글자를 200%로 키울 때
      // 여백이 40px씩 되어 본문 폭이 줄고 제목 단어가 끊긴다. 기본 배율에서는 값이 같다.
      className={`rounded-card bg-brand px-[20px] py-6 text-surface ${HERO_RINGS}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-5">
        <div className="min-w-0 flex-1 basis-40">
          {/* 채움 대신 테두리만: 반투명 흰 채움을 깔면 흰 글자 대비가 4.5:1 아래(약 4:1)로 내려간다. */}
          <p className="inline-flex rounded-full border border-surface/40 px-3 py-1 text-support font-normal text-surface">
            밀스루틴과 가볍게 시작해요
          </p>
          <h2
            id="home-hero-title"
            className="mt-3 text-app-title leading-snug font-semibold text-surface"
          >
            운동과 식단을
            <br />
            한곳에 기록하세요
          </h2>
          {/* 보조 문구는 순백이 아니라 brand-soft: 파란 배경 위에서 글자 명도 대비 4.5:1을 넘기기 위해서다. */}
          <p className="mt-2 text-body leading-relaxed font-normal text-brand-soft">
            오늘의 작은 실천을 모아
            <br />
            나만의 루틴으로.
          </p>
          {/* A03 회원가입의 `/signup`은 기획 문서에 없는 임시 확정 경로다. */}
          <Link
            to="/signup"
            className={`mt-5 inline-flex min-h-12 items-center rounded-control bg-surface px-5 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRingOnBrand}`}
          >
            {/* 글자와 화살표를 한 덩어리로 묶어, 좁을 때 글자만 먼저 줄어 단어가 끊기지 않게 한다. */}
            <span>
              무료로 시작하기 <span aria-hidden="true">›</span>
            </span>
          </Link>
        </div>
        {HERO_ART}
      </div>
    </section>
  )
}
