import { useState, type KeyboardEvent } from 'react'
import {
  BODY_PART_GROUPS,
  DIFFICULTIES,
  TOOLS,
} from '../../exercise/exerciseTaxonomy.ts'
import {
  FILTER_LABELS,
  type FilterKey,
} from '../../exercise/exerciseFilters.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/** "전체"(조건 없음)를 가리키는 선택지 키. 다른 값과 겹치지 않는다. */
const ALL_KEY = '__all__'

/**
 * 선택지 하나(listbox의 option). 선택은 옅은 인디고 면·인디고 테두리·인디고 글자·굵게로 보이고 체크 아이콘은 쓰지 않는다.
 * 선택됨은 색만이 아니라 글자 굵기와 테두리로도 달라지고 aria-selected가 보조기기에 전한다.
 * 목록 전체가 Tab 정지점 하나다(roving tabindex): tabStop인 항목만 tabIndex 0이고 나머지는 방향키로 옮긴다.
 */
function Option({
  label,
  selected,
  tabStop,
  onSelect,
  onActive,
  chip = false,
}: {
  label: string
  selected: boolean
  /** 목록에서 Tab으로 들어올 때 포커스를 받는 항목인지 */
  tabStop: boolean
  onSelect: () => void
  /** 포커스를 받으면 알린다(roving tabindex 위치 갱신) */
  onActive: () => void
  /** true이면 내용 폭의 둥근 칩, 아니면 전체 폭 행 */
  chip?: boolean
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={tabStop ? 0 : -1}
      onFocus={onActive}
      onClick={onSelect}
      className={`min-h-12 cursor-pointer border text-body leading-snug transition-colors motion-reduce:transition-none ${focusRing} ${
        chip
          ? 'rounded-full px-4'
          : 'flex w-full items-center rounded-control px-4 text-left'
      } ${
        selected
          ? 'border-exercise bg-exercise-soft font-semibold text-exercise'
          : 'border-line bg-surface font-normal text-content hover:border-exercise/50'
      }`}
    >
      {label}
    </button>
  )
}

/** 방향키·Home·End로 같은 목록 안 선택지 사이의 포커스를 옮긴다(선택은 Enter·Space). 목록(listbox)마다 따로 움직인다. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = [
    'ArrowDown',
    'ArrowRight',
    'ArrowUp',
    'ArrowLeft',
    'Home',
    'End',
  ]
  if (!keys.includes(event.key)) return

  // currentTarget은 이 핸들러가 붙은 listbox다. 한 시트에 목록이 여럿이어도 다른 목록으로 넘어가지 않는다.
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'),
  ]
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return

  event.preventDefault()
  const last = items.length - 1
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? Math.min(index + 1, last)
          : Math.max(index - 1, 0)
  items[next].focus()
}

interface FilterListboxProps {
  filterKey: FilterKey
  value: string | null
  onSelect: (value: string | null) => void
  /**
   * true이면 한 시트 안에 여러 필터를 나란히 보여 주는 배치다: 난이도·도구도 칩으로 줄바꿈해 세로 길이를 줄인다.
   * 기본(false)은 필터 하나를 고르는 선택 시트의 배치(난이도·도구는 전체 폭 행)다. 선택 규칙은 두 배치가 같다.
   */
  inline?: boolean
}

/**
 * 필터별 선택지. 선택을 풀려면 "전체"를 고른다. 운동 부위는 큰 분류(상체·하체·코어·전신) 전체와 세부 부위를 고를 수 있다.
 * 접근성 패턴은 listbox(단일 선택 목록)다. 방향키는 포커스만 옮기고 선택은 Enter·Space로 한다. Tab 정지점은 목록에서 하나
 * (선택된 항목, 없으면 "전체")다. 부위의 큰 분류는 listbox 안의 group이다.
 * 검색 전 화면의 선택 시트와 결과 화면의 조건 수정 시트가 같은 선택지·규칙을 쓰도록 한곳에 둔다.
 */
export default function FilterListbox({
  filterKey,
  value,
  onSelect,
  inline = false,
}: FilterListboxProps) {
  const selectedKey = value ?? ALL_KEY
  const [active, setActive] = useState(selectedKey)
  // 값이 밖에서 바뀌면(초기화 등) Tab 정지점도 선택된 항목으로 옮긴다.
  const [seenKey, setSeenKey] = useState(selectedKey)
  if (seenKey !== selectedKey) {
    setSeenKey(selectedKey)
    setActive(selectedKey)
  }

  const option = (key: string, label: string, chip: boolean) => (
    <Option
      key={key}
      label={label}
      chip={chip}
      selected={selectedKey === key}
      tabStop={active === key}
      onActive={() => setActive(key)}
      onSelect={() => onSelect(key === ALL_KEY ? null : key)}
    />
  )

  if (filterKey === 'part') {
    return (
      <div
        role="listbox"
        aria-label={FILTER_LABELS.part}
        onKeyDown={moveFocus}
        className="flex flex-col gap-5"
      >
        <div>{option(ALL_KEY, '전체', true)}</div>
        {BODY_PART_GROUPS.map((group, index) => (
          <section key={group.label}>
            <p
              id={`exercise-part-group-${inline ? 'edit-' : ''}${index}`}
              className="text-support leading-snug font-semibold text-muted"
            >
              {group.label}
            </p>
            <div
              role="group"
              aria-labelledby={`exercise-part-group-${inline ? 'edit-' : ''}${index}`}
              className="mt-2 flex flex-wrap gap-2"
            >
              {option(group.label, `${group.label} 전체`, true)}
              {group.parts.map((part) => option(part, part, true))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  const options = filterKey === 'difficulty' ? DIFFICULTIES : TOOLS

  return (
    <div
      role="listbox"
      aria-label={FILTER_LABELS[filterKey]}
      onKeyDown={moveFocus}
      className={inline ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}
    >
      {option(ALL_KEY, '전체', inline)}
      {options.map((item) => option(item, item, inline))}
    </div>
  )
}
