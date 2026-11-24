import type { AuthBackend } from './authTypes.ts'
import { serverBackend } from './serverBackend.ts'

/**
 * 현재 앱이 사용하는 인증 처리. 기본은 실제 백엔드(serverBackend)다(F1-D3).
 * 개발 서버에서 `VITE_DEV_AUTH=true`로 실행했을 때만 개발용 계정 처리(dev/devBackend)를 불러온다.
 * 서버가 없다고 개발용 계정으로 자동 전환하지 않는다.
 * import.meta.env.DEV는 빌드 때 상수(false)로 바뀌어 운영 빌드에서는 이 분기와 개발 데이터 청크가 제거된다.
 */
const devModule =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
    ? await import('./dev/devBackend.ts')
    : null

export const authBackend: AuthBackend = devModule
  ? devModule.devBackend
  : serverBackend
