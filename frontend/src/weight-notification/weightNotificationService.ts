import { notifyNotificationsChanged } from '../notifications/notificationEvents.ts'
import {
  NotificationError,
  type NotificationDraft,
  type NotificationRepository,
} from '../notifications/notificationTypes.ts'
import { isValidIsoDate } from '../weight-log/weightDate.ts'
import type { WeightCheckStatus } from '../weight-log/weightLogTypes.ts'

/**
 * 월간 몸무게 확인 알림의 조정 계층. 몸무게 기록 저장소(WeightLogRepository)와 알림 저장소(NotificationRepository)를 서로 직접
 * 연결하지 않고, 이 서비스가 "수치 없는 확인 상태(WeightCheckStatus)"와 "알림 저장소"만 받아 둘을 맞춘다.
 *
 * 운영에서는 알림 생성·완료 처리의 최종 책임이 백엔드에 있어야 한다(서버 스케줄러가 확인 주기를 보고 한 번만 만든다). 이 서비스는
 * 개발 환경(Mock 저장소)에서 같은 규칙을 흉내 내는 클라이언트 쪽 구현이며, 운영 API가 정해지면 이 계층을 서버 호출로 바꾸거나 없앤다.
 *
 * 알림에는 몸무게 수치를 담지 않는다. 읽음(readAt)과 처리 완료(resolvedAt)는 독립이며 이 서비스는 readAt을 바꾸지 않는다.
 */

/** 이 서비스가 만드는 알림의 dedupeKey 접두어 */
export const WEIGHT_NOTIFICATION_PREFIX = 'weight-check:'
const CYCLE_KEY = /^weight-check:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/

export const WEIGHT_NOTIFICATION_TITLE = '이번 달 몸무게를 확인해 주세요'
export const WEIGHT_NOTIFICATION_BODY =
  '마지막 기록 이후 한 달이 지났어요. 몸무게를 기록해 보세요.'
/**
 * 알림이 열어 주는 곳: 마이페이지의 몸무게 기록 섹션. 새 경로를 만들지 않고 기존 `/mypage`에 해시를 붙인다
 * (마이페이지가 해시를 보고 그 섹션의 진입 버튼으로 포커스를 옮긴다). 알림을 여는 것만으로는 기록이 완료되지 않는다.
 */
export const WEIGHT_NOTIFICATION_ROUTE = '/mypage#weight-log'

type CycleFields = Pick<WeightCheckStatus, 'lastRecordedOn' | 'nextDueOn'>

/**
 * 확인 주기의 안정적인 식별자: `weight-check:<마지막 기록일>:<다음 확인일>`.
 * - 같은 주기에서는 언제 몇 번 조회해도 같다(같은 날 여러 번 기록해도 마지막 기록일이 같아 같은 주기다).
 * - 새 기록을 남기면 마지막 기록일이 바뀌어 새 주기·새 키가 된다. 현재 달만 쓰지 않으므로 같은 달에 두 주기가 있어도 구분된다.
 * 기록일이나 확인일을 모르면(이력 없음·미래 기록일) 주기가 없다(null).
 */
export function weightCycleKey(status: CycleFields): string | null {
  // 없는 날짜(예: 2월 30일)나 형식이 다른 값으로는 주기를 만들지 않는다.
  if (
    !isValidIsoDate(status.lastRecordedOn) ||
    !isValidIsoDate(status.nextDueOn)
  )
    return null
  const key = `${WEIGHT_NOTIFICATION_PREFIX}${status.lastRecordedOn}:${status.nextDueOn}`
  return CYCLE_KEY.test(key) ? key : null
}

/**
 * 월간 확인 알림을 만들어야 하는 상태인가. 이력이 있고(마지막 기록일 있음), 확인일이 되었고(due), 기록과 현재 몸무게가 일치하는 정상 상태일 때만이다.
 * 이력 없음·기록일 모르는 기존 몸무게·미래 기록일·기록 불일치는 만들지 않는다(조회 실패·저장소 미연결은 상태 자체가 없어 호출되지 않는다).
 */
export function shouldCreateWeightNotification(
  status: WeightCheckStatus,
): boolean {
  return (
    status.reason === 'due' &&
    status.needsCheck &&
    status.consistent &&
    !status.legacyWeightUndated &&
    weightCycleKey(status) !== null
  )
}

export function weightNotificationDraft(
  status: CycleFields,
): NotificationDraft | null {
  const dedupeKey = weightCycleKey(status)
  if (!dedupeKey) return null
  return {
    type: 'body',
    title: WEIGHT_NOTIFICATION_TITLE,
    body: WEIGHT_NOTIFICATION_BODY,
    dedupeKey,
    target: { route: WEIGHT_NOTIFICATION_ROUTE },
  }
}

export type ResolveOutcome =
  /** 그 주기의 알림을 처리 완료로 표시했다(이미 처리 완료였어도 같다) */
  | 'resolved'
  /** 처리할 알림이 없다(아직 만들어지지 않았거나 주기를 모른다). 실패가 아니다 */
  | 'none'

export interface SyncResult {
  /** 이번 호출로 새 알림을 만들었는가(같은 주기의 알림이 이미 있으면 false) */
  created: boolean
  /** 이전 주기의 미처리 알림을 처리 완료로 바꾼 수 */
  reconciled: number
}

