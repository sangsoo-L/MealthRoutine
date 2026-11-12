import { MY_DESTINATIONS } from '../../mypage/destinations.ts'
import type { PointBalance, Slot } from '../../mypage/mypageTypes.ts'
import Metric from './Metric.tsx'
import MyLink from './MyLink.tsx'

interface PointSummaryProps {
  points: Slot<PointBalance>
}

/**
 * P01 섹션 3. 보유 포인트.
 *
 * 카드 없이 페이지 바탕 위에 놓는 평면 구역이다. 원형 `P` 심볼과 큰 수치(26/600, 고정폭 숫자) 한 줄이 핵심이고,
 * 심볼과 수치 블록이 세로 중앙에 맞고, 폭이 모자라면(글자 확대) 수치가 심볼 아래 줄로 내려간다. 경험치(EXP)와 별개의 값이며 둘 사이에 계산 규칙이 없다.
 * 연결된 포인트 API가 없으면 수치는 줄표이고 작은 보조 글자로 알린다. 0P로 채우지 않는다.
 * 포인트 내역(P16)은 화면이 생겨 경로가 채워지면 오른쪽에 링크로 나타난다(MyLink). 지금은 그리지 않는다.
 */
export default function PointSummary({ points }: PointSummaryProps) {
  const ready = points.state === 'ready'

  return (
    <section
      aria-labelledby="my-point-title"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-section-title leading-none font-semibold text-surface"
        >
          P
        </span>
        <div className="min-w-0">
          <h2
            id="my-point-title"
            className="mb-1 text-support leading-none font-normal text-muted"
          >
            보유 포인트
          </h2>
          <Metric
            value={ready ? points.data.balance : null}
            unit="P"
            missingLabel="연결 전"
          />
          {ready ? null : (
            <p className="mt-1 text-support leading-snug font-normal text-muted">
              아직 연결되지 않았어요
            </p>
          )}
        </div>
      </div>
      <MyLink destination={MY_DESTINATIONS.pointHistory}>포인트 내역</MyLink>
    </section>
  )
}
