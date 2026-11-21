import {
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router'
import Icon from '../components/icons/Icon.tsx'
import {
  TONES,
  focusRingInsetOf,
  focusRingOf,
  type Tone,
} from './searchTones.ts'

/**
 * 도메인별 검색 화면(운동 탐색 E01 구성을 따르는 음식 탐색 F01 등)이 함께 쓰는 화면 조각.
 * 색은 도메인 토큰(exercise 인디고·meal 오렌지)만 쓰고, Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다.
 * 운동 탐색(ExercisesPage)은 이 모듈을 쓰지 않고 자체 구현을 유지한다(기존 화면 회귀 방지). 통합은 별도 승인 후 한다.
 */
interface SearchHeaderProps {
  tone: Tone
  /** 뒤로가기 목적지. null이면 그리지 않는다. */
  backTo: string | null
  title: string
  description: string
  headingRef: RefObject<HTMLHeadingElement | null>
  /** 설명 아래에 붙는 내용(검색창) */
  children?: ReactNode
}

/**
 * 검색 화면 상단: 뒤로가기 + 제목 + 설명을 한 그룹으로 둔다(handle.bodyBack).
 * 그룹은 flex items-center라 44px 뒤로가기 버튼이 제목+설명 덩어리 전체의 세로 중앙에 놓이고,
 * 아이콘은 버튼 안의 가로·세로 정중앙이다(음수 margin 보정 없음). 왼쪽 여백을 10px(pl-2.5)로 줄여 44px 버튼 안의
 * 아이콘 그림이 20px 기준선 근처(21.5px)에 오고, 아래 검색창은 ml-2.5로 같은 20px 기준선에 맞춘다.
 * -mx-5 -mt-5는 AppShell 본문 여백(20px)을 상쇄해 그라데이션이 화면 맨 위에서 전체 폭으로 시작하게 한다.
 */
export function SearchHeader({
  tone,
  backTo,
  title,
  description,
  headingRef,
  children,
}: SearchHeaderProps) {
  const t = TONES[tone]
  return (
    <header
      className={`-mx-5 -mt-5 bg-linear-to-b ${t.headerFrom} to-page pt-6 pr-5 pb-4 pl-2.5`}
    >
      <div className="flex items-center">
        {backTo ? (
          <Link
            to={backTo}
            aria-label="이전 화면으로 돌아가기"
            className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-full text-content ${t.iconHover} ${focusRingOf(tone)}`}
          >
            <Icon name="arrow-left" size={21} />
          </Link>
        ) : null}
        <div className={`min-w-0 flex-1 ${backTo ? 'ml-1' : 'ml-2.5'}`}>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-app-title leading-snug font-semibold text-content outline-none"
          >
            {title}
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {description}
          </p>
        </div>
      </div>
      {children}
    </header>
  )
}

interface SearchBoxProps {
  tone: Tone
  id: string
  label: string
  placeholder: string
  value: string
  maxLength: number
  onChange: (value: string) => void
}

/**
 * 돋보기 검색창(48px, pill). 테두리는 흰 배경 대비 3:1 이상이 되도록 muted/75를 쓴다(가입 화면 입력창과 같은 조합).
 * text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(placeholder는 본문 크기).
 * 헤더 안에서 쓰며 mt-5 ml-2.5로 설명과의 간격과 20px 왼쪽 기준선을 맞춘다.
 */
export function SearchBox({
  tone,
  id,
  label,
  placeholder,
  value,
  maxLength,
  onChange,
}: SearchBoxProps) {
  return (
    <div role="search" className="mt-5 ml-2.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
        />
        <input
          id={id}
          name="q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-12 w-full rounded-full border border-muted/75 bg-surface pr-4 pl-12 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis hover:border-muted focus-visible:outline-2 focus-visible:-outline-offset-1 motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none ${TONES[tone].inputFocus}`}
        />
      </div>
    </div>
  )
}

interface FilterRowProps {
  tone: Tone
  label: string
  /** 오른쪽에 보이는 현재 값 */
  value: string
  /** 값이 선택된 상태인지(도메인색 굵게) 아니면 기본값("전체" 등)인지(회색) */
  active: boolean
  onOpen: () => void
}

/**
 * 필터 한 행(목록 안). 왼쪽 항목명·오른쪽 선택값·화살표. 누르면 선택 시트를 연다.
 * 값과 화살표는 한 묶음이라 글자를 키워 자리가 모자라면 묶음째 아랫줄로 내려간다(값이 한 글자씩 끊기지 않게).
 */
export function FilterRow({
  tone,
  label,
  value,
  active,
  onOpen,
}: FilterRowProps) {
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(event) => {
          // Safari는 버튼을 눌러도 포커스를 주지 않아, 닫힌 뒤 돌아갈 곳을 직접 정해 둔다.
          event.currentTarget.focus()
          onOpen()
        }}
        className={`flex min-h-14 w-full cursor-pointer flex-wrap items-center gap-x-3 px-4 py-2 text-left hover:bg-page ${focusRingInsetOf(tone)}`}
      >
        <span className="text-body font-semibold text-content">{label}</span>
        <span className="ml-auto flex items-center gap-3">
          <span
            className={`text-right text-body whitespace-nowrap ${active ? `font-semibold ${TONES[tone].text}` : 'font-normal text-muted'}`}
          >
            {value}
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
}

/** 필터 행들을 하나로 묶는 목록(모서리 12px·경계 1px). */
export function FilterList({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {children}
    </ul>
  )
}

/** 방향키·Home·End로 시트 안 선택지 사이의 포커스를 옮긴다(선택은 Enter·Space). */
function moveOptionFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = [
    'ArrowDown',
    'ArrowRight',
    'ArrowUp',
    'ArrowLeft',
    'Home',
    'End',
  ]
  if (!keys.includes(event.key)) return
  const items = [
    ...(event.currentTarget
      .closest('[role="dialog"]')
      ?.querySelectorAll<HTMLElement>('[role="option"]') ?? []),
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

export interface OptionItem {
  /** 선택지를 구분하는 값. null은 "전체"(조건 없음)다. */
  value: string | null
  label: string
}

interface OptionListProps {
  tone: Tone
  /** listbox의 접근 가능한 이름 */
  label: string
  options: readonly OptionItem[]
  /** 지금 선택된 값(null = 전체) */
  selected: string | null
  onSelect: (value: string | null) => void
  /** true이면 내용 폭의 둥근 칩으로 나열하고, 아니면 전체 폭 행으로 쌓는다. */
  chips?: boolean
}

const ALL = '__all__'

/**
 * 시트 안 단일 선택 목록(listbox). 선택은 옅은 도메인색 면·도메인색 테두리와 글자·굵게로 보이고 체크 아이콘은 쓰지 않는다.
 * 선택됨은 aria-selected가 보조기기에 전한다. 방향키는 포커스만 옮기고 Enter·Space로 선택한다(선택하면 시트가 닫히므로 radio 패턴과 다르다).
 * Tab 정지점은 목록에서 하나(선택된 항목)다(roving tabindex).
 */
export function OptionList({
  tone,
  label,
  options,
  selected,
  onSelect,
  chips = false,
}: OptionListProps) {
  const selectedKey = selected ?? ALL
  const [active, setActive] = useState(selectedKey)
  const t = TONES[tone]
  return (
    <div
      role="listbox"
      aria-label={label}
      onKeyDown={moveOptionFocus}
      className={chips ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}
    >
      {options.map((option) => {
        const key = option.value ?? ALL
        const isSelected = selectedKey === key
        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={active === key ? 0 : -1}
            onFocus={() => setActive(key)}
            onClick={() => onSelect(option.value)}
            className={`min-h-12 cursor-pointer border text-body leading-snug transition-colors motion-reduce:transition-none ${focusRingOf(tone)} ${
              chips
                ? 'rounded-full px-4'
                : 'flex w-full items-center rounded-control px-4 text-left'
            } ${
              isSelected
                ? t.selected
                : `border-line bg-surface font-normal text-content ${t.hoverBorder}`
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
