/**
 * 음식 사진 분석(I04) 사진 선택 규칙과 경로. React에 의존하지 않는 순수 모듈이다.
 *
 * - 용량 10MB 이하는 화면명세 v5.0 I04의 "이미지 10MB 이하"이다.
 * - 허용 형식(JPG·PNG·WEBP)은 **명세에 없다**("허용 형식·최대 크기 표시"만 있다). 브라우저가 미리보기를 그릴 수 있는 일반 형식으로
 *   임시로 정했고, 서버가 받는 형식(API 정책 문서 §4의 이미지 업로드 방식)이 확정되면 이 목록만 바꾼다. HEIC는 미리보기가 안 되어 뺐다.
 * - 선택한 파일은 이 기기의 메모리에서 미리보기만 한다. 서버로 보내거나 저장소에 쓰지 않는다.
 */

/** I04 사진 분석 화면(사용자 확인이 필요한 임시 경로 — v5.0은 URL을 정의하지 않는다). */
export const PATH_PHOTO = '/ai/meal/photo'
/** I04-1 사진 음식 분석 · AI 대화. */
export const PATH_PHOTO_ANALYSIS = '/ai/meal/photo/analysis'

/** 최대 용량(바이트). 10MB는 1024×1024바이트 기준이다. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const PHOTO_MAX_LABEL = '10MB'

export type PhotoFormat = 'jpeg' | 'png' | 'webp'

export const PHOTO_FORMATS: readonly {
  format: PhotoFormat
  mime: string
  label: string
}[] = [
  { format: 'jpeg', mime: 'image/jpeg', label: 'JPG' },
  { format: 'png', mime: 'image/png', label: 'PNG' },
  { format: 'webp', mime: 'image/webp', label: 'WEBP' },
]

/** 파일 선택창에 넘기는 accept 값. 사용자의 선택 편의일 뿐이고 검증은 아래 함수가 다시 한다. */
export const PHOTO_ACCEPT = PHOTO_FORMATS.map((item) => item.mime).join(',')
export const PHOTO_FORMAT_LABEL = PHOTO_FORMATS.map((item) => item.label).join(
  ' · ',
)

export type PhotoRejection = 'empty' | 'size' | 'format' | 'unreadable'

export type PhotoValidation =
  { ok: true; format: PhotoFormat } | { ok: false; reason: PhotoRejection }

export const PHOTO_REJECTION_MESSAGE: Record<PhotoRejection, string> = {
  empty: '비어 있는 파일이에요. 다른 사진을 선택해 주세요.',
  size: `사진이 너무 커요. ${PHOTO_MAX_LABEL} 이하의 사진을 선택해 주세요.`,
  format: `${PHOTO_FORMAT_LABEL} 형식의 사진만 올릴 수 있어요.`,
  unreadable: '사진을 읽지 못했어요. 다른 사진을 선택해 주세요.',
}

/** 파일 앞부분(매직 넘버)으로 실제 이미지 형식을 읽는다. 확장자·MIME 표기가 거짓이어도 속지 않는다. */
export function sniffPhotoFormat(head: Uint8Array): PhotoFormat | null {
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  )
    return 'jpeg'
  if (
    head.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => head[index] === byte,
    )
  )
    return 'png'
  // WEBP: "RIFF" + 4바이트 길이 + "WEBP"
  if (
    head.length >= 12 &&
    String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...head.slice(8, 12)) === 'WEBP'
  )
    return 'webp'
  return null
}

/**
 * 선택한 파일을 검사한다. 순서: 비어 있음 → 용량 → 선언된 형식 → 실제 내용(매직 넘버).
 * 선언된 MIME(`file.type`)은 브라우저가 확장자로 추정한 값이라 믿지 않고 실제 내용과 일치하는지 본다(둘이 다르면 형식 오류).
 */
export async function validatePhotoFile(file: File): Promise<PhotoValidation> {
  if (file.size === 0) return { ok: false, reason: 'empty' }
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, reason: 'size' }
  const declared = PHOTO_FORMATS.find((item) => item.mime === file.type)
  if (!declared) return { ok: false, reason: 'format' }
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const actual = sniffPhotoFormat(head)
  if (actual === null || actual !== declared.format)
    return { ok: false, reason: 'format' }
  return { ok: true, format: actual }
}

/** 용량 표시(예: 2.3MB, 340KB). 10MB 제한과 같은 1024 기준이다. */
export function formatPhotoSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}
