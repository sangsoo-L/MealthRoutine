import { Link } from 'react-router'
import { HOME_SHORTCUTS, TONE_CLASS } from './homeContent.ts'
import { focusRing } from './homeStyles.ts'

// 메뉴를 감싸는 카드(배경·테두리·그림자)는 두지 않는다. 아이콘 타일과 메뉴명만 보인다.
// 위에서부터 쌓는(justify-start) 구조라 아래에 상태 글이 붙어도 아이콘·메뉴명 위치가 모든 칸에서 같다.
// 칸 높이가 아이콘 48px + 메뉴명 이상이라 링크의 터치 영역은 44px을 넘고, 보이지 않는 영역이 칸 전체다.
const cellClass = `flex h-full flex-col items-center justify-start gap-3 px-1 py-1 text-center text-support leading-snug font-normal text-content ${focusRing}`

const interactiveClass =
  'rounded-card transition-colors hover:text-brand motion-reduce:transition-none'

/**
 * 회원 홈(MemberHomePage)의 바로가기 6개(3열×2행). 비회원 랜딩(H01)은 이 컴포넌트를 렌더링하지 않는다.
 *
 * 핵심 기능 바로가기 6개(운동 기록·식단 기록·AI 코칭 / 운동 찾기·음식 찾기·커뮤니티), 3열 × 2행.
 * 목적지가 없는 항목은 눌러도 아무 일이 없는 버튼이 되지 않도록 링크·버튼이 아닌 요소로 두고,
 * 아이콘을 옅게 하고 메뉴명 아래에 "준비 중"을 글자로 함께 표시한다(색만으로 전하지 않는다).
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
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(max(4.5rem,calc((100%-16px)/3)),1fr))] gap-x-2 gap-y-7">
        {HOME_SHORTCUTS.map((item) => {
          const ready = item.to !== null
          const content = (
            <>
              <span
                aria-hidden="true"
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-card text-metric ${TONE_CLASS[item.tone]} ${ready ? '' : 'opacity-70'}`}
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
                  className={`${cellClass} ${interactiveClass}`}
                >
                  {content}
                </Link>
              ) : (
                <div className={cellClass}>
                  {content}
                  <span className="-mt-1 text-support font-normal text-muted">
                    준비 중
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
