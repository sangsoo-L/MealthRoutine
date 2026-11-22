import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import Icon from '../components/icons/Icon.tsx'
import type { ExerciseResult } from '../exercise/exerciseTypes.ts'
import { EXPLORE_KEYWORD_GROUPS } from './exploreContent.ts'
import { useRecentSearches } from './recentSearches.ts'
import { searchBackend } from './searchBackend.ts'
import type {
  FoodResult,
  SearchCategory,
  SearchOutcome,
} from './searchTypes.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** 검색어 최대 길이(입력창 maxLength와 같다) */
const MAX_QUERY = 50

/** 마우스·키보드 같은 정밀 포인터인지. 터치 기기에서는 입력창에 포커스를 주면 키보드가 열려 방해가 된다. */
function hasFinePointer(): boolean {
  return window.matchMedia('(pointer: fine)').matches
}

/** 전체 탭에서 분야마다 먼저 보여 주는 결과 수. 더 있으면 "더 보기"로 해당 분야 탭으로 간다. */
const PREVIEW_COUNT = 3

const CATEGORIES: ReadonlyArray<{ key: SearchCategory; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'exercise', label: '운동' },
  { key: 'food', label: '음식' },
]

function readCategory(value: string | null): SearchCategory {
  return value === 'exercise' || value === 'food' ? value : 'all'
}

/** 검색 주소. 검색어가 없으면 초기 화면(/search)이다. */
function searchUrl(query: string, category: SearchCategory): string {
  if (!query) return '/search'
  const params = new URLSearchParams({ q: query })
  if (category !== 'all') params.set('c', category)
  return `/search?${params.toString()}`
}

// 추천 검색어(탐색 화면과 같은 시안용 예시). 운동은 exercise, 식단 키워드는 음식 검색(food)으로 보낸다.
const GROUP_STYLE = {
  exercise: {
    category: 'exercise' as const,
    label: 'text-exercise',
    chip: 'border-exercise/20 bg-exercise-soft text-exercise hover:border-exercise/50',
  },
  meal: {
    category: 'food' as const,
    label: 'text-meal',
    chip: 'border-meal/20 bg-meal-soft text-meal hover:border-meal/50',
  },
}

interface ResultSectionProps {
  title: string
  toneClass: string
  count: number
  children: ReactNode
  /** 전체 탭의 "더 보기". 없으면 그리지 않는다. */
  onMore?: () => void
}

function ResultSection({
  title,
  toneClass,
  count,
  children,
  onMore,
}: ResultSectionProps) {
  return (
    <section aria-label={`${title} 결과`}>
      <h2
        className={`text-section-title leading-snug font-semibold ${toneClass}`}
      >
        {title} <span className="font-normal">{count}건</span>
      </h2>
      <ul className="mt-3 flex flex-col gap-2">{children}</ul>
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          className={`mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-body font-semibold text-content hover:border-muted ${focusRing}`}
        >
          {title} 결과 더 보기
        </button>
      ) : null}
    </section>
  )
}

/**
 * 결과 항목. `to`가 있으면 행 전체가 상세 진입 링크다(운동: `/exercises/<운동 id>`, 운동 상세 E02).
 * 어느 검색에서 왔는지(`from`)를 함께 넘겨 상세의 "이전"이 같은 검색어·범위의 결과로 돌아오게 한다.
 * `to`가 없으면(음식: 상세 화면과 데이터 없음) 이동하지 않는 비대화형 행이다.
 */
function ResultRow({
  name,
  meta,
  to,
  from,
}: {
  name: string
  meta: string[]
  to?: string
  from?: string
}) {
  const body = (
    <>
      <span className="block text-body leading-snug font-semibold text-content">
        {name}
      </span>
      {meta.length > 0 ? (
        <span className="mt-1 block text-support leading-snug font-normal text-muted">
          {meta.join(' · ')}
        </span>
      ) : null}
    </>
  )

  if (!to) {
    return (
      <li className="rounded-card border border-line bg-surface px-4 py-3">
        {body}
      </li>
    )
  }
  return (
    <li>
      <Link
        to={to}
        state={{ from }}
        className={`flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-exercise/40 motion-reduce:transition-none ${focusRing}`}
      >
        <span className="min-w-0">{body}</span>
        <Icon name="chevron-right" size={18} className="shrink-0 text-muted" />
      </Link>
    </li>
  )
}

function exerciseMeta(item: ExerciseResult): string[] {
  return [
    item.bodyParts.join('·'),
    item.difficulty,
    item.tools.join('·'),
  ].filter((v): v is string => !!v)
}

function foodMeta(item: FoodResult): string[] {
  return item.nutrition ? [item.nutrition] : []
}

