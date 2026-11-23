import { useState } from 'react'
import { Link } from 'react-router'
import { FOCUS_LABEL } from '../../../health-goal/goalPolicy.ts'
import type {
  HealthGoalInput,
  HealthGoalState,
} from '../../../health-goal/goalTypes.ts'
import { PATH_MEAL_GOAL } from '../../../meal-goal/mealGoalPaths.ts'
import type { KnowledgeState } from '../../../mypage/mypageTypes.ts'
import { noticeClass, secondaryButtonClass } from '../../auth/authStyles.ts'
import { GoalForm } from '../../health-goal/HealthGoalSheet.tsx'
import RatioBar from '../../health-goal/RatioBar.tsx'
import Icon from '../../icons/Icon.tsx'
import { cardClass, sectionTitleClass } from '../../mypage/myStyles.ts'

/** P10 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_HEALTH_GOAL_SETTINGS = '/settings/health-goal'
const PATH_EXERCISE_GOAL = '/records/exercise/goal'
const PATH_PROFILE = '/settings/profile'

/** 서버 연결 전 안내. 조회·저장 수단이 없어 설정 폼을 열지 않는다. */
export const GOAL_UNAVAILABLE_TEXT =
  '건강 목표 기능은 서비스 연결을 준비하고 있어요. 지금은 목표를 보거나 저장할 수 없어요.'

const rowClass = `flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-body leading-snug font-semibold text-content transition-colors hover:bg-page motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand`

/**
 * P10 건강 목표 상세 설정(화면명세 v5.0). 기존 건강 목표 설정 폼(GoalForm)을 시트가 아니라 전체 화면으로 재사용한다.
 *
 * - 현재 목표(관리 방향·운동/식단 비율·비율 막대)와 목표 설정·변경 폼을 한 화면에서 보인다. 선택지·검증(간편 선택 70:30·30:70·50:50,
 *   직접 설정 20~80% 10% 단위, 이해도 등급에 따른 방식)은 기존 정책 그대로이고 새 계산식·추천은 없다. 저장은 기존 건강 목표 저장소(`save`)가 하며
 *   저장 완료 안내는 저장이 성공한 뒤에만 나온다. 취소는 저장하지 않고 돌아간다.
 * - 조회 중·조회 실패(다시 시도)·연결 전(폼 없음)을 구분하고 "목표 없음"은 조회가 끝나고 실제로 저장된 목표가 없을 때만이다.
 * - 운동 목표(W01-1)·식단 목표(D01-4)·알레르기·프로필(P02)은 각 화면으로 가는 링크다(신체 정보가 필요한 목표 설정은 그 화면의 기존 안내를 따른다).
 */
export default function HealthGoalSettingsView({
  goal,
  knowledge,
  save,
  onRetry,
  onCancel,
}: {
  goal: HealthGoalState
  knowledge: KnowledgeState
  save: (input: HealthGoalInput) => Promise<unknown>
  onRetry: () => void
  /** 취소·돌아가기. 저장하지 않고 이전 화면으로 간다. */
  onCancel: () => void
}) {
  const [saved, setSaved] = useState(false)
  const current = goal.status === 'ready' ? goal.goal : null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          건강 목표 상세 설정
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          운동과 식단을 모두 관리하되, 더 신경 쓰고 싶은 쪽의 비중을 정해요.
        </p>
      </header>

      {goal.status === 'unavailable' ? (
        <p
          role="status"
          data-goal-state="unavailable"
          className={`${noticeClass} mt-0`}
        >
          {GOAL_UNAVAILABLE_TEXT}
        </p>
      ) : null}

      <section aria-labelledby="goal-current-title" className={cardClass}>
        <h2 id="goal-current-title" className={sectionTitleClass}>
          현재 건강 목표
        </h2>
        <div className="mt-2.5">
          {goal.status === 'loading' ? (
            <p
              role="status"
              data-goal-state="loading"
              className="text-body leading-snug font-normal text-muted"
            >
              불러오는 중이에요.
            </p>
          ) : null}
          {goal.status === 'error' ? (
            <div role="alert" data-goal-state="error">
              <p className="text-body leading-snug font-normal text-danger">
                건강 목표를 불러오지 못했어요. 목표가 없는 것은 아니에요.
              </p>
              <button
                type="button"
                data-goal-retry=""
                onClick={onRetry}
                className={`${secondaryButtonClass} mt-2`}
              >
                다시 시도
              </button>
            </div>
          ) : null}
          {goal.status === 'unavailable' ? (
            <p className="text-body leading-snug font-normal text-muted">
              건강 목표 정보를 아직 불러올 수 없어요.
            </p>
          ) : null}
          {goal.status === 'ready' && current === null ? (
            <p
              data-goal-state="empty"
              className="text-body leading-relaxed font-normal text-muted"
            >
              아직 설정한 건강 목표가 없어요. 아래에서 방식을 골라 설정해
              보세요.
            </p>
          ) : null}
          {current ? (
            <div data-goal-current="">
              <p className="text-section-title leading-snug font-semibold text-content">
                {FOCUS_LABEL[current.focus]}
              </p>
              <p className="mt-0.5 text-body leading-snug font-normal text-muted tabular-nums">
                운동 {current.exerciseRatio}% · 식단 {current.mealRatio}%
              </p>
              <div className="mt-2.5">
                <RatioBar exerciseRatio={current.exerciseRatio} />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {goal.status === 'ready' ? (
        <section aria-labelledby="goal-form-title" className="px-1">
          <h2 id="goal-form-title" className={sectionTitleClass}>
            {current ? '건강 목표 변경' : '건강 목표 설정'}
          </h2>
          <div className="mt-3" data-goal-form="">
            <GoalForm
              key={current?.updatedAt ?? 'none'}
              goal={current}
              knowledge={knowledge}
              save={async (input) => {
                setSaved(false)
                await save(input)
              }}
              close={onCancel}
              closing={false}
              onSaved={() => setSaved(true)}
            />
          </div>
        </section>
      ) : null}

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. 저장이 성공한 뒤에만 안내가 나온다. */}
      <div role="status" className="empty:hidden">
        {saved ? (
          <p
            data-goal-saved=""
            className="rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content"
          >
            건강 목표를 저장했어요.
          </p>
        ) : null}
      </div>

      {goal.status === 'unavailable' ? (
        <button
          type="button"
          data-goal-back=""
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          돌아가기
        </button>
      ) : null}

      <nav aria-label="관련 목표 설정">
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {[
            {
              to: PATH_EXERCISE_GOAL,
              label: '운동 목표 설정',
              key: 'exercise',
            },
            { to: PATH_MEAL_GOAL, label: '식단 목표 설정', key: 'meal' },
            { to: PATH_PROFILE, label: '알레르기·프로필 수정', key: 'profile' },
          ].map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                state={{ from: PATH_HEALTH_GOAL_SETTINGS }}
                data-goal-link={item.key}
                className={rowClass}
              >
                <span className="min-w-0">{item.label}</span>
                <Icon
                  name="chevron-right"
                  size={18}
                  className="shrink-0 text-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
