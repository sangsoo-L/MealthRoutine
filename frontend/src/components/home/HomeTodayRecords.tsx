import { Link } from 'react-router'
import { DOMAIN_TONE, sectionBand } from './homeStyles.ts'

/** 오늘의 기록 한 줄에 필요한 값. 지금은 연결된 기록 데이터가 없어 항상 비어 있는 상태로 쓴다. */
const ROWS = [
  {
    domain: 'exercise',
    label: '운동',
    to: '/records/exercise',
    emptyText: '아직 기록이 없어요',
  },
  {
    domain: 'meal',
    label: '식단',
    to: '/records/meal',
    emptyText: '아직 기록이 없어요',
  },
] as const

/**
 * 회원 홈의 "오늘의 기록". 운동과 식단을 한 줄씩 구분해 보여 주는 평면 영역이다(스토리보드 v5.0 H01: 평면 기록 영역과 간결한 링크).
 *
 * 운동·식단 기록 기능과 기록 API가 아직 없어 모든 줄이 "아직 기록이 없어요" 상태다. 개수·칼로리·세트 같은 수치와 예시 기록은
 * 만들지 않는다. 기록 데이터가 연결되면 ROWS의 값을 응답으로 바꾼다(기록이 있는 줄의 표시는 그때 정한다).
 * 각 줄은 해당 기록 화면(W01·D01 임시 화면)으로 가는 링크이고, 줄 전체가 눌린다. 구분은 색만이 아니라 "운동"·"식단" 글자로도 한다.
 */
export default function HomeTodayRecords() {
  return (
    // 흰 밴드(sectionBand)가 이 섹션의 위아래 경계를 맡는다. 목록은 줄 사이 구분선만 둔다.
    <section aria-labelledby="home-today-title" className={sectionBand}>
      <h2
        id="home-today-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        오늘의 기록
      </h2>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {ROWS.map((row) => (
          <li key={row.domain}>
            <Link
              to={row.to}
              // 윤곽선이 줄 위아래 구분선에 가려지지 않도록 안쪽으로 그린다.
              className="flex min-h-16 items-center gap-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              <span
                className={`w-10 shrink-0 text-body leading-snug font-semibold ${DOMAIN_TONE[row.domain].label}`}
              >
                {row.label}
              </span>
              <span className="min-w-0 flex-1 text-body leading-snug font-normal text-muted">
                {row.emptyText}
              </span>
              <span className="shrink-0 text-support font-normal text-brand">
                기록하기 <span aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
