import { useEffect, useRef, useState } from 'react'
import type { BodyMeasurementState } from '../../body-measurements/bodyTypes.ts'
import type {
  NotificationSyncState,
  WeightCheckState,
} from '../../weight-log/useWeightCheck.ts'
import type { WeightLogInput } from '../../weight-log/weightLogTypes.ts'
import Icon from '../icons/Icon.tsx'
import WeightNotificationSyncNotice from '../weight-log/WeightNotificationSyncNotice.tsx'
import WeightLogSheet, {
  type WeightLogSheetVariant,
} from '../weight-log/WeightLogSheet.tsx'
import { selectWeightLogEntry, weightDateLabel } from './weightLogEntry.ts'
import { focusRing, sectionTitleClass } from './myStyles.ts'

interface WeightLogSummaryProps {
  body: BodyMeasurementState
  weight: WeightCheckState
  retrying: boolean
  onRetry: () => void
  log: (input: WeightLogInput) => Promise<void>
  /** 기록은 성공했지만 알림 완료 처리만 실패한 상태와 그 재시도. 몸무게 기록을 다시 저장하지 않는다. */
  notificationSync: NotificationSyncState
  onRetryNotificationSync: () => void
  /** true이면(알림에서 들어온 경우) 진입 버튼이 나타나는 즉시 한 번 화면 가운데로 옮기고 포커스를 준다. 기록을 시작하거나 완료하지 않는다. */
  focusEntry?: boolean
}

const actionClass = `-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1 px-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`
const noteClass = 'mt-2.5 text-support leading-snug font-normal text-muted'

/**
 * P01 "몸무게 기록" 섹션(나의 신체 정보 아래). 몸무게 기록을 시작하거나 이어서 남기는 진입점이다. 새 경로는 없고 입력은
 * 홈과 같은 바텀시트(WeightLogSheet)다.
 *
 * - 상태별 안내와 버튼은 selectWeightLogEntry가 정한다: 이력 없음 "체중 기록 시작하기" · 이력 있음 "몸무게 기록하기" ·
 *   기록 어긋남 "기록 확인하기" · 신체 정보 미등록은 위 섹션의 입력 기능 안내 · 조회 실패는 다시 확인 · 연결 전은 사용 불가 안내.
 * - 기존 몸무게로 이력을 자동 만들지 않는다. 몸무게 수치를 받지도 읽지도 보여 주지도 않는다(PIN 보호). 보이는 값은 기록일뿐이다.
 * - 시트를 열 때의 변형을 기억한다. 저장 직후 상태가 바뀌어도 닫히는 동안 시트의 제목·버튼이 바뀌지 않는다.
 */
