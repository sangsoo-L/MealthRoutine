import {
  PhotoAnalysisQuotaError,
  type PhotoAnalysisResult,
  type PhotoAnalysisSource,
} from './photoAnalysisContract.ts'

/**
 * [개발 전용] 음식 사진 분석 화면 검증용 상태.
 *
 * 사진 분석 API가 없어서 분석 중·결과·결과 없음·실패 화면을 실제로 만들 수 없다. 그 우회로 서버 결과를 만들지 않고,
 * 개발 서버에서만 I04 주소의 `?devAnalysis=<상태>`로 분석 요청의 결과를 메모리 값으로 바꿔 레이아웃과 분기를 확인한다.
 * - 개발 서버에서만 호출된다. 호출 쪽(`PhotoAnalysisFlowProvider`)이 `import.meta.env.DEV`로 막아 운영 빌드에서는 이 파일이 번들에 들어가지 않는다.
 * - 선택한 사진을 읽거나 분석하지 않는다. `result`·`partial`의 음식·열량은 v5.0 스토리보드 I04-1의 고정 시안 값(현미밥·된장국·고등어구이)이며
 *   **사진 속 음식이 아니다.** 화면은 이 결과에 "개발용 예시" 표지를 항상 붙인다(`example`).
 * - 아무것도 저장하지 않고 서버로 보내지도 않는다. 식단 기록으로 등록하지도 않는다.
 */
export type DevAnalysisPreview =
  'result' | 'partial' | 'empty' | 'error' | 'exhausted' | 'slow'

export const DEV_ANALYSIS_PARAM = 'devAnalysis'
const PREVIEWS: readonly DevAnalysisPreview[] = [
  'result',
  'partial',
  'empty',
  'error',
  'exhausted',
  'slow',
]

/** 주소의 검색 문자열에서 검증 상태를 읽는다. 알 수 없는 값은 null이다. */
export function parseDevAnalysisPreview(
  search: string,
): DevAnalysisPreview | null {
  const value = new URLSearchParams(search).get(DEV_ANALYSIS_PARAM)
  return PREVIEWS.find((preview) => preview === value) ?? null
}

const FULL: PhotoAnalysisResult = {
  foods: [
    { name: '현미밥', amountText: '1공기', kcal: 310 },
    { name: '된장국', amountText: '1그릇', kcal: 140 },
    { name: '고등어구이', amountText: '1토막', kcal: 310 },
  ],
  totalKcal: 760,
  summary: '한 끼 구성의 예시 결과예요.',
  partial: false,
  example: true,
}

const PARTIAL: PhotoAnalysisResult = {
  foods: [
    { name: '현미밥', amountText: '1공기', kcal: 310 },
    { name: '된장국', amountText: null, kcal: null },
  ],
  totalKcal: null,
  summary: null,
  partial: true,
  example: true,
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('취소됐어요', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

/** 검증 상태에 맞는 분석 연결(개발 전용). */
export function devAnalysisSource(
  preview: DevAnalysisPreview,
): PhotoAnalysisSource {
  return {
    async analyze(_photo, signal) {
      await wait(preview === 'slow' ? 30_000 : 1_200, signal)
      if (preview === 'error') throw new Error('검증용 실패')
      if (preview === 'exhausted') throw new PhotoAnalysisQuotaError()
      if (preview === 'empty') return null
      return preview === 'partial' ? PARTIAL : FULL
    },
  }
}
