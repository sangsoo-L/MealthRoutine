import {
  parseDevAnalysisPreview,
  type DevAnalysisPreview,
} from './devPhotoAnalysis.ts'

/**
 * 개발 서버에서만 주소의 `?devAnalysis=`를 읽는다. 운영 빌드에서는 `import.meta.env.DEV`가 상수 false가 되어 항상 null이고,
 * 이 분기와 devPhotoAnalysis.ts의 코드·문구는 번들에서 제거된다.
 */
export function parseDevAnalysisPreviewIfDev(
  search: string,
): DevAnalysisPreview | null {
  return import.meta.env.DEV ? parseDevAnalysisPreview(search) : null
}
