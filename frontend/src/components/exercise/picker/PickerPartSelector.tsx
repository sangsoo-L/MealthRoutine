import { useState } from 'react'
import { togglePickerPart } from '../../../exercise/exercisePickerSearch.ts'
import { pickerFocusRing } from './PickerNotices.tsx'

const chipBase = `min-h-12 cursor-pointer rounded-full border px-4 text-body leading-snug transition-colors motion-reduce:transition-none ${pickerFocusRing}`
const chipOn = 'border-exercise bg-exercise-soft font-semibold text-exercise'
const chipOff =
  'border-line bg-surface font-normal text-content hover:border-exercise/50'

/**
 * 직접 검색(W13)의 운동 부위 선택(바텀시트 본문). 여러 부위를 고를 수 있어 단일 선택 listbox가 아니라 눌림 상태(aria-pressed)를 가진 칩 버튼이다.
 *
 * - 상체 → 하체 → 코어 → 전신 순서로 묶고, 묶음 이름은 구분용 제목일 뿐 누를 수 없다. "상체 전체" 같은 묶음 선택지는 없다.
 * - 맨 위의 "전체"는 부위 조건이 없는 상태다(고르면 개별 선택을 모두 푼다). 개별 부위를 고르면 "전체"가 풀리고, 고른 부위를 다시 누르면 그 부위만 풀린다.
 *   마지막 개별 부위를 풀면 "전체"로 돌아간다. "전체"를 부위 값으로 따로 저장하지 않는다(빈 선택 = 전체).
 * - 고르는 동안은 시트 안의 임시 값이다. "적용하기"를 눌러야 호출부에 넘기고, 닫기·Escape는 임시 값을 버린다(호출부의 확정 값은 그대로).
 * - 선택 상태는 색뿐 아니라 ✓ 표시와 aria-pressed로도 전한다. 첫 포커스는 선택된 칩(없으면 "전체")이다(BottomSheet의 data-autofocus).
 */
export default function PickerPartSelector({
  groups,
  value,
  onApply,
}: {
  groups: ReadonlyArray<{ label: string; parts: readonly string[] }>
  /** 호출부가 확정해 둔 선택(빈 배열 = 전체). */
  value: readonly string[]
  onApply: (parts: readonly string[]) => void
}) {
  const [draft, setDraft] = useState<readonly string[]>(value)
  const firstSelected = groups
    .flatMap((group) => group.parts)
    .find((part) => draft.includes(part))

  return (
    <div className="flex flex-col">
      <div>
        <button
          type="button"
          aria-pressed={draft.length === 0}
          data-autofocus={firstSelected === undefined ? '' : undefined}
          onClick={() => setDraft([])}
          className={`${chipBase} ${draft.length === 0 ? chipOn : chipOff}`}
        >
          {draft.length === 0 ? <Check /> : null}전체
        </button>
      </div>

      {groups.map((group, index) => (
        <section key={group.label} className="mt-5">
          <p
            id={`picker-part-group-${index}`}
            className="text-support leading-snug font-semibold text-muted"
          >
            {group.label}
          </p>
          <div
            role="group"
            aria-labelledby={`picker-part-group-${index}`}
            className="mt-2 flex flex-wrap gap-2"
          >
            {group.parts.map((part) => {
              const selected = draft.includes(part)
              return (
                <button
                  key={part}
                  type="button"
                  aria-pressed={selected}
                  data-autofocus={part === firstSelected ? '' : undefined}
                  onClick={() =>
                    setDraft((prev) => togglePickerPart(prev, part))
                  }
                  className={`${chipBase} ${selected ? chipOn : chipOff}`}
                >
                  {selected ? <Check /> : null}
                  {part}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {/* 항목이 많아 시트 안을 스크롤해도 적용 버튼은 항상 보인다. */}
      <div className="sticky bottom-0 mt-6 bg-surface pt-3">
        <button
          type="button"
          onClick={() => onApply(draft)}
          className={`flex min-h-13 w-full cursor-pointer items-center justify-center rounded-control bg-exercise text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 motion-reduce:transition-none ${pickerFocusRing}`}
        >
          적용하기
        </button>
      </div>
    </div>
  )
}

/** 선택됨 표시. 의미는 aria-pressed가 전하므로 보조기기에서는 숨긴다. */
function Check() {
  return (
    <span aria-hidden="true" className="mr-1.5">
      ✓
    </span>
  )
}
