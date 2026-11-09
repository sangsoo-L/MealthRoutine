import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useMatches, useNavigate, useSearchParams } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import BottomSheet from '../components/layout/BottomSheet.tsx'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import {
  EMPTY_NUTRITION,
  FOOD_TYPES,
  MAX_FOOD_QUERY,
  foodBackend,
  foodCriteriaUrl,
  foodTags,
  kindsFor,
  normalizeNumber,
  nutritionSummary,
  parseFoodCriteria,
  validateNutrition,
  withoutTag,
  type FoodCriteria,
  type FoodNutrition,
  type NutritionError,
  type FoodSearchOutcome,
} from './foodSearch.ts'
import type { FoodResult } from './searchTypes.ts'
import {
  FilterList,
  FilterRow,
  OptionList,
  SearchBox,
  SearchHeader,
} from './searchUi.tsx'
import { TONES, focusRingOf } from './searchTones.ts'

const TONE = 'meal'
const t = TONES[TONE]
const focusRing = focusRingOf(TONE)

const secondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border bg-surface px-4 text-body font-semibold ${t.outlined} ${focusRing}`

type SheetKey = 'type' | 'kind' | 'nutrition'

const SHEET_TITLES: Record<SheetKey, string> = {
  type: '식품 구분 선택',
  kind: '음식 종류 선택',
  nutrition: '상세 필터',
}

// text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(placeholder는 본문 크기).
const inputClass = `h-12 w-full rounded-control border border-muted/75 bg-surface px-4 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted hover:border-muted focus-visible:outline-2 focus-visible:-outline-offset-1 aria-[invalid=true]:border-danger motion-reduce:transition-none ${t.inputFocus}`

interface NutritionFormProps {
  initial: FoodNutrition
  onApply: (value: FoodNutrition) => void
  close: () => void
  closing: boolean
}

/**
 * 상세 필터 시트의 입력(100g당 열량 최소·최대, 단백질 최소). 시트 안에서만 값을 들고 있다가 "조건 적용"을 눌러야 반영한다:
 * 닫기·Escape·배경 클릭으로 닫으면 적용 전 값이 그대로다(스토리보드 action). 빈 값은 제한 없음이다.
 * 음수·숫자가 아닌 값·최소>최대는 오류 문구로 막고 입력은 그대로 둔다.
 */
function NutritionForm({
  initial,
  onApply,
  close,
  closing,
}: NutritionFormProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<NutritionError | null>(null)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (closing) return
    const found = validateNutrition(value)
    if (found) {
      setError(found)
      // 틀린 입력으로 포커스를 옮겨 어느 칸인지 알 수 있게 한다.
      document
        .querySelector<HTMLInputElement>(
          `[role="dialog"] input[name="${found.field}"]`,
        )
        ?.focus()
      return
    }
    onApply({
      minKcal: normalizeNumber(value.minKcal),
      maxKcal: normalizeNumber(value.maxKcal),
      minProtein: normalizeNumber(value.minProtein),
    })
    close()
  }

  function field(key: keyof FoodNutrition) {
    return {
      value: value[key],
      onChange: (next: string) => {
        setValue((current) => ({ ...current, [key]: next }))
        setError(null)
      },
    }
  }

  const min = field('minKcal')
  const max = field('maxKcal')
  const protein = field('minProtein')
  // 오류는 틀린 입력 하나에만 연결한다(aria-invalid·aria-describedby).
  const invalidFor = (key: keyof FoodNutrition) =>
    error?.field === key ? true : undefined
  const describedFor = (key: keyof FoodNutrition) =>
    error?.field === key ? 'food-nutrition-error' : undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-support leading-relaxed font-normal text-muted">
        영양정보 비교 기준 · 100g당
      </p>
      <fieldset>
        <legend className="text-body font-semibold text-content">
          열량 범위 <span className="font-normal text-muted">kcal</span>
        </legend>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="min-w-0 flex-1 basis-28 text-support font-normal text-muted">
            최소
            <input
              data-autofocus
              type="text"
              inputMode="decimal"
              autoComplete="off"
              name="minKcal"
              placeholder="제한 없음"
              value={min.value}
              onChange={(event) => min.onChange(event.target.value)}
              aria-invalid={invalidFor('minKcal')}
              aria-describedby={describedFor('minKcal')}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <span aria-hidden="true" className="pb-3 text-body text-muted">
            ~
          </span>
          <label className="min-w-0 flex-1 basis-28 text-support font-normal text-muted">
            최대
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              name="maxKcal"
              placeholder="제한 없음"
              value={max.value}
              onChange={(event) => max.onChange(event.target.value)}
              aria-invalid={invalidFor('maxKcal')}
              aria-describedby={describedFor('maxKcal')}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      </fieldset>
      <label className="text-body font-semibold text-content">
        단백질 최소량 <span className="font-normal text-muted">g 이상</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          name="minProtein"
          placeholder="제한 없음"
          value={protein.value}
          onChange={(event) => protein.onChange(event.target.value)}
          aria-invalid={invalidFor('minProtein')}
          aria-describedby={describedFor('minProtein')}
          className={`mt-2 font-normal ${inputClass}`}
        />
      </label>
      <p className="text-support leading-relaxed font-normal text-muted">
        조건을 설정한 영양성분이나 100g 기준 정보가 없는 음식은 결과에서
        제외돼요.
      </p>
      <div role="alert" className="empty:hidden">
        {error ? (
          <p
            id="food-nutrition-error"
            className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5 text-support leading-relaxed font-normal text-danger"
          >
            {error.message}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            setValue(EMPTY_NUTRITION)
            setError(null)
          }}
          className={`min-w-0 flex-1 basis-24 ${secondaryButton}`}
        >
          초기화
        </button>
        <button
          type="submit"
          className={`flex min-h-11 min-w-0 flex-2 basis-32 cursor-pointer items-center justify-center rounded-control text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 motion-reduce:transition-none ${t.solid} ${focusRing}`}
        >
          조건 적용
        </button>
      </div>
    </form>
  )
}

/** 결과 한 건. 음식 영양정보(F02) 화면이 아직 없어서 이동하지 않는 비대화형 카드다. 있는 정보만 보여 주고 없는 값은 0으로 바꾸지 않는다. */
function FoodCard({ item }: { item: FoodResult }) {
  const label = [item.type, item.kind].filter((v): v is string => !!v)
  const numeric = item.kcal !== undefined || item.protein !== undefined
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      {label.length > 0 ? (
        <p className={`text-support leading-snug font-normal ${t.text}`}>
          {label.join(' · ')}
        </p>
      ) : null}
      <p
        className={`text-section-title leading-snug font-semibold text-content ${label.length > 0 ? 'mt-1' : ''}`}
      >
        {item.name}
      </p>
      {numeric ? (
        <p className="mt-2 text-support leading-snug font-normal text-muted">
          {item.per100g ? '100g 기준' : '영양 기준 미확인'} ·{' '}
          {item.kcal != null ? `${item.kcal}kcal` : '열량 정보 없음'} · 단백질{' '}
          {item.protein != null ? `${item.protein}g` : '정보 없음'}
        </p>
      ) : item.nutrition ? (
        <p className="mt-2 text-support leading-snug font-normal text-muted">
          {item.nutrition}
        </p>
      ) : null}
    </li>
  )
}

const noticePanel = 'rounded-card bg-surface px-5 py-6 text-center'

interface ResultViewProps {
  outcome: FoodSearchOutcome | 'loading'
  hasNutrition: boolean
  onRetry: () => void
}

/** 결과 영역. 준비 중·오류·결과 없음·결과를 서로 다른 화면으로 보여 준다. */
function ResultView({ outcome, hasNutrition, onRetry }: ResultViewProps) {
  if (outcome === 'loading') {
    return (
      <p
        role="status"
        className="py-10 text-center text-body font-normal text-muted"
      >
        음식을 찾는 중이에요…
      </p>
    )
  }
  if (outcome.status === 'unavailable') {
    return (
      <div role="status" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          음식 검색을 준비하고 있어요
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          음식 데이터가 아직 연결되지 않아 결과를 보여 드릴 수 없어요. 조건은
          그대로 두었으니 연결되면 바로 찾을 수 있어요.
        </p>
      </div>
    )
  }
  if (outcome.status === 'error') {
    return (
      <div role="alert" className={noticePanel}>
        <p className="text-section-title leading-snug font-semibold text-content">
          음식을 불러오지 못했어요
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
          검색 결과가 없어요
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          검색어와 필터 조건을 바꿔 보세요. 없는 음식 등록 요청은 준비 중이에요.
        </p>
      </div>
    )
  }
  return (
    <>
      <p className="text-body font-normal text-muted">
        <strong className="font-semibold text-content">
          {outcome.items.length}개
        </strong>
        의 음식을 찾았어요.
      </p>
      {hasNutrition ? (
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          100g 기준 정보 또는 선택한 영양성분이 없는 음식은 제외했어요.
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-3">
        {outcome.items.map((item) => (
          <FoodCard key={item.id} item={item} />
        ))}
      </ul>
    </>
  )
}

/**
 * F01 음식 탐색. 문구·구성은 화면명세 v5.0 F01과 스토리보드 v5.0(음식 검색)을 따르고, 화면 흐름과 레이아웃은 운동 탐색(E01)과 같다.
 *
 * 검색 전과 검색 결과를 별도 화면 상태로 나눈다. 검색 전에는 결과 목록을 보여 주지 않는다.
 * - 검색 전: 음식명·제품명 검색창, 선택 초기화가 있는 "검색 조건"(식품 구분·음식 종류·상세 필터), 전체 너비 "검색하기".
 *   식품 구분·음식 종류 행은 바텀시트에서 단일 선택하고 고르면 바로 반영하며 닫힌다. 상세 필터는 열량(100g당) 범위와 단백질 최소량을
 *   시트에서 입력하고 "조건 적용"으로 반영한다(닫기만 하면 적용 전 값 유지).
 * - 결과: 적용한 조건 태그(하나씩 해제)와 "조건 수정", 결과(준비 중·오류·결과 없음·목록). 조건 수정으로 돌아가면 값이 그대로다.
 * 식품 구분을 바꾸면 음식 종류는 전체 종류로 돌아간다(구분마다 종류가 다르다).
 * 조건과 화면 상태는 주소(?q=&type=&kind=&minKcal=&maxKcal=&minProtein=&view=results)에 둔다. 시트를 여닫는 것은 주소를 바꾸지 않으며,
 * 시트가 열린 채 주소가 바뀌면(뒤로가기 등) 닫힌다.
 *
 * 음식 검색 API·데이터가 없어서(foodBackend) 검색하기를 누르면 "준비 중" 상태가 나온다. 가짜 음식은 만들지 않는다.
 * 결과의 "영양정보 보기"(F02)와 "없는 음식 등록 요청"(F03)은 화면과 경로가 없어 두지 않았다.
 */
export default function FoodsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const matches = useMatches()
  const backTo = useBackTarget(
    getRouteHandle(matches.at(-1)?.handle).parent ?? null,
  )
  const { criteria: applied, showResults } = parseFoodCriteria(params)
  const paramsKey = params.toString()

  // 검색 전 화면의 입력값. 주소가 바뀌면(조건 수정·뒤로가기 등) 그 조건으로 맞춘다.
  const [form, setForm] = useState<FoodCriteria>(applied)
  const [syncedKey, setSyncedKey] = useState(paramsKey)
  if (syncedKey !== paramsKey) {
    setSyncedKey(paramsKey)
    setForm(applied)
  }

  // 열려 있는 시트. 어느 주소에서 열었는지 함께 기억해, 주소가 바뀌면(뒤로가기 등) 닫고 다시 돌아와도 열리지 않게 비운다.
  const [sheet, setSheet] = useState<{ key: SheetKey; at: string } | null>(null)
  if (sheet && sheet.at !== paramsKey) setSheet(null)
  const openSheet = sheet && sheet.at === paramsKey ? sheet.key : null
  // 시트에서 이미 하나를 골랐는지(같은 순간의 연속 선택 방지). 시트를 열 때마다 비운다.
  const chosen = useRef(false)

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
    outcome: FoodSearchOutcome
  } | null>(null)
  useEffect(() => {
    if (!showResults) return
    let cancelled = false
    Promise.resolve()
      .then(() => foodBackend.search(applied))
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
  const outcome: FoodSearchOutcome | 'loading' =
    result?.key === searchKey ? result.outcome : 'loading'

  function search(criteria: FoodCriteria) {
    void navigate(foodCriteriaUrl(criteria, true))
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    search(form)
  }

  const kindOptions = [
    { value: null, label: '전체 종류' },
    ...kindsFor(form.type).map((kind) => ({ value: kind, label: kind })),
  ]
  const typeOptions = [
    { value: null, label: '전체' },
    ...FOOD_TYPES.map((type) => ({ value: type, label: type })),
  ]

  if (showResults) {
    const tags = foodTags(applied)
    const hasNutrition =
      applied.nutrition.minKcal !== '' ||
      applied.nutrition.maxKcal !== '' ||
      applied.nutrition.minProtein !== ''
    return (
      <div className="flex flex-col gap-5 pb-6 break-keep wrap-anywhere">
        <SearchHeader
          tone={TONE}
          backTo={backTo}
          title="음식 검색 결과"
          description="입력한 조건으로 찾은 음식이에요."
          headingRef={headingRef}
        />
        <section
          aria-label="적용한 조건"
          className="flex items-start justify-between gap-3"
        >
          <ul className="flex min-w-0 flex-wrap gap-2">
            {tags.length === 0 ? (
              <li
                className={`rounded-full border px-3 py-1 text-support leading-snug font-normal ${t.tag}`}
              >
                전체 음식
              </li>
            ) : (
              tags.map((tag) => (
                <li key={tag.key}>
                  <button
                    type="button"
                    aria-label={`${tag.label} 조건 해제`}
                    onClick={() => {
                      search(withoutTag(applied, tag.key))
                      // 눌린 태그가 사라지므로 포커스를 "조건 수정" 링크로 옮긴다.
                      requestAnimationFrame(() =>
                        document.getElementById('food-edit-link')?.focus(),
                      )
                    }}
                    className={`flex min-h-11 cursor-pointer items-center gap-1 rounded-full border px-3 text-support leading-snug font-normal ${t.tag} ${focusRing}`}
                  >
                    {tag.label}
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            id="food-edit-link"
            to={foodCriteriaUrl(applied, false)}
            className={`flex min-h-11 shrink-0 items-center px-1 text-body font-semibold ${t.text} ${focusRing}`}
          >
            조건 수정
          </Link>
        </section>
        <section aria-label="검색 결과">
          <ResultView
            outcome={outcome}
            hasNutrition={hasNutrition}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        </section>
      </div>
    )
  }

  const open = (key: SheetKey) => {
    chosen.current = false
    setSheet({ key, at: paramsKey })
  }

  return (
    <div className="pb-6 break-keep wrap-anywhere">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <SearchHeader
          tone={TONE}
          backTo={backTo}
          title="음식 검색"
          description="이름이나 조건으로 원하는 음식을 찾아보세요."
          headingRef={headingRef}
        >
          <SearchBox
            tone={TONE}
            id="food-query"
            label="음식명·제품명"
            placeholder="음식명 또는 제품명을 입력해 주세요"
            value={form.query}
            maxLength={MAX_FOOD_QUERY}
            onChange={(query) => setForm((current) => ({ ...current, query }))}
          />
        </SearchHeader>

        <section aria-labelledby="food-conditions">
          <div className="mb-0.5 flex items-center justify-between">
            <h3
              id="food-conditions"
              className="text-section-title leading-snug font-semibold text-content"
            >
              검색 조건
            </h3>
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  type: null,
                  kind: null,
                  nutrition: EMPTY_NUTRITION,
                }))
              }
              className={`-mr-2 flex min-h-11 cursor-pointer items-center px-2 text-support font-normal text-muted hover:text-content ${focusRing}`}
            >
              선택 초기화
            </button>
          </div>
          {/* 세 조건은 한 목록으로 묶고 같은 규칙(행 높이·좌우 여백·화살표 위치)을 쓴다. 누르면 아래에서 선택 시트가 올라온다. */}
          <FilterList>
            <FilterRow
              tone={TONE}
              label="식품 구분"
              value={form.type ?? '전체'}
              active={form.type !== null}
              onOpen={() => open('type')}
            />
            <FilterRow
              tone={TONE}
              label="음식 종류"
              value={form.kind ?? '전체 종류'}
              active={form.kind !== null}
              onOpen={() => open('kind')}
            />
            <FilterRow
              tone={TONE}
              label="상세 필터"
              value={nutritionSummary(form.nutrition)}
              active={
                form.nutrition.minKcal !== '' ||
                form.nutrition.maxKcal !== '' ||
                form.nutrition.minProtein !== ''
              }
              onOpen={() => open('nutrition')}
            />
          </FilterList>
        </section>

        <div className="mt-6">
          <button
            type="submit"
            className={`flex min-h-13 w-full cursor-pointer items-center justify-center rounded-control text-body font-semibold text-surface transition-[filter] hover:brightness-95 active:brightness-90 motion-reduce:transition-none ${t.solid} ${focusRing}`}
          >
            검색하기
          </button>
          {foodBackend.connected ? null : (
            <p className="mt-3 text-center text-support leading-relaxed font-normal text-muted">
              음식 데이터 연결 전이라 결과는 준비 중이에요.
            </p>
          )}
        </div>
      </form>

      {openSheet ? (
        <BottomSheet
          title={SHEET_TITLES[openSheet]}
          onClose={() => setSheet(null)}
        >
          {(close, closing) =>
            openSheet === 'nutrition' ? (
              <NutritionForm
                initial={form.nutrition}
                closing={closing}
                close={close}
                onApply={(nutrition) =>
                  setForm((current) => ({ ...current, nutrition }))
                }
              />
            ) : openSheet === 'type' ? (
              <OptionList
                tone={TONE}
                label="식품 구분"
                options={typeOptions}
                selected={form.type}
                onSelect={(type) => {
                  // 닫히는 중에 한 번 더 눌러도 처음 선택을 바꾸지 않는다.
                  if (closing || chosen.current) return
                  chosen.current = true
                  // 구분마다 음식 종류가 달라서 구분을 바꾸면 종류는 전체 종류로 돌아간다.
                  setForm((current) =>
                    current.type === type
                      ? current
                      : { ...current, type, kind: null },
                  )
                  close()
                }}
              />
            ) : (
              <OptionList
                tone={TONE}
                label="음식 종류"
                chips
                options={kindOptions}
                selected={form.kind}
                onSelect={(kind) => {
                  if (closing || chosen.current) return
                  chosen.current = true
                  setForm((current) => ({ ...current, kind }))
                  close()
                }}
              />
            )
          }
        </BottomSheet>
      ) : null}
    </div>
  )
}
