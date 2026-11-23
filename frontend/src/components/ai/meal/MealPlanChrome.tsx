import { useEffect, useRef, type ReactNode } from 'react'
import {
  STEP_LABEL,
  STEP_ORDER,
  type PlanStep,
} from '../../../ai/meal/mealPlanFlow.ts'
import { usePageTitle } from '../../../ai/meal/usePageTitle.ts'
import type { DevGoalPreview } from '../../../ai/meal/devGoalPreview.ts'
import Icon from '../../icons/Icon.tsx'
import { planChip } from './mealPlanStyles.ts'

/**
 * 4개 단계 화면의 공통 머리말: AI 식단 플랜 표시, 단계 진행(몇 단계 중 몇 단계), 제목(h1)과 설명.
 * - 단계 진행은 글자("2 / 4 · 끼니 선택")와 보조기기용 목록(aria-current="step")으로 전하며 색만으로 구분하지 않는다.
 * - 제목은 이 화면이 보이는 동안 문서 제목이 되고, 앞 단계에서 이동해 온 화면(focusTitle)은 제목으로 포커스를 옮긴다.
 *   제목에는 tabIndex -1만 두어 탭 순서에 끼지 않는다.
 */
export default function StepHeader({
  step,
  title,
  description,
  focusTitle = false,
  documentTitle,
}: {
  step: PlanStep
  title: ReactNode
  description?: string
  /** true이면 처음 그릴 때 제목으로 포커스를 옮긴다(앞 단계에서 이동해 온 화면). */
  focusTitle?: boolean
  /** 문서 제목. 생략하면 단계 이름이다. */
  documentTitle?: string
}) {
  const index = STEP_ORDER.indexOf(step)
  const headingRef = useRef<HTMLHeadingElement>(null)
  usePageTitle(documentTitle ?? `AI 식단 플랜 · ${STEP_LABEL[step]}`)
  useEffect(() => {
    if (focusTitle) headingRef.current?.focus({ preventScroll: true })
  }, [focusTitle])

  return (
    <header className="min-w-0">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-semibold text-meal">
        <Icon name="sparkle" size={18} />
        AI 식단 플랜
      </p>
      <p
        data-plan-step={step}
        className="mt-3 text-support leading-snug font-semibold text-muted tabular-nums"
      >
        {index + 1} / {STEP_ORDER.length} · {STEP_LABEL[step]}
      </p>
      <ol
        role="list"
        aria-label="추천 단계"
        className="mt-1.5 grid grid-cols-4 gap-1.5"
      >
        {STEP_ORDER.map((item, itemIndex) => (
          <li
            key={item}
            aria-current={itemIndex === index ? 'step' : undefined}
          >
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full ${itemIndex <= index ? 'bg-meal' : 'bg-line'}`}
            />
            <span className="sr-only">
              {itemIndex + 1}단계 {STEP_LABEL[item]}
              {itemIndex < index
                ? ' 완료'
                : itemIndex === index
                  ? ' 진행 중'
                  : ''}
            </span>
          </li>
        ))}
      </ol>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-app-title leading-snug font-semibold text-balance text-content focus:outline-none"
      >
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          {description}
        </p>
      ) : null}
    </header>
  )
}

/** 화면이 알려야 하는 짧은 안내(충돌·초기화). 읽어 주되 포커스를 빼앗지 않는다. */
export function FlowNotice({
  notice,
  onDismiss,
}: {
  notice: string | null
  onDismiss: () => void
}) {
  // 읽어 주는 영역(role="status")은 안내가 없을 때도 DOM에 두고 내용만 넣고 뺀다(비어 있다가 채워질 때 보조기기가 알려 준다).
  return (
    <div role="status" className="empty:hidden">
      {notice === null ? null : (
        <div
          data-plan-notice=""
          className="flex items-start justify-between gap-2 rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          <p className="min-w-0">{notice}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center px-2 text-support font-semibold text-warning underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  )
}

const PREVIEW_LABEL: Record<DevGoalPreview, string> = {
  loading: '목표 조회 중',
  error: '목표 조회 실패',
  unavailable: '저장 수단 없음',
  missing: '목표 없음',
  ready: '목표 있음',
}

/** [개발 전용] 개발용 검증 상태 안내. 실제 식단 목표나 추천이 아니라는 점과 저장·API·체험 횟수와 무관하다는 점을 알린다. */
export function DevPreviewBanner({ preview }: { preview: DevGoalPreview }) {
  return (
    <p
      role="note"
      data-dev-goal-preview={preview}
      className="rounded-control border border-dashed border-warning bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
    >
      <span className={`${planChip} mr-1.5 border-warning text-warning`}>
        개발용 검증 상태
      </span>
      {PREVIEW_LABEL[preview]}. 화면 확인용 가짜 상태예요. 실제 식단 목표가
      아니고 저장·추천·체험 횟수와 관계가 없어요.
    </p>
  )
}
