import { useId, useState, type Ref } from 'react'
import type { ExerciseTool } from '../../../exercise/exerciseTaxonomy.ts'
import {
  STEP_TEXT,
  TOOL_UNAVAILABLE_TEXT,
  ctaLabel,
  describeToolChoices,
  invalidMessage,
  progressLabel,
  progressSpeech,
  stepIsValid,
  toolControlIds,
  totalSteps,
  type ConditionStep,
  type ToolChoiceState,
} from '../../../exercise/planConditionSteps.ts'
import {
  MINUTES_RANGE_TEXT,
  PLAN_TEXT,
  PURPOSE_CHOICES,
  type PlanInputs,
} from '../../../exercise/recommend/planFlow.ts'
import {
  PLAN_MINUTES_PRESETS,
  isValidPlanMinutes,
} from '../../../exercise/recommend/rules.ts'
import type {
  PlanMode,
  PlanPurpose,
} from '../../../exercise/recommend/types.ts'
import Icon from '../../icons/Icon.tsx'
import {
  composeCard,
  composeFocusRing,
  composeInput,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'

/** 선택 카드 한 장(목표·도구). 터치 영역은 44px 이상이고, 선택 상태는 색뿐 아니라 굵은 테두리와 ✓ 표시로도 드러난다. */
const choiceBase =
  'flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-control border-2 px-4 py-3 text-left text-body focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-exercise'

function choiceTone(checked: boolean): string {
  return checked ? 'border-exercise bg-exercise-soft' : 'border-line bg-surface'
}

/** 구성 방법 선택(전체 자동 추천 / 직접 운동 선택). 내부 코드명은 보이지 않는다. */
export function PlanModeChoice({
  onChoose,
}: {
  onChoose: (mode: PlanMode) => void
}) {
  const cards: readonly { mode: PlanMode; title: string; body: string }[] = [
    {
      mode: 'automatic',
      title: '오늘의 운동 추천받기',
      body: '운동 목표와 시간을 선택하면 오늘 할 운동을 추천해 드려요.',
    },
    {
      mode: 'selected',
      title: '직접 운동 선택하기',
      body: '하고 싶은 운동을 고르면 세트와 목표 횟수를 자동으로 설정해 드려요.',
    },
  ]
  return (
    <ul role="list" aria-label="운동 구성 방법" className="flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.mode}>
          <button
            type="button"
            onClick={() => onChoose(card.mode)}
            className={`${composeCard} flex w-full cursor-pointer flex-col gap-1 text-left hover:border-exercise/60 ${composeFocusRing}`}
          >
            <span className={composeSectionTitle}>{card.title}</span>
            <span className="text-body leading-relaxed font-normal text-muted">
              {card.body}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface SelectedRow {
  id: string
  name: string
  /** "가슴 · 초급 · 맨몸" 같은 정보 한 줄. 운동 정보를 알 수 없으면 null */
  meta: string | null
  /** 자동 구성 가능 여부 안내 문구(가능하면 null이 아니라 "자동 구성 가능") */
  status: string
  usable: boolean
}

/** 진행률 막대의 채움 너비. 전체 단계 수와 현재 단계로 정해지며(임의 값 없이) 정해진 클래스만 쓴다. */
const FILL_WIDTH: Record<number, Record<number, string>> = {
  3: { 1: 'w-1/3', 2: 'w-2/3', 3: 'w-full' },
  4: { 1: 'w-1/4', 2: 'w-2/4', 3: 'w-3/4', 4: 'w-full' },
}

/** 단계 화면 맨 위: 이전 버튼 · 단계 표시 · 가로 진행률 막대. 진행률은 글자(예: "1/3단계")로도 보이고 보조기기에도 전달된다. */
function StepHeader({
  step,
  mode,
  backLabel,
  onBack,
}: {
  step: ConditionStep
  mode: PlanMode
  backLabel: string
  onBack: () => void
}) {
  const total = totalSteps(mode)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className={`-ml-2.5 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-control px-2.5 text-body leading-snug font-normal text-content transition-colors hover:text-brand motion-reduce:transition-none ${composeFocusRing}`}
        >
          <Icon name="arrow-left" size={20} />
          <span>이전</span>
        </button>
        <p className="text-support font-semibold text-muted">
          {progressLabel(step, mode)}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="추천 조건 설정 진행률"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={progressSpeech(step, mode)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full bg-exercise transition-[width] duration-200 motion-reduce:transition-none ${FILL_WIDTH[total][step]}`}
        />
      </div>
    </div>
  )
}

/** 1단계: 운동 목표(단일 선택). 선택지는 추천 엔진이 지원하는 목표 그대로다. */
function PurposeStep({
  value,
  labelledBy,
  onChange,
}: {
  value: PlanPurpose | null
  labelledBy: string
  onChange: (purpose: PlanPurpose) => void
}) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3"
    >
      {PURPOSE_CHOICES.map((choice) => {
        const checked = value === choice.value
        return (
          <label
            key={choice.value}
            className={`${choiceBase} ${choiceTone(checked)}`}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={checked}
              onChange={() => onChange(choice.value)}
              className="size-5 shrink-0 accent-exercise"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-content">{choice.label}</span>
              <span className="text-support font-normal text-muted">
                {choice.hint}
              </span>
            </span>
            {checked ? (
              <span
                aria-hidden="true"
                className="shrink-0 text-body font-semibold text-exercise"
              >
                ✓
              </span>
            ) : null}
          </label>
        )
      })}
    </div>
  )
}

/**
 * 2단계: 운동 시간. 10·20·30분은 빠른 선택일 뿐이고, 직접 입력으로 엔진이 허용하는 5~180분(정수)을 모두 고를 수 있다.
 * 입력값을 보정하지 않는다(범위 밖·소수는 오류 안내만 하고 값은 비운다).
 */
function MinutesStep({
  inputs,
  minutesFromGoal,
  onMinutes,
}: {
  inputs: PlanInputs
  minutesFromGoal: number | null
  onMinutes: (minutes: number | null) => void
}) {
  const id = useId()
  const [text, setText] = useState(
    inputs.minutes !== null && !PLAN_MINUTES_PRESETS.includes(inputs.minutes)
      ? String(inputs.minutes)
      : '',
  )
  const typed = text.trim()
  const typedInvalid =
    typed !== '' && !isValidPlanMinutes(Number(typed.replace(/\s/g, '')))
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="운동 가능 시간 고르기"
        className="grid grid-cols-3 gap-3"
      >
        {PLAN_MINUTES_PRESETS.map((minutes) => {
          const active = inputs.minutes === minutes
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setText('')
                onMinutes(minutes)
              }}
              className={`flex min-h-16 cursor-pointer items-center justify-center gap-1 rounded-control border-2 px-2 text-body font-semibold ${active ? 'border-exercise bg-exercise-soft text-exercise' : 'border-line bg-surface text-content'} ${composeFocusRing}`}
            >
              {active ? <span aria-hidden="true">✓</span> : null}
              {minutes}분
            </button>
          )
        })}
      </div>
      <div>
        <label
          htmlFor={`${id}-minutes`}
          className="block text-support font-semibold text-content"
        >
          직접 입력(분, {MINUTES_RANGE_TEXT})
        </label>
        <input
          id={`${id}-minutes`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          aria-invalid={typedInvalid ? true : undefined}
          aria-describedby={typedInvalid ? `${id}-minutes-error` : undefined}
          onChange={(event) => {
            const value = event.currentTarget.value
            setText(value)
            const compact = value.trim()
            onMinutes(
              compact !== '' && isValidPlanMinutes(Number(compact))
                ? Number(compact)
                : null,
            )
          }}
          className={`${composeInput} mt-1`}
        />
        {typedInvalid ? (
          <p
            id={`${id}-minutes-error`}
            role="alert"
            className="mt-1 text-support font-normal text-danger"
          >
            {MINUTES_RANGE_TEXT} 사이의 숫자(정수)로 입력해 주세요.
          </p>
        ) : null}
      </div>
      <p className="text-support leading-relaxed font-normal text-muted">
        {PLAN_TEXT.timeNote}
      </p>
      {minutesFromGoal !== null && inputs.minutes === minutesFromGoal ? (
        <p className="-mt-2 text-support font-normal text-exercise">
          운동 목표에서 가져온 시간이에요. 오늘만 바꿀 수 있고 목표는 바뀌지
          않아요.
        </p>
      ) : null}
    </div>
  )
}

/**
 * 도구 카드의 모양. 체크박스는 눈에 보이지 않고(sr-only) 카드 전체가 선택 영역이다. 선택 상태는 색뿐 아니라 굵은 테두리·도구명 색·오른쪽 ✓로 드러난다.
 * 키보드 포커스 표시는 :focus-visible일 때만 카드 바깥선으로 보인다(마우스로 눌렀을 때는 나타나지 않는다).
 */
const toolCardBase =
  'relative flex min-h-16 w-full items-center gap-3 rounded-control border-2 px-4 py-3 text-left text-body has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-exercise'

function toolCardTone(state: ToolChoiceState, checked: boolean): string {
  if (state === 'unavailable') {
    return 'cursor-not-allowed border-line bg-page'
  }
  const tone = checked
    ? 'border-exercise bg-exercise-soft'
    : 'border-line bg-surface'
  return `${tone} ${state === 'always' ? 'cursor-default' : 'cursor-pointer'}`
}

/**
 * 3단계: 사용할 수 있는 도구(복수 선택). 목록은 운동 탐색(E01)의 운동 도구와 같다(공통 정의 TOOLS).
 * 맨몸은 항상 포함되어 끌 수 없고 하나도 고르지 않아도 된다. 추천 엔진이 쓸 수 있는 운동이 없는 도구는 보이되 고를 수 없고 이유가 글자로 보인다.
 * `toolChoices`는 고를 수 있는 도구(엔진이 쓸 수 있는 도구)다.
 */
function ToolsStep({
  inputs,
  toolChoices,
  labelledBy,
  onToggleTool,
}: {
  inputs: PlanInputs
  toolChoices: readonly ExerciseTool[]
  labelledBy: string
  onToggleTool: (tool: ExerciseTool) => void
}) {
  const baseId = useId()
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-3"
    >
      {describeToolChoices(toolChoices).map(({ tool, state }, index) => {
        const always = state === 'always'
        const unavailable = state === 'unavailable'
        const checked = !unavailable && inputs.tools.includes(tool)
        // 접근성 ID는 도구명이 아니라 순번으로 만든다(공백이 있으면 aria-describedby가 끊긴다). 이름은 도구명 요소만, 설명은 상태 문구(이유)만 가리킨다.
        const ids = toolControlIds(baseId, index)
        return (
          <label
            key={tool}
            className={`${toolCardBase} ${toolCardTone(state, checked)}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={always || unavailable}
              aria-labelledby={ids.name}
              aria-describedby={always || unavailable ? ids.note : undefined}
              onChange={() => onToggleTool(tool)}
              className="sr-only"
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block font-semibold ${
                  unavailable
                    ? 'text-muted'
                    : checked
                      ? 'text-exercise'
                      : 'text-content'
                }`}
              >
                <span id={ids.name}>{tool}</span>
                {always ? (
                  <span
                    id={ids.note}
                    className="ml-2 text-support font-normal text-muted"
                  >
                    (항상 가능)
                  </span>
                ) : null}
              </span>
              {unavailable ? (
                <span
                  id={ids.note}
                  className="mt-0.5 block text-support leading-snug font-normal text-muted"
                >
                  {TOOL_UNAVAILABLE_TEXT}
                </span>
              ) : null}
            </span>
            {checked ? (
              <span
                aria-hidden="true"
                className="shrink-0 text-body font-semibold text-exercise"
              >
                ✓
              </span>
            ) : null}
          </label>
        )
      })}
      <p className="text-support leading-relaxed font-normal text-muted">
        도구 없이 하는 운동(맨몸)은 항상 포함돼요. 고르지 않은 도구가 필요한
        운동은 추천하지 않아요.
      </p>
    </div>
  )
}

/** 4단계(직접 선택만): 고른 운동 목록. 기존 입력 항목이며 목록과 순서는 그대로 보존된다. */
function SelectedStep({
  selectedRows,
  onPick,
  onRemoveSelected,
}: {
  selectedRows: readonly SelectedRow[]
  onPick: () => void
  onRemoveSelected: (id: string) => void
}) {
  return (
    <section className="flex flex-col gap-3" aria-label="고른 운동">
      {selectedRows.length === 0 ? (
        <p className="text-body leading-relaxed font-normal text-muted">
          아직 고른 운동이 없어요. 하고 싶은 운동을 골라 주세요.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {selectedRows.map((row, index) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-2 rounded-control border border-line bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-body font-semibold text-content">
                  <span className="font-normal text-muted">{index + 1}. </span>
                  {row.name}
                </p>
                {row.meta ? (
                  <p className="text-support font-normal text-muted">
                    {row.meta}
                  </p>
                ) : null}
                <p
                  className={`text-support ${row.usable ? 'font-normal text-exercise' : 'font-semibold text-warning'}`}
                >
                  {row.usable ? '✓ ' : '⚠ '}
                  {row.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSelected(row.id)}
                className={`flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-support font-semibold text-content ${composeFocusRing}`}
              >
                <span aria-hidden="true">빼기</span>
                <span className="sr-only">{row.name} 목록에서 빼기</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        onClick={onPick}
        className={`${composeSecondaryButton} w-full`}
      >
        {selectedRows.length === 0 ? '운동 고르기' : '운동 더 고르기'}
      </button>
    </section>
  )
}

/**
 * 추천 조건 입력(S8-UI-1): 한 화면에 질문 하나씩 보여 주는 단계 화면.
 * 위에 이전 버튼·단계 표시·진행률, 가운데에 큰 질문과 선택지, 아래에 고정된 주요 버튼이 있다.
 * 어느 단계를 보일지(step)와 이동은 호출한 쪽이 정하고, 이 컴포넌트는 고른 값을 PlanInputs 그대로 올려 보낸다.
 * 고르지 않은 값은 비어 있다(임의로 채우지 않는다). 질문 제목(h1)은 단계가 바뀔 때 호출한 쪽이 포커스를 옮긴다.
 */
export default function PlanConditions({
  step,
  direction,
  headingRef,
  inputs,
  toolChoices,
  minutesFromGoal,
  selectedRows,
  backLabel,
  onBack,
  onPurpose,
  onMinutes,
  onToggleTool,
  onPick,
  onRemoveSelected,
  onNext,
}: {
  step: ConditionStep
  /** 방금 이동한 방향. 질문 전환 애니메이션의 방향을 정한다. */
  direction: 'next' | 'back'
  headingRef: Ref<HTMLHeadingElement>
  inputs: PlanInputs
  toolChoices: readonly ExerciseTool[]
  /** 운동 목표 요약에서 가져온 시간이면 그 값(안내 문구용), 아니면 null */
  minutesFromGoal: number | null
  selectedRows: readonly SelectedRow[]
  /** 이전 버튼의 보조기기용 이름(예: "이전 단계로 돌아가기"). 보이는 글자 "이전"으로 시작한다. */
  backLabel: string
  onBack: () => void
  onPurpose: (purpose: PlanPurpose) => void
  onMinutes: (minutes: number | null) => void
  onToggleTool: (tool: ExerciseTool) => void
  onPick: () => void
  onRemoveSelected: (id: string) => void
  /** 주요 버튼. 마지막 단계에서는 추천(자동 설정)을 만들고, 그 밖에는 다음 단계로 간다. */
  onNext: () => void
}) {
  const id = useId()
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  const text = STEP_TEXT[step]
  const valid = stepIsValid(step, inputs)
  const message = invalidMessage(step, inputs)

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] min-w-0 flex-col">
      <StepHeader
        step={step}
        mode={inputs.mode}
        backLabel={backLabel}
        onBack={onBack}
      />

      {/* key로 단계가 바뀔 때마다 새로 그려 전환 효과를 한 번만 재생한다(사용자 조작 이후에만, reduced-motion이면 없음). */}
      <div
        key={step}
        className={`flex flex-1 flex-col gap-6 pt-6 pb-6 motion-reduce:animate-none ${direction === 'back' ? 'animate-survey-back' : 'animate-survey-next'}`}
      >
        <header>
          <h1
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="text-app-title leading-snug font-semibold break-keep text-content outline-none"
          >
            {text.title}
          </h1>
          <p
            id={hintId}
            className="mt-2 text-body leading-relaxed font-normal break-keep text-muted"
          >
            {text.hint}
          </p>
        </header>

        {step === 1 ? (
          <PurposeStep
            value={inputs.purpose}
            labelledBy={titleId}
            onChange={onPurpose}
          />
        ) : null}
        {step === 2 ? (
          <MinutesStep
            key={minutesFromGoal ?? 'none'}
            inputs={inputs}
            minutesFromGoal={minutesFromGoal}
            onMinutes={onMinutes}
          />
        ) : null}
        {step === 3 ? (
          <ToolsStep
            inputs={inputs}
            toolChoices={toolChoices}
            labelledBy={titleId}
            onToggleTool={onToggleTool}
          />
        ) : null}
        {step === 4 ? (
          <SelectedStep
            selectedRows={selectedRows}
            onPick={onPick}
            onRemoveSelected={onRemoveSelected}
          />
        ) : null}
      </div>

      {/* 고정 버튼 영역: 화면 아래에 붙어 있고 본문 끝에 자리를 차지하므로 마지막 선택지를 가리지 않는다.
          하단 안전 영역은 viewport-fit=cover를 쓰지 않아 브라우저가 맡는다(프로젝트 규칙). */}
      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-page px-5 pt-3 pb-3">
        {message ? (
          <p
            id={`${id}-cta-message`}
            role="status"
            className="mb-2 text-support font-normal text-muted"
          >
            {message}
          </p>
        ) : null}
        <button
          type="button"
          aria-disabled={!valid}
          aria-describedby={message ? `${id}-cta-message` : undefined}
          onClick={() => {
            if (valid) onNext()
          }}
          className={`${composePrimaryButton} aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100`}
        >
          {ctaLabel(step, inputs.mode)}
        </button>
      </div>
    </div>
  )
}
