import { useRef, useState, type KeyboardEvent } from 'react'
import type { SetSlide } from '../../../exercise/workoutListView.ts'
import Icon from '../../icons/Icon.tsx'
import { composeFocusRing } from '../compose/composeStyles.ts'

const navButton = `flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-control border border-line bg-surface px-3 text-body font-semibold text-content hover:border-exercise/40 aria-disabled:cursor-not-allowed aria-disabled:text-muted aria-disabled:opacity-50 aria-disabled:hover:border-line motion-reduce:transition-none ${composeFocusRing}`

/**
 * 한 운동의 세트 목표를 가로로 넘겨 보는 슬라이더(스토리보드 W11). 세트별 목표 수치와 단위를 크게 보여 주고,
 * 모든 세트가 같으면 한 장으로 "동일 목표 × 세트"를 보여 준다. 슬라이드가 한 장이면 조작 영역을 그리지 않는다.
 *
 * - 가로 스크롤(scroll-snap)이라 터치로 넘길 수 있고, 이전·다음 버튼과 화살표 키로도 넘긴다. 가장자리에서는 버튼이 aria-disabled라 포커스를 잃지 않는다.
 * - 막대와 점은 현재 위치를 눈으로 알리는 장식이다(aria-hidden). 위치는 "2 / 3" 글자와 각 슬라이드의 이름으로도 전한다.
 * - prefers-reduced-motion이면 부드러운 이동 없이 바로 옮긴다.
 */
export default function SetSlider({
  slides,
  label,
}: {
  slides: readonly SetSlide[]
  /** 이 슬라이더가 가리키는 운동 이름(보조기기용). */
  label: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = slides.length
  const multiple = count > 1

  function go(next: number) {
    const track = trackRef.current
    if (!track) return
    const target = Math.min(Math.max(next, 0), count - 1)
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    track.scrollTo({
      left: target * track.clientWidth,
      behavior: reduced ? 'auto' : 'smooth',
    })
    setIndex(target)
  }

  function onScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(index - 1)
    }
  }

  return (
    <div className="mt-3">
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="슬라이더"
        aria-label={`${label} 세트 목표`}
        tabIndex={multiple ? 0 : undefined}
        onScroll={multiple ? onScroll : undefined}
        onKeyDown={multiple ? onKeyDown : undefined}
        className={`flex snap-x snap-mandatory overflow-x-auto rounded-control bg-page [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${composeFocusRing}`}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.key}
            role="group"
            aria-roledescription="슬라이드"
            aria-label={`${i + 1} / ${count}. ${slide.spoken}`}
            className="flex w-full shrink-0 snap-center flex-col items-center justify-center px-4 py-5 text-center"
          >
            <p className="text-support font-normal text-muted">
              {slide.heading}
            </p>
            <p className="mt-1 flex items-baseline justify-center gap-1">
              <span className="text-metric leading-none font-semibold tabular-nums text-content">
                {slide.main}
              </span>
              <span className="text-body font-normal text-muted">
                {slide.unit}
              </span>
            </p>
            {slide.extra ? (
              <p className="mt-1 text-section-title leading-snug font-semibold text-content">
                {slide.extra}
              </p>
            ) : null}
            {slide.repeat !== null ? (
              <p className="mt-2 text-body font-semibold text-exercise">
                × {slide.repeat}세트
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {multiple ? (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            aria-label="이전 세트 목표"
            aria-disabled={index === 0}
            onClick={() => {
              if (index > 0) go(index - 1)
            }}
            className={navButton}
          >
            <Icon name="arrow-left" size={18} />
            <span aria-hidden="true">이전</span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span
              aria-live="polite"
              className="text-support font-normal tabular-nums text-muted"
            >
              {index + 1} / {count}
            </span>
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-exercise transition-[width] motion-reduce:transition-none"
                style={{ width: `${((index + 1) / count) * 100}%` }}
              />
            </div>
            <div aria-hidden="true" className="flex gap-1">
              {slides.map((slide, i) => (
                <span
                  key={slide.key}
                  className={`size-1.5 rounded-full ${i === index ? 'bg-exercise' : 'bg-line'}`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label="다음 세트 목표"
            aria-disabled={index === count - 1}
            onClick={() => {
              if (index < count - 1) go(index + 1)
            }}
            className={navButton}
          >
            <span aria-hidden="true">다음</span>
            <Icon name="arrow-right" size={18} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
