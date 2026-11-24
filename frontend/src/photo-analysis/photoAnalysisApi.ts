import type { PhotoAnalysisResult, PhotoAnalysisSource } from './photoAnalysisContract.ts'

const AI_BASE = 'http://127.0.0.1:8000/internal/ai'
const LIMIT = 10 * 1024 * 1024

function validNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value : null
}

/** FastAPI의 음식 분석 결과를 현재 사진 분석 화면의 타입으로 변환합니다. */
export function parsePhotoAnalysis(raw: unknown): PhotoAnalysisResult | null {
  if (!raw || typeof raw !== 'object') throw new Error('분석 응답이 올바르지 않습니다.')
  const data = raw as Record<string, unknown>
  if (!Array.isArray(data.foods)) throw new Error('음식 목록이 누락되었습니다.')
  const foods = data.foods.flatMap((rawFood: unknown) => {
    if (!rawFood || typeof rawFood !== 'object') return []
    const food = rawFood as Record<string, unknown>
    if (typeof food.primary !== 'string' || !food.primary.trim()) return []
    const weight = validNumber(food.estimated_weight_g)
    const volume = validNumber(food.estimated_volume_ml)
    const quantity = validNumber(food.estimated_quantity)
    return [{
      name: food.primary.trim(),
      amountText: weight !== null ? `약 ${weight}g` :
        volume !== null ? `약 ${volume}mL` :
          quantity !== null ? `약 ${quantity}인분` : null,
      kcal: validNumber(food.estimated_calories_kcal),
    }]
  })
  if (foods.length === 0) return null
  return {
    foods,
    totalKcal: validNumber(data.estimated_total_calories_kcal),
    summary: null,
    partial: data.calorie_estimate_complete === false ||
      (Array.isArray(data.calorie_estimate_omitted_foods) &&
        data.calorie_estimate_omitted_foods.length > 0),
  }
}

/** 화면은 WebP도 받지만 FastAPI는 JPG/PNG만 받으므로 WebP는 PNG로 변환합니다. */
async function normalizePhoto(file: File, signal: AbortSignal): Promise<File> {
  if (file.type !== 'image/webp') return file
  if (signal.aborted) throw new DOMException('요청이 취소됐습니다.', 'AbortError')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('사진 변환에 실패했습니다.')
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('사진 변환에 실패했습니다.')), 'image/png')
    })
    if (blob.size > LIMIT) throw new Error('PNG로 변환한 사진은 10MB 이하여야 합니다.')
    if (signal.aborted) throw new DOMException('요청이 취소됐습니다.', 'AbortError')
    return new File([blob], file.name.replace(/\.webp$/i, '.png'), { type: 'image/png' })
  } finally {
    bitmap.close()
  }
}

export function createLocalPhotoAnalysisSource(): PhotoAnalysisSource {
  return {
    async analyze(file, signal) {
      const body = new FormData()
      body.append('file', await normalizePhoto(file, signal))
      const response = await fetch(`${AI_BASE}/food-analyses`, { method: 'POST', body, signal })
      if (!response.ok) throw new Error(`사진 분석 요청 실패 (${response.status})`)
      return parsePhotoAnalysis(await response.json() as unknown)
    },
  }
}
