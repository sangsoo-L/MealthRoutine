import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PATH_MEAL_RECORD } from '../../../food/foodPaths.ts'
import {
  AI_EXHAUSTED_TEXT,
  type AiAccess,
} from '../../../membership/aiAccess.ts'
import { PATH_MEMBERSHIP } from '../../../membership/membership.ts'
import type {
  AnalysisState,
  PhotoAnalysisResult,
} from '../../../photo-analysis/photoAnalysisContract.ts'
import type { PickedPhoto } from '../../../photo-analysis/photoAnalysisFlowContext.ts'
import { PATH_PHOTO } from '../../../photo-analysis/photoAnalysisPolicy.ts'
import { noticeClass } from '../../auth/authStyles.ts'
import {
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'
import Icon from '../../icons/Icon.tsx'

/** 추정값 안내. 알레르기 안전 판정에 쓸 수 없다는 점(명세 I04 data)을 항상 함께 둔다. */
const ESTIMATE_NOTE =
  '추정값이에요. 실제와 다를 수 있고, 알레르기 확인에는 쓸 수 없어요.'

function kcalText(kcal: number | null): string {
  return kcal === null ? '열량 정보 없음' : `약 ${kcal}kcal`
}

function Bubble({ children, label }: { children: ReactNode; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-meal-soft text-meal"
      >
        <Icon name="sparkle" size={18} />
      </span>
      <div className="min-w-0 max-w-full flex-1">
        <p className="sr-only">{label}</p>
        <div className="rounded-card border border-line bg-surface p-4">
          {children}
        </div>
      </div>
    </li>
  )
}

function ResultList({ result }: { result: PhotoAnalysisResult }) {
  return (
    <div data-analysis-result="">
      <p className="text-body leading-relaxed font-normal text-content">
        사진 속 음식을 찾았어요.
      </p>
      <ul role="list" className="mt-3 flex flex-col divide-y divide-line">
        {result.foods.map((food, index) => (
          <li
            // 같은 이름이 반복될 수 있어 순서를 키에 더한다(목록은 바뀌지 않고 한 번에 그려진다).
            key={`${food.name}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
          >
            <span className="min-w-0 flex-1 basis-28">
              <span className="block text-body leading-snug font-semibold text-content">
                {food.name}
              </span>
              <span className="block text-support leading-snug font-normal text-muted">
                {food.amountText ?? '양 정보 없음'}
              </span>
            </span>
            <span className="text-body leading-snug font-normal text-content tabular-nums">
              {kcalText(food.kcal)}
            </span>
          </li>
        ))}
      </ul>
      <p
        data-analysis-total=""
        className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3 text-body font-semibold text-content"
      >
        <span>합계</span>
        <span className="tabular-nums">
          {result.totalKcal === null
            ? '합계를 확인하지 못했어요'
            : `약 ${result.totalKcal}kcal`}
        </span>
      </p>
      {result.summary ? (
        <p className="mt-2 text-body leading-relaxed font-normal text-content">
          {result.summary}
        </p>
      ) : null}
      {result.partial ? (
        <p
          data-analysis-partial=""
          className="mt-2 text-support leading-relaxed font-normal text-content"
        >
          일부 음식은 인식하지 못했어요. 인식한 음식만 보여 드려요.
        </p>
      ) : null}
      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
        {ESTIMATE_NOTE}
      </p>
    </div>
  )
}

export interface PhotoAnalysisViewProps {
  photo: PickedPhoto
  analysis: AnalysisState
  /**
   * 서버가 확인한 통합 AI 사용량 상태. exhausted이면 새 AI 요청(다시 시도·다시 분석·다른 사진 분석)을 숨기고 이미 받은 결과는 그대로 보인다(명세 I04 error).
   * 사용량은 이 화면이 계산하지 않는다.
   */
  access: AiAccess
  /** 날짜 구분에 쓰는 오늘 날짜(기기 시계). */
  today: Date
  onCancel: () => void
  onRetry: () => void
}

/**
 * I04-1 사진 음식 분석 · AI 대화. 첨부한 사진과 분석 진행·결과를 대화(말풍선)로 보여 준다. 상단 제목·하단 상태 바 없이 대화만 있다(제목은 보조기기용 h1).
 *
 * 상태별 말풍선: 분석 중(취소 가능) · 결과(음식·추정 양·열량·합계·추정값 안내) · 결과 없음 · 실패 · 사용 횟수 소진 · 서버 연결 전.
 * 서버가 준 결과만 보인다: 음식·열량을 화면이 만들거나 더하지 않고, 결과가 없으면 영양정보를 채우지 않는다.
 *
 * 명세와 다른 점(승인 확인 필요): 하단 입력창·추천 질문 칩(예시 답변)과 끼니 확인 후 식단 자동 등록은 만들지 않았다.
 * 질문 답변은 AI가 필요하고 등록 저장은 식단 기록 저장 계약(식단 기록 API)이 없어서다. 대신 결과에서 식단 기록(D02) 화면으로 이동해 직접 기록한다.
 */
export default function PhotoAnalysisView({
  photo,
  analysis,
  access,
  today,
  onCancel,
  onRetry,
}: PhotoAnalysisViewProps) {
  const dateLabel = `${today.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })} ${today.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}`
  const exhausted = access === 'exhausted'

  let reply: ReactNode
  let replyLabel = 'AI의 답변'
  switch (analysis.status) {
    case 'analyzing':
      replyLabel = 'AI가 분석하고 있어요'
      reply = (
        <div role="status" aria-busy="true" data-analysis-state="analyzing">
          <p className="text-body leading-relaxed font-normal text-content">
            사진을 받았어요. 분석하는 중이에요…
          </p>
          <span
            aria-hidden="true"
            className="mt-2 flex items-center gap-1.5 text-meal"
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-2 animate-pulse rounded-full bg-meal motion-reduce:animate-none"
                style={{ animationDelay: `${dot * 200}ms` }}
              />
            ))}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className={`mt-3 w-full ${mealSecondaryButton}`}
          >
            분석 취소
          </button>
        </div>
      )
      break
    case 'ready':
      replyLabel = 'AI의 분석 결과'
      reply = (
        // 결과가 나타날 때 한 번만 부드럽게 보인다(모션 줄이기 설정이면 없음). 사용자가 분석을 시작한 뒤의 화면 안 전환이라 공통 화면 전환과 겹치지 않는다.
        <div
          data-analysis-state="ready"
          className="animate-route-fade motion-reduce:animate-none"
        >
          <ResultList result={analysis.result} />
          <p className="mt-3 text-support leading-relaxed font-normal text-muted">
            분석 결과는 자동으로 기록되지 않아요. 확인하고 식단에 직접 기록해
            주세요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: PATH_PHOTO }}
              className={mealPrimaryButton}
            >
              식단 기록하러 가기
            </Link>
            {exhausted ? null : (
              <Link
                to={PATH_PHOTO}
                data-analysis-again=""
                className={mealSecondaryButton}
              >
                다른 사진으로 다시 분석
              </Link>
            )}
          </div>
        </div>
      )
      break
    case 'empty':
      reply = (
        <div data-analysis-state="empty">
          <p className="text-body leading-relaxed font-normal text-content">
            사진에서 음식을 찾지 못했어요.
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            음식 전체가 밝고 선명하게 보이도록 다시 찍어 올리거나, 직접 입력해
            주세요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {exhausted ? null : (
              <Link to={PATH_PHOTO} className={mealPrimaryButton}>
                다른 사진 선택
              </Link>
            )}
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: PATH_PHOTO }}
              className={exhausted ? mealPrimaryButton : mealSecondaryButton}
            >
              직접 입력하기
            </Link>
          </div>
        </div>
      )
      break
    case 'error':
      reply = (
        <div role="alert" data-analysis-state="error">
          <p className="text-body leading-relaxed font-normal text-content">
            분석하지 못했어요.
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {exhausted
              ? 'AI 사용 횟수를 모두 사용해 다시 분석할 수 없어요. 직접 입력해 주세요.'
              : '잠시 후 다시 시도하거나 직접 입력해 주세요. 사진은 그대로 남아 있어요.'}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {exhausted ? null : (
              <button
                type="button"
                data-analysis-retry=""
                onClick={onRetry}
                className={mealPrimaryButton}
              >
                다시 시도
              </button>
            )}
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: PATH_PHOTO }}
              className={exhausted ? mealPrimaryButton : mealSecondaryButton}
            >
              직접 입력하기
            </Link>
          </div>
        </div>
      )
      break
    case 'exhausted':
      replyLabel = 'AI 사용 안내'
      reply = (
        <div role="status" data-analysis-state="exhausted">
          <p className="text-body leading-relaxed font-semibold text-content">
            {AI_EXHAUSTED_TEXT.title}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {AI_EXHAUSTED_TEXT.body}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              to={PATH_MEMBERSHIP}
              state={{ from: PATH_PHOTO }}
              className={mealPrimaryButton}
            >
              {AI_EXHAUSTED_TEXT.link}
            </Link>
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: PATH_PHOTO }}
              className={mealSecondaryButton}
            >
              직접 입력하기
            </Link>
          </div>
        </div>
      )
      break
    case 'unavailable':
      reply = (
        <div role="status" data-analysis-state="unavailable">
          <p className="text-body leading-relaxed font-normal text-content">
            분석 서버가 아직 연결되지 않았어요.
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            사진은 서버로 보내지 않았어요. 연결되면 이 화면에서 분석 결과를 볼
            수 있어요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link
              to={PATH_MEAL_RECORD}
              state={{ from: PATH_PHOTO }}
              className={mealPrimaryButton}
            >
              직접 입력하기
            </Link>
            <Link to={PATH_PHOTO} className={mealSecondaryButton}>
              사진 화면으로 돌아가기
            </Link>
          </div>
        </div>
      )
      break
    default:
      // idle: 사진은 있지만 분석을 시작하지 않았다(취소 뒤 등).
      reply = (
        <div data-analysis-state="idle">
          <p className="text-body leading-relaxed font-normal text-content">
            분석을 시작하지 않았어요.
          </p>
          <Link to={PATH_PHOTO} className={`mt-3 ${mealSecondaryButton}`}>
            사진 화면으로 돌아가기
          </Link>
        </div>
      )
  }

  return (
    <div
      data-photo-analysis=""
      className="flex min-w-0 flex-col gap-4 break-keep wrap-anywhere"
    >
      <h1 className="sr-only">사진 음식 분석 · AI 대화</h1>

      {import.meta.env.DEV &&
      analysis.status === 'ready' &&
      analysis.result.example ? (
        <p role="note" data-photo-dev="" className={`${noticeClass} mt-0`}>
          개발용 예시 결과예요. 선택한 사진을 분석한 결과가 아니에요.
        </p>
      ) : null}

      <p className="self-center rounded-full bg-page px-3 py-1 text-support leading-snug font-normal text-muted">
        {dateLabel}
      </p>

      <ol
        role="log"
        aria-live="polite"
        aria-label="사진 분석 대화"
        className="flex min-w-0 flex-col gap-4"
      >
        <li className="flex justify-end">
          <div className="max-w-[220px] min-w-0">
            <p className="sr-only">내가 보낸 사진</p>
            <div className="overflow-hidden rounded-card border border-meal bg-surface">
              <img
                src={photo.url}
                alt="내가 첨부한 음식 사진"
                className="max-h-56 w-full object-contain"
              />
            </div>
            <p className="mt-1 text-right text-support leading-snug font-normal break-all text-muted">
              {photo.name}
            </p>
          </div>
        </li>
        <Bubble label={replyLabel}>{reply}</Bubble>
      </ol>
    </div>
  )
}
