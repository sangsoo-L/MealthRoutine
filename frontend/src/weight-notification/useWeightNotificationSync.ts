import { useEffect } from 'react'
import { createNotificationRepository } from '../notifications/notificationSource.ts'
import { createWeightLogRepository } from '../weight-log/weightLogSource.ts'
import { createWeightNotificationService } from './weightNotificationService.ts'

/**
 * 알림 센터에 들어왔을 때 월간 몸무게 확인 알림을 맞춘다(홈·마이페이지를 거치지 않고 바로 열어도 확인일이 된 알림이 보이도록).
 * 몸무게 확인 상태를 한 번 읽어 서비스에 넘기며, 알림이 바뀌면 서비스가 변경 신호를 보내 목록과 벨이 스스로 다시 조회한다.
 * 저장소가 없거나(운영 빌드) 조회·생성이 실패해도 알림 센터의 주요 기능은 막지 않는다(오류를 무시하고 다음 진입에서 다시 맞춘다).
 */
export function useWeightNotificationSync(userId: string): void {
  useEffect(() => {
    let cancelled = false
    const weight = createWeightLogRepository(userId)
    const notifications = createNotificationRepository(userId)
    if (!weight || !notifications) return
    weight
      .getCheckStatus()
      .then((status) =>
        cancelled
          ? undefined
          : createWeightNotificationService(notifications).sync(status),
      )
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])
}
