import { Link } from 'react-router'
import type { RoutinesState } from '../../exercise/useRoutines.ts'
import { PATH_ROUTINE_NEW } from '../../exercise/routinePaths.ts'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../exercise/compose/composeStyles.ts'
import { RoutineRow } from './RoutineParts.tsx'

/**
 * W06 내 운동 루틴 본문. 상태별로 목록·빈 상태·불러오는 중·불러오지 못함·저장소 없음(준비 중)을 구분해 그린다.
 * - "새 루틴 만들기"는 전체 너비 버튼이며(W08), 루틴을 저장할 수 없는 환경(unavailable)에서는 눌리지 않는 비활성 버튼과 이유를 보인다.
 * - 목록은 최근 수정 순이고 행 전체가 상세(W07)로 가는 링크다. 읽을 수 없는 루틴이 있으면 건수만 알리고 정상 루틴은 숨기지 않는다.
 * - 저장소가 없으면(계정 없음) 가짜 루틴을 보이지 않고 "준비 중"으로 안내한다.
 */
export default function RoutineListView({
  state,
  onRetry,
}: {
  state: RoutinesState
  onRetry: () => void
}) {
  const unavailable = state.status === 'unavailable'
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          내 운동 루틴
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          자주 하는 운동 구성을 루틴으로 저장해 두고 다시 써요.
        </p>
      </header>

      {unavailable ? (
        <div>
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="routine-new-reason"
            className="flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-control bg-line px-4 text-body font-semibold text-muted"
          >
            새 루틴 만들기
          </button>
          <p
            id="routine-new-reason"
            className="mt-2 text-support leading-relaxed font-normal text-muted"
          >
            루틴 저장 기능을 준비 중이에요.
          </p>
        </div>
      ) : (
        <Link to={PATH_ROUTINE_NEW} className={composePrimaryButton}>
          새 루틴 만들기
        </Link>
      )}

      <section aria-labelledby="routine-list-title">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="routine-list-title" className={composeSectionTitle}>
            루틴 목록
          </h2>
          {state.status === 'ready' && state.items.length > 0 ? (
            <span className="text-support font-normal tabular-nums text-muted">
              {state.items.length}개
            </span>
          ) : null}
        </div>
        {state.status === 'loading' ? (
          <p role="status" className={`${composeCard} text-body text-muted`}>
            루틴을 불러오는 중이에요…
          </p>
        ) : state.status === 'unavailable' ? (
          <div className={composeCard}>
            <p className="text-body leading-snug font-semibold text-content">
              루틴 기능을 준비 중이에요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              이 환경에서는 저장한 루틴을 볼 수 없어요.
            </p>
          </div>
        ) : state.status === 'error' ? (
          <div role="alert" className={composeCard}>
            <p className="text-body leading-snug font-semibold text-content">
              루틴을 불러오지 못했어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              잠시 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className={`mt-3 w-full ${composeSecondaryButton}`}
            >
              다시 시도
            </button>
          </div>
        ) : state.items.length === 0 ? (
          <div className={composeCard}>
            <p className="text-body leading-snug font-semibold text-content">
              {state.skippedCount > 0
                ? '루틴을 확인할 수 없어요'
                : '아직 저장한 루틴이 없어요'}
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              {state.skippedCount > 0
                ? '저장된 루틴을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'
                : '첫 루틴을 만들어 보세요. 운동 순서와 세트별 목표를 저장해 두면 언제든 다시 불러와 쓸 수 있어요.'}
            </p>
          </div>
        ) : (
          <ul
            role="list"
            className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
          >
            {state.items.map((routine) => (
              <RoutineRow key={routine.id} routine={routine} />
            ))}
          </ul>
        )}
        {state.status === 'ready' && state.skippedCount > 0 ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            읽을 수 없는 루틴 {state.skippedCount}개를 제외했어요.
          </p>
        ) : null}
      </section>
    </div>
  )
}
