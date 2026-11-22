interface RatioBarProps {
  /** 운동 비율(%). 식단 비율은 100에서 뺀 값이다. */
  exerciseRatio: number
  /** 막대 높이. 기본은 얇은 막대 */
  thick?: boolean
}

/**
 * 운동·식단 비율 가로 막대. 운동은 인디고, 식단은 앰버 면이고 두 구간의 합은 항상 100%다. 색만으로 전하지 않도록
 * 막대는 장식이며(role 없음) 같은 정보를 바로 옆 글자("운동 70% · 식단 30%")가 전한다.
 */
export default function RatioBar({
  exerciseRatio,
  thick = false,
}: RatioBarProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex w-full overflow-hidden rounded-full bg-line ${thick ? 'h-3' : 'h-2'}`}
    >
      <div
        className="bg-exercise transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${exerciseRatio}%` }}
      />
      <div
        className="bg-meal transition-[width] duration-200 motion-reduce:transition-none"
        style={{ width: `${100 - exerciseRatio}%` }}
      />
    </div>
  )
}
