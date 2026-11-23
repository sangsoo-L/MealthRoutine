import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import PhotoAnalysisView from '../components/ai/photo/PhotoAnalysisView.tsx'
import { parseDevAnalysisPreviewIfDev } from '../photo-analysis/devAnalysisParam.ts'
import { useAiAccess } from '../membership/useAiAccess.ts'
import { usePhotoAnalysisFlow } from '../photo-analysis/photoAnalysisFlowContext.ts'
import { PATH_PHOTO } from '../photo-analysis/photoAnalysisPolicy.ts'

/**
 * I04-1 사진 음식 분석 · AI 대화(`/ai/meal/photo/analysis`, 회원 전용). I04에서 "분석 시작"을 누르면 들어와 분석 상태를 대화로 보여 준다.
 * 선택한 사진이 없으면(새로고침·주소 직접 입력) I04로 돌려보낸다(사진은 메모리에만 있다). 이 화면을 떠나면 진행 중인 분석은 취소된다.
 * 실제 분석 결과는 서버가 준 것만 보이며, 연결 전에는 "연결 전"을 보인다. 통합 AI 사용량이 소진(서버 확인)이면 새 요청은 숨기고 받은 결과만 보인다.
 */
function AnalysisBody() {
  usePageTitle('사진 음식 분석')
  const flow = usePhotoAnalysisFlow()
  const access = useAiAccess()
  const { enter } = flow
  const { search } = useLocation()
  // 날짜 구분은 화면을 연 시점의 기기 날짜다.
  const [today] = useState(() => new Date())

  useEffect(() => enter('analysis'), [enter])

  if (!flow.photo) return <Navigate to={PATH_PHOTO} replace />

  return (
    <PhotoAnalysisView
      photo={flow.photo}
      analysis={flow.analysis}
      access={access}
      today={today}
      onCancel={flow.cancel}
      onRetry={() => {
        // 서버가 확인한 잔여가 0이면 새 AI 요청을 시작하지 않는다(화면도 다시 시도를 숨긴다).
        if (access !== 'exhausted')
          flow.start(parseDevAnalysisPreviewIfDev(search))
      }}
    />
  )
}

export default function AiPhotoAnalysisPage() {
  return <AnalysisBody />
}
