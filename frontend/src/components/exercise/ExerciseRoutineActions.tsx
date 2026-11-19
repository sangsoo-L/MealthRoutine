import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/authContext.ts'
import { planAddToToday } from '../../exercise/addToTodayDraft.ts'
import type { Exercise } from '../../exercise/exerciseTypes.ts'
import { useWorkoutDraft } from '../../exercise/workoutDraftContext.ts'
import Icon from '../icons/Icon.tsx'
import type { IconName } from '../icons/iconTypes.ts'
import {
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from './compose/composeStyles.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/** W02(직접 운동 목록 구성). E02에서 운동을 정한 경우 W12(구성 방법 선택)를 거치지 않고 바로 간다. */
const PATH_COMPOSE = '/records/exercise/compose'

const buttonBase = `flex cursor-pointer items-center justify-center gap-2 rounded-control px-4 text-body font-semibold transition-colors motion-reduce:transition-none ${focusRing}`

const TODAY_CLASS =
  'min-h-12 flex-[1.4] basis-36 bg-exercise text-surface hover:opacity-90 active:opacity-80'
const TOMORROW_CLASS =
  'min-h-12 flex-1 basis-32 border border-exercise bg-surface text-exercise hover:bg-exercise-soft active:bg-exercise-soft/70'

const TODAY_ICON: IconName = 'clipboard-check'
const TOMORROW_ICON: IconName = 'calendar-plus'

type Panel = null | 'choose' | 'confirmNew'

type Notice = { tone: 'info' | 'error'; title: string; body: string }

/**
 * 화면명세 v5.0 E02: "오늘 기록"(클립보드 체크)·"내일 계획"(캘린더 추가) 아이콘 버튼.
 * 목적이 다른 두 동작이라 모양으로 우선순위를 나눈다. 오늘 기록은 채운 주 버튼(더 크고 넓게), 내일 계획은 윤곽선 보조 버튼이다.
 *
 * - 오늘 기록: 이 운동을 W02(직접 운동 목록 구성)의 초안에 담고 W02로 이동한다. 운동명·기록 방식·기본 목표는 W02·W13과 같은 규칙이다.
 *   구성 중인 초안이 없으면 이 운동만 담은 새 초안으로 시작한다. 구성 중인 초안이 있으면 확인 전에는 바꾸지 않고
 *   "기존 구성에 추가 / 새 구성으로 시작 / 취소"를 고르게 한다(새 구성은 기존 구성이 사라진다고 알리고 한 번 더 확인한다, W12와 같은 정책).
 *   저장은 W02 → W11(최종 검토)에서만 한다. 이 화면은 운동 목록을 저장하지 않는다.
 * - 내일 계획: 예정일 기능이 없어 저장하지 않고 "준비 중"을 안내만 한다.
 *
 * 회원 전용이다. 비회원에게는 이 컴포넌트를 그리지 않는다(호출하는 ExerciseDetailView가 회원일 때만 렌더링). 그래서 이 안에는
 * 인증 분기가 없고, 비회원 화면에는 빈 컨테이너나 여백도 남지 않는다. 버튼 이름은 눈에 보이는 라벨로 시작해 어떤 운동에 대한 동작인지 알려 준다.
 */
function RoutineActions({ exercise }: { exercise: Exercise }) {
  const navigate = useNavigate()
  const { status, draft, replaceDraft, addExercises } = useWorkoutDraft()
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  // 이동이 끝나기 전의 반복 클릭이 같은 운동을 두 번 담거나 기록을 여러 번 쌓지 않게 한다.
  const moving = useRef(false)
  const todayRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 현재 초안 기준의 판단. 선택 사이에 초안이 바뀌어도(다른 탭 편집 등) 눌렀을 때의 최신 값으로 다시 판단한다.
  const plan = planAddToToday({
    memberReady: status === 'ready',
    draft,
    exercise,
  })
  const panelOpen =
    panel !== null && (plan.kind === 'choose' || plan.kind === 'blocked')

  useEffect(() => {
    if (panelOpen) panelRef.current?.focus()
  }, [panelOpen, panel])

  const failure: Notice = {
    tone: 'error',
    title: '오늘 운동 목록에 담지 못했어요',
    body: `‘${exercise.name}’은(는) 저장되지 않았어요. 잠시 후 다시 시도해 주세요.`,
  }

  function goCompose(added: number) {
    moving.current = true
    void navigate(PATH_COMPOSE, { state: { added, skipped: 0 } })
  }

  /** 새 초안으로 시작한다(구성 중인 초안이 없을 때, 또는 사용자가 "새 구성으로 시작"을 확인했을 때). 기존 초안을 한 번에 바꾼다. */
  function startFresh() {
    if (moving.current) return
    if (
      plan.kind !== 'start' &&
      plan.kind !== 'choose' &&
      plan.kind !== 'blocked'
    )
      return
    const draftToUse = plan.kind === 'start' ? plan.draft : plan.fresh
    if (!replaceDraft(draftToUse)) {
      setPanel(null)
      setNotice(failure)
      return
    }
    goCompose(1)
  }

  function handleToday() {
    if (moving.current) return
    setNotice(null)
    if (plan.kind === 'rejected') {
      setNotice(
        plan.reason === 'notMember'
          ? {
              tone: 'error',
              title: '로그인 후 담을 수 있어요',
              body: `‘${exercise.name}’은(는) 저장되지 않았어요.`,
            }
          : {
              tone: 'error',
              title: '이 운동은 담을 수 없어요',
              body: `운동 정보가 올바르지 않아 ‘${exercise.name}’을(를) 저장하지 못했어요.`,
            },
      )
      return
    }
    if (plan.kind === 'start') {
      startFresh()
      return
    }
    setPanel('choose')
  }

  function appendToExisting() {
    if (moving.current || plan.kind !== 'choose') return
    addExercises([exercise])
    goCompose(1)
  }

  function openExisting() {
    if (moving.current) return
    moving.current = true
    void navigate(PATH_COMPOSE)
  }

  function cancel() {
    setPanel(null)
    // 닫으면 눌렀던 버튼으로 포커스를 돌려 포커스가 사라지지 않게 한다.
    window.setTimeout(() => todayRef.current?.focus(), 0)
  }

  function handleTomorrow() {
    setPanel(null)
    setNotice({
      tone: 'info',
      title: '내일 계획은 아직 준비 중이에요',
      body: `‘${exercise.name}’은(는) 내일 계획에 저장되지 않았어요. 예정일 기능이 준비되면 여기서 바로 담을 수 있어요.`,
    })
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        <button
          ref={todayRef}
          type="button"
          aria-label={`오늘 기록에 추가: ${exercise.name}`}
          aria-expanded={panelOpen}
          aria-controls={panelOpen ? 'exercise-add-panel' : undefined}
          aria-describedby={notice ? 'exercise-routine-notice' : undefined}
          onClick={handleToday}
          className={`${buttonBase} ${TODAY_CLASS}`}
        >
          <Icon name={TODAY_ICON} size={20} />
          <span>오늘 기록</span>
        </button>
        <button
          type="button"
          aria-label={`내일 계획에 추가: ${exercise.name}`}
          aria-describedby={notice ? 'exercise-routine-notice' : undefined}
          onClick={handleTomorrow}
          className={`${buttonBase} ${TOMORROW_CLASS}`}
        >
          <Icon name={TOMORROW_ICON} size={20} />
          <span>내일 계획</span>
        </button>
      </div>

      {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역(포커스는 누른 버튼에 그대로 둔다). */}
      <div aria-live="polite">
        {notice ? (
          <div
            id="exercise-routine-notice"
            role={notice.tone === 'error' ? 'alert' : undefined}
            className="mt-3 rounded-card border border-line bg-surface p-4"
          >
            <p className="text-body leading-snug font-semibold text-content">
              {notice.title}
            </p>
            <p className="mt-1 text-body leading-relaxed font-normal text-muted">
              {notice.body}
            </p>
          </div>
        ) : null}
      </div>

      {panelOpen && (plan.kind === 'choose' || plan.kind === 'blocked') ? (
        <div
          ref={panelRef}
          id="exercise-add-panel"
          tabIndex={-1}
          role="group"
          aria-labelledby="exercise-add-panel-title"
          className={`mt-3 ${composeCardActive} outline-none`}
        >
          {panel === 'confirmNew' ? (
            <>
              <h2 id="exercise-add-panel-title" className={composeSectionTitle}>
                새 구성으로 시작할까요?
              </h2>
              <p className="mt-2 text-body leading-relaxed font-normal text-muted">
                구성 중이던 운동 {plan.itemCount}개가 사라지고 ‘{exercise.name}’
                하나로 새로 시작해요. 되돌릴 수 없어요. 저장해 둔 목록과 운동
                기록은 그대로예요.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={startFresh}
                  className={composePrimaryButton}
                >
                  지우고 새 구성으로 시작하기
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('choose')}
                  className={composeSecondaryButton}
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="exercise-add-panel-title" className={composeSectionTitle}>
                구성 중이던 운동 목록이 있어요
              </h2>
              <p className="mt-2 text-body leading-relaxed font-normal text-muted">
                {plan.kind === 'blocked'
                  ? plan.reason === 'duplicate'
                    ? `‘${exercise.name}’은(는) 구성 중인 목록(${plan.itemCount}개)에 이미 있어서 다시 담지 않아요.`
                    : `운동은 최대 500개까지 담을 수 있어서 ‘${exercise.name}’을(를) 더 담을 수 없어요.`
                  : `운동 ${plan.itemCount}개가 담겨 있어요. ‘${exercise.name}’을(를) 여기에 추가하거나, 지금 구성을 지우고 새로 시작할 수 있어요.`}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {plan.kind === 'choose' ? (
                  <button
                    type="button"
                    onClick={appendToExisting}
                    className={composePrimaryButton}
                  >
                    기존 구성에 추가하기
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openExisting}
                    className={composePrimaryButton}
                  >
                    구성 중인 목록 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanel('confirmNew')}
                  className={composeSecondaryButton}
                >
                  새 구성으로 시작하기
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className={composeSecondaryButton}
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** 계정이 바뀌거나 다른 운동으로 이동하면 확인 패널·안내를 새로 시작한다(이전 계정·운동의 선택이 남지 않는다). */
export default function ExerciseRoutineActions({
  exercise,
}: {
  exercise: Exercise
}) {
  const { user } = useAuth()
  return (
    <RoutineActions
      key={`${user?.id ?? ''}|${exercise.id}`}
      exercise={exercise}
    />
  )
}
