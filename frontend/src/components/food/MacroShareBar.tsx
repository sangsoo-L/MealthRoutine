import type { MacroShare } from '../../food/foodNutrition.ts'

/**
 * 탄수화물·단백질·지방의 열량 비율 누적 막대와 범례(g·%). 색만으로 구분하지 않도록 범례에 이름·g·%를 글자로 함께 둔다.
 * 막대 색은 기존 토큰(식단·브랜드·경고)이며 영양소 전용 색 토큰이 아니다. 비율은 탄수화물·단백질 4kcal/g, 지방 9kcal/g로 환산한 열량 비율이다.
 */
const ROWS = [
  { key: 'carb', label: '탄수화물', bar: 'bg-meal' },
  { key: 'protein', label: '단백질', bar: 'bg-brand' },
  { key: 'fat', label: '지방', bar: 'bg-warning' },
] as const

export default function MacroShareBar({ share }: { share: MacroShare }) {
  const values = {
    carb: { percent: share.carbPercent, grams: share.carbG },
    protein: { percent: share.proteinPercent, grams: share.proteinG },
    fat: { percent: share.fatPercent, grams: share.fatG },
  }
  const gramText = (g: number) => `${Number(g.toFixed(1))}g`
  return (
    <div data-macro-share>
      <div
        role="img"
        aria-label={`열량 비율 탄수화물 ${share.carbPercent}%, 단백질 ${share.proteinPercent}%, 지방 ${share.fatPercent}%`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-line"
      >
        {ROWS.map((row) =>
          values[row.key].percent > 0 ? (
            <span
              key={row.key}
              className={row.bar}
              style={{ width: `${values[row.key].percent}%` }}
            />
          ) : null,
        )}
      </div>
      <ul role="list" className="mt-3 flex flex-col gap-1.5">
        {ROWS.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-3 text-support leading-snug font-normal text-content"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${row.bar}`}
              />
              {row.label}
            </span>
            <span className="tabular-nums text-muted">
              {gramText(values[row.key].grams)} ·{' '}
              <span className="font-semibold text-content">
                {values[row.key].percent}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
