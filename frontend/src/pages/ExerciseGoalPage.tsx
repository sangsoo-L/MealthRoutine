import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ExerciseGoalForm from '../components/exercise/goal/ExerciseGoalForm.tsx'
import GoalPinForm from '../components/exercise/goal/GoalPinForm.tsx'
import GoalProfileForm from '../components/exercise/goal/GoalProfileForm.tsx'
import {
  goalCard,
  goalFocus,
  goalHeading,
  goalSecondary,
} from '../components/exercise/goal/goalStyles.ts'
import { exerciseGoalMessage } from '../exercise-goal/exerciseGoalMessages.ts'
import { TIER_LABEL } from '../exercise-goal/exerciseGoalPolicy.ts'
import { useExerciseGoal } from '../exercise-goal/useExerciseGoal.ts'
import { FOCUS_LABEL } from '../health-goal/goalPolicy.ts'

function GoalPageBody({ ownerId }: { ownerId: string }) {
  const {
    state,
    notice,
    reload,
    lock,
    registerPin,
    unlock,
    saveProfile,
    saveGoal,
  } = useExerciseGoal(ownerId)
  const [editingProfile, setEditingProfile] = useState(false)
  const navigate = useNavigate()
  const context =
    state.status === 'locked' || state.status === 'unlocked'
      ? state.context
      : null
  useEffect(() => {
    const previousTitle = document.title
    document.title = '운동 목표 설정 | 밀스루틴'
    return () => {
      document.title = previousTitle
    }
  }, [])
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          운동 목표 설정
        </h1>
        <p className="mt-2 text-body leading-relaxed text-muted">
          건강 목표와 운동 이해도에 맞춰 시작해요.
        </p>
      </header>
      {import.meta.env.DEV ? (
        <p
          role="note"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed text-warning"
        >
          개발용 화면이에요. 실제 개인정보 대신 테스트 정보를 입력해 주세요.
          입력한 정보는 이 브라우저에만 저장돼요.
        </p>
      ) : null}
      <div aria-live="polite">
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed text-exercise"
          >
            {notice}
          </p>
        ) : null}
      </div>
      {context ? (
        <section className={goalCard} aria-labelledby="goal-context-title">
          <h2 id="goal-context-title" className={goalHeading}>
            목표 설정에 반영할 정보
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-exercise-soft px-3 py-1 text-support font-semibold text-exercise">
              {FOCUS_LABEL[context.healthGoal.focus]}
            </span>
            <span className="rounded-full bg-page px-3 py-1 text-support font-semibold text-content">
              운동 이해도{' '}
              {context.exerciseTier
                ? TIER_LABEL[context.exerciseTier]
                : '미확인'}
            </span>
          </div>
          <p className="mt-2 text-support leading-relaxed tabular-nums text-muted">
            운동 {context.healthGoal.exerciseRatio}% · 식단{' '}
            {context.healthGoal.mealRatio}%
          </p>
          {context.knowledgeSource === 'dev-initial' ? (
            <p className="mt-2 text-support leading-relaxed text-muted">
              이해도는 개발용 초기값이에요. 응시 결과가 있으면 그 결과를
              우선해요.
            </p>
          ) : context.exerciseTier === null ? (
            <p className="mt-2 text-support leading-relaxed text-muted">
              이해도 결과가 없어 간편 설정을 제공해요. 초급으로 저장하거나
              평가하지 않아요.
            </p>
          ) : null}
        </section>
      ) : null}
      {state.status === 'loading' ? (
        <p role="status" className={goalCard}>
          목표 설정 정보를 불러오는 중이에요…
        </p>
      ) : state.status === 'missingHealthGoal' ? (
        <section className={goalCard}>
          <h2 className={goalHeading}>건강 목표를 먼저 설정해 주세요</h2>
          <p className="mt-2 text-body leading-relaxed text-muted">
            마이페이지에서 운동·식단의 관리 비중을 정하면 이 화면에서 운동
            목표를 이어서 설정할 수 있어요.
          </p>
          <Link to="/mypage" className={`mt-4 ${goalSecondary}`}>
            마이페이지에서 건강 목표 설정
          </Link>
        </section>
      ) : state.status === 'unavailable' ? (
        <p role="status" className={goalCard}>
          운동 목표 저장 기능을 준비 중이에요. 현재는 설정을 저장할 수 없어요.
        </p>
      ) : state.status === 'error' ? (
        <div role="alert" className={goalCard}>
          <p className="text-body leading-relaxed text-danger">
            {exerciseGoalMessage(state.error)}
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className={`mt-4 ${goalSecondary}`}
          >
            다시 불러오기
          </button>
        </div>
      ) : state.status === 'locked' ? (
        <GoalPinForm
          key={String(state.configured)}
          configured={state.configured}
          retryAt={state.retryAt}
          register={registerPin}
          unlock={unlock}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-support text-muted">
              확인 후 1분 동안 열람할 수 있어요. 화면을 떠나면 다시 숨겨져요.
            </p>
            <button
              type="button"
              onClick={() => lock()}
              className={`min-h-11 rounded-control px-2 text-support font-semibold text-exercise ${goalFocus}`}
            >
              지금 숨기기
            </button>
          </div>
          {!state.profile || editingProfile ? (
            <GoalProfileForm
              profile={state.profile}
              prefill={state.prefill}
              save={async (profile) => {
                await saveProfile(profile)
                setEditingProfile(false)
              }}
              cancel={() => {
                setEditingProfile(false)
                lock()
              }}
            />
          ) : (
            <ExerciseGoalForm
              key={`${state.profile.updatedAt}#${state.context.healthGoal.updatedAt}#${state.context.exerciseTier}`}
              context={state.context}
              profile={state.profile}
              saved={state.goal}
              save={async (draft) => {
                await saveGoal(draft)
                navigate('/records/exercise', {
                  replace: true,
                  state: { exerciseGoalSaved: true },
                })
              }}
              editProfile={() => setEditingProfile(true)}
              cancel={() => {
                lock()
                navigate('/records/exercise')
              }}
            />
          )}
        </>
      )}
      <Link to="/records/exercise" className={goalSecondary}>
        운동 기록으로 돌아가기
      </Link>
    </div>
  )
}

export default function ExerciseGoalPage() {
  const { user } = useAuth()
  return user ? <GoalPageBody key={user.id} ownerId={user.id} /> : null
}
