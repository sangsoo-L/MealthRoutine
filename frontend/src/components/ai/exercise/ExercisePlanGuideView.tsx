import { useState } from 'react'
import { Link } from 'react-router'
import {
  DATE_LABEL,
  FRAME_MS,
  INPUT_STEPS,
  LAST_FRAME_MS,
  PLAN_EXAMPLES,
  buildFrames,
  conditionValue,
  rowDetail,
  staticFrameIndex,
  type ExampleFrame,
  type PlanExample,
} from '../../../ai/exercisePlanExample.ts'
import { useExamplePlayback } from '../../../ai/useExamplePlayback.ts'
import Icon from '../../icons/Icon.tsx'
import {
  composeCard,
  composeFocusRing,
  composeSectionTitle,
} from '../../exercise/compose/composeStyles.ts'

const FRAMES = PLAN_EXAMPLES.map(buildFrames)

const FLOW_STEPS = [
  {
    title: '운동 목록 확인',
    text: '등록한 날의 운동 목록에서 구성을 확인해요.',
  },
  { title: '운동 진행', text: '운동을 시작하고 세트마다 기록해요.' },
  { title: '기록 확인', text: '끝낸 운동은 운동 기록에서 다시 볼 수 있어요.' },
] as const

function StageInput({
  example,
  filled,
}: {
  example: PlanExample
  filled: number
}) {
  return (
    <div>
      <p className="text-body leading-snug font-semibold text-content">
        조건을 골라요
      </p>
      <ol role="list" className="mt-3 flex flex-col gap-2">
        {INPUT_STEPS.map((step, index) => {
          const done = index < filled
          const current = index === filled - 1
          return (
            <li
              key={step}
              data-input-step={step}
              data-filled={done ? 'true' : 'false'}
              className={`flex items-center justify-between gap-3 rounded-control border px-3 py-2.5 ${current ? 'border-exercise bg-exercise-soft' : 'border-line bg-surface'}`}
            >
              <span className="text-support leading-snug font-normal text-muted">
                {index + 1}. {step}
              </span>
              <span
                className={`text-body leading-snug ${done ? 'font-semibold text-exercise' : 'font-normal text-muted'}`}
              >
                {done ? conditionValue(example.conditions, step) : '–'}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function StageLoading() {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-exercise-soft text-exercise"
      >
        <Icon
          name="clipboard-plus"
          size={30}
          className="animate-pulse motion-reduce:animate-none"
        />
      </span>
      <p className="mt-3 text-body leading-snug font-semibold text-content">
        예시 목록을 구성하고 있어요
      </p>
      <p className="mt-1 text-support font-normal text-muted">
        미리 정해 둔 고정 예시를 보여 줘요.
      </p>
    </div>
  )
}

function StageRows({
  example,
  shown,
}: {
  example: PlanExample
  shown: number
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-body leading-snug font-semibold text-content">
          추천 목록 예시
        </p>
        <p className="text-support font-normal tabular-nums text-muted">
          휴식 포함 {example.conditions.minutes}분
        </p>
      </div>
      <ol role="list" className="mt-3 flex flex-col gap-2">
        {example.rows.map((row, index) => (
          <li
            key={row.exerciseId}
            data-example-row={row.exerciseId}
            aria-hidden={index >= shown ? 'true' : undefined}
            className={`flex items-start gap-3 rounded-control border border-line bg-surface px-3 py-2.5 transition-opacity duration-300 motion-reduce:transition-none ${index < shown ? 'opacity-100' : 'opacity-0'}`}
          >
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-support leading-none font-semibold tabular-nums text-exercise"
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body leading-snug font-semibold text-content">
                {row.name}
              </span>
              <span className="mt-0.5 block text-support leading-snug font-normal tabular-nums text-muted">
                {rowDetail(row)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function StageRegister({ date }: { date: 'today' | 'tomorrow' | null }) {
  return (
    <div className="flex h-full min-h-56 flex-col justify-center">
      <p className="text-body leading-snug font-semibold text-content">
        어느 날의 목록으로 등록할까요?
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['today', 'tomorrow'] as const).map((value) => (
          <span
            key={value}
            data-register-date={value}
            data-selected={date === value ? 'true' : 'false'}
            className={`flex min-h-11 items-center justify-center rounded-control border px-3 text-body font-semibold ${date === value ? 'border-exercise bg-exercise text-surface' : 'border-line bg-surface text-muted'}`}
          >
            {DATE_LABEL[value]}
          </span>
        ))}
      </div>
      <p className="mt-3 text-support leading-relaxed font-normal text-muted">
        예시 화면이라 실제로 등록되지 않아요.
      </p>
    </div>
  )
}

function StageDone({ date }: { date: 'today' | 'tomorrow' }) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-exercise text-surface"
      >
        <Icon name="clipboard-check" size={30} />
      </span>
      <p className="mt-3 text-body leading-snug font-semibold text-content">
        {DATE_LABEL[date]} 운동 목록에 등록되는 모습이에요
      </p>
      <p className="mt-1 text-support font-normal text-muted">
        예시 화면이라 실제 목록은 만들어지지 않아요.
      </p>
    </div>
  )
}

function Stage({
  example,
  frame,
}: {
  example: PlanExample
  frame: ExampleFrame
}) {
  switch (frame.phase) {
    case 'input':
      return <StageInput example={example} filled={frame.filled} />
    case 'loading':
      return <StageLoading />
    case 'rows':
      return <StageRows example={example} shown={frame.shown} />
    case 'register':
      return <StageRegister date={frame.date} />
    case 'done':
      return <StageDone date={frame.date} />
  }
}

/**
 * I02 AI 운동 플랜 안내 본문(`/ai/exercise`, 비회원 공개). 소개, "고정 예시" 미리보기 무대(조건 입력 → 구성 중 → 추천 목록 → 오늘·내일 등록 → 완료의 자동 반복),
 * 재생·일시정지, 등록 뒤 흐름, 기본 기록 무료 안내와 "운동 조건 선택하기"(I02-1 `/ai/exercise/plan`, 회원 전용이라 비회원은 로그인 안내 뒤 돌아온다)로 구성한다.
 *
 * 예시는 기존 운동 카탈로그의 실제 운동으로 만든 고정 데이터이며 실제 AI 결과처럼 쓰지 않는다. 기록·초안을 만들지 않고 체험 횟수를 다루지 않는다
 * (체험 안내는 명세에 따라 이 화면에서 제외한다). 보조기기에는 움직이는 무대 대신 현재 예시의 조건과 목록을 정적 글로 알린다.
 */
export default function ExercisePlanGuideView() {
  const [exampleIndex, setExampleIndex] = useState(0)
  const example = PLAN_EXAMPLES[exampleIndex]
  const frames = FRAMES[exampleIndex]
  const { frame, playing, toggle, jumpTo } = useExamplePlayback({
    frameCount: frames.length,
    durationOf: (index) =>
      index >= frames.length - 1 ? LAST_FRAME_MS : FRAME_MS,
    initialFrame: staticFrameIndex(PLAN_EXAMPLES[0]),
    onCycleEnd: () =>
      setExampleIndex((value) => (value + 1) % PLAN_EXAMPLES.length),
  })

  function choose(index: number) {
    if (index === exampleIndex) return
    setExampleIndex(index)
    jumpTo(playing ? 0 : staticFrameIndex(PLAN_EXAMPLES[index]))
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            AI 운동 플랜
          </h1>
          <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-semibold text-exercise">
            고정 예시
          </span>
        </div>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          시간·도구·부위를 고르면 실행하기 쉬운 운동 목록을 제안하고, 고쳐서
          오늘이나 내일의 운동 목록으로 등록하는 과정을 미리 볼 수 있어요.
        </p>
        <p
          role="note"
          data-fixed-example-note=""
          className="mt-3 rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise"
        >
          아래는 미리 정해 둔 고정 예시예요. 실제 AI 추천 결과가 아니에요.
        </p>
      </header>

      <section
        aria-labelledby="ai-example-title"
        className="flex flex-col gap-3"
      >
        <h2
          id="ai-example-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          예시 미리보기
        </h2>
        <div
          role="group"
          aria-label="조건 예시 선택"
          className="grid grid-cols-2 gap-2"
        >
          {PLAN_EXAMPLES.map((item, index) => {
            const selected = index === exampleIndex
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(index)}
                className={`min-h-11 cursor-pointer rounded-control border px-3 text-body ${composeFocusRing} ${selected ? 'border-exercise bg-exercise-soft font-semibold text-exercise' : 'border-line bg-surface font-normal text-muted hover:text-content'}`}
              >
                {item.tabLabel}
              </button>
            )
          })}
        </div>

        <div
          role="group"
          aria-label={`${example.tabLabel} 고정 예시`}
          data-example-stage={example.key}
          data-frame-phase={frames[frame].phase}
          className={`${composeCard} min-h-72`}
        >
          <div aria-hidden="true" className="h-full">
            <Stage example={example} frame={frames[frame]} />
          </div>
          {/* 움직이는 무대는 보조기기에서 숨기고, 같은 내용을 정적 글로 알린다. */}
          <div className="sr-only">
            <p>
              {example.tabLabel} 조건 예시. 난이도{' '}
              {example.conditions.difficulty}, 부위{' '}
              {example.conditions.parts.join(', ')}, 도구{' '}
              {example.conditions.tools.join(', ')}, 휴식 포함{' '}
              {example.conditions.minutes}분.
            </p>
            <ul>
              {example.rows.map((row) => (
                <li key={row.exerciseId}>
                  {row.name}, {rowDetail(row)}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button
          type="button"
          aria-pressed={playing}
          onClick={toggle}
          className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${composeFocusRing}`}
        >
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
          {playing ? '예시 일시정지' : '예시 재생'}
        </button>
      </section>

      <section aria-labelledby="ai-flow-after-title" className={composeCard}>
        <h2 id="ai-flow-after-title" className={composeSectionTitle}>
          등록한 뒤에는
        </h2>
        <ol role="list" className="mt-3 flex flex-col gap-3">
          {FLOW_STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-exercise text-support leading-none font-semibold tabular-nums text-surface"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-body leading-snug font-semibold text-content">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-support leading-relaxed font-normal text-muted">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ai-exercise-cta-title" className={composeCard}>
        <h2 id="ai-exercise-cta-title" className={composeSectionTitle}>
          직접 조건을 골라 볼까요?
        </h2>
        <Link
          to="/ai/exercise/plan"
          state={{ from: '/ai/exercise' }}
          data-plan-cta=""
          className={`mt-3 flex min-h-12 w-full items-center justify-center rounded-control bg-exercise px-4 text-body font-semibold text-surface hover:bg-exercise/90 ${composeFocusRing}`}
        >
          운동 조건 선택하기
        </Link>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          로그인한 회원이 조건을 고르면 미리 정해 둔 운동량 기준으로 예시 목록을
          구성해 드려요. 실제 AI 추천이 아니에요.
        </p>
        <p className="mt-3 border-t border-line pt-3 text-support leading-relaxed font-normal text-muted">
          기본 운동·식단 기록은 무료예요.
        </p>
        <Link
          to="/records/exercise"
          state={{ from: '/ai/exercise' }}
          className={`mt-1 inline-flex min-h-11 items-center text-body font-semibold text-exercise hover:underline ${composeFocusRing}`}
        >
          운동 기록으로 가기
        </Link>
      </section>
    </div>
  )
}
