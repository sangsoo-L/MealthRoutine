import { useState } from 'react'
import { useFoodFavorite } from '../../food/useFoodFavorite.ts'
import { FAVORITE_MESSAGES } from '../exercise/favoriteMessages.ts'
import Icon from '../icons/Icon.tsx'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal'

/**
 * 음식 즐겨찾기 별 버튼(회원 전용). 비회원에게는 아무것도 그리지 않는다. 상태는 공유 상태(FoodFavoritesProvider)를 쓰므로 F01·F02·D02에서 같은 값이다.
 * - 저장이 끝난 뒤에만 표시가 바뀌고 저장 중에는 다시 눌러도 무시한다.
 * - 데이터 소스 미연결(운영 빌드 등)이면 누를 때 "준비하고 있어요" 안내만 하고 저장하지 않는다. 조회 실패면 누를 때 다시 불러온다.
 * - 접근 이름은 상태를 글자로 알린다("즐겨찾기에 추가"·"즐겨찾기 해제"). 바뀐 결과는 보이지 않는 안내(role=status)로 읽어 준다.
 * - 실패·미연결 안내는 버튼 아래에 보이는 글자로 둔다(색만으로 전하지 않는다).
 */
export default function FoodFavoriteButton({
  foodId,
  foodName,
}: {
  foodId: string
  foodName: string
}) {
  const { state, saving, saveFailed, toggle, reload } = useFoodFavorite(foodId)
  const [notice, setNotice] = useState<'unavailable' | null>(null)
  const [announce, setAnnounce] = useState('')
  if (state.status === 'guest') return null

  const favorite = state.status === 'ready' && state.favorite
  const waiting = state.status === 'loading' || saving
  const label =
    state.status === 'loading'
      ? `즐겨찾기 상태 확인 중: ${foodName}`
      : state.status === 'error'
        ? `${FAVORITE_MESSAGES.loadFailed} 다시 시도: ${foodName}`
        : favorite
          ? `즐겨찾기 해제: ${foodName}`
          : `즐겨찾기에 추가: ${foodName}`

  async function handleClick() {
    setAnnounce('')
    if (state.status === 'loading') return
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
    if (result === 'added') setAnnounce(FAVORITE_MESSAGES.added)
    else if (result === 'removed') setAnnounce(FAVORITE_MESSAGES.removed)
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        data-food-favorite
        aria-label={label}
        aria-pressed={state.status === 'ready' ? favorite : undefined}
        aria-disabled={waiting || undefined}
        onClick={() => void handleClick()}
        className={`flex size-11 items-center justify-center rounded-full border transition-colors motion-reduce:transition-none ${focusRing} ${
          favorite
            ? 'border-meal bg-meal-soft text-meal'
            : 'border-line bg-surface text-muted hover:border-meal/40 hover:text-meal'
        } ${waiting ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
      >
        <Icon name="star" size={21} filled={favorite} />
      </button>
      <p role="status" className="sr-only">
        {announce}
      </p>
      {notice === 'unavailable' && state.status === 'unavailable' ? (
        <p className="mt-1 max-w-40 text-support leading-snug font-normal text-muted">
          {FAVORITE_MESSAGES.unavailable}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-1 max-w-40 text-support leading-snug font-normal text-danger">
          {FAVORITE_MESSAGES.loadFailed}
        </p>
      ) : null}
      {saveFailed ? (
        <p
          role="alert"
          className="mt-1 max-w-40 text-support leading-snug font-normal text-danger"
        >
          {FAVORITE_MESSAGES.saveFailed}
        </p>
      ) : null}
    </div>
  )
}
