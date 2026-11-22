/**
 * 알림이 만들어지거나 처리 완료로 바뀌었음을 같은 탭의 화면들에 알리는 신호. 알림 내용·계정 정보는 담지 않는다.
 * 홈의 벨 숫자와 알림 목록이 서비스 계층(weight-notification)이 알림을 바꾼 뒤 스스로 다시 조회하게 하려는 용도이며,
 * 받은 쪽은 자기 계정의 저장소에서 다시 읽는다. 다른 탭·다른 기기와는 연결되지 않는다(실시간 알림이 아니다).
 */
const EVENT = 'mealthroutine:notifications-changed'

export function notifyNotificationsChanged(): void {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function'
  )
    return
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeNotificationsChanged(
  listener: () => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.addEventListener !== 'function'
  )
    return () => {}
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
