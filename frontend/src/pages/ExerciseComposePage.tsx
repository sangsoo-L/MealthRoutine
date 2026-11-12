import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ComposeItemCard from '../components/exercise/compose/ComposeItemCard.tsx'
import {
  composeCard,
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
  fieldId,
  itemCardId,
  moveButtonId,
} from '../components/exercise/compose/composeStyles.ts'
import { useExerciseCatalog } from '../exercise/useExerciseCatalog.ts'
import { normalizeDraft, validateDraft } from '../exercise/workoutDraftModel.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'
import type { DraftIssue } from '../exercise/workoutDraftTypes.ts'

/** W13이 등록 결과를 알리는 라우터 state(추가·건너뛴 개수). 올바른 모양일 때만 쓴다. */
function readPickerResult(
  state: unknown,
): { added: number; skipped: number } | null {
  if (typeof state !== 'object' || state === null) return null
  const { added, skipped } = state as Record<string, unknown>
  return Number.isInteger(added) &&
    Number.isInteger(skipped) &&
    (added as number) > 0 &&
    (skipped as number) >= 0
    ? { added: added as number, skipped: skipped as number }
    : null
}

const PATH_SELECT = '/records/exercise/select'
const PATH_COMPOSE = '/records/exercise/compose'
/** W10(목록 선택)이 아직 없어 임시로 운동 기록 대시보드(W01)로 돌아간다. */
const PATH_BACK = '/records/exercise'

