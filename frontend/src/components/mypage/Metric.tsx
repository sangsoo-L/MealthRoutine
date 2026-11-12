interface MetricProps {
  /** null이면 값을 알 수 없는 상태다. 0과 구분하려고 숫자 대신 줄표(–)를 보인다. */
  value: number | null
  unit: string
  /** 값이 없을 때 보조기기에 읽어 줄 이유(예: "연결 전") */
  missingLabel: string
}

/**
 * 핵심 수치 + 단위. 수치는 26/600에 고정폭 숫자라 자릿수가 바뀌어도 흔들리지 않고, 단위는 작게 둬서 수치가 먼저 읽힌다.
 * 값이 없으면 줄표와 이유 글자(보조기기용)를 보이며 0이나 가짜 값으로 채우지 않는다.
 */
export default function Metric({ value, unit, missingLabel }: MetricProps) {
  return (
    <span className="inline-flex items-baseline gap-1">
      {value === null ? (
        <>
          <span
            aria-hidden="true"
            className="text-metric leading-none font-semibold text-muted"
          >
            –
          </span>
          <span className="sr-only">{missingLabel}</span>
          <span
            aria-hidden="true"
            className="text-support font-normal text-muted"
          >
            {unit}
          </span>
        </>
      ) : (
        <>
          <span className="text-metric leading-none font-semibold whitespace-nowrap text-content tabular-nums">
            {value.toLocaleString('ko-KR')}
          </span>
          <span className="text-support font-normal text-muted">{unit}</span>
        </>
      )}
    </span>
  )
}
