import type {
  DraftIssue,
  DraftItem,
  DraftSet,
  RecordType,
} from '../../../exercise/workoutDraftTypes.ts'
import { MAX_SETS_PER_ITEM } from '../../../exercise/workoutDraftModel.ts'
import {
  RECORD_TYPES,
  RECORD_TYPE_LABEL,
} from '../../../exercise/workoutDraftTypes.ts'
import {
  composeCard,
  composeIconButton,
  composeInput,
  composeSecondaryButton,
  composeSectionTitle,
  fieldId,
  itemCardId,
  moveButtonId,
} from './composeStyles.ts'

export interface ComposeItemActions {
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  removeItem: (itemId: string) => void
  setRecordType: (itemId: string, recordType: RecordType) => void
  addSet: (itemId: string) => void
  removeSet: (itemId: string, setIndex: number) => void
  updateSet: (
    itemId: string,
    setIndex: number,
    patch: Partial<Record<keyof DraftSet, number | undefined>>,
  ) => void
}

function errorId(itemId: string, setIndex: number | null, field: string) {
  return `${fieldId(itemId, setIndex, field)}-error`
}

/** 입력창의 문자열을 값으로. 비어 있으면 undefined(값 없음), 숫자가 아니면 null(받지 않음). */
function parseInput(text: string): number | undefined | null {
  if (text.trim() === '') return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function NumberField({
  item,
  setIndex,
  field,
  label,
  unit,
  value,
  min,
  max,
  step,
  inputMode,
  issue,
  onChange,
}: {
  item: DraftItem
  setIndex: number
  field: 'reps' | 'weightKg' | 'targetSeconds'
  label: string
  unit: string
  value: number | undefined
  min: number
  max?: number
  step: string
  inputMode: 'numeric' | 'decimal'
  issue: DraftIssue | undefined
  onChange: (value: number | undefined) => void
}) {
  const id = fieldId(item.itemId, setIndex, field)
  const errId = errorId(item.itemId, setIndex, field)
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-support font-normal text-muted">
        {label} ({unit})
      </label>
      <input
        id={id}
        type="number"
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        aria-label={`${item.name} ${setIndex + 1}세트 ${label} (${unit})`}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? errId : undefined}
        onChange={(event) => {
          const next = parseInput(event.target.value)
          if (next !== null) onChange(next)
        }}
        className={`mt-1 ${composeInput}`}
      />
      {issue ? (
        <p
          id={errId}
          className="mt-1 text-support leading-snug font-normal text-danger"
        >
          {issue.message}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 운동 한 개의 편집 카드(W02). 운동 순서 이동·삭제, 기록 방식 선택, 세트 편집을 한다.
 * - 기록 방식에 맞는 입력만 보인다: 횟수형 횟수, 중량형 횟수+중량(비워도 됨), 시간형 목표 시간. 방식을 바꿔도 다른 입력값은 보존한다(숨겨질 뿐).
 * - 순서 이동은 양 끝에서 비활성이고, 세트가 하나뿐이면 그 세트의 삭제가 비활성이다. 마지막 운동도 삭제할 수 있다.
 * - 검증 오류는 해당 입력 아래에 글자로 보이고 입력에 aria-invalid·aria-describedby로 연결된다(색만으로 전하지 않는다).
 * - 버튼 이름에는 운동 이름을 넣어 여러 카드 사이에서 구분되게 한다.
 */
export default function ComposeItemCard({
  item,
  index,
  total,
  issues,
  actions,
}: {
  item: DraftItem
  index: number
  total: number
  issues: readonly DraftIssue[]
  actions: ComposeItemActions
}) {
  const itemIssues = issues.filter((issue) => issue.setIndex === undefined)
  const setIssue = (setIndex: number, field: string) =>
    issues.find((issue) => issue.setIndex === setIndex && issue.field === field)
  const recordTypeId = fieldId(item.itemId, null, 'recordType')

  return (
    <li
      id={itemCardId(item.itemId)}
      tabIndex={-1}
      className={`${composeCard} outline-none`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className={`min-w-0 break-keep wrap-anywhere ${composeSectionTitle}`}
        >
          {index + 1}. {item.name}
        </h3>
        <div className="flex shrink-0 gap-1">
          <button
            id={moveButtonId(item.itemId, 'up')}
            type="button"
            aria-label={`${item.name} 순서 위로 이동`}
            disabled={index === 0}
            onClick={() => actions.moveItem(item.itemId, 'up')}
            className={composeIconButton}
          >
            <span aria-hidden="true">▲</span>
          </button>
          <button
            id={moveButtonId(item.itemId, 'down')}
            type="button"
            aria-label={`${item.name} 순서 아래로 이동`}
            disabled={index === total - 1}
            onClick={() => actions.moveItem(item.itemId, 'down')}
            className={composeIconButton}
          >
            <span aria-hidden="true">▼</span>
          </button>
          <button
            type="button"
            aria-label={`${item.name} 삭제`}
            onClick={() => actions.removeItem(item.itemId)}
            className={composeIconButton}
          >
            삭제
          </button>
        </div>
      </div>

      {itemIssues.map((issue) => (
        <p
          key={`${issue.field}-${issue.message}`}
          className="mt-2 text-support leading-snug font-normal text-danger"
        >
          {issue.message}
        </p>
      ))}

      <div className="mt-3">
        <label
          htmlFor={recordTypeId}
          className="block text-support font-normal text-muted"
        >
          기록 방식
        </label>
        <select
          id={recordTypeId}
          value={item.recordType}
          aria-label={`${item.name} 기록 방식`}
          onChange={(event) =>
            actions.setRecordType(item.itemId, event.target.value as RecordType)
          }
          className={`mt-1 ${composeInput}`}
        >
          {RECORD_TYPES.map((type) => (
            <option key={type} value={type}>
              {RECORD_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <ol role="list" className="mt-3 flex flex-col gap-3">
        {item.sets.map((set, setIndex) => (
          <li
            key={setIndex}
            className="rounded-control bg-page p-3"
            aria-label={`${item.name} ${setIndex + 1}세트`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-body font-semibold text-content">
                {setIndex + 1}세트
              </span>
              <button
                type="button"
                aria-label={`${item.name} ${setIndex + 1}세트 삭제`}
                disabled={item.sets.length <= 1}
                onClick={() => actions.removeSet(item.itemId, setIndex)}
                className={composeIconButton}
              >
                삭제
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              {item.recordType !== 'time' ? (
                <NumberField
                  item={item}
                  setIndex={setIndex}
                  field="reps"
                  label="횟수"
                  unit="회"
                  value={set.reps}
                  min={1}
                  step="1"
                  inputMode="numeric"
                  issue={setIssue(setIndex, 'reps')}
                  onChange={(value) =>
                    actions.updateSet(item.itemId, setIndex, { reps: value })
                  }
                />
              ) : null}
              {item.recordType === 'weight' ? (
                <NumberField
                  item={item}
                  setIndex={setIndex}
                  field="weightKg"
                  label="중량"
                  unit="kg"
                  value={set.weightKg}
                  min={0}
                  step="any"
                  inputMode="decimal"
                  issue={setIssue(setIndex, 'weightKg')}
                  onChange={(value) =>
                    actions.updateSet(item.itemId, setIndex, {
                      weightKg: value,
                    })
                  }
                />
              ) : null}
              {item.recordType === 'time' ? (
                <NumberField
                  item={item}
                  setIndex={setIndex}
                  field="targetSeconds"
                  label="목표 시간"
                  unit="초"
                  value={set.targetSeconds}
                  min={1}
                  max={3600}
                  step="1"
                  inputMode="numeric"
                  issue={setIssue(setIndex, 'targetSeconds')}
                  onChange={(value) =>
                    actions.updateSet(item.itemId, setIndex, {
                      targetSeconds: value,
                    })
                  }
                />
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        aria-label={`${item.name} 세트 추가`}
        disabled={item.sets.length >= MAX_SETS_PER_ITEM}
        onClick={() => actions.addSet(item.itemId)}
        className={`mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50 ${composeSecondaryButton}`}
      >
        ＋ 세트 추가
      </button>
      {item.sets.length >= MAX_SETS_PER_ITEM ? (
        <p className="mt-2 text-support leading-snug font-normal text-muted">
          세트는 한 운동에 {MAX_SETS_PER_ITEM}개까지 추가할 수 있어요.
        </p>
      ) : null}
    </li>
  )
}
