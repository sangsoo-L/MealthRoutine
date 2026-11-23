import { createContext, useContext } from 'react'
import type { DevAnalysisPreview } from './devPhotoAnalysis.ts'
import type { AnalysisState } from './photoAnalysisContract.ts'
import type { PhotoRejection } from './photoAnalysisPolicy.ts'

/** 선택한 사진의 화면용 정보. url은 이 기기의 메모리에서만 쓰는 미리보기 주소(blob)다. 파일 내용은 여기 두지 않는다. */
export interface PickedPhoto {
  name: string
  size: number
  url: string
}

export interface PhotoAnalysisFlowValue {
  photo: PickedPhoto | null
  /** 마지막 선택이 거부된 이유. 새로 선택하거나 해제하면 사라진다(이전에 고른 정상 사진은 그대로 남는다). */
  rejection: PhotoRejection | null
  analysis: AnalysisState
  /** 서버 연결이 있는지. 없으면 개발 서버의 검증 상태가 없는 한 분석을 시작할 수 없다. */
  connected: boolean
  select: (file: File) => Promise<void>
  clear: () => void
  /** 분석을 시작한다. 사진이 없으면 아무것도 하지 않는다. devPreview는 개발 서버에서만 쓰인다. */
  start: (devPreview: DevAnalysisPreview | null) => void
  /** 진행 중인 분석을 취소하고 처음 상태로 돌린다. 사진은 남는다. */
  cancel: () => void
  /** 분석 상태만 처음으로 되돌린다(재시도 등). 사진은 남는다. */
  resetAnalysis: () => void
  /**
   * 사진 분석 화면(I04·I04-1)이 보이는 동안 호출한다. 반환 함수가 해제다.
   * 두 화면을 모두 떠나면 사진과 분석 상태를 버리고, 분석 화면(I04-1)만 떠나면(I04로 돌아감) 진행 중인 분석을 취소하고 분석 상태만 비운다.
   */
  enter: (screen: 'upload' | 'analysis') => () => void
}

export const PhotoAnalysisFlowContext =
  createContext<PhotoAnalysisFlowValue | null>(null)

export function usePhotoAnalysisFlow(): PhotoAnalysisFlowValue {
  const value = useContext(PhotoAnalysisFlowContext)
  if (!value)
    throw new Error(
      'usePhotoAnalysisFlow는 PhotoAnalysisFlowProvider 안에서만 사용할 수 있습니다.',
    )
  return value
}
