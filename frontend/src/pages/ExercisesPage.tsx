import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SubmitEvent,
} from 'react'

import {
  Link,
  useLocation,
  useMatches,
  useNavigate,
  useSearchParams,
} from 'react-router'

import Icon from '../components/icons/Icon.tsx'

import { getRouteHandle } from '../app/routeHandle.ts'

import BottomSheet from '../components/layout/BottomSheet.tsx'

import { useBackTarget } from '../components/layout/useBackTarget.ts'

import {
  BODY_PART_GROUPS,
  DIFFICULTIES,
  EMPTY_FILTERS,
  FILTER_LABELS,
  MAX_EXERCISE_QUERY,
  TOOLS,
  criteriaSummary,
  criteriaUrl,
  exerciseBackend,
  parseCriteria,
  type ExerciseCriteria,
  type ExerciseSearchOutcome,
  type FilterKey,
} from './exerciseSearch.ts'

import type { ExerciseResult } from './searchTypes.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/**
 * 목록 안 행의 포커스 표시. 윤곽선을 행 안쪽으로 그린다(-outline-offset-2): 목록이 overflow-hidden이라
 * 바깥으로 그리면 좌우가 잘려 위아래 띠로만 보인다. 같은 속성을 두 번 지정하면 어느 쪽이 이길지 알 수 없어 focusRing과 섞지 않는다.
 */
const focusRingInset =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-exercise'

const secondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${focusRing}`

/** 필터 선택 시트의 제목(스토리보드 v5.0의 필터 이름 + "선택"). */

const SHEET_TITLES: Record<FilterKey, string> = {
  difficulty: '난이도 선택',

  part: '운동 부위 선택',

  tool: '운동 도구 선택',
}

/**

 * 시트 안의 선택지 하나(listbox의 option). 선택은 옅은 인디고 면·인디고 테두리·인디고 글자·굵게로 보이고

 * 체크 아이콘은 쓰지 않는다. 선택됨은 aria-selected가 보조기기에 전한다.

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

  /** true이면 내용 폭의 둥근 칩(부위), 아니면 전체 폭 행(난이도·도구) */

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

/** 방향키·Home·End로 시트 안 선택지 사이의 포커스를 옮긴다(선택은 Enter·Space). */

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

interface SheetBodyProps {
  filterKey: FilterKey

  value: string | null

  onSelect: (value: string | null) => void
}

/** "전체"(조건 없음)를 가리키는 선택지 키. 다른 값과 겹치지 않는다. */

const ALL_KEY = '__all__'

/**

 * 필터별 선택지. 선택을 풀려면 "전체"를 고른다.

 * 접근성 패턴은 listbox(단일 선택 목록)다. 방향키는 포커스만 옮기고 선택은 Enter·Space로 하는데, 선택하면 시트가 닫히므로

 * 방향키로 선택까지 하는 radio 패턴과 맞지 않기 때문이다. Tab 정지점은 목록에서 하나(선택된 항목, 없으면 "전체")다.

 * 부위의 상체·하체·코어·전신은 listbox 안의 group이다.

 */

function SheetBody({ filterKey, value, onSelect }: SheetBodyProps) {
  const selectedKey = value ?? ALL_KEY

  const [active, setActive] = useState(selectedKey)

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
            <h3
              id={`exercise-part-group-${index}`}

              className="text-support leading-snug font-semibold text-muted"
            >
              {group.label}
            </h3>

            <div
              role="group"

              aria-labelledby={`exercise-part-group-${index}`}

              className="mt-2 flex flex-wrap gap-2"
            >
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

      className="flex flex-col gap-2"
    >
      {option(ALL_KEY, '전체', false)}

      {options.map((item) => option(item, item, false))}
    </div>
  )
}

/** 결과 한 건. 운동 상세(E02) 화면이 아직 없어서 이동하지 않는 비대화형 카드다. 있는 정보만 보여 준다. */

function ExerciseCard({ item }: { item: ExerciseResult }) {
  const meta = [item.difficulty, item.bodyPart, item.tool].filter(
    (v): v is string => !!v,
  )

  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <p className="text-section-title leading-snug font-semibold text-content">
        {item.name}
      </p>

      {meta.length > 0 ? (
        <p className="mt-2 text-support leading-snug font-normal text-exercise">
          {meta.join(' · ')}
        </p>
      ) : null}
    </li>
  )
}

const noticePanel = 'rounded-card bg-surface px-5 py-6 text-center'

interface ResultViewProps {
  outcome: ExerciseSearchOutcome | 'loading'

  onRetry: () => void

  onResetFilters: () => void

  onBeginner: () => void
}

/** 결과 영역. 준비 중·오류·결과 없음·결과를 서로 다른 화면으로 보여 준다. */

function ResultView({
  outcome,

  onRetry,

  onResetFilters,

  onBeginner,
}: ResultViewProps) {
  if (outcome === 'loading') {
    return (
      <p
        role="status"

        className="py-10 text-center text-body font-normal text-muted"
      >
        운동을 찾는 중이에요…
      </p>
    )
  }

  if (outcome.status === 'unavailable') {
    return (
      <div role="status" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          운동 검색을 준비하고 있어요
        </p>

        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          운동 데이터가 아직 연결되지 않아 결과를 보여 드릴 수 없어요. 조건은
          그대로 두었으니 연결되면 바로 찾을 수 있어요.
        </p>
      </div>
    )
  }

  if (outcome.status === 'error') {
    return (
      <div role="alert" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          운동을 불러오지 못했어요
        </p>

        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          입력한 조건은 그대로예요. 잠시 후 다시 시도해 주세요.
        </p>

        <button
          type="button"

          onClick={onRetry}

          className={`mx-auto mt-5 ${secondaryButton}`}
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (outcome.items.length === 0) {
    return (
      <div role="status" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          이 조건의 운동이 없어요.
        </p>

        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          조건을 줄이거나 처음이라면 초급·맨몸 운동부터 찾아보세요.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"

            onClick={onResetFilters}

            className={secondaryButton}
          >
            조건 초기화
          </button>

          <button
            type="button"

            onClick={onBeginner}

            className={secondaryButton}
          >
            초급 · 맨몸 보기
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="text-body font-normal text-muted">
        선택한 조건에 맞는 운동{' '}
        <strong className="font-semibold text-content">
          {outcome.items.length}개
        </strong>
        를 찾았어요.
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {outcome.items.map((item) => (
          <ExerciseCard key={item.id} item={item} />
        ))}
      </ul>
    </>
  )
}

/** 두 화면 공통의 상단 영역: 운동 도메인 아이콘 + 제목 + 한 줄 안내. 아래에 children(검색창)을 붙인다. */

function Header({
  backTo,
  title,
  description,
  headingRef,
  children,
}: {
  /** 뒤로가기 목적지. null이면 그리지 않는다. */
  backTo: string | null
  title: string
  description: string
  headingRef: RefObject<HTMLHeadingElement | null>
  children?: ReactNode
}) {
  return (
    <header className="-mx-5 -mt-5 bg-linear-to-b from-exercise-soft to-page pt-6 pr-5 pb-4 pl-2.5">
      {/*
        뒤로가기 + 제목 + 설명을 한 그룹으로 둔다(handle.bodyBack, 안 A). 그룹은 flex items-center라 44px 뒤로가기 버튼이
        제목+설명 덩어리 전체의 세로 중앙에 놓이고, 아이콘은 버튼 안에서 가로·세로 정중앙이다(음수 margin 보정 없음).
        왼쪽 여백을 10px(pl-2.5)로 줄여 44px 버튼 안의 아이콘 그림이 20px 기준선 근처(21.5px)에 오고,
        아래 검색창은 ml-2.5로 같은 20px 기준선에 맞춘다.
      */}
      <div className="flex items-center">
        {backTo ? (
          <Link
            to={backTo}
            aria-label="이전 화면으로 돌아가기"
            className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-full text-content hover:bg-exercise/10 ${focusRing}`}
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

