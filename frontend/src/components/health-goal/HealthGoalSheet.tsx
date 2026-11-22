import { useId, useRef, useState } from 'react'
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  CUSTOM_STEP,
  FOCUS_LABEL,
  SIMPLE_OPTIONS,
  SIMPLE_RECOMMENDED_RATIO,
  focusOf,
  isAllowedRatio,
  policyForTier,
} from '../../health-goal/goalPolicy.ts'
import type {
  HealthGoalInput,
  HealthManagementGoal,
} from '../../health-goal/goalTypes.ts'
import type { KnowledgeState } from '../../mypage/mypageTypes.ts'
import { summarizeKnowledgeTier } from '../../mypage/overallKnowledge.ts'
import { ASSESSMENT_LEVEL_LABEL } from '../../onboarding-assessment/assessmentLabels.ts'
import {
  errorClass,
  noticeClass,
  primaryButtonClass,
  primaryDisabledClass,
} from '../auth/authStyles.ts'
import BottomSheet from '../layout/BottomSheet.tsx'
import RatioBar from './RatioBar.tsx'

interface HealthGoalSheetProps {
  /** 저장된 목표. 없으면 null(처음 설정) */
  goal: HealthManagementGoal | null
  /** 이해도 상태. 종합 이해도 등급으로 설정 방식(간편 선택/직접 설정)을 정한다. */
  knowledge: KnowledgeState
  /** 저장. 실패하면 예외를 던지고, 그 경우 기존 목표는 그대로이고 선택은 남는다. */
  save: (input: HealthGoalInput) => Promise<unknown>
  /** 시트가 닫힌 뒤(저장 성공·취소·Esc·배경·닫기 버튼) 호출된다. 취소하면 선택한 내용은 버려진다. */
  onClose: () => void
}

/**
 * 건강 목표 설정 바텀시트. 기존 BottomSheet를 재사용하며 라우트를 늘리지 않는다.
 * 설정 과정: 종합 이해도 확인 → 이해도에 맞는 설정 UI → 선택 확인 → 저장 → 마이페이지에 반영(부모가 상태를 갱신).
 */
export default function HealthGoalSheet({
  goal,
  knowledge,
  save,
  onClose,
}: HealthGoalSheetProps) {
  return (
    <BottomSheet
      title={goal ? '건강 목표 변경' : '건강 목표 설정'}
      onClose={onClose}
    >
      {(close, closing) => (
        <GoalForm
          goal={goal}
          knowledge={knowledge}
          save={save}
          close={close}
          closing={closing}
        />
      )}
    </BottomSheet>
  )
}

const optionBase =
  'flex min-h-14 w-full cursor-pointer flex-col gap-2 rounded-card border p-3 text-left transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand motion-reduce:transition-none'

