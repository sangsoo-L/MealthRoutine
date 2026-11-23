import { useRef, useState, type SubmitEvent } from 'react'
import { DIFFICULTIES } from '../../../exercise/exerciseTaxonomy.ts'
import {
  formatPickerParts,
  type PickerCriteria,
} from '../../../exercise/exercisePickerSearch.ts'
import Icon from '../../icons/Icon.tsx'
import BottomSheet from '../../layout/BottomSheet.tsx'
import ExerciseQueryInput from '../ExerciseQueryInput.tsx'
import PickerFilterListbox from './PickerFilterListbox.tsx'
import { pickerFocusRing } from './PickerNotices.tsx'
import PickerPartSelector from './PickerPartSelector.tsx'

type FilterKey = 'difficulty' | 'parts'

const FILTERS: ReadonlyArray<{ key: FilterKey; label: string; sheet: string }> =
  [
    { key: 'difficulty', label: '난이도', sheet: '난이도 선택' },
    { key: 'parts', label: '운동 부위', sheet: '운동 부위 선택' },
  ]

/** 목록 안 행의 포커스 표시(윤곽선을 행 안쪽으로 그린다: 목록이 overflow-hidden이라 바깥은 잘린다). */
const focusRingInset =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-exercise'

/**
 * 직접 검색(W13)의 검색 영역: 운동 검색창, 검색 조건(난이도·운동 부위), 검색하기, 조건 초기화를 하나의 면으로 묶는다.
 * 운동 탐색(E01)의 검색 전 화면과 같은 구성이다: 검색창 → "검색 조건" 행 목록(누르면 아래에서 선택 시트) → 전체 너비 "검색하기".
 *
 * 입력 중인 조건(criteria)만 보여 주고 바꾸는 일은 호출부에 넘긴다. 검색은 "검색하기"(또는 검색창에서 Enter)를 제출할 때만 실행하며,
 * 조건을 바꾸는 것만으로는 아무것도 검색하지 않는다. "전체"가 기본이다.
 * - 난이도: 하나를 고르면 바로 반영하고 시트가 닫힌다(단일 선택).
 * - 운동 부위: 여러 개를 고르는 시트이며 "적용하기"를 눌러야 반영한다(닫기·Escape는 변경을 버린다). 행에는 "전체"·"등"·"등, 어깨"·"등 외 2개"로 보인다.
 * 초기화 버튼은 조건이 처음 상태가 아니거나 검색을 실행한 상태일 때만 나타난다(canReset). 검색하기보다 눈에 덜 띄는 글자 버튼이다.
 */
export default function PickerSearchForm({
  criteria,
  partGroups,
  canReset,
  onQuery,
  onDifficulty,
  onParts,
  onSubmit,
  onReset,
}: {
  criteria: PickerCriteria
  /** 운동 부위 선택지(큰 분류별 묶음. 불러온 운동에 실제로 있는 부위만). */
  partGroups: ReadonlyArray<{ label: string; parts: readonly string[] }>
  canReset: boolean
  onQuery: (query: string) => void
  onDifficulty: (difficulty: string | null) => void
  onParts: (parts: readonly string[]) => void
  onSubmit: () => void
  onReset: () => void
}) {
  const [sheet, setSheet] = useState<FilterKey | null>(null)
  // 난이도 시트에서 이미 하나를 골랐는지(닫히는 동안의 연속 선택 방지). 시트를 열 때마다 비운다.
  const chosen = useRef(false)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  const values: Record<FilterKey, string | null> = {
    difficulty: criteria.difficulty,
    parts: criteria.parts.length > 0 ? formatPickerParts(criteria.parts) : null,
  }

  return (
    <>
      <form
        role="search"
        aria-label="운동 검색"
        onSubmit={handleSubmit}
        className="mt-4 rounded-card border border-line bg-surface p-4"
      >
        <label htmlFor="picker-query" className="sr-only">
          운동명·부위·도구 검색
        </label>
        <ExerciseQueryInput
          id="picker-query"
          value={criteria.query}
          onChange={onQuery}
          placeholder="운동명·부위·도구 검색"
          inputClassName="scroll-mb-(--picker-footer-h)"
        />

        <div className="mt-4 mb-0.5 flex items-center justify-between">
          <h2 className="text-section-title leading-snug font-semibold text-content">
            검색 조건
          </h2>
          {canReset ? (
            <button
              type="button"
              onClick={onReset}
              className={`-mr-2 flex min-h-11 scroll-mb-(--picker-footer-h) cursor-pointer items-center px-2 text-support font-normal text-muted hover:text-content ${pickerFocusRing}`}
            >
              조건 초기화
            </button>
          ) : null}
        </div>

        <ul className="divide-y divide-line overflow-hidden rounded-control border border-line bg-surface">
          {FILTERS.map(({ key, label }) => {
            const value = values[key]
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    // Safari는 버튼을 눌러도 포커스를 주지 않아, 시트가 닫힌 뒤 돌아갈 곳(이 버튼)을 직접 정해 둔다.
                    event.currentTarget.focus()
                    chosen.current = false
                    setSheet(key)
                  }}
                  className={`flex min-h-14 w-full scroll-mb-(--picker-footer-h) cursor-pointer flex-wrap items-center gap-x-3 px-4 py-2 text-left hover:bg-page ${focusRingInset}`}
                >
                  <span className="text-body font-semibold text-content">
                    {label}
                  </span>
                  {/* 값과 화살표는 한 묶음이라 글자를 키워 자리가 모자라면 묶음째 아랫줄로 내려간다. 값이 길면 줄바꿈한다. */}
                  <span className="ml-auto flex min-w-0 items-center gap-3">
                    <span
                      className={`min-w-0 text-right text-body break-keep wrap-anywhere ${value ? 'font-semibold text-exercise' : 'font-normal text-muted'}`}
                    >
                      {value ?? '전체'}
                    </span>
                    <Icon
                      name="chevron-right"
                      size={18}
                      className="shrink-0 text-muted"
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          type="submit"
          className={`mt-4 flex min-h-13 w-full scroll-mb-(--picker-footer-h) cursor-pointer items-center justify-center rounded-control bg-exercise text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 motion-reduce:transition-none ${pickerFocusRing}`}
        >
          검색하기
        </button>
      </form>

      {sheet ? (
        <BottomSheet
          title={FILTERS.find((f) => f.key === sheet)?.sheet ?? ''}
          onClose={() => setSheet(null)}
        >
          {(close, closing) =>
            sheet === 'parts' ? (
              <PickerPartSelector
                groups={partGroups}
                value={criteria.parts}
                onApply={(parts) => {
                  if (closing || chosen.current) return
                  chosen.current = true
                  onParts(parts)
                  close()
                }}
              />
            ) : (
              <PickerFilterListbox
                label="난이도"
                options={DIFFICULTIES}
                value={criteria.difficulty}
                onSelect={(value) => {
                  // 닫히는 중에 한 번 더 눌러도 처음 선택을 바꾸지 않는다.
                  if (closing || chosen.current) return
                  chosen.current = true
                  onDifficulty(value)
                  close()
                }}
              />
            )
          }
        </BottomSheet>
      ) : null}
    </>
  )
}
