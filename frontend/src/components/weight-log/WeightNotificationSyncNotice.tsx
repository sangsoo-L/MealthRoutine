const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 몸무게 기록은 성공했지만 월간 확인 알림의 완료 처리만 실패했을 때의 안내. 기록이 성공했음을 먼저 알리고, 실패를 몸무게 기록의
 * 실패로 말하지 않는다. "알림 다시 확인"은 알림 완료 처리만 다시 시도하며 몸무게 기록을 다시 저장하지 않는다.
 * 다시 확인하는 동안(busy)에도 안내를 유지하고 버튼은 눌러도 반응하지 않는다(포커스를 잃지 않게 disabled 대신 aria-disabled).
 * 몸무게 수치는 담지 않는다.
 */
export default function WeightNotificationSyncNotice({
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
        몸무게는 기록했어요. 알림 상태를 갱신하지 못했어요.
      </p>
      <button
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) onRetry()
        }}
        className={`min-h-11 rounded-control px-2 text-body font-semibold ${busy ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-brand hover:text-brand-hover'} ${focusRing}`}
      >
        {busy ? '확인 중…' : '알림 다시 확인'}
      </button>
    </div>
  )
}