function GoalForm({
  goal,
  knowledge,
  save,
  close,
  closing,
}: Omit<HealthGoalSheetProps, 'onClose'> & {
  close: () => void
  closing: boolean
}) {
  const groupId = useId()
  const submitting = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const waiting = knowledge.status === 'loading'
  // 종합 이해도 등급. 값이 없으면(확인 전·조회 실패·연결 전) null이고, 임의의 등급으로 취급하거나 저장하지 않는다.
  const tier =
    knowledge.status === 'ready'
      ? summarizeKnowledgeTier(
          knowledge.levels.exercise?.tier ?? null,
          knowledge.levels.meal?.tier ?? null,
        )
      : null
  const policy = policyForTier(tier)

  // 처음 선택값: 저장된 목표가 현재 설정 방식에서 허용되면 그 값, 아니면 간편 선택은 추천(균형 관리), 직접 설정은 50이다.
  // 저장된 목표가 있는데 간편 선택에 없는 비율(이해도가 바뀐 경우)이면 아무것도 고르지 않아 기존 값을 임의로 덮어쓰지 않는다.
  const storedAllowed = goal && isAllowedRatio(goal.exerciseRatio, policy)
  const storedOutOfPolicy = goal !== null && !storedAllowed
  const [selected, setSelected] = useState<number | null>(() => {
    if (storedAllowed && goal) return goal.exerciseRatio
    if (storedOutOfPolicy) return null
    return SIMPLE_RECOMMENDED_RATIO
  })
  // 직접 설정(슬라이더)은 처음 보이는 값이 정해져 있어야 하므로 별도 기본값을 둔다.
  const sliderValue = selected ?? SIMPLE_RECOMMENDED_RATIO

  async function handleSave() {
    if (submitting.current || closing || selected === null) return
    submitting.current = true
    setSaving(true)
    setSaveFailed(false)
    try {
      await save({ exerciseRatio: selected, policy })
      close()
    } catch {
      // 실패하면 기존 목표는 그대로이고 선택은 남겨 다시 시도할 수 있게 한다.
      setSaveFailed(true)
      setSaving(false)
      submitting.current = false
    }
  }

  return (
    <div aria-busy={saving}>
      {waiting ? (
        <p
          role="status"
          className="py-6 text-body leading-relaxed font-normal text-muted"
        >
          이해도를 확인하는 중이에요.
        </p>
      ) : (
        <>
          <p className="text-body leading-relaxed font-normal text-muted">
            운동과 식단을 모두 관리하되, 더 신경 쓰고 싶은 쪽의 비중을 조금
            높여요.
          </p>

          <p className="mt-3 text-support leading-snug font-normal text-muted">
            운동·식단 이해도{' '}
            <strong className="font-semibold text-content">
              {tier ? ASSESSMENT_LEVEL_LABEL[tier] : '확인 전'}
            </strong>
          </p>
          {tier === null ? (
            <p className={noticeClass}>
              아직 이해도를 확인하지 않아서 간편하게 고를 수 있게 준비했어요.
            </p>
          ) : null}
          {storedOutOfPolicy && goal ? (
            <p className={noticeClass}>
              지금 목표(운동 {goal.exerciseRatio}% · 식단 {goal.mealRatio}%)는
              이 선택 방식에 없는 비율이에요. 새로 선택하면 목표가 바뀌고,
              선택하기 전까지는 지금 목표가 그대로예요.
            </p>
          ) : null}

          {policy === 'simple' ? (
            <fieldset className="mt-4">
              <legend className="sr-only">관리 방향 선택</legend>
              <div className="flex flex-col gap-2.5">
                {SIMPLE_OPTIONS.map((option) => {
                  const checked = selected === option.exerciseRatio
                  return (
                    <label
                      key={option.focus}
                      className={`${optionBase} ${
                        checked
                          ? 'border-brand bg-brand-soft'
                          : 'border-line bg-surface hover:border-muted'
                      }`}
                    >
                      <input
                        type="radio"
                        name={groupId}
                        value={option.exerciseRatio}
                        checked={checked}
                        disabled={saving}
                        data-autofocus={checked ? '' : undefined}
                        onChange={() => {
                          setSelected(option.exerciseRatio)
                          setSaveFailed(false)
                        }}
                        className="sr-only"
                      />
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-section-title leading-snug font-semibold text-content">
                          {FOCUS_LABEL[option.focus]}
                          {option.exerciseRatio === SIMPLE_RECOMMENDED_RATIO ? (
                            <span className="ml-2 rounded-control bg-brand px-1.5 py-0.5 align-middle text-support font-semibold text-surface">
                              추천
                            </span>
                          ) : null}
                        </span>
                        <span className="text-body leading-snug font-normal text-muted tabular-nums">
                          운동 {option.exerciseRatio}% · 식단{' '}
                          {100 - option.exerciseRatio}%
                        </span>
                      </span>
                      <RatioBar exerciseRatio={option.exerciseRatio} />
                      <span className="text-support leading-snug font-normal text-muted">
                        {option.description}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : (
            <div className="mt-4 rounded-card border border-line p-4">
              <p className="text-section-title leading-snug font-semibold text-content">
                {FOCUS_LABEL[focusOf(sliderValue)]}
              </p>
              <p
                aria-live="polite"
                className="mt-1 text-metric leading-none font-semibold text-content tabular-nums"
              >
                운동 {sliderValue}%{' '}
                <span className="text-section-title font-normal text-muted">
                  · 식단 {100 - sliderValue}%
                </span>
              </p>
              <div className="mt-3">
                <RatioBar exerciseRatio={sliderValue} thick />
              </div>
              <label htmlFor={`${groupId}-ratio`} className="sr-only">
                운동 비율
              </label>
              <input
                id={`${groupId}-ratio`}
                type="range"
                min={CUSTOM_MIN}
                max={CUSTOM_MAX}
                step={CUSTOM_STEP}
                value={sliderValue}
                disabled={saving}
                data-autofocus=""
                aria-valuetext={`운동 ${sliderValue}%, 식단 ${100 - sliderValue}%`}
                onChange={(e) => {
                  setSelected(Number(e.target.value))
                  setSaveFailed(false)
                }}
                className="mt-2 h-11 w-full cursor-pointer accent-brand"
              />
              <div className="flex justify-between text-support leading-snug font-normal text-muted tabular-nums">
                <span>운동 {CUSTOM_MIN}%</span>
                <span>운동 {CUSTOM_MAX}%</span>
              </div>
              <p className="mt-2 text-support leading-relaxed font-normal text-muted">
                10% 단위로 조절할 수 있고, 운동과 식단의 합은 항상 100%예요.
              </p>
            </div>
          )}

          <p className="mt-4 text-support leading-relaxed font-normal text-muted">
            이 비율은 관리 콘텐츠와 추천의 우선순위를 정하는 데 쓰여요. 운동
            강도나 식사량을 정하는 값은 아니에요.
          </p>

          {saveFailed ? (
            <p role="alert" className={errorClass}>
              저장하지 못했어요. {goal ? '지금 목표는 그대로예요. ' : ''}
              선택은 그대로 있으니 다시 시도해 주세요.
            </p>
          ) : null}
        </>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={waiting || saving || closing || selected === null}
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {saving ? '저장하는 중…' : '저장하기'}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={saving || closing}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control text-body font-normal text-muted transition-colors hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed motion-reduce:transition-none"
        >
          취소
        </button>
      </div>
    </div>
  )
}
