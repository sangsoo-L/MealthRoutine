import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import GoalPinForm from '../components/exercise/goal/GoalPinForm.tsx'
import { mealSecondaryButton } from '../components/food/foodStyles.ts'
import MealGoalCurrentCard from '../components/meal/goal/MealGoalCurrentCard.tsx'
import MealGoalForm from '../components/meal/goal/MealGoalForm.tsx'
import MealGoalProfileForm from '../components/meal/goal/MealGoalProfileForm.tsx'
import { goalCard } from '../components/meal/goal/mealGoalStyles.ts'
import { PATH_MEAL } from '../food/foodPaths.ts'
import { resolveReturnPath } from '../meal-goal/mealGoalPaths.ts'
import { mealGoalMessage } from '../meal-goal/mealGoalMessages.ts'
import { isMealGoalSaveEnabled } from '../meal-goal/mealGoalPolicy.ts'
import {
  type GoalDraft,
  type ProfileDraft,
} from '../meal-goal/mealGoalValidation.ts'
import { useMealGoalForm } from '../meal-goal/useMealGoalForm.ts'

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
  } = useMealGoalForm(ownerId)
  const [editingProfile, setEditingProfile] = useState(false)
  // 열람 시간이 끝나 폼이 사라져도 입력 중이던 값은 여기에 남아, 비밀번호를 다시 확인하면 이어서 쓸 수 있다.
  const [goalDraft, setGoalDraft] = useState<GoalDraft | undefined>()
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | undefined>()
  const navigate = useNavigate()
  const location = useLocation()
  // 돌아갈 곳: 들어온 화면(D01 또는 AI 식단 플랜). 허용 목록 밖의 값이면 식단 대시보드(D01)다.
  const from = (location.state as { from?: unknown } | null)?.from
  const returnTo = resolveReturnPath(from, PATH_MEAL)
  const existing =
    state.status === 'locked' || state.status === 'unlocked' ? state.goal : null
  const saveEnabled = isMealGoalSaveEnabled()

  useEffect(() => {
    const previousTitle = document.title
    document.title = '식단 목표 설정 | 밀스루틴'
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <span className="inline-flex items-center rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-semibold text-meal">
          식단 목표
        </span>
        <h1 className="mt-2 text-app-title leading-snug font-semibold text-content">
          {existing ? '목표 다시 정하기' : '식단 목표 정하기'}
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          목적을 고르면 하루 열량과 탄단지 비율을 계산해 보여 드려요.
        </p>
      </header>
      {!saveEnabled ? (
        <p
          role="note"
          data-meal-goal-policy-note=""
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          식단 목표를 계산하는 기준은 전문가 검증을 기다리고 있어요. 지금은
          입력과 확인만 해 볼 수 있고, 목표를 저장할 수는 없어요.
        </p>
      ) : null}
      {import.meta.env.DEV ? (
        <p
          role="note"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          개발용 화면이에요. 실제 개인정보 대신 테스트 정보를 입력해 주세요.
          입력한 정보는 이 브라우저에만 저장돼요.
        </p>
      ) : null}
      <div aria-live="polite">
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-meal-soft px-3 py-2 text-support leading-relaxed text-meal"
          >
            {notice}
          </p>
        ) : null}
      </div>

      {existing ? <MealGoalCurrentCard goal={existing} /> : null}

      {state.status === 'loading' ? (
        <p role="status" className={goalCard}>
          식단 목표 정보를 불러오는 중이에요…
        </p>
      ) : state.status === 'unavailable' ? (
        <p role="status" data-meal-goal-unavailable="" className={goalCard}>
          식단 목표 저장 기능을 준비 중이에요. 현재는 목표를 읽거나 저장할 수
          없어요.
        </p>
      ) : state.status === 'error' ? (
        <div role="alert" className={goalCard}>
          <p className="text-body leading-relaxed text-danger">
            {mealGoalMessage(state.error)}
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className={`mt-4 w-full ${mealSecondaryButton}`}
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
            <p className="text-support leading-relaxed font-normal text-muted">
              확인 후 1분 동안 열람할 수 있어요. 화면을 떠나면 다시 숨겨져요.
            </p>
            <button
              type="button"
              onClick={() => lock()}
              className="min-h-11 cursor-pointer rounded-control px-2 text-support font-semibold text-meal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal"
            >
              지금 숨기기
            </button>
          </div>
          {!state.profile || editingProfile ? (
            <MealGoalProfileForm
              profile={state.profile}
              prefill={state.prefill}
              initialDraft={profileDraft}
              onDraftChange={setProfileDraft}
              save={async (value) => {
                await saveProfile(value)
                // 신체 정보가 바뀌면 그 정보로 채운 직접 조정 값은 더 이상 맞지 않아 처음부터 다시 시작한다.
                setGoalDraft(undefined)
                setProfileDraft(undefined)
                setEditingProfile(false)
              }}
              cancel={() => {
                setEditingProfile(false)
                lock()
              }}
            />
          ) : (
            <MealGoalForm
              // 신체 정보가 바뀌면 폼을 새로 시작해 오래된 계산 결과가 남지 않게 한다.
              key={`${state.profile.updatedAt}#${state.profile.age}#${state.level}`}
              level={state.level}
              levelSource={state.levelSource}
              profile={state.profile}
              existing={state.goal}
              initialDraft={goalDraft}
              onDraftChange={setGoalDraft}
              save={async (goal) => {
                await saveGoal(goal)
                navigate(returnTo, { replace: true })
              }}
              editProfile={() => setEditingProfile(true)}
              cancel={() => {
                lock()
                navigate(returnTo)
              }}
            />
          )}
        </>
      )}
      <Link to={returnTo} className={mealSecondaryButton}>
        {returnTo === PATH_MEAL
          ? '식단 기록으로 돌아가기'
          : 'AI 서비스 안내로 돌아가기'}
      </Link>
    </div>
  )
}

export default function MealGoalPage() {
  const { user } = useAuth()
  return user ? <GoalPageBody key={user.id} ownerId={user.id} /> : null
}
