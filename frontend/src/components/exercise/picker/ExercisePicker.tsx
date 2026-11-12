import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { Link } from 'react-router'
import {
  pickFavoriteExercises,
  searchPickerExercises,
} from '../../../exercise/exercisePickerSearch.ts'
import type { Exercise } from '../../../exercise/exerciseTypes.ts'
import { useFavorites } from '../../../exercise/favoritesContext.ts'
import {
  useExerciseCatalog,
  type ExerciseCatalogState,
} from '../../../exercise/useExerciseCatalog.ts'
import { useExerciseSelection } from '../../../exercise/useExerciseSelection.ts'
import Icon from '../../icons/Icon.tsx'
import ExerciseQueryInput from '../ExerciseQueryInput.tsx'
import { FAVORITE_MESSAGES } from '../favoriteMessages.ts'
import {
  PickerLoading,
  PickerNotice,
  pickerFocusRing,
  pickerInlineNotice,
  pickerSecondaryButton,
} from './PickerNotices.tsx'
import PickerRow, { type PickerStar } from './PickerRow.tsx'
import SelectedFooter from './SelectedFooter.tsx'

type Tab = 'favorites' | 'search'

const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: 'favorites', label: '즐겨찾기' },
  { key: 'search', label: '직접 검색' },
]

/**
 * 운동 선택을 마칠 때 호출부가 돌려주는 결과. 호출부(W02 등)가 정해지면 선택한 운동 id(선택한 순서)를 받아 초안에 추가하고 ok를 돌려준다.
 * ok가 아니면 이 화면이 message를 안내하고 선택은 그대로 둔다(저장 성공처럼 보이지 않는다).
 */
export type PickerCompleteResult = { ok: true } | { ok: false; message: string }

/**
 * 운동 선택 화면 W13의 본체. 즐겨찾기 탭(기본)과 직접 검색 탭에서 운동을 여러 개 골라 하단에 모으고, 등록을 호출부에 넘긴다.
 * 이 컴포넌트는 호출부를 알지 못한다(콜백만 받는다). 선택은 이 컴포넌트 안의 임시 값이라 새로고침·재진입·계정 전환에서 사라지고 어디에도 저장하지 않는다.
 *
 * - 선택과 즐겨찾기 별은 독립이다. 별을 해제해도, 탭·검색어를 바꿔도 선택은 유지되고 하단 선택 목록에서 확인·해제한다.
 * - 즐겨찾기 상태는 공유 상태(FavoritesProvider)를 쓰고 E02와 같은 값이다. 운동 정보는 운동 목록을 한 번 조회해(useExerciseCatalog)
 *   즐겨찾기 id와 매칭한다. 즐겨찾기 조회 실패와 운동 목록 조회 실패는 따로 안내하고, 즐겨찾기가 실패해도 직접 검색·선택은 계속 쓸 수 있다.
 * - 탭을 옮겨도 검색어·검색 여부·선택이 유지된다. 검색은 "검색하기"를 제출했을 때만 하며, 그 전에는 결과를 보이지 않는다.
 */