const noticePanel = 'rounded-card bg-page px-5 py-6 text-center'

interface OutcomeViewProps {
  query: string
  category: SearchCategory
  /** 결과 행의 상세 진입이 "이전"으로 돌아올 현재 검색 주소 */
  from: string
  outcome: SearchOutcome | 'loading'
  onRetry(): void
  onCategory(category: SearchCategory): void
}

/** 검색어가 있을 때의 결과 영역. 상태마다 서로 다른 화면을 보여 준다(미연결·오류·결과 없음을 섞지 않는다). */
function OutcomeView({
  query,
  category,
  from,
  outcome,
  onRetry,
  onCategory,
}: OutcomeViewProps) {
  if (outcome === 'loading') {
    return (
      <p
        role="status"
        className="py-10 text-center text-body font-normal text-muted"
      >
        검색하는 중이에요…
      </p>
    )
  }

  if (outcome.status === 'unavailable') {
    return (
      <div role="status" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          검색 서비스를 준비하고 있어요
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {category === 'exercise'
            ? '운동'
            : category === 'food'
              ? '음식'
              : '운동·음식'}{' '}
          데이터가 아직 연결되지 않아 ‘{query}’ 결과를 보여 드릴 수 없어요.
          검색어 문제는 아니에요.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/exercises"
            state={{ from: '/search' }}
            className={`flex min-h-11 items-center rounded-full border border-exercise/20 bg-exercise-soft px-4 text-body font-semibold text-exercise ${focusRing}`}
          >
            운동 찾기
          </Link>
          <Link
            to="/foods"
            state={{ from: '/search' }}
            className={`flex min-h-11 items-center rounded-full border border-meal/20 bg-meal-soft px-4 text-body font-semibold text-meal ${focusRing}`}
          >
            음식 찾기
          </Link>
        </div>
      </div>
    )
  }

  if (outcome.status === 'error') {
    return (
      <div role="alert" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          검색 중 문제가 생겼어요
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`mt-5 min-h-11 cursor-pointer rounded-control border border-brand bg-surface px-5 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`}
        >
          다시 시도
        </button>
      </div>
    )
  }

  const showExercises = category !== 'food'
  const showFoods = category !== 'exercise'
  const exercises = showExercises ? outcome.exercises : []
  const foods = showFoods ? outcome.foods : []
  // 데이터 소스가 없어 검색하지 못한 음식은 "결과 0건"이 아니다. 결과 없음과 섞지 않고 따로 안내한다.
  const foodUnavailable = showFoods && !!outcome.unavailable?.includes('food')
  const foodNote = foodUnavailable ? (
    <p
      role="status"
      className="rounded-card bg-page px-4 py-3 text-support leading-relaxed font-normal text-muted"
    >
      음식 검색은 아직 준비 중이에요. 지금은 운동만 찾아 드려요.
    </p>
  ) : null

  if (exercises.length === 0 && foods.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div role="status" className={noticePanel}>
          <p className="text-section-title leading-snug font-semibold text-content">
            {foodUnavailable
              ? '운동 검색 결과가 없어요.'
              : '검색 결과가 없어요.'}
          </p>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            검색어를 다시 확인하거나 다른 단어로 검색해 보세요.
          </p>
        </div>
        {foodNote}
      </div>
    )
  }

  const preview = category === 'all'
  const shownExercises = preview ? exercises.slice(0, PREVIEW_COUNT) : exercises
  const shownFoods = preview ? foods.slice(0, PREVIEW_COUNT) : foods

  return (
    <div className="flex flex-col gap-8">
      {exercises.length > 0 ? (
        <ResultSection
          title="운동"
          toneClass="text-exercise"
          count={exercises.length}
          onMore={
            preview && exercises.length > PREVIEW_COUNT
              ? () => onCategory('exercise')
              : undefined
          }
        >
          {shownExercises.map((item) => (
            <ResultRow
              key={item.id}
              name={item.name}
              meta={exerciseMeta(item)}
              to={`/exercises/${item.id}`}
              from={from}
            />
          ))}
        </ResultSection>
      ) : null}
      {foods.length > 0 ? (
        <ResultSection
          title="음식"
          toneClass="text-meal"
          count={foods.length}
          onMore={
            preview && foods.length > PREVIEW_COUNT
              ? () => onCategory('food')
              : undefined
          }
        >
          {shownFoods.map((item) => (
            <ResultRow key={item.id} name={item.name} meta={foodMeta(item)} />
          ))}
        </ResultSection>
      ) : null}
      {foodNote}
    </div>
  )
}

