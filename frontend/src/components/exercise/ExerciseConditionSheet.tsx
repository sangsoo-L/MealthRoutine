import { useRef, useState, type SubmitEvent } from 'react'
import {
  EMPTY_FILTERS,
  FILTER_LABELS,
  MAX_EXERCISE_QUERY,
  type ExerciseCriteria,
  type FilterKey,
} from '../../exercise/exerciseFilters.ts'
import BottomSheet from '../layout/BottomSheet.tsx'
import ExerciseQueryInput from './ExerciseQueryInput.tsx'
import FilterListbox from './FilterOptions.tsx'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

const FILTER_KEYS: readonly FilterKey[] = ['difficulty', 'part', 'tool']

interface ExerciseConditionSheetProps {
  /** 지금 검색 결과에 적용된 조건(주소에서 읽은 값). 시트를 열 때 수정용 사본(draft)으로 복사한다. */
  applied: ExerciseCriteria
  /**
   * 시트가 닫힌 뒤 호출된다. 재검색으로 닫혔으면 적용할 조건, 그 밖의 모든 닫기(닫기 버튼·배경·Esc)는 null(수정 사항 폐기)이다.
   * 조건을 실제로 적용(주소 갱신·재검색)하는 일은 호출한 쪽이 한다.
   */
  onClose: (next: ExerciseCriteria | null) => void
}

/**
 * 결과 화면의 "조건 수정" 바텀시트. 검색 결과 화면을 떠나지 않고 조건을 고쳐 다시 검색한다.
 *
 * - 적용된 조건(applied)과 수정 중인 조건(draft)을 나눈다. 시트를 열 때 applied를 draft로 복사하고, 시트 안의 어떤 조작도 결과·주소·요약 바를
 *   바꾸지 않는다. "이 조건으로 재검색"을 눌러 닫힐 때만 호출한 쪽이 draft를 적용한다. 닫기·배경·Esc는 draft를 버린다.
 * - "초기화"는 draft만 비운다(검색어 없음, 모든 필터 전체). 결과는 재검색을 눌러야 바뀐다.
 * - 선택지는 시트 안에 직접 보여 준다(다른 시트를 또 열지 않는다). 선택 규칙·선택지는 검색 전 화면의 선택 시트와 같은 컴포넌트를 쓴다.
 * - 재검색 버튼은 하단에 붙어 있어 내용이 길어도(글자 확대 포함) 화면 밖으로 사라지지 않는다.
 * 포커스 이동·복귀, 배경 inert, 스크롤 잠금, Esc는 공통 BottomSheet가 맡는다.
 */
export default function ExerciseConditionSheet({
  applied,
  onClose,
}: ExerciseConditionSheetProps) {
  // 재검색으로 닫는 경우에만 값이 들어간다. BottomSheet가 닫힘 애니메이션을 마친 뒤 onClose에서 읽는다.
  const submitted = useRef<ExerciseCriteria | null>(null)

  return (
    <BottomSheet
      title="검색 조건 수정"
      onClose={() => onClose(submitted.current)}
    >
      {(close, closing) => (
        <ConditionForm
          applied={applied}
          closing={closing}
          onSubmit={(criteria) => {
            // 중복 제출 방지: 처음 한 번만 받는다.
            if (submitted.current) return
            submitted.current = criteria
            close()
          }}
        />
      )}
    </BottomSheet>
  )
}

function ConditionForm({
  applied,
  closing,
  onSubmit,
}: {
  applied: ExerciseCriteria
  closing: boolean
  onSubmit: (criteria: ExerciseCriteria) => void
}) {
  const [draft, setDraft] = useState<ExerciseCriteria>(() => ({
    query: applied.query,
    filters: { ...applied.filters },
  }))

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (closing) return
    // 검색어는 앞뒤 공백을 지우고 최대 길이로 맞춘다. 필터 값은 선택지에서만 고르므로 항상 유효하다.
    onSubmit({
      query: draft.query.trim().slice(0, MAX_EXERCISE_QUERY),
      filters: draft.filters,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="exercise-edit-query"
          className="mb-2 block text-body leading-snug font-semibold text-content"
        >
          운동 이름
        </label>
        <ExerciseQueryInput
          id="exercise-edit-query"
          value={draft.query}
          onChange={(query) => setDraft((current) => ({ ...current, query }))}
        />
      </div>

      {FILTER_KEYS.map((key) => (
        <section key={key} className="mt-5">
          <h3 className="mb-2 text-body leading-snug font-semibold text-content">
            {FILTER_LABELS[key]}
          </h3>
          <FilterListbox
            inline
            filterKey={key}
            value={draft.filters[key]}
            onSelect={(value) =>
              setDraft((current) => ({
                ...current,
                filters: { ...current.filters, [key]: value },
              }))
            }
          />
        </section>
      ))}

      {/*
        하단 고정 버튼 줄: 스크롤해도 시트 아래에 붙어 있다. 재검색이 가장 강조된다.
        시트 내용 영역의 아래 여백(안전 영역 포함)까지 이 줄이 덮도록 같은 크기의 음수 bottom·margin과 padding을 둔다.
        그렇지 않으면 여백 띠에 스크롤된 선택지가 버튼 줄 아래로 비쳐 보인다.
        폭이 모자라면(글자 확대) flex-wrap-reverse로 줄바꿈해 재검색이 위, 초기화가 아래에 놓이고 글자가 한 글자씩 쪼개지지 않는다.
      */}
      <div className="sticky -bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-10 -mx-5 -mb-[max(1.25rem,env(safe-area-inset-bottom))] mt-5 flex flex-wrap-reverse items-center gap-2 border-t border-line bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={closing}
          onClick={() => setDraft({ query: '', filters: EMPTY_FILTERS })}
          className={`flex min-h-13 shrink-0 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-5 text-body font-semibold text-content hover:border-muted disabled:cursor-not-allowed ${focusRing}`}
        >
          초기화
        </button>
        <button
          type="submit"
          disabled={closing}
          className={`flex min-h-13 min-w-0 flex-1 basis-40 cursor-pointer items-center justify-center rounded-control bg-exercise px-4 text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed motion-reduce:transition-none ${focusRing}`}
        >
          이 조건으로 <span className="whitespace-nowrap">재검색</span>
        </button>
      </div>
    </form>
  )
}