export default function ExercisePicker({
  backTo,
  onComplete,
}: {
  /** 뒤로가기·취소 목적지. 없으면 두 링크를 그리지 않는다. */
  backTo: string | null
  /**
   * 등록을 눌렀을 때 호출한다. 첫 인자는 선택한 운동 id(선택 순서)다. 두 번째 인자는 이 화면이 화면을 그리는 데 쓴 운동 목록(카탈로그) 상태로,
   * 호출부가 같은 데이터에서 운동 객체를 고르게 한다(호출부가 따로 조회하지 않는다). 두 번째 인자를 쓰지 않는 호출부도 그대로 동작한다.
   */
  onComplete: (
    ids: readonly string[],
    catalog: ExerciseCatalogState,
  ) => PickerCompleteResult
}) {
  const catalog = useExerciseCatalog()
  const favorites = useFavorites()
  const selection = useExerciseSelection()

  const [tab, setTab] = useState<Tab>('favorites')
  const [query, setQuery] = useState('')
  // 검색을 제출한 검색어. null이면 아직 검색하지 않았다.
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const [starNotice, setStarNotice] = useState(false)
  // seq는 같은 선택에서 등록을 다시 눌렀을 때 안내를 다시 읽어 주도록 새 요소로 만드는 번호다.
  const [completeNotice, setCompleteNotice] = useState<{
    ids: readonly string[]
    message: string
    seq: number
  } | null>(null)
  const frameRef = useRef<HTMLElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const noticeSeq = useRef(0)

  // 하단 고정 영역의 높이를 CSS 변수(--picker-footer-h)로 알려, 키보드 포커스·스크롤이 목록 행을 그 영역 뒤로 보내지 않게 한다(행의 scroll-mb).
  useEffect(() => {
    const root = rootRef.current
    const footer = root?.querySelector<HTMLElement>(
      'section[aria-label="선택한 운동"]',
    )
    if (!root || !footer) return
    const update = () =>
      root.style.setProperty(
        '--picker-footer-h',
        `${Math.ceil(footer.getBoundingClientRect().height) + 8}px`,
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])

  const exercises =
    catalog.state.status === 'ready' ? catalog.state.exercises : null

  const favoriteView = useMemo(
    () =>
      exercises && favorites.status === 'ready'
        ? pickFavoriteExercises(exercises, favorites.ids)
        : null,
    [exercises, favorites.status, favorites.ids],
  )
  const searchItems = useMemo(
    () =>
      exercises && submitted !== null
        ? searchPickerExercises(exercises, submitted)
        : null,
    [exercises, submitted],
  )

  // 선택이 바뀌면 지난 "등록" 안내는 더 이상 맞지 않아 보이지 않는다(ids는 선택이 바뀔 때만 새 값이 된다).
  const visibleNotice =
    completeNotice && completeNotice.ids === selection.ids
      ? completeNotice.message
      : null

  /** 재시도를 누르면 눌렀던 버튼이 사라지므로, 목록 영역으로 포커스를 옮겨 포커스가 문서 처음으로 빠지지 않게 한다. */
  function retryWith(action: () => void) {
    frameRef.current?.focus()
    action()
  }

  function starLabel(exercise: Exercise): string {
    if (favorites.status === 'loading') {
      return `즐겨찾기 상태 확인 중: ${exercise.name}`
    }
    if (favorites.status === 'error') {
      return `${FAVORITE_MESSAGES.loadFailed} 다시 시도: ${exercise.name}`
    }
    return favorites.ids.has(exercise.id)
      ? `즐겨찾기 해제: ${exercise.name}`
      : `즐겨찾기에 추가: ${exercise.name}`
  }

  async function handleStar(exercise: Exercise) {
    setAnnounce('')
    if (favorites.status === 'loading' || favorites.status === 'guest') return
    if (favorites.status === 'unavailable') {
      setStarNotice(true)
      return
    }
    if (favorites.status === 'error') {
      // 별 버튼은 그대로 남으므로 포커스를 옮기지 않는다(E02와 같다).
      favorites.reload()
      return
    }
    setStarNotice(false)
    const result = await favorites.toggle(exercise.id)
    // 목록에서는 어느 운동의 결과인지 함께 읽어 준다(승인된 문구 앞에 운동 이름만 붙인다).
    if (result === 'added') {
      setAnnounce(`${exercise.name}: ${FAVORITE_MESSAGES.added}`)
    } else if (result === 'removed') {
      setAnnounce(`${exercise.name}: ${FAVORITE_MESSAGES.removed}`)
      // 즐겨찾기 탭에서는 해제한 행이 목록에서 사라지므로, 포커스가 문서 처음으로 빠지지 않게 목록 영역으로 옮긴다.
      if (tab === 'favorites') frameRef.current?.focus()
    } else if (result === 'failed') {
      setAnnounce(`${exercise.name}: ${FAVORITE_MESSAGES.saveFailed}`)
    }
  }

  function star(exercise: Exercise): PickerStar {
    return {
      label: starLabel(exercise),
      favorite: favorites.status === 'ready' && favorites.ids.has(exercise.id),
      waiting:
        favorites.status === 'loading' || favorites.savingIds.has(exercise.id),
      failed: favorites.failedIds.has(exercise.id),
      onClick: () => void handleStar(exercise),
    }
  }

  function renderRows(items: readonly Exercise[]): ReactNode {
    return (
      <>
        <p role="status" className="text-body font-normal text-muted">
          {items.length}개 운동
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((exercise) => (
            <PickerRow
              key={exercise.id}
              exercise={exercise}
              selected={selection.isSelected(exercise.id)}
              onToggleSelect={() =>
                selection.toggle({ id: exercise.id, name: exercise.name })
              }
              star={star(exercise)}
            />
          ))}
        </ul>
      </>
    )
  }

  const goSearchButton = (
    <button
      type="button"
      onClick={() => setTab('search')}
      className={pickerSecondaryButton}
    >
      직접 검색하기
    </button>
  )

  /** 두 탭이 함께 의존하는 운동 목록의 상태 안내. 준비되었으면 null. */
  function renderCatalogNotice(): ReactNode {
    if (catalog.state.status === 'loading') return <PickerLoading />
    if (catalog.state.status === 'unavailable') {
      return (
        <PickerNotice
          role="status"
          title="운동 검색을 준비하고 있어요"
          body="운동 데이터가 아직 연결되지 않아 운동을 보여 드릴 수 없어요. 선택한 운동은 그대로예요."
        />
      )
    }
    if (catalog.state.status === 'error') {
      return (
        <PickerNotice
          role="alert"
          title="운동을 불러오지 못했어요"
          body="선택한 운동과 검색어는 그대로예요. 잠시 후 다시 시도해 주세요."
        >
          <button
            type="button"
            onClick={() => retryWith(catalog.reload)}
            className={pickerSecondaryButton}
          >
            다시 시도
          </button>
        </PickerNotice>
      )
    }
    return null
  }

  function renderFavorites(): ReactNode {
    const catalogNotice = renderCatalogNotice()
    if (catalogNotice) return catalogNotice
    if (favorites.status === 'loading') return <PickerLoading />
    if (favorites.status === 'unavailable') {
      return (
        <PickerNotice
          role="status"
          title={FAVORITE_MESSAGES.unavailable}
          body="지금은 직접 검색으로 운동을 찾아 선택할 수 있어요."
        >
          {goSearchButton}
        </PickerNotice>
      )
    }
    if (favorites.status === 'error') {
      return (
        <PickerNotice
          role="alert"
          title={FAVORITE_MESSAGES.loadFailed}
          body="선택한 운동은 그대로예요. 잠시 후 다시 시도해 주세요."
        >
          <button
            type="button"
            onClick={() => retryWith(favorites.reload)}
            className={pickerSecondaryButton}
          >
            다시 시도
          </button>
        </PickerNotice>
      )
    }
    if (!favoriteView) return null
    const { items, missing } = favoriteView
    if (items.length === 0 && missing === 0) {
      return (
        <PickerNotice
          role="status"
          title="즐겨찾기한 운동이 없어요"
          body="직접 검색에서 운동을 찾고 별표를 눌러 저장해 보세요."
        >
          {goSearchButton}
        </PickerNotice>
      )
    }
    return (
      <>
        <p className="mb-3 text-body font-normal text-muted">
          별표로 저장해 둔 운동을 선택할 수 있어요.
        </p>
        {missing > 0 ? (
          <p role="status" className={`mb-3 ${pickerInlineNotice}`}>
            즐겨찾기한 운동 {missing}개는 운동 정보를 찾지 못해 보여 드리지
            못해요.
          </p>
        ) : null}
        {items.length > 0 ? (
          renderRows(items)
        ) : (
          <div className="flex justify-center">{goSearchButton}</div>
        )}
      </>
    )
  }

  function renderSearchResults(): ReactNode {
    const catalogNotice = renderCatalogNotice()
    if (catalogNotice) return catalogNotice
    if (!searchItems) {
      return (
        <PickerNotice
          role="status"
          title="운동을 검색해 주세요"
          body="운동명이나 부위·도구 이름으로 찾아볼 수 있어요."
        />
      )
    }
    if (searchItems.length === 0) {
      return (
        <PickerNotice
          role="status"
          title="검색 결과가 없어요"
          body="운동명이나 부위·도구 이름으로 찾아볼 수 있어요."
        />
      )
    }
    return renderRows(searchItems)
  }

  /** 직접 검색 탭에서 즐겨찾기 상태 안내(검색과 선택은 막지 않는 보조 안내). */
  function renderFavoritesNotice(): ReactNode {
    if (favorites.status === 'error') {
      return (
        <div role="alert" className={`mb-3 ${pickerInlineNotice}`}>
          <p>{FAVORITE_MESSAGES.loadFailed}</p>
          <button
            type="button"
            onClick={() => retryWith(favorites.reload)}
            className={`mt-3 ${pickerSecondaryButton}`}
          >
            즐겨찾기 다시 시도
          </button>
        </div>
      )
    }
    if (favorites.status === 'unavailable' && starNotice) {
      return (
        <p role="status" className={`mb-3 ${pickerInlineNotice}`}>
          {FAVORITE_MESSAGES.unavailable}
        </p>
      )
    }
    return null
  }

  function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(query.trim())
  }

  function handleComplete() {
    const result = onComplete(selection.ids, catalog.state)
    if (!result.ok) {
      noticeSeq.current += 1
      setCompleteNotice({
        ids: selection.ids,
        message: result.message,
        seq: noticeSeq.current,
      })
    }
  }

  return (
    <div
      ref={rootRef}
      // 하단 선택 영역이 화면 맨 아래에 붙도록 본문 높이를 채운다(AppShell 본문의 위아래 여백 2.5rem만 뺀다: 이 화면은 하단탭·본문 뒤로가기가 없다).
      style={{ minHeight: 'calc(100dvh - 2.5rem)' }}
      className="flex flex-col"
    >
      <header className="-mx-5 -mt-5 bg-linear-to-b from-exercise-soft to-page pt-6 pr-5 pb-4 pl-2.5">
        <div className="flex items-center">
          {backTo ? (
            <Link
              to={backTo}
              aria-label="이전 화면으로 돌아가기"
              className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-full text-content hover:bg-exercise/10 ${pickerFocusRing}`}
            >
              <Icon name="arrow-left" size={21} />
            </Link>
          ) : null}
          <div className={`min-w-0 flex-1 ${backTo ? 'ml-1' : 'ml-2.5'}`}>
            <h1 className="text-app-title leading-snug font-semibold text-content">
              운동 검색·등록
            </h1>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              운동을 여러 개 선택한 뒤 목록에 추가해 주세요.
            </p>
          </div>
        </div>
      </header>

      <div
        role="group"
        aria-label="운동 찾는 방법"
        className="mt-4 grid grid-cols-2 gap-2"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 scroll-mb-(--picker-footer-h) cursor-pointer rounded-control px-4 text-body font-semibold transition-colors motion-reduce:transition-none ${pickerFocusRing} ${
              tab === key
                ? 'bg-exercise text-surface'
                : 'border border-line bg-surface text-content hover:border-exercise/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' ? (
        <form role="search" onSubmit={handleSearch} className="mt-4">
          <label htmlFor="picker-query" className="sr-only">
            운동명·부위·도구 검색
          </label>
          <ExerciseQueryInput
            id="picker-query"
            value={query}
            onChange={setQuery}
            placeholder="운동명·부위·도구 검색"
            inputClassName="scroll-mb-(--picker-footer-h)"
          />
          <button
            type="submit"
            className={`mt-3 flex min-h-12 w-full scroll-mb-(--picker-footer-h) cursor-pointer items-center justify-center rounded-control bg-exercise px-4 text-body font-semibold text-surface transition-colors hover:opacity-90 motion-reduce:transition-none ${pickerFocusRing}`}
          >
            검색하기
          </button>
        </form>
      ) : null}

      <div className="mt-4 flex-1">
        {/* 별 등록·해제 결과를 읽어 주는 보이지 않는 안내 */}
        <p role="status" className="sr-only">
          {announce}
        </p>
        <section
          ref={frameRef}
          tabIndex={-1}
          aria-label="운동 목록"
          className="outline-none"
        >
          {tab === 'favorites' ? (
            renderFavorites()
          ) : (
            <>
              {renderFavoritesNotice()}
              {renderSearchResults()}
            </>
          )}
        </section>
      </div>

      <SelectedFooter
        items={selection.items}
        notice={visibleNotice}
        noticeKey={completeNotice?.seq ?? 0}
        cancelTo={backTo}
        onRemove={selection.remove}
        onComplete={handleComplete}
      />
    </div>
  )
}
