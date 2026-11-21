import { useState, type ReactNode } from 'react'
import type { Exercise } from '../../exercise/exerciseTypes.ts'
import { useExerciseFavorite } from '../../exercise/useExerciseFavorite.ts'
import Icon from '../icons/Icon.tsx'
import { FAVORITE_MESSAGES } from './favoriteMessages.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

type Notice = 'unavailable'

const noticeBox = 'mt-3 rounded-card border border-line bg-surface p-4'
const noticeText = 'text-body leading-relaxed font-normal text-content'

// 승인된 즐겨찾기 안내 문구는 운동 선택(W13)과 같이 쓰도록 favoriteMessages.ts에 있다.
const MESSAGES = FAVORITE_MESSAGES

/**
 * 회원 전용: 운동명 줄에 즐겨찾기 별 버튼과 안내를 붙인다. 회원일 때만 마운트되므로(ExerciseTitleRow) 별 버튼과 안내는 비회원 DOM에 없다.
 * 즐겨찾기 상태는 FavoritesProvider가 계정별로 한 번만 불러와 공유하며(비회원이면 저장소를 만들지 않는다), 이 컴포넌트는 그 값을 쓰기만 한다.
 * - 등록·해제한다. 저장이 끝난 뒤에만 표시가 바뀌고, 저장 중에는 다시 눌러도 무시한다.
 * - 데이터 소스 미연결(운영 빌드 등): 누르면 "기능을 준비하고 있어요" 안내. 저장하지 않는다.
 * - 조회·저장 실패: 안내하고 별 버튼을 다시 누르면 다시 시도한다(버튼이 그대로 있어 포커스가 사라지지 않는다). 조회 실패일 때는
 *   별 버튼의 접근 이름이 "다시 시도"를 알린다.
 * 접근 이름은 상태를 글자로 알린다("즐겨찾기에 추가"·"즐겨찾기 해제"). 별 아이콘의 채움·색만으로 상태를 전하지 않는다.
 * 바뀐 결과는 보이지 않는 안내(role=status)로 읽어 준다.
 */
function FavoriteTitleRow({
  exercise,
  heading,
}: {
  exercise: Exercise
  heading: ReactNode
}) {
  const { state, saving, saveFailed, toggle, reload } = useExerciseFavorite(
    exercise.id,
  )
  const [notice, setNotice] = useState<Notice | null>(null)
  const [announce, setAnnounce] = useState('')

  const favorite = state.status === 'ready' && state.favorite
  const waiting = state.status === 'loading' || saving

  const label =
    state.status === 'loading'
      ? `즐겨찾기 상태 확인 중: ${exercise.name}`
      : state.status === 'error'
        ? `${MESSAGES.loadFailed} 다시 시도: ${exercise.name}`
        : favorite
          ? `즐겨찾기 해제: ${exercise.name}`
          : `즐겨찾기에 추가: ${exercise.name}`

  async function handleClick() {
    setAnnounce('')
    // guest는 이 컴포넌트가 마운트되지 않는 상태라 닿지 않는다(방어). 조회 중에는 누름을 무시한다.
    if (state.status === 'guest' || state.status === 'loading') return
    if (state.status === 'unavailable') {
      setNotice('unavailable')
      return
    }
    if (state.status === 'error') {
      reload()
      return
    }
    setNotice(null)
    const result = await toggle()
    if (result === 'added') setAnnounce(MESSAGES.added)
    else if (result === 'removed') setAnnounce(MESSAGES.removed)
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        {heading}
        <button
          type="button"
          aria-label={label}
          aria-disabled={waiting || undefined}
          onClick={() => void handleClick()}
          className={`-mt-1.5 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none ${focusRing} ${
            favorite
              ? 'border-exercise bg-exercise-soft text-exercise'
              : 'border-line bg-surface text-muted hover:border-exercise/40 hover:text-exercise'
          } ${waiting ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
        >
          <Icon name="star" size={21} filled={favorite} />
        </button>
      </div>

      {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역. 포커스는 누른 별 버튼에 그대로 둔다. */}
      <div aria-live="polite">
        {notice === 'unavailable' && state.status === 'unavailable' ? (
          <div className={noticeBox}>
            <p className={noticeText}>{MESSAGES.unavailable}</p>
          </div>
        ) : null}
        {state.status === 'error' ? (
          <div className={noticeBox}>
            <p className={noticeText}>{MESSAGES.loadFailed}</p>
          </div>
        ) : null}
        {saveFailed ? (
          <div className={noticeBox}>
            <p className={noticeText}>{MESSAGES.saveFailed}</p>
          </div>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {announce}
      </p>
    </>
  )
}

/**
 * 운동명(h1) 줄. 운동명은 모두에게 보이고, 즐겨찾기 별 버튼은 회원에게만 그린다(화면명세 v5.0 F02·P07·W13의 별 표현, 이름 오른쪽).
 * 비회원은 운동명만 그려서 별 버튼 자리에 빈 공간이 남지 않는다. 회원 여부는 호출하는 쪽(ExerciseDetailView)이 한 번 판정해 넘긴다.
 */
export default function ExerciseTitleRow({
  exercise,
  isMember,
}: {
  exercise: Exercise
  isMember: boolean
}) {
  const heading = (
    <h1 className="min-w-0 flex-1 text-app-title leading-snug font-semibold text-content">
      {exercise.name}
    </h1>
  )
  return isMember ? (
    <FavoriteTitleRow exercise={exercise} heading={heading} />
  ) : (
    heading
  )
}