/**
 * 통합검색(`/search`). 탐색 화면의 검색창에서 들어온다. 화면명세 v5.0에 없는 화면이라 화면 ID가 없다.
 *
 * 검색어·범위는 URL(?q=&c=)이 가진다: 새로고침·뒤로가기에서 같은 화면이 복원되고 추천 검색어가 주소만으로 검색을 시작한다.
 * 첫 검색은 history에 쌓고(뒤로가기 → 검색 초기 화면), 이어지는 검색·범위 변경은 대체해 뒤로가기가 검색 화면을 벗어나게 한다.
 * 검색어가 없으면 최근 검색어·추천 검색어, 있으면 범위 탭과 결과를 보여 준다.
 * 검색은 searchBackend가 맡는다: 운동은 운동 탐색(E01)과 같은 운동 데이터 경계를 재사용한다(개발 서버: Mock 운동, 운영 빌드: 미연결 "준비 중").
 * 음식은 검색 데이터가 없어 항상 미연결이며, 전체 범위에서는 운동 결과와 함께 "음식 검색은 준비 중"을 따로 안내한다. 가짜 결과는 만들지 않는다.
 * 운동 결과를 누르면 운동 상세(`/exercises/<id>`, E02)로 이동하고, 상세의 "이전"은 같은 검색어·범위의 결과로 돌아온다.
 * 하단 탭은 그리지 않는다(키보드가 열리는 화면). 뒤로가기는 이 화면의 헤더가 맡는다(handle.bodyBack).
 */
