import { Link } from 'react-router'
import { HOME_SHORTCUTS, TONE_CLASS } from './homeContent.ts'
import { focusRing } from './homeStyles.ts'

// 타일 전체가 눌리는 영역임을 테두리와 흰 배경으로 보여 준다. 눌렀을 때는 배경이 옅은 브랜드색으로 바뀐다.
const tileClass = `flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-line bg-surface px-1 py-3 text-center text-support leading-snug font-normal text-content ${focusRing}`

const interactiveClass =
  'transition-colors hover:border-brand/40 active:bg-brand-soft motion-reduce:transition-none'

/**
 * 회원 홈(MemberHomePage)의 바로가기 6개(3열×2행). 비회원 랜딩(H01)은 이 컴포넌트를 렌더링하지 않는다.
 *
 * 핵심 기능 바로가기 6개(운동 기록·식단 기록·AI 코칭 / 운동 찾기·음식 찾기·커뮤니티), 3열 × 2행.
 * 목적지가 없는 항목은 링크 대신 비활성 버튼으로 두어 이동할 수 있는 것처럼 보이지 않게 한다.
 */
export default function HomeShortcuts() {
  return (
    // nav가 아니라 이름 붙은 영역 + 목록이다: 사이트 전체 내비게이션(BottomNav)만 nav 랜드마크로 남긴다.
    <section aria-label="핵심 기능 바로가기">
      {/*
        v5.0 H01의 6개 바로가기는 3열 × 2행이다. 칸의 최소 폭을 "전체의 1/3"로 두면 열이 3개를 넘지 않고,
        4.5rem 바닥값 덕분에 글자를 키워 칸이 모자라면 열이 줄어(3→2→1) 라벨 단어가 끊기지 않는다.
        (gap-2 = 8px이라 3열 사이 간격은 16px)
      */}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(max(4.5rem,calc((100%-16px)/3)),1fr))] gap-2">
        {HOME_SHORTCUTS.map((item) => {
          const tile = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-12 w-12 items-center justify-center rounded-card text-metric ${TONE_CLASS[item.tone]}`}
              >
                {item.emoji}
              </span>
              <span>{item.label}</span>
            </>
          )
          return (
            <li key={item.label}>
              {item.to ? (
                <Link
                  to={item.to}
                  className={`${tileClass} ${interactiveClass}`}
                >
                  {tile}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-disabled="true"
                  className={`${tileClass} w-full cursor-not-allowed opacity-60`}
                >
                  {tile}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
