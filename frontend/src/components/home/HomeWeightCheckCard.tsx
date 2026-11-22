import { focusRing } from './homeStyles.ts'
import { WEIGHT_CARD_TEXT } from './homeWeightCheck.ts'

/**
 * 월간 몸무게 확인 카드. 오늘의 추천 자리에 기존 추천 배너를 대체해 보인다(홈의 신체 정보 입력 카드와 같은 틀).
 *
 * - due: 마지막 기록 후 한 달이 지났을 때. mismatch: 등록된 몸무게와 마지막 기록이 일치하지 않을 때.
 * - 몸무게 수치·변화량을 표시하지 않는다. 문구는 일반 문장이다.
 * - "몸무게 기록하기"(또는 "기록 확인하기")는 입력 시트를 연다. "나중에 하기"는 오늘(서울)만 카드를 숨긴다. 기록 완료·알림 읽음이 아니다.
 * - 버튼은 터치 영역 44px 이상이고 좁은 화면(글자 확대)에서는 줄을 바꾼다.
 */
export default function HomeWeightCheckCard({
  variant,
  onRecord,
  onLater,
}: {
  variant: 'due' | 'mismatch'
  onRecord: () => void
  onLater: () => void
}) {
  const text = WEIGHT_CARD_TEXT[variant]
  return (
    <section
      aria-labelledby="home-weightcheck-title"
      className="rounded-card bg-brand-soft px-[20px] py-6"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-support leading-snug font-semibold text-brand">
            오늘의 추천
          </p>
          <h2
            id="home-weightcheck-title"
            className="mt-1 text-section-title leading-snug font-semibold text-balance text-content"
          >
            {text.title}
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
            {text.description}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-surface text-metric"
        >
          ⚖️
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onRecord}
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          {text.action}
          <span aria-hidden="true" className="ml-1">
            ›
          </span>
        </button>
        <button
          type="button"
          onClick={onLater}
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control px-3 text-body font-normal text-muted transition-colors hover:text-content motion-reduce:transition-none ${focusRing}`}
        >
          나중에 하기
        </button>
      </div>
      {import.meta.env.DEV ? (
        <p className="mt-3 text-support leading-snug font-normal text-muted">
          개발 서버의 임시 저장소로 확인 중이에요.
        </p>
      ) : null}
    </section>
  )
}

/**
 * 몸무게 기록 상태를 불러오지 못했을 때 기존 추천 배너 아래에 붙는 재시도 안내. 실패를 "확인 필요"나 "기록 없음"으로 말하지 않는다.
 * 다시 확인하는 동안(busy)에도 안내를 유지하고 버튼은 눌러도 반응하지 않는다. disabled 대신 aria-disabled를 써서 포커스를 잃지 않는다.
 */
export function HomeWeightCheckRetry({
  busy,
  onRetry,
}: {
  busy: boolean
  onRetry: () => void
}) {
  return (
    <div
      role="status"
      aria-busy={busy}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-page px-4 py-2"
    >
      <p className="min-w-0 text-support leading-snug font-normal text-muted">
        몸무게 기록 상태를 확인하지 못했어요.
      </p>
      <button
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) onRetry()
        }}
        className={`min-h-11 rounded-control px-2 text-body font-semibold ${busy ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-brand hover:text-brand-hover'} ${focusRing}`}
      >
        {busy ? '확인 중…' : '다시 확인'}
      </button>
    </div>
  )
}
