import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Icon from '../icons/Icon.tsx'

/** 닫힘 애니메이션 시간(ms). 아래 패널·배경의 duration-200(200ms)과 같은 값이므로 함께 바꾼다. 열림은 CSS의 starting 상태로 같은 시간 동안 올라온다. */
const EXIT_MS = 200

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface BottomSheetProps {
  /** 시트 제목(보조기기에는 dialog의 이름이 된다) */
  title: string
  /** 닫힘 애니메이션이 끝난 뒤 호출된다. 부모는 여기서 시트를 언마운트한다. */
  onClose: () => void
  /** 내용. 받은 close()를 부르면 닫힘 애니메이션 후 onClose가 호출된다. closing이 true인 동안은 선택 등 조작을 무시한다. */
  children: (close: () => void, closing: boolean) => ReactNode
}

/**
 * 모바일 바텀시트. 화면 아래에서 올라오는 모달 대화상자이며 앱 프레임(최대 390px) 폭을 따른다.
 * 부모는 열려 있는 동안에만 이 컴포넌트를 렌더링한다(닫기는 close → onClose).
 *
 * 접근성·동작:
 * - role="dialog", aria-modal, 제목 연결. 열리면 선택된 항목(없으면 첫 항목)으로 포커스가 가고, 닫히면 열기 전 포커스로 돌아간다.
 * - 배경(#root)은 inert로 막아 조작·읽기가 되지 않게 하고, Tab·Shift+Tab은 시트 안에서만 순환한다.
 * - Escape, 어두운 배경 누르기, 닫기 버튼으로 닫는다. 열려 있는 동안 배경 페이지 스크롤을 잠근다.
 * - 화면이 낮으면 내용 영역만 스크롤하고, 아래 여백은 기기 안전 영역(env(safe-area-inset-bottom))을 따른다.
 * - 움직임을 줄이는 설정(prefers-reduced-motion)에서는 애니메이션 없이 바로 나타나고 사라진다.
 * 브라우저 뒤로가기는 시트를 닫는 용도로 가로채지 않는다(기록을 쌓지 않으므로 페이지 이동과 충돌하지 않는다).
 */
export default function BottomSheet({
  title,
  onClose,
  children,
}: BottomSheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  /** 닫기를 요청한다. 닫힘 애니메이션을 재생한 뒤 onClose가 호출된다(여러 번 불러도 한 번만 닫힌다). */
  const close = () => setClosing(true)

  // 닫기 요청 후 애니메이션이 끝날 때까지 기다렸다가 부모에게 알린다. 움직임을 줄이는 설정이면 바로 알린다.
  useEffect(() => {
    if (!closing) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => onCloseRef.current(),
      reduce ? 0 : EXIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [closing])

  // 열려 있는 동안: 스크롤 잠금, 배경 inert, 포커스 이동·복귀, Escape.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight
    // 스크롤바가 사라져도 화면이 옆으로 밀리지 않게 그 폭만큼 오른쪽 여백을 둔다.
    // 이미 스크롤바 자리를 유지하는 설정(scrollbar-gutter: stable, 큰 화면)이면 보정하지 않는다(이중 보정 방지).
    const gutterKept = getComputedStyle(
      document.documentElement,
    ).scrollbarGutter.includes('stable')
    const scrollbar = gutterKept
      ? 0
      : window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    root?.setAttribute('inert', '')

    const panel = panelRef.current
    const target =
      panel?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('[role="option"], button')
    target?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setClosing(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
      root?.removeAttribute('inert')
      // 페이지가 바뀌어 원래 요소가 없어졌다면 복귀하지 않는다.
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  /** Tab·Shift+Tab이 시트 밖으로 나가지 않게 처음과 끝을 이어 준다. */
  function trapTab(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    // Tab으로 닿는 것(tabIndex ≥ 0)만 센다. 방향키로만 닿는 항목(roving tabindex의 -1)은 처음·끝 판단에서 뺀다.
    const items = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ].filter((el) => el.tabIndex >= 0)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (
      event.shiftKey &&
      (active === first || !panelRef.current?.contains(active))
    ) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={trapTab}>
      {/* 어두운 배경: 누르면 닫는다. 키보드 사용자는 Escape와 닫기 버튼을 쓰므로 보조기기에는 숨긴다. */}
      <div
        aria-hidden="true"
        onClick={close}
        className={`absolute inset-0 bg-content/40 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100'}`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] w-full max-w-app flex-col rounded-t-card bg-surface transition-transform duration-200 ease-out starting:translate-y-full motion-reduce:transition-none ${closing ? 'pointer-events-none translate-y-full' : 'translate-y-0'}`}
      >
        {/* 드래그 손잡이: 모양만 있고 끌어서 닫는 기능은 없다. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line"
        />
        <div className="flex shrink-0 items-center justify-between pr-2 pl-5">
          <h2
            id={titleId}
            className="py-3 text-section-title leading-snug font-semibold text-content"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={`${title} 닫기`}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children(close, closing)}
        </div>
      </div>
    </div>,
    document.body,
  )
}