export default function WeightLogSummary({
  body,
  weight,
  retrying,
  onRetry,
  log,
  notificationSync,
  onRetryNotificationSync,
  focusEntry = false,
}: WeightLogSummaryProps) {
  const [sheet, setSheet] = useState<WeightLogSheetVariant | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const restoreFocus = useRef(false)

  // 저장 성공으로 상태가 바뀌면 진입 버튼이 다른 버튼(예: 시작하기 → 기록하기)으로 바뀌어, 시트가 돌려줄 포커스 대상이 사라진다.
  // 포커스가 문서 처음으로 빠졌다면 이 섹션의 진입 버튼으로 옮긴다.
  useEffect(() => {
    if (sheet !== null || !restoreFocus.current) return
    restoreFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) {
      sectionRef.current
        ?.querySelector<HTMLElement>('[data-weight-trigger]')
        ?.focus()
    }
  }, [sheet])
  const view = selectWeightLogEntry({ body, weight, retrying })
  const focusedFromNotification = useRef(false)

  // 알림에서 들어왔으면 진입 버튼이 나타나는 순간 한 번만 그 버튼으로 옮긴다(자동으로 시트를 열거나 기록하지 않는다).
  useEffect(() => {
    if (!focusEntry || focusedFromNotification.current) return
    const trigger = sectionRef.current?.querySelector<HTMLElement>(
      '[data-weight-trigger]',
    )
    if (!trigger) return
    focusedFromNotification.current = true
    trigger.scrollIntoView({ block: 'center' })
    trigger.focus()
  }, [focusEntry, view.kind])

  if (view.kind === 'hidden') return null
  const today = weight.status === 'ready' ? weight.value.today : ''

  function dates(last: string | null, next: string | null): string | null {
    const l = last ? weightDateLabel(last, today) : null
    const n = next ? weightDateLabel(next, today) : null
    if (l && n) return `마지막 기록 ${l} · 다음 확인 ${n}`
    return l ? `마지막 기록 ${l}` : null
  }

  const trigger = (label: string, variant: WeightLogSheetVariant) => (
    <button
      type="button"
      data-weight-trigger=""
      onClick={() => setSheet(variant)}
      className={actionClass}
    >
      {label}
      <Icon name="chevron-right" size={18} />
    </button>
  )

  return (
    <section
      ref={sectionRef}
      id="weight-log"
      aria-labelledby="my-weightlog-title"
      className="p-4"
    >
      <h2 id="my-weightlog-title" className={sectionTitleClass}>
        몸무게 기록
      </h2>

      {view.kind === 'loading' ? (
        <p role="status" className={noteClass}>
          몸무게 기록을 확인하는 중이에요…
        </p>
      ) : view.kind === 'unavailable' ? (
        <p className={noteClass}>
          몸무게 기록은 아직 사용할 수 없어요. 연결되면 이곳에서 기록할 수
          있어요.
        </p>
      ) : view.kind === 'body-missing' ? (
        <p className={noteClass}>
          키와 몸무게를 먼저 입력해 주세요. 위의 나의 신체 정보에서 입력할 수
          있어요.
        </p>
      ) : view.kind === 'error' || view.kind === 'retrying' ? (
        <div role="status" aria-busy={view.kind === 'retrying'}>
          <p className={noteClass}>몸무게 기록 상태를 확인하지 못했어요.</p>
          <button
            type="button"
            aria-disabled={view.kind === 'retrying'}
            onClick={() => {
              if (view.kind === 'error') onRetry()
            }}
            className={`${actionClass} ${view.kind === 'retrying' ? 'cursor-not-allowed text-muted hover:text-muted' : ''}`}
          >
            {view.kind === 'retrying' ? '확인 중…' : '다시 확인'}
          </button>
        </div>
      ) : view.kind === 'future' ? (
        <p className={noteClass}>
          마지막 기록일이 오늘보다 늦어 지금은 기록할 수 없어요. 기기의 날짜
          설정을 확인해 주세요.
        </p>
      ) : view.kind === 'start' ? (
        <>
          <p className={noteClass}>
            아직 몸무게 기록이 없어요. 지금 몸무게를 기록하면 한 달 뒤에 다시
            확인해 드려요.
          </p>
          {trigger('체중 기록 시작하기', 'start')}
        </>
      ) : view.kind === 'mismatch' ? (
        <>
          <p className={noteClass}>
            등록된 몸무게와 마지막 기록이 일치하지 않아요. 현재 몸무게를 다시
            기록해 주세요.
          </p>
          {dates(view.lastRecordedOn, view.nextDueOn) ? (
            <p className="mt-1 text-support leading-snug font-normal text-muted">
              {dates(view.lastRecordedOn, view.nextDueOn)}
            </p>
          ) : null}
          {trigger('기록 확인하기', 'mismatch')}
        </>
      ) : (
        <>
          {dates(view.lastRecordedOn, view.nextDueOn) ? (
            <p className={noteClass}>
              {dates(view.lastRecordedOn, view.nextDueOn)}
            </p>
          ) : null}
          {trigger('몸무게 기록하기', 'manual')}
        </>
      )}

      {notificationSync !== 'idle' ? (
        <div className="mt-2">
          <WeightNotificationSyncNotice
            busy={notificationSync === 'retrying'}
            onRetry={onRetryNotificationSync}
          />
        </div>
      ) : null}

      {sheet ? (
        <WeightLogSheet
          variant={sheet}
          log={log}
          onClose={() => {
            restoreFocus.current = true
            setSheet(null)
          }}
        />
      ) : null}
    </section>
  )
}