/**

 * E01 운동 탐색. 문구·구성은 화면명세 v5.0 E01과 스토리보드 v5.0을 따른다.

 *

 * 검색 전과 검색 결과를 별도 화면 상태로 나눈다. 검색 전에는 결과 목록을 보여 주지 않는다.

 * - 검색 전: 운동 검색창, 선택 초기화가 있는 "검색 조건"(난이도·운동 부위·운동 도구), 전체 너비 "검색하기".

 *   조건 행을 누르면 아래에서 바텀시트가 올라와 단일 선택하고, 고르면 바로 반영하며 닫힌다(화면 안에서 펼치지 않는다).

 * - 결과: 조건 요약과 "조건 수정", 결과(준비 중·오류·결과 없음·목록). 조건 수정으로 돌아가면 입력값과 선택값이 그대로다.

 * 조건과 화면 상태는 주소(?q=&difficulty=&part=&tool=&view=results)에 둔다(스토리보드 data: 조건과 위치를 URL에 보관).

 * 시트를 여닫는 것은 주소를 바꾸지 않으며, 시트가 열린 채 주소가 바뀌면(뒤로가기 등) 닫힌다.

 *

 * 운동 검색 API·데이터가 없어서(exerciseBackend) 검색하기를 누르면 "준비 중" 상태가 나온다. 가짜 운동은 만들지 않는다.

 * 결과 카드의 "방법 보기"는 운동 상세(E02) 화면과 경로가 없어 두지 않았다.

 */