export default function SearchPage() {
  const [params] = useSearchParams()
  // 주소로 직접 들어와도 입력창과 같은 50자까지만 쓴다.
  const query = (params.get('q') ?? '').trim().slice(0, MAX_QUERY)
  const category = readCategory(params.get('c'))
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const recent = useRecentSearches(user?.id ?? 'guest')
  const inputRef = useRef<HTMLInputElement>(null)

  // 입력창 값. 주소의 검색어가 바뀌면(뒤로가기 등) 입력창도 그 값으로 맞춘다.
  const [text, setText] = useState(query)
  const [syncedQuery, setSyncedQuery] = useState(query)
  if (syncedQuery !== query) {
    setSyncedQuery(query)
    setText(query)
  }

  // 진입하면 입력창에 포커스한다. 검색어를 들고 들어온 경우(추천 검색어 등)에는 키보드를 열지 않는다.
  useEffect(() => {
    if (!query) inputRef.current?.focus()
    // 진입 시 한 번만 판단한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 검색 실행. 결과는 어떤 검색의 것인지(key)와 함께 저장해, 현재 검색의 결과가 아직 없으면 "검색 중"으로 파생한다.
  const [attempt, setAttempt] = useState(0)
  const searchKey = `${query}|${category}|${attempt}`
  const [result, setResult] = useState<{
    key: string
    outcome: SearchOutcome
  } | null>(null)
  useEffect(() => {
    if (!query) return
    let cancelled = false
    searchBackend
      .search(query, category)
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
  }, [query, category, searchKey])
  const outcome: SearchOutcome | 'loading' =
    result?.key === searchKey ? result.outcome : 'loading'

  // "다시 시도"를 누르면 그 버튼이 "검색하는 중" 안내로 바뀌며 사라져 포커스가 body로 빠진다. 결과 영역은 조회 중·결과·실패 화면에서도 그대로
  // 남으므로, 재시도 직후 이 영역으로 포커스를 옮겨 이어서 Tab으로 새 결과나 새 "다시 시도" 버튼에 닿게 한다.
  // attempt는 재시도 버튼에서만 오른다. 이 화면 안에서만 다루며 전역 포커스 관리는 아니다.
  const resultsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (attempt > 0) resultsRef.current?.focus()
  }, [attempt])

  /** 검색을 실행한다(앞뒤 공백 제거, 빈 검색어 무시, 최근 검색어 저장). */
  function runSearch(raw: string, nextCategory: SearchCategory = category) {
    const trimmed = raw.trim()
    if (!trimmed) return
    recent.add(trimmed)
    setText(trimmed)
    // 첫 검색은 쌓고, 검색 화면 안의 이어지는 검색은 대체한다.
    void navigate(searchUrl(trimmed, nextCategory), { replace: query !== '' })
    // 터치 기기에서만 키보드를 닫는다. 키보드·스크린리더 사용자는 포커스가 body로 빠지지 않게 입력창에 둔다.
    if (hasFinePointer()) inputRef.current?.focus()
    else inputRef.current?.blur()
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    runSearch(text)
  }

  function changeCategory(next: SearchCategory) {
    if (next === category) return
    void navigate(searchUrl(query, next), { replace: true })
    // "더 보기"를 누르면 그 버튼이 사라지므로 포커스를 해당 범위 탭으로 옮긴다.
    requestAnimationFrame(() =>
      document.getElementById(`search-cat-${next}`)?.focus(),
    )
  }

  function handleBack() {
    // 앱 안에서 들어왔으면 이전 화면으로, 주소로 직접 열었으면 탐색으로 간다.
    if (location.key === 'default') void navigate('/explore')
    else void navigate(-1)
  }

  function clearText() {
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="-mx-5 -my-5 min-h-screen bg-surface break-keep wrap-anywhere">
      <h1 className="sr-only">통합검색</h1>
      <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-surface py-2 pr-4 pl-1">
        <button
          type="button"
          onClick={handleBack}
          aria-label="이전 화면으로 돌아가기"
          className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-content hover:bg-page ${focusRing}`}
        >
          <Icon name="arrow-left" />
        </button>
        <form
          role="search"
          onSubmit={handleSubmit}
          className="relative min-w-0 flex-1"
        >
          <label htmlFor="search-input" className="sr-only">
            운동명 또는 음식명 검색
          </label>
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          {/* text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(placeholder는 본문 크기). */}
          <input
            ref={inputRef}
            id="search-input"
            name="q"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={MAX_QUERY}
            placeholder="운동명 또는 음식명 검색"
            value={text}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setText(event.target.value)
            }
            className="h-11 w-full rounded-full border border-transparent bg-page pr-11 pl-10 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis focus-visible:border-brand focus-visible:bg-surface focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text ? (
            <button
              type="button"
              onClick={clearText}
              aria-label="검색어 지우기"
              className={`absolute top-1/2 right-0 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted hover:text-content ${focusRing}`}
            >
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </form>
      </header>

      <div className="px-5 pt-5 pb-8">
        {query ? (
          <>
            <div
              role="group"
              aria-label="검색 범위"
              className="flex flex-wrap gap-2"
            >
              {CATEGORIES.map((item) => {
                const active = item.key === category
                return (
                  <button
                    key={item.key}
                    id={`search-cat-${item.key}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeCategory(item.key)}
                    className={`min-h-11 min-w-16 cursor-pointer rounded-full border px-4 text-body transition-colors motion-reduce:transition-none ${focusRing} ${
                      active
                        ? 'border-brand bg-brand font-semibold text-surface'
                        : 'border-line bg-surface font-normal text-content hover:border-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            <div
              ref={resultsRef}
              tabIndex={-1}
              role="region"
              aria-label="검색 결과"
              className="mt-6 outline-none"
            >
              <OutcomeView
                query={query}
                category={category}
                from={`${location.pathname}${location.search}`}
                outcome={outcome}
                onRetry={() => setAttempt((n) => n + 1)}
                onCategory={changeCategory}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-8">
            {recent.items.length > 0 ? (
              <section aria-labelledby="recent-title">
                <div className="flex items-center justify-between">
                  <h2
                    id="recent-title"
                    className="text-section-title leading-snug font-semibold text-content"
                  >
                    최근 검색어
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      recent.clear()
                      if (hasFinePointer()) inputRef.current?.focus()
                    }}
                    className={`flex min-h-11 cursor-pointer items-center px-1 text-support font-normal text-muted hover:text-content ${focusRing}`}
                  >
                    전체 삭제
                  </button>
                </div>
                <ul>
                  {recent.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-center border-b border-line last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => runSearch(item)}
                        className={`min-h-11 min-w-0 flex-1 cursor-pointer truncate text-left text-body font-normal text-content ${focusRing}`}
                      >
                        {item}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          recent.remove(item)
                          if (hasFinePointer()) inputRef.current?.focus()
                        }}
                        aria-label={`${item} 삭제`}
                        className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:text-content ${focusRing}`}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="suggest-title">
              <h2
                id="suggest-title"
                className="text-section-title leading-snug font-semibold text-content"
              >
                추천 검색어
              </h2>
              <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                운동과 식단 검색어 예시예요.
              </p>
              <div className="mt-4 flex flex-col gap-4">
                {EXPLORE_KEYWORD_GROUPS.map((group) => {
                  const style = GROUP_STYLE[group.key]
                  return (
                    <div key={group.key}>
                      <p
                        className={`text-support leading-snug font-semibold ${style.label}`}
                      >
                        {group.label}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {group.keywords.map((keyword) => (
                          <li key={keyword}>
                            <button
                              type="button"
                              onClick={() => runSearch(keyword, style.category)}
                              className={`min-h-11 cursor-pointer rounded-full border px-4 text-body leading-snug font-normal transition-colors motion-reduce:transition-none ${style.chip} ${focusRing}`}
                            >
                              {keyword}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