/** 정리가 한 번에 조회하는 미처리 월간 알림 수. 대상이 이보다 많으면 cursor로 이어서 끝까지 조회한다(조회할 페이지 수에 고정 상한은 없다). */
const RECONCILE_PAGE_SIZE = 50

export interface WeightNotificationService {
  /**
   * 상태에 맞춰 알림을 맞춘다. 중복 호출에 안전하다(같은 주기는 한 번만 만들고, 이미 맞춰진 것은 쓰지 않는다).
   * 1) 생성 조건이면 이번 주기의 알림을 만든다. 2) 마지막 기록일이 더 늦은(= 이미 새로 기록한) 이전 주기의 미처리 알림을 처리 완료로 바꾼다.
   *    2번은 기록 직후의 완료 처리가 실패했거나 화면을 떠난 경우를 나중에 바로잡는 안전망이다. 알림을 지우지 않는다.
   * 어느 한쪽이 실패해도 다른 쪽은 시도하고, 처음 발생한 오류를 마지막에 던진다(호출한 화면은 이 오류로 주요 기능을 막지 않는다).
   */
  sync(status: WeightCheckStatus): Promise<SyncResult>
  /** 기록을 남기기 전의 상태(previous)가 속한 주기의 알림을 처리 완료로 표시한다. 알림이 없으면 'none'. 읽음 상태는 바꾸지 않는다. */
  resolveCycle(previous: CycleFields): Promise<ResolveOutcome>
  /** 주기 키로 직접 처리 완료를 표시한다(실패한 완료 처리를 다시 시도할 때 쓴다). */
  resolveByKey(key: string): Promise<ResolveOutcome>
}

export function createWeightNotificationService(
  notifications: NotificationRepository,
): WeightNotificationService {
  async function resolveByKey(key: string): Promise<ResolveOutcome> {
    try {
      await notifications.resolve(key)
    } catch (error) {
      if (error instanceof NotificationError && error.code === 'notFound')
        return 'none'
      throw error
    }
    notifyNotificationsChanged()
    return 'resolved'
  }

  async function reconcile(status: WeightCheckStatus): Promise<number> {
    // 마지막 기록일을 믿을 수 없을 때(미래 기록일)나 이력이 없을 때는 이전 주기를 판단하지 않는다.
    if (!status.lastRecordedOn || status.reason === 'future-date') return 0
    // 기록과 현재 몸무게가 어긋난 상태(예: 일부만 저장된 기록)는 기록이 끝났다고 볼 수 없으므로 알림을 완료 처리하지 않는다.
    // 사용자가 현재 몸무게를 다시 기록해 일치하게 되면 그때 정리한다.
    if (!status.consistent) return 0
    let resolved = 0
    let firstError: unknown = null
    let cursor: string | null = null
    const seenCursors = new Set<string>()
    const handled = new Set<string>()
    for (;;) {
      // 미처리 월간 알림만 조회한다(전체 알림을 훑지 않으므로 알림이 얼마나 많아도, 얼마나 오래됐어도 놓치지 않는다).
      // cursor는 (생성 시각, id) 값 기반이라, 아래에서 알림을 처리 완료로 바꿔 이 목록에서 사라져도 다음 페이지가 누락되지 않는다.
      const page = await notifications.list({
        filter: 'all',
        resolved: false,
        dedupeKeyPrefix: WEIGHT_NOTIFICATION_PREFIX,
        cursor,
        limit: RECONCILE_PAGE_SIZE,
      })
      for (const n of page.items) {
        if (handled.has(n.dedupeKey)) continue // 같은 알림을 한 번의 정리에서 두 번 처리하지 않는다
        handled.add(n.dedupeKey)
        const match = CYCLE_KEY.exec(n.dedupeKey)
        if (!match || n.resolvedAt !== null) continue
        if (match[1] >= status.lastRecordedOn) continue // 현재(또는 더 늦은) 주기는 기록으로만 끝난다
        try {
          await notifications.resolve(n.dedupeKey)
          resolved += 1
        } catch (error) {
          // 실패한 알림은 미처리로 남아 다음 정리에서 다시 시도된다. 성공한 변경은 유지하고 나머지를 계속 처리한다.
          firstError ??= error
        }
      }
      // 무한 반복 방지: 항목이 없거나, cursor가 없거나, 이미 본 cursor로 돌아오면 끝낸다(올바른 저장소는 이런 응답을 하지 않는다).
      const next = page.nextCursor
      if (page.items.length === 0 || !next || seenCursors.has(next)) break
      seenCursors.add(next)
      cursor = next
    }
    if (resolved > 0) notifyNotificationsChanged()
    if (firstError) throw firstError
    return resolved
  }

  return {
    resolveByKey,

    async resolveCycle(previous) {
      const key = weightCycleKey(previous)
      return key ? resolveByKey(key) : 'none'
    },

    async sync(status) {
      const result: SyncResult = { created: false, reconciled: 0 }
      let firstError: unknown = null
      const draft = shouldCreateWeightNotification(status)
        ? weightNotificationDraft(status)
        : null
      if (draft) {
        try {
          result.created = (await notifications.create(draft)).created
          if (result.created) notifyNotificationsChanged()
        } catch (error) {
          firstError ??= error
        }
      }
      try {
        result.reconciled = await reconcile(status)
      } catch (error) {
        firstError ??= error
      }
      if (firstError) throw firstError
      return result
    },
  }
}