/** 오늘 날짜(이 기기의 로컬 날짜, YYYY-MM-DD). 표시용이며 저장하지 않는다(날짜 기준·시간대는 미확정). */
function todayLabel(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** 첫 오류가 가리키는 입력의 DOM id. 운동·세트 단위가 아니면 운동 카드, 운동이 없으면 "운동 등록하기"다. */
function focusTargetId(issue: DraftIssue): string {
  if (!issue.itemId) return 'compose-add-link'
  if (issue.setIndex !== undefined) {
    return fieldId(issue.itemId, issue.setIndex, issue.field)
  }
  if (issue.field === 'recordType')
    return fieldId(issue.itemId, null, 'recordType')
  return itemCardId(issue.itemId)
}

const stepBadge =
  'mr-2 inline-flex size-6 items-center justify-center rounded-full bg-exercise-soft text-support font-semibold text-exercise'

/**
 * W02 직접 운동 목록 구성. 운동 편집 화면이며 편집 중인 값은 앱 수준 초안(WorkoutDraftProvider)이 가진다. 회원 전용이고 비회원은 라우트의
 * AuthGate가 기존 로그인 안내를 보여 준다.
 *
 * 이번 단계에서 하지 않는 것: 운동 선택 결과를 초안에 반영하는 일(W13-C), 최종 검토 화면(W11)으로 이동·목록 저장, 수행 기록 생성.
 * "운동 등록하기"는 W13으로 이동하되 선택 결과는 아직 연결되지 않아 안내한다. 내일 운동은 지원하지 않는다(오늘만).
 */
function ComposeBody() {
  const location = useLocation()
  const navigate = useNavigate()
  // W13에서 돌아왔을 때의 안내. 새로고침·뒤로가기로 다시 나타나지 않도록 읽은 뒤 history state를 비운다(같은 경로라 화면 전환 없음).
  const [pickerResult] = useState(() => readPickerResult(location.state))
  useEffect(() => {
    if (pickerResult)
      navigate(location.pathname, { replace: true, state: null })
  }, [pickerResult, navigate, location.pathname])
  const draftState = useWorkoutDraft()
  const { draft } = draftState
  const catalog = useExerciseCatalog()

  // 운동 정보를 읽을 수 있을 때만 "알 수 없는 운동"을 가려낸다(읽을 수 없으면 판단하지 않는다).
  const known = useMemo(
    () =>
      catalog.state.status === 'ready'
        ? new Set(catalog.state.exercises.map((exercise) => exercise.id))
        : undefined,
    [catalog.state],
  )
  const validation = useMemo(() => validateDraft(draft, known), [draft, known])
  // 입력 아래 오류는 항상 보인다. "운동 없음"은 최종 검토를 눌렀을 때만 알린다.
  const liveIssues = validation.ok
    ? []
    : validation.issues.filter((issue) => issue.field !== 'items')

  // 최종 검토 결과 안내. 초안이 바뀌면(updatedAt) 지난 안내는 더 이상 맞지 않아 사라진다.
  const [attempt, setAttempt] = useState<
    | { at: string; kind: 'errors'; issues: readonly DraftIssue[] }
    | { at: string; kind: 'pending' }
    | null
  >(null)
  const visibleAttempt =
    attempt && attempt.at === draft.updatedAt ? attempt : null

  function handleReview() {
    const result = validateDraft(draft, known)
    if (!result.ok) {
      setAttempt({ at: draft.updatedAt, kind: 'errors', issues: result.issues })
      const target = document.getElementById(focusTargetId(result.issues[0]))
      target?.focus()
      return
    }
    // W11(최종 검토)이 없어 이동·목록 저장·초안 삭제를 하지 않는다. 걸러 낸 결과가 유효한지만 확인하고 준비 중임을 알린다.
    if (normalizeDraft(draft, known) === null) return
    setAttempt({ at: draft.updatedAt, kind: 'pending' })
  }

  // 삭제·이동·세트 삭제 뒤에는 눌렀던 버튼이 사라지거나 비활성이 되어 포커스가 문서 처음으로 빠진다. 화면 안에서만 가까운 곳으로 옮긴다
  // (전역 포커스 관리가 아니다). 초안이 실제로 바뀐 뒤(렌더 직후)에 한 번 실행한다. 동작이 불가능한 경우(경계 이동·마지막 세트 삭제)는 버튼이 비활성이라 호출되지 않는다.
  const pendingFocus = useRef<(() => void) | null>(null)
  useEffect(() => {
    const run = pendingFocus.current
    pendingFocus.current = null
    run?.()
  }, [draft])
  const focusId = (id: string) => () => document.getElementById(id)?.focus()

  const actions = {
    moveItem: (itemId: string, direction: 'up' | 'down') => {
      pendingFocus.current = () => {
        // 이동한 운동에서 같은 방향 버튼이 아직 쓸 수 있으면 거기로, 끝에 닿아 비활성이면 반대 방향 버튼으로 옮긴다.
        const same = document.getElementById(moveButtonId(itemId, direction))
        const other = document.getElementById(
          moveButtonId(itemId, direction === 'up' ? 'down' : 'up'),
        )
        const target =
          same instanceof HTMLButtonElement && !same.disabled
            ? same
            : other instanceof HTMLButtonElement && !other.disabled
              ? other
              : document.getElementById(itemCardId(itemId))
        target?.focus()
      }
      draftState.moveItem(itemId, direction)
    },
    removeItem: (itemId: string) => {
      const index = draft.items.findIndex((item) => item.itemId === itemId)
      const neighbor = draft.items[index + 1] ?? draft.items[index - 1]
      pendingFocus.current = focusId(
        neighbor ? itemCardId(neighbor.itemId) : 'compose-add-link',
      )
      draftState.removeItem(itemId)
    },
    setRecordType: draftState.setRecordType,
    addSet: draftState.addSet,
    removeSet: (itemId: string, setIndex: number) => {
      const item = draft.items.find((entry) => entry.itemId === itemId)
      if (item) {
        const next = Math.min(setIndex, item.sets.length - 2)
        const field = item.recordType === 'time' ? 'targetSeconds' : 'reps'
        pendingFocus.current = focusId(fieldId(itemId, next, field))
      }
      draftState.removeSet(itemId, setIndex)
    },
    updateSet: draftState.updateSet,
  }
  const itemName = (itemId?: string) =>
    draft.items.find((item) => item.itemId === itemId)?.name

  return (
    <div className="flex flex-col gap-6">
      {/* 저장 상태 안내. 편집 도중 저장이 실패하면 나타나므로 항상 그려 두는 live 영역에서 읽어 준다(비어 있으면 자리를 차지하지 않는다). */}
      <div
        id="compose-notices"
        aria-live="polite"
        className="flex flex-col gap-2 empty:hidden"
      >
        {draftState.discardedNotice ? (
          <p className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-semibold text-warning">
            저장돼 있던 구성이 올바르지 않아 새로 시작했어요.
          </p>
        ) : null}
        {draftState.persistence === 'unavailable' ? (
          <p className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-semibold text-warning">
            이 탭에서만 편집을 이어갈 수 있어요. 새로고침하면 구성이 사라질 수
            있어요.
          </p>
        ) : null}
      </div>

      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          직접 운동 목록 구성
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          운동을 추가하고 세트별 목표를 정해 주세요.
        </p>
      </header>

      <section aria-labelledby="compose-day-title">
        <h2 id="compose-day-title" className={composeSectionTitle}>
          <span aria-hidden="true" className={stepBadge}>
            1
          </span>
          언제 운동할까요?
        </h2>
        <div
          role="group"
          aria-label="운동 날짜"
          className="mt-3 grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            aria-pressed="true"
            className={`flex min-h-14 cursor-default flex-col items-start justify-center rounded-card border border-exercise bg-exercise-soft px-4 text-left ${composeFocusRing}`}
          >
            <span className="text-body font-semibold text-exercise">
              오늘 운동 목록
            </span>
            <span className="text-support font-normal text-muted">
              {todayLabel()}
            </span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            className={`flex min-h-14 cursor-not-allowed flex-col items-start justify-center rounded-card border border-line bg-surface px-4 text-left ${composeFocusRing}`}
          >
            <span className="text-body font-normal text-muted">
              내일 운동 목록
            </span>
            <span className="text-support font-normal text-muted">준비 중</span>
          </button>
        </div>
      </section>

      <section aria-labelledby="compose-list-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="compose-list-title" className={composeSectionTitle}>
            <span aria-hidden="true" className={stepBadge}>
              2
            </span>
            운동 목록 구성
          </h2>
          <Link
            id="compose-add-link"
            to={PATH_SELECT}
            state={{ from: PATH_COMPOSE }}
            className={composeSecondaryButton}
          >
            ＋ 운동 등록하기
          </Link>
        </div>
        {/* 등록 결과 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역 */}
        <div aria-live="polite">
          {pickerResult ? (
            <p
              role="status"
              className="mt-3 text-support leading-relaxed font-normal text-exercise"
            >
              운동 {pickerResult.added}개를 추가했어요.
              {pickerResult.skipped > 0
                ? ` 이미 있는 운동 ${pickerResult.skipped}개는 건너뛰었어요.`
                : ''}
            </p>
          ) : null}
        </div>

        {draft.items.length === 0 ? (
          <p
            className={`mt-3 text-center break-keep text-body leading-relaxed font-normal text-muted ${composeCard}`}
          >
            아직 등록한 운동이 없어요.
            <br />
            즐겨찾기나 검색으로 운동을 찾아 추가해 주세요.
          </p>
        ) : (
          <>
            <p className="mt-3 text-body leading-relaxed font-normal text-muted">
              운동별 기록 방식을 선택하고 세트별 목표를 설정해 주세요.
            </p>
            <ol role="list" className="mt-3 flex flex-col gap-3">
              {draft.items.map((item, index) => (
                <ComposeItemCard
                  key={item.itemId}
                  item={item}
                  index={index}
                  total={draft.items.length}
                  issues={liveIssues.filter(
                    (issue) => issue.itemId === item.itemId,
                  )}
                  actions={actions}
                />
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="text-support leading-relaxed font-normal text-muted">
        시간형은 초, 중량형은 횟수·kg, 횟수형은 횟수로 설정해요. 덤벨은 한 손에
        드는 1개 기준이에요. 처음 채워진 값은 편집용 예시이며 최종 검토에서
        확정해요.
      </p>

      <div className="flex flex-col gap-3">
        {visibleAttempt?.kind === 'errors' ? (
          <div
            role="alert"
            className="rounded-card border border-danger bg-danger-soft p-4 text-body leading-relaxed font-normal text-danger"
          >
            <p className="font-semibold">
              입력을 확인해 주세요. 고칠 곳이 {visibleAttempt.issues.length}개
              있어요.
            </p>
            <ul role="list" className="mt-2 list-none">
              {visibleAttempt.issues.map((issue, index) => (
                <li key={index}>
                  {itemName(issue.itemId) ? `${itemName(issue.itemId)} ` : ''}
                  {issue.setIndex !== undefined
                    ? `${issue.setIndex + 1}세트 `
                    : ''}
                  · {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역 */}
        <div id="compose-review-live" aria-live="polite">
          {visibleAttempt?.kind === 'pending' ? (
            <p
              className={`${composeCard} text-body leading-relaxed font-normal text-content`}
            >
              운동 목록 최종 검토 기능을 준비하고 있어요.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleReview}
          className={composePrimaryButton}
        >
          운동 목록 등록 · 최종 검토
        </button>
        <Link to={PATH_BACK} className={composeSecondaryButton}>
          목록 선택으로 돌아가기
        </Link>
      </div>
    </div>
  )
}

export default function ExerciseComposePage() {
  const { user } = useAuth()
  // 사용자가 바뀌면 화면 안내 상태도 새로 만든다(초안 자체의 격리는 WorkoutDraftProvider가 한다).
  return <ComposeBody key={user?.id ?? ''} />
}