export default function ExercisesPage() {
  const [params] = useSearchParams()

  const navigate = useNavigate()

  const location = useLocation()

  const matches = useMatches()

  const backTo = useBackTarget(
    getRouteHandle(matches.at(-1)?.handle).parent ?? null,
  )

  const { criteria: applied, showResults } = parseCriteria(params)

  const paramsKey = params.toString()

  // 검색 전 화면의 입력값. 주소가 바뀌면(조건 수정·뒤로가기 등) 그 조건으로 맞춘다.

  const [form, setForm] = useState<ExerciseCriteria>(applied)

  const [syncedKey, setSyncedKey] = useState(paramsKey)

  if (syncedKey !== paramsKey) {
    setSyncedKey(paramsKey)

    setForm(applied)
  }

  // 열려 있는 필터 시트. 어느 주소에서 열었는지 함께 기억해, 주소가 바뀌면(뒤로가기 등) 닫고 다시 돌아와도 열리지 않게 비운다.

  const [sheet, setSheet] = useState<{ key: FilterKey; at: string } | null>(
    null,
  )

  if (sheet && sheet.at !== paramsKey) setSheet(null)

  // 시트에서 이미 하나를 골랐는지(같은 순간의 연속 선택 방지). 시트를 열 때마다 비운다.

  const chosen = useRef(false)

  const openSheet = sheet && sheet.at === paramsKey ? sheet.key : null

  // 검색 전 ↔ 결과 전환 시 새 화면의 제목으로 포커스를 옮겨 보조기기가 전환을 알 수 있게 한다(첫 표시에는 옮기지 않는다).

  const headingRef = useRef<HTMLHeadingElement>(null)

  const previousView = useRef(showResults)

  useEffect(() => {
    if (previousView.current !== showResults) headingRef.current?.focus()

    previousView.current = showResults
  }, [showResults])

  // 검색 실행. 결과는 어떤 검색의 것인지(key)와 함께 저장해, 현재 검색의 결과가 아직 없으면 "검색 중"으로 파생한다.

  const [attempt, setAttempt] = useState(0)

  const searchKey = `${paramsKey}|${attempt}`

  const [result, setResult] = useState<{
    key: string

    outcome: ExerciseSearchOutcome
  } | null>(null)

  useEffect(() => {
    if (!showResults) return

    let cancelled = false

    Promise.resolve()

      .then(() => exerciseBackend.search(applied))

      .then((outcome) => {
        if (!cancelled) setResult({ key: searchKey, outcome })
      })

      .catch(() => {
        if (!cancelled)
          setResult({ key: searchKey, outcome: { status: 'error' } })
      })

    return () => {
      cancelled = true
    }

    // applied는 paramsKey에서 파생되므로 searchKey(paramsKey 포함)가 의존성을 대신한다.

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults, searchKey])

  const outcome: ExerciseSearchOutcome | 'loading' =
    result?.key === searchKey ? result.outcome : 'loading'

  function search(criteria: ExerciseCriteria) {
    const url = criteriaUrl(criteria, true)

    // 이미 같은 조건의 결과 화면이면 기록만 쌓이므로 이동하지 않고 다시 검색만 한다.

    if (url === `${location.pathname}${location.search}`) {
      setAttempt((n) => n + 1)

      return
    }

    void navigate(url)
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    search(form)
  }

  function setFilter(key: FilterKey, value: string | null) {
    setForm((current) => ({
      ...current,

      filters: { ...current.filters, [key]: value },
    }))
  }

  if (showResults) {
    return (
      <div className="flex flex-col gap-5 pb-6 break-keep wrap-anywhere">
        <Header
          backTo={backTo}

          title="운동 검색 결과"

          description="입력한 조건으로 찾은 운동이에요."

          headingRef={headingRef}
        />

        <section
          aria-label="검색한 조건"

          className="flex items-start justify-between gap-3"
        >
          <ul className="flex min-w-0 flex-wrap gap-2">
            {criteriaSummary(applied).map((label) => (
              <li
                key={label}

                className="rounded-full border border-exercise/20 bg-exercise-soft px-3 py-1 text-support leading-snug font-normal text-exercise"
              >
                {label}
              </li>
            ))}
          </ul>

          <Link
            to={criteriaUrl(applied, false)}

            className={`flex min-h-11 shrink-0 items-center px-1 text-body font-semibold text-exercise ${focusRing}`}
          >
            조건 수정
          </Link>
        </section>

        <section aria-label="검색 결과">
          <ResultView
            outcome={outcome}

            onRetry={() => setAttempt((n) => n + 1)}

            onResetFilters={() =>
              search({ query: applied.query, filters: EMPTY_FILTERS })
            }

            onBeginner={() =>
              search({
                query: applied.query,

                filters: { difficulty: '초급', part: null, tool: '맨몸' },
              })
            }
          />
        </section>
      </div>
    )
  }

  return (
    <div className="pb-6 break-keep wrap-anywhere">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <Header
          backTo={backTo}

          title="나에게 맞는 운동 찾기"

          description="운동 이름과 조건으로 원하는 운동을 찾아보세요."

          headingRef={headingRef}
        >
          <div role="search" className="mt-5 ml-2.5">
            <label htmlFor="exercise-query" className="sr-only">
              운동 검색
            </label>

            <div className="relative">
              <Icon
                name="search"

                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
              />

              {/* text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(placeholder는 본문 크기). */}

              <input
                id="exercise-query"

                name="q"

                type="search"

                autoComplete="off"

                spellCheck={false}

                maxLength={MAX_EXERCISE_QUERY}

                placeholder="운동 이름을 검색해 보세요"

                value={form.query}

                onChange={(event) =>
                  setForm((current) => ({
                    ...current,

                    query: event.target.value,
                  }))
                }

                className="h-12 w-full rounded-full border border-muted/75 bg-surface pr-4 pl-12 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis hover:border-muted focus-visible:border-exercise focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-exercise motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none"
              />
            </div>
          </div>
        </Header>

        <section aria-labelledby="exercise-conditions">
          <div className="mb-0.5 flex items-center justify-between">
            <h3
              id="exercise-conditions"

              className="text-section-title leading-snug font-semibold text-content"
            >
              검색 조건
            </h3>

            <button
              type="button"

              onClick={() =>
                setForm((current) => ({ ...current, filters: EMPTY_FILTERS }))
              }

              className={`-mr-2 flex min-h-11 cursor-pointer items-center px-2 text-support font-normal text-muted hover:text-content ${focusRing}`}
            >
              선택 초기화
            </button>
          </div>

          {/* 세 조건은 한 목록으로 묶고 같은 규칙(행 높이·좌우 여백·화살표 위치)을 쓴다. 누르면 아래에서 선택 시트가 올라온다. */}

          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {(['difficulty', 'part', 'tool'] as const).map((key) => {
              const value = form.filters[key]

              return (
                <li key={key}>
                  <button
                    type="button"

                    aria-haspopup="dialog"

                    onClick={(event) => {
                      // Safari는 버튼을 눌러도 포커스를 주지 않아, 닫힌 뒤 돌아갈 곳을 직접 정해 둔다.

                      event.currentTarget.focus()

                      chosen.current = false

                      setSheet({ key, at: paramsKey })
                    }}

                    className={`flex min-h-14 w-full cursor-pointer flex-wrap items-center gap-x-3 px-4 py-2 text-left hover:bg-page ${focusRingInset}`}
                  >
                    <span className="text-body font-semibold text-content">
                      {FILTER_LABELS[key]}
                    </span>

                    {/* 값과 화살표는 한 묶음이라 글자를 키워 자리가 모자라면 묶음째 아랫줄로 내려간다(값이 한 글자씩 끊기지 않게). */}

                    <span className="ml-auto flex items-center gap-3">
                      <span
                        className={`text-right text-body whitespace-nowrap ${value ? 'font-semibold text-exercise' : 'font-normal text-muted'}`}
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
            type="button"

            onClick={() =>
              search({
                query: form.query,

                filters: { difficulty: '초급', part: null, tool: '맨몸' },
              })
            }

            className={`mt-1 flex min-h-11 cursor-pointer items-center gap-1 text-body font-normal text-muted hover:text-content ${focusRing}`}
          >
            처음이라면
            <span className="font-semibold text-exercise">
              초급 · 맨몸 바로 보기
            </span>
            <Icon name="arrow-right" size={18} className="text-exercise" />
          </button>
        </section>

        <div className="mt-3">
          <button
            type="submit"

            className={`flex min-h-13 w-full cursor-pointer items-center justify-center rounded-control bg-exercise text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 motion-reduce:transition-none ${focusRing}`}
          >
            검색하기
          </button>

          {exerciseBackend.connected ? null : (
            <p className="mt-3 text-center text-support leading-relaxed font-normal text-muted">
              운동 데이터 연결 전이라 결과는 준비 중이에요.
            </p>
          )}
        </div>
      </form>

      {openSheet ? (
        <BottomSheet
          title={SHEET_TITLES[openSheet]}

          onClose={() => setSheet(null)}
        >
          {(close, closing) => (
            <SheetBody
              filterKey={openSheet}

              value={form.filters[openSheet]}

              onSelect={(value) => {
                // 닫히는 중에 한 번 더 눌러도 처음 선택을 바꾸지 않는다.

                if (closing || chosen.current) return

                chosen.current = true

                setFilter(openSheet, value)

                close()
              }}
            />
          )}
        </BottomSheet>
      ) : null}
    </div>
  )
}
