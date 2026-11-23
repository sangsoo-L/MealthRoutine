import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import PhotoUploadView from '../components/ai/photo/PhotoUploadView.tsx'
import { useAiAccessInfo } from '../membership/useAiAccess.ts'
import { parseDevAnalysisPreviewIfDev } from '../photo-analysis/devAnalysisParam.ts'
import { usePhotoAnalysisFlow } from '../photo-analysis/photoAnalysisFlowContext.ts'
import { PATH_PHOTO_ANALYSIS } from '../photo-analysis/photoAnalysisPolicy.ts'

/**
 * I04 사진 음식 분석과 확인(`/ai/meal/photo`, 회원 전용). 식단 사진을 고르고 미리 본 뒤 분석을 시작해 I04-1로 이동한다.
 * 사진은 메모리에만 두고(PhotoAnalysisFlowProvider) 서버로 보내지 않는다. 분석 서버가 연결되지 않으면 분석을 시작할 수 없다.
 * 접근 상태는 멤버십 상품 유형이 아니라 서버가 확인한 통합 AI 사용량으로 구분한다(useAiAccessInfo). 서버 연결 전(unknown)에는 권한을 부여하지 않고,
 * 잔여가 0이면 분석 시작을 제한한다. 사용량은 이 앱이 계산·차감·저장하지 않는다.
 * 개발 서버에서만 주소의 `?devAnalysis=`로 검증 상태를 열 수 있다(분석 결과는 사진과 무관한 예시).
 */
export default function AiPhotoPage() {
  usePageTitle('사진 음식 분석')
  const { search } = useLocation()
  const navigate = useNavigate()
  const flow = usePhotoAnalysisFlow()
  const { enter } = flow
  const devPreview = parseDevAnalysisPreviewIfDev(search)

  // 사진 분석 화면이 보이는 동안 사진을 유지하고, 두 화면을 모두 떠나면 버린다.
  useEffect(() => enter('upload'), [enter])

  const { access, remaining } = useAiAccessInfo()

  return (
    <PhotoUploadView
      access={access}
      remaining={remaining}
      photo={flow.photo}
      rejection={flow.rejection}
      connected={flow.connected}
      devPreviewOn={devPreview !== null}
      onSelect={(file) => void flow.select(file)}
      onClear={flow.clear}
      onStart={() => {
        flow.start(devPreview)
        // 개발 서버의 검증 상태(?devAnalysis=)는 분석 화면의 다시 시도에도 이어 간다. 운영 빌드에서는 빈 문자열이다.
        void navigate({
          pathname: PATH_PHOTO_ANALYSIS,
          search: import.meta.env.DEV && devPreview !== null ? search : '',
        })
      }}
    />
  )
}
