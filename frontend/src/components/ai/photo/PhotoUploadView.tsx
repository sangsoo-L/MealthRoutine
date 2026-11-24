import { useId, useRef, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import {
  AI_EXHAUSTED_TEXT,
  AI_USAGE_NOTE,
  type AiAccess,
} from '../../../membership/aiAccess.ts'
import { PATH_MEMBERSHIP } from '../../../membership/membership.ts'
import { PATH_MEAL_RECORD } from '../../../food/foodPaths.ts'
import type { PickedPhoto } from '../../../photo-analysis/photoAnalysisFlowContext.ts'
import {
  PHOTO_ACCEPT,
  PHOTO_FORMAT_LABEL,
  PHOTO_MAX_LABEL,
  PHOTO_REJECTION_MESSAGE,
  formatPhotoSize,
  type PhotoRejection,
} from '../../../photo-analysis/photoAnalysisPolicy.ts'
import {
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from '../../food/foodStyles.ts'
import { errorClass, noticeClass } from '../../auth/authStyles.ts'
import Icon from '../../icons/Icon.tsx'

const TIPS = [
  '음식 전체가 보이게 찍어 주세요',
  '밝은 곳에서 선명하게 찍어 주세요',
  '한 장에 한 끼만 담아 주세요',
] as const

export interface PhotoUploadViewProps {
  /**
   * 서버가 확인한 통합 AI 사용량에 따른 이용 상태. exhausted이면 신규 AI 요청의 입력 영역(사진 등록·분석 시작)을 보이지 않고
   * 멤버십 안내와 직접 입력만 둔다(명세 I04 error). unknown(서버 미연결 등)은 권한을 부여하지 않으며 사진 고르기·미리보기(AI 요청이 아닌 동작)만 열려 있다.
   */
  access: AiAccess
  /** 서버가 확인한 잔여 횟수(표시용). 확인 전·연결 전에는 null이며 숫자를 만들지 않는다. */
  remaining?: number | null
  photo: PickedPhoto | null
  rejection: PhotoRejection | null
  /** 분석 서버 연결 여부. false이면 사진은 골라 볼 수 있지만 분석은 시작할 수 없다. */
  connected: boolean
  /** 개발 서버의 검증 상태(`?devAnalysis=`)가 있어 연결 없이도 시작할 수 있는지. 운영 빌드에서는 항상 false다. */
  devPreviewOn: boolean
  onSelect: (file: File) => void
  onClear: () => void
  onStart: () => void
}

/**
 * I04 사진 음식 분석과 확인. 식단 사진을 고르고 미리 본 뒤 분석을 시작하는 화면이다.
 * 분석 시작 전에 사진을 미리 보고, 사용자가 분석을 시작하면 연결된 AI 서버에 전송한다. 분석이 성공한 것처럼 보이는 표현은 쓰지 않는다.
 *
 * - 파일 선택은 버튼이 숨은 파일 입력을 열어 준다(키보드로 누를 수 있다). 형식·용량 검사는 `validatePhotoFile`이 하고, 거부 이유는 role="alert"로 알린다.
 * - 이미지는 비율을 유지한 채(object-contain) 잘리지 않게 보인다. 파일명은 길면 줄바꿈한다.
 * - "분석 시작"은 aria-disabled로 막아 포커스는 받되 누르면 아무 일도 없다. 막힌 이유는 버튼 바로 위 글로 알린다.
 */
export default function PhotoUploadView({
  access,
  remaining = null,
  photo,
  rejection,
  connected,
  devPreviewOn,
  onSelect,
  onClear,
  onStart,
}: PhotoUploadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const base = useId()
  const reasonId = `${base}-reason`
  const errorId = `${base}-error`
  const canAnalyze = connected || devPreviewOn
  const exhausted = access === 'exhausted'
  const canStart = photo !== null && canAnalyze && !exhausted

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // 같은 사진을 다시 골라도 변경 이벤트가 나도록 값을 비운다(파일 자체는 이미 읽었다).
    event.target.value = ''
    if (file) onSelect(file)
  }

  const reason = !photo
    ? '사진을 올리면 분석을 시작할 수 있어요.'
    : exhausted
      ? 'AI 사용 횟수를 모두 사용해 분석을 시작할 수 없어요.'
      : !canAnalyze
        ? '분석 서버가 아직 연결되지 않아 시작할 수 없어요.'
        : null

  return (
    <div
      data-photo-upload=""
      className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere"
    >
      <header className="min-w-0">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-semibold text-meal">
          <Icon name="sparkle" size={18} />
          AI 사진 분석
        </p>
        <h1 className="mt-3 text-app-title leading-snug font-semibold text-balance text-content">
          사진으로 식단을 기록해요
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          음식 사진을 올리면 수정할 수 있는 식단 입력 초안으로 정리해 드려요.
        </p>
      </header>

      {import.meta.env.DEV && devPreviewOn ? (
        <p role="note" data-photo-dev="" className={`${noticeClass} mt-0`}>
          개발용 검증 상태예요. 분석 결과는 선택한 사진과 무관한 예시예요.
        </p>
      ) : null}

      {!connected && !devPreviewOn ? (
        <div
          role="status"
          data-photo-status="unavailable"
          className={`${noticeClass} mt-0`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <strong className="font-semibold">
              분석 서버가 아직 연결되지 않았어요
            </strong>
            <p>
              사진을 미리 골라 볼 수 있지만, 연결되기 전에는 분석을 시작할 수
              없어요.
            </p>
          </div>
        </div>
      ) : null}

      {exhausted ? (
        <section
          role="status"
          data-photo-access="exhausted"
          className={mealCard}
        >
          <h2 className={mealSectionTitle}>{AI_EXHAUSTED_TEXT.title}</h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {AI_EXHAUSTED_TEXT.body}
          </p>
          <Link
            to={PATH_MEMBERSHIP}
            state={{ from: '/ai/meal/photo' }}
            className={`mt-3 ${mealSecondaryButton}`}
          >
            {AI_EXHAUSTED_TEXT.link}
          </Link>
        </section>
      ) : null}

      {exhausted ? (
        <Link
          to={PATH_MEAL_RECORD}
          state={{ from: '/ai/meal/photo' }}
          data-photo-manual=""
          className={mealPrimaryButton}
        >
          직접 입력하기
        </Link>
      ) : (
        <>
          <section
            aria-labelledby={`${base}-title`}
            data-photo-card=""
            className={mealCard}
          >
            <h2 id={`${base}-title`} className={mealSectionTitle}>
              식단 사진 등록
            </h2>

            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={onChange}
              hidden
              tabIndex={-1}
              data-photo-input=""
            />

            {photo ? (
              <div className="mt-3" data-photo-selected="">
                <div className="flex max-h-72 items-center justify-center overflow-hidden rounded-control border border-line bg-page">
                  <img
                    src={photo.url}
                    alt="선택한 음식 사진 미리보기"
                    className="max-h-72 w-full object-contain"
                  />
                </div>
                <p
                  role="status"
                  className="mt-3 text-body font-semibold text-content"
                >
                  사진이 첨부되었어요
                </p>
                <p className="mt-1 text-support leading-relaxed font-normal break-all text-muted">
                  {photo.name} · {formatPhotoSize(photo.size)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className={`min-w-0 flex-1 basis-32 ${mealSecondaryButton}`}
                  >
                    다른 사진 선택
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    className={`min-w-0 flex-1 basis-32 ${mealSecondaryButton}`}
                  >
                    선택 해제
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-describedby={rejection ? errorId : undefined}
                className={`mt-3 flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-meal/60 bg-meal-soft px-4 py-5 text-center transition-colors hover:border-meal motion-reduce:transition-none ${mealFocusRing}`}
              >
                <Icon name="camera" size={30} className="text-meal" />
                <span className="text-body font-semibold text-content">
                  음식 사진 올리기
                </span>
                <span className="text-support leading-relaxed font-normal text-muted">
                  앨범에서 고르거나 바로 촬영해요
                </span>
                <span className="text-support leading-relaxed font-normal text-muted">
                  {PHOTO_FORMAT_LABEL} · {PHOTO_MAX_LABEL} 이하
                </span>
              </button>
            )}

            <div aria-live="polite">
              {rejection ? (
                <p id={errorId} role="alert" className={errorClass}>
                  {PHOTO_REJECTION_MESSAGE[rejection]}
                </p>
              ) : null}
            </div>

            <h3 className="mt-4 text-body leading-snug font-semibold text-content">
              이렇게 찍으면 더 정확해요
            </h3>
            <ul
              role="list"
              className="mt-2 flex flex-col gap-1.5 text-support leading-relaxed font-normal text-muted"
            >
              {TIPS.map((tip) => (
                <li key={tip} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-meal"
                  />
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby={`${base}-use`}
            className="rounded-card bg-page p-4"
          >
            <h2
              id={`${base}-use`}
              className="text-body leading-snug font-semibold text-content"
            >
              사진 사용 안내
            </h2>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              올린 사진은 음식 분석에만 사용해요. 분석 시작을 누르면 AI 서버로 전송되며,
          분석 요청 전에는 이 기기에서만 미리봅니다.
            </p>
          </section>

          <div className="flex flex-col gap-3" data-photo-actions="">
            {access === 'available' && remaining !== null ? (
              <p
                data-photo-remaining={remaining}
                className="text-body leading-snug font-semibold text-content"
              >
                AI 사용 남은 횟수 {remaining}회
                <span className="block text-support font-normal text-muted">
                  운동·식단 AI 공통 사용 횟수예요.
                </span>
              </p>
            ) : null}
            {access === 'unknown' ? (
              <p
                data-photo-usage-note=""
                className="text-support leading-relaxed font-normal text-muted"
              >
                {AI_USAGE_NOTE}
              </p>
            ) : null}
            {reason ? (
              <p
                id={reasonId}
                data-photo-reason=""
                className="text-support leading-relaxed font-normal text-muted"
              >
                {reason}
              </p>
            ) : null}
            <button
              type="button"
              aria-disabled={!canStart}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => {
                if (canStart) onStart()
              }}
              data-photo-start=""
              className={mealPrimaryButton}
            >
              분석 시작
            </button>
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: '/ai/meal/photo' }}
              className={mealSecondaryButton}
            >
              분석 없이 직접 입력하기
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
