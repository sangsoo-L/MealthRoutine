import { useState } from 'react'
import type { Exercise } from '../../exercise/exerciseTypes.ts'
import Icon from '../icons/Icon.tsx'
import type { IconName } from '../icons/iconTypes.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

type Target = 'today' | 'tomorrow'

/**
 * 화면명세 v5.0 E02: "오늘 기록"(클립보드 체크)·"내일 계획"(캘린더 추가) 아이콘 버튼.
 * 목적이 다른 두 동작이라 모양으로 우선순위를 나눈다. 오늘 기록은 채운 주 버튼(더 크고 넓게), 내일 계획은 윤곽선 보조 버튼이다.
 */
const TARGETS: ReadonlyArray<{
  key: Target
  label: string
  icon: IconName
  className: string
}> = [
  {
    key: 'today',
    label: '오늘 기록',
    icon: 'clipboard-check',
    className:
      'min-h-12 flex-[1.4] basis-36 bg-exercise text-surface hover:opacity-90 active:opacity-80',
  },
  {
    key: 'tomorrow',
    label: '내일 계획',
    icon: 'calendar-plus',
    className:
      'min-h-12 flex-1 basis-32 border border-exercise bg-surface text-exercise hover:bg-exercise-soft active:bg-exercise-soft/70',
  },
]

/**
 * 운동을 오늘 기록·내일 계획에 담는 진입점.
 * 추가 대상인 운동 목록 구성(W02)과 운동 루틴은 아직 구현되지 않았으므로 아무것도 저장하지 않고, 누르면 이유를 안내만 한다.
 * 버튼이 주 버튼 모양이어도 저장된 것처럼 보이지 않도록 안내 문구가 "저장되지 않았어요"를 분명히 적는다.
 * 회원 전용이다. 비회원에게는 이 컴포넌트를 그리지 않는다(호출하는 ExerciseDetailView가 회원일 때만 렌더링). 그래서 이 안에는
 * 인증 분기가 없고, 비회원 화면에는 빈 컨테이너나 여백도 남지 않는다. 회원에게는 운동 목록 구성이 준비 중임을 안내한다.
 * 버튼 이름은 눈에 보이는 라벨("오늘 기록")로 시작해 어떤 운동에 대한 동작인지 알려 준다.
 */
export default function ExerciseRoutineActions({
  exercise,
}: {
  exercise: Exercise
}) {
  const [selected, setSelected] = useState<Target | null>(null)
  const selectedLabel = TARGETS.find((t) => t.key === selected)?.label

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {TARGETS.map((target) => (
          <button
            key={target.key}
            type="button"
            aria-label={`${target.label}에 추가: ${exercise.name}`}
            aria-describedby={selected ? 'exercise-routine-notice' : undefined}
            onClick={() => setSelected(target.key)}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-control px-4 text-body font-semibold transition-colors motion-reduce:transition-none ${focusRing} ${target.className}`}
          >
            <Icon name={target.icon} size={20} />
            <span>{target.label}</span>
          </button>
        ))}
      </div>

      {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역(포커스는 누른 버튼에 그대로 둔다). */}
      <div aria-live="polite">
        {selected ? (
          <div
            id="exercise-routine-notice"
            className="mt-3 rounded-card border border-line bg-surface p-4"
          >
            <p className="text-body leading-snug font-semibold text-content">
              운동 목록 구성은 아직 준비 중이에요
            </p>
            <p className="mt-1 text-body leading-relaxed font-normal text-muted">
              ‘{exercise.name}’은(는) {selectedLabel}에 저장되지 않았어요. 운동
              목록을 만들 수 있게 되면 여기서 바로 담을 수 있어요.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
