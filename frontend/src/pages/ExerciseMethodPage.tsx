import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  composeCard,
  composeCardActive,
  composeCardMuted,
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../components/exercise/compose/composeStyles.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'

const PATH_COMPOSE = '/records/exercise/compose'
/** W10(운동 목록)이 아직 없어 임시로 운동 기록 대시보드(W01)로 돌아간다. */
const PATH_BACK = '/records/exercise'

type Panel = null | 'resume' | 'confirm'

/**
 * W12 운동 목록 구성 방법 선택. AI 추천(준비 중)과 직접 구성 중 하나를 고른다. 회원 전용이며 비회원은 라우트의 AuthGate가 안내한다.
 *
 * - AI 추천: 이번 단계는 미구현이라 누를 수 없는 "준비 중" 항목이다(AI 호출·체험 횟수·멤버십 로직 없음).
 * - 직접 구성: 기존에 구성하던 운동이 없으면 새 빈 초안으로 W02에 간다. 있으면 시안의 즉시 초기화 대신 "이어서 하기"와 "새로 구성하기"를
 *   고르게 한다(새로 구성하기는 한 번 더 확인하고, 취소하면 초안은 그대로다). 이는 작업이 사라지는 것을 막는 UX 보완이다.
 */
export default function ExerciseMethodPage() {
  const navigate = useNavigate()
  const { draft, hasContent, startNew } = useWorkoutDraft()
  const [panel, setPanel] = useState<Panel>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const directRef = useRef<HTMLButtonElement>(null)

  // 안내 상자가 열리면 포커스를 그 안으로 옮겨 보조기기가 읽게 한다.
  useEffect(() => {
    if (panel) panelRef.current?.focus()
  }, [panel])

  function chooseDirect() {
    if (!hasContent) {
      startNew()
      navigate(PATH_COMPOSE)
      return
    }
    setPanel('resume')
  }

  function closePanel() {
    setPanel(null)
    // 닫으면 눌렀던 카드로 포커스를 돌려 포커스가 사라지지 않게 한다.
    window.setTimeout(() => directRef.current?.focus(), 0)
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          어떻게 구성할까요?
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          나에게 편한 방법으로 운동 목록을 준비해요.
        </p>
      </header>

      <ul
        role="list"
        aria-label="운동 목록 구성 방법"
        className="flex flex-col gap-3"
      >
        <li>
          <div
            className={composeCardMuted}
            aria-label="AI 추천으로 시작하기, 준비 중"
            role="group"
          >
            <div className="flex items-start justify-between gap-3">
              <span className={composeSectionTitle}>AI 추천으로 시작하기</span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-normal text-exercise">
                준비 중
              </span>
            </div>
            <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
              난이도·운동 부위·도구를 선택하면 추천 구성을 확인하고 수정할 수
              있어요.
            </p>
          </div>
        </li>
        <li>
          <button
            ref={directRef}
            type="button"
            aria-expanded={panel !== null}
            aria-controls={panel !== null ? 'method-panel' : undefined}
            onClick={chooseDirect}
            className={`${composeCard} flex w-full cursor-pointer flex-col items-start text-left transition-colors hover:border-exercise/40 motion-reduce:transition-none ${composeFocusRing}`}
          >
            <span className={composeSectionTitle}>직접 운동 목록 구성하기</span>
            <span className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
              원하는 운동을 고르고 순서·세트·횟수와 세트별 목표 시간을 직접
              정해요.
            </span>
            <span className="mt-2 text-support font-normal text-exercise">
              무료로 이용
            </span>
          </button>
        </li>
      </ul>

      {panel ? (
        <div
          ref={panelRef}
          id="method-panel"
          tabIndex={-1}
          role="group"
          aria-labelledby="method-panel-title"
          className={`${composeCardActive} outline-none`}
        >
          {panel === 'resume' ? (
            <>
              <h2 id="method-panel-title" className={composeSectionTitle}>
                이전에 구성하던 운동 목록이 있어요
              </h2>
              <p className="mt-2 text-body leading-relaxed font-normal text-muted">
                {draft.items.length}개 운동이 담겨 있어요. 이어서 하거나 새로
                구성할 수 있어요.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => navigate(PATH_COMPOSE)}
                  className={composePrimaryButton}
                >
                  기존 구성 이어서 하기
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('confirm')}
                  className={composeSecondaryButton}
                >
                  새로 구성하기
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className={composeSecondaryButton}
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="method-panel-title" className={composeSectionTitle}>
                새로 구성할까요?
              </h2>
              <p className="mt-2 text-body leading-relaxed font-normal text-muted">
                새로 구성하면 이전에 구성하던 운동 목록이 지워져요. 되돌릴 수
                없어요.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    startNew()
                    navigate(PATH_COMPOSE)
                  }}
                  className={composePrimaryButton}
                >
                  지우고 새로 구성하기
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('resume')}
                  className={composeSecondaryButton}
                >
                  취소
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <p className="text-support leading-relaxed font-normal break-keep text-muted">
        두 방법 모두 목록을 최종 검토한 뒤 운동을 시작해요.
      </p>

      <Link to={PATH_BACK} className={composeSecondaryButton}>
        운동 목록으로 돌아가기
      </Link>
    </div>
  )
}
