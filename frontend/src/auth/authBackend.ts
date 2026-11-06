import type { AuthBackend } from './authTypes.ts'
import { unavailableBackend } from './unavailableBackend.ts'

/**
 * 현재 앱이 사용하는 인증 처리. 개발 서버에서만 개발용 계정 처리(dev/devBackend)를 불러온다.
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 개발 데이터 청크가 제거된다.
 *
 * 실제 인증 API가 정해지면 AuthBackend를 구현한 객체로 아래 할당을 교체한다.
 */
const devModule = import.meta.env.DEV
  ? await import('./dev/devBackend.ts')
  : null

export const authBackend: AuthBackend = devModule
  ? devModule.devBackend
  : unavailableBackend
