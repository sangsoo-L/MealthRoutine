/**
 * 앱 내부 알림(P08)의 타입. 알림에는 몸무게·키 같은 신체 수치를 담지 않는다(생성할 때 검증으로 막는다).
 * 웹 푸시·실시간 알림은 이 모듈의 범위가 아니다.
 */

export type NotificationType = 'body' | 'exercise' | 'system'

/** 알림이 열어 주는 앱 내부 화면. 외부 주소는 허용하지 않는다. */
export interface NotificationTarget {
  route: string
}

/**
 * 알림 한 건. 읽음(readAt)과 처리 완료(resolvedAt)는 서로 독립이다.
 * - readAt: 사용자가 이 알림을 열어 본 시각. 읽었다고 해서 알림이 가리키는 일(예: 몸무게 기록)이 끝난 것이 아니다.
 * - resolvedAt: 알림이 가리키는 일이 실제로 끝난 시각. 시스템이 정하며, 읽는 동작으로는 바뀌지 않는다.
 */
export interface AppNotification {
  id: string
  /** 이 알림의 주인. 저장소가 계정별로 분리하고, 읽을 때도 다시 확인한다. */
  userId: string
  type: NotificationType
  title: string
  body: string
  /** ISO 8601 */
  createdAt: string
  readAt: string | null
  resolvedAt: string | null
  /** 계정 안에서 유일한 중복 방지 키. 같은 키로는 알림이 두 번 만들어지지 않는다. */
  dedupeKey: string
  target: NotificationTarget | null
}

/** 새 알림의 내용. 식별자·시각·읽음 상태는 저장소가 정한다. */
export type NotificationDraft = Pick<
  AppNotification,
  'type' | 'title' | 'body' | 'dedupeKey' | 'target'
>

export type NotificationFilter = 'all' | 'unread'

export interface NotificationListQuery {
  filter: NotificationFilter
  /** 이전 조회가 돌려준 nextCursor. 없으면 첫 페이지. 형식을 알 수 없는 값이다(저장소가 정한다). */
  cursor?: string | null
  /** 한 번에 가져올 개수(1~50, 기본 20) */
  limit?: number
  /**
   * true이면 처리 완료(resolvedAt이 있는) 알림만, false이면 처리 완료가 없는 알림만. 생략하면 구분하지 않는다.
   * 전체/읽지 않음 필터와 함께 쓸 수 있다. boolean이 아닌 값은 'invalidInput'.
   */
  resolved?: boolean
  /**
   * dedupeKey가 이 접두어로 시작하는 알림만. 생략하면 구분하지 않는다. 비어 있거나 dedupeKey에 쓸 수 없는 글자가 있으면 'invalidInput'.
   * (월간 몸무게 알림 정리가 오래된 미처리 알림만 조회하는 데 쓴다. 전체 알림을 훑지 않아도 된다.)
   */
  dedupeKeyPrefix?: string
}

export interface NotificationPage {
  /** 최신 알림이 먼저 */
  items: AppNotification[]
  /** 다음 페이지가 있으면 그 시작 위치, 없으면 null */
  nextCursor: string | null
}

export type NotificationErrorCode =
  /** 알림 내용이 규칙을 어긴다(빈 제목, 외부 경로, 신체 수치 등) */
  | 'invalidInput'
  /** 조회 위치(cursor)가 올바르지 않다 */
  | 'invalidCursor'
  | 'notFound'
  | 'save'
  | 'load'
  /** 저장된 알림 데이터가 손상됐거나 다른 계정의 것이 섞여 있다. 덮어쓰지 않는다 */
  | 'corrupt'
  | 'unavailable'

/** 메시지에 알림 내용이나 저장 내용을 담지 않는다. */
export class NotificationError extends Error {
  readonly code: NotificationErrorCode

  constructor(code: NotificationErrorCode) {
    super(`notification ${code}`)
    this.name = 'NotificationError'
    this.code = code
  }
}

/**
 * 알림 데이터 경계. 구현은 계정 하나에 묶여 있고 다른 계정의 알림에 접근하지 않는다.
 * 운영 API 계약은 아직 없다(api-spec.md에 알림 API가 없다). 개발용 Mock 구현과 나중에 만들 API 구현을 이 인터페이스로 교체한다.
 */
export interface NotificationRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /**
   * 최신순 목록. 읽지 않음 필터는 처리 완료 여부와 무관하게 readAt이 없는 알림만 돌려준다.
   * 필터(filter·resolved·dedupeKeyPrefix)를 먼저 적용한 뒤 cursor로 이어서 조회한다. cursor는 (생성 시각, id)라는 값에 기반하므로,
   * 조회하는 사이 알림이 필터에서 사라지거나(예: 처리 완료로 바뀜) 새 알림이 끼어들어도 다음 페이지가 누락·중복되지 않는다.
   */
  list(query: NotificationListQuery): Promise<NotificationPage>

  /** 읽지 않은(readAt이 없는) 알림 수. 처리 완료 여부와 무관하다. */
  getUnreadCount(): Promise<number>

  /**
   * 알림을 읽음으로 바꾼다. 이미 읽은 알림이면 아무것도 바꾸지 않는다(readAt은 처음 읽은 시각 그대로). resolvedAt은 바꾸지 않는다.
   * 없는 알림이면 'notFound'.
   */
  markRead(id: string): Promise<AppNotification>

  /**
   * 현재 계정의 읽지 않은 알림을 모두(필터·페이지와 무관하게) 읽음으로 바꾼다.
   * - 바꾸는 것은 readAt뿐이다. resolvedAt·내용·순서는 바꾸지 않고, 이미 읽은 알림의 readAt(처음 읽은 시각)은 덮어쓰지 않는다. 삭제하지 않는다.
   * - 새로 읽음이 된 알림은 모두 같은 시각(readAt)을 가진다. 돌려주는 readAt이 그 시각이다.
   * - 전부 반영되거나 하나도 반영되지 않는다(부분 반영 없음). 실패하면 아무것도 바뀌지 않으므로 그대로 다시 호출해도 안전하다.
   * - 읽지 않은 알림이 없으면 아무것도 쓰지 않고 { updated: 0, readAt: null }을 돌려준다(여러 번 호출해도 결과가 같다).
   * - 오류: 'load' | 'save' | 'corrupt' | 'unavailable'.
   * 운영 API에서는 "계정의 읽지 않은 알림 일괄 읽음" 한 번의 요청으로 대응시키면 된다(멱등).
   */
  markAllRead(): Promise<{ updated: number; readAt: string | null }>

  /**
   * 알림을 만든다. 같은 dedupeKey의 알림이 이미 있으면 새로 만들지 않고 기존 알림을 돌려준다(created: false). 읽음 상태는 바꾸지 않는다.
   * 이 단계에서는 어떤 화면도 이 메서드를 호출하지 않는다(월간 몸무게 알림 자동 생성은 다음 단계).
   */
  create(
    draft: NotificationDraft,
  ): Promise<{ notification: AppNotification; created: boolean }>

  /**
   * dedupeKey의 알림을 처리 완료로 표시한다. 읽음 상태는 바꾸지 않는다. 이미 처리 완료면 그대로, 없는 키면 'notFound'.
   * 이 단계에서는 어떤 화면도 이 메서드를 호출하지 않는다(체중 기록 완료 연동은 다음 단계).
   */
  resolve(dedupeKey: string): Promise<AppNotification>
}
