import logoUrl from '../../assets/images/logo/mealthroutine-logo-icon.svg'

/**
 * 공식 로고를 위쪽·아래쪽 두 조각으로 나눠 보여 주는 컴포넌트.
 *
 * 공식 SVG는 PNG를 그대로 담은 파일이라 조각이 따로 없다. 같은 이미지를 두 겹 쌓고
 * clip-path로 위쪽·아래쪽 조각만 남긴다. 두 조각을 원래 자리에 놓으면 원본과 같은 모양이다.
 *
 * 아래 숫자는 원본 이미지(1254×1254px)를 분석한 값이다.
 * - 로고 영역(알파 16 이상): x 245~1016, y 366~886
 * - 분리선: 두 조각 사이의 빈 틈(최소 21px)을 따라가며 조각 본체와 닿지 않는다.
 *   (좌표는 이미지 전체 크기에 대한 퍼센트)
 * 로고 이미지를 교체하면 이 값을 다시 계산해야 한다.
 */
const SOURCE_SIZE = 1254
const MARK = { x: 245, y: 366, width: 772, height: 521 }
const SPLIT_LINE: ReadonlyArray<readonly [number, number]> = [
  [0, 51.2],
  [44.98, 51.2],
  [47.85, 50.16],
  [48.96, 49.8],
  [49.12, 49.8],
  [49.6, 49.6],
  [49.76, 49.6],
  [50.08, 49.44],
  [51.67, 49.04],
  [54.39, 48.72],
  [100, 48.72],
]

const toPoint = ([x, y]: readonly [number, number]) => `${x}% ${y}%`
const UPPER_CLIP = `polygon(0% 0%, 100% 0%, ${[...SPLIT_LINE].reverse().map(toPoint).join(', ')})`
const LOWER_CLIP = `polygon(${SPLIT_LINE.map(toPoint).join(', ')}, 100% 100%, 0% 100%)`

/** 이미지 전체를 로고 영역 크기의 상자 안에 맞추는 위치와 크기 (상자 기준 퍼센트) */
const LAYER_GEOMETRY = {
  width: `${(SOURCE_SIZE / MARK.width) * 100}%`,
  left: `${(-MARK.x / MARK.width) * 100}%`,
  top: `${(-MARK.y / MARK.height) * 100}%`,
}

interface SplitLogoProps {
  /** true이면 두 조각이 등장해 결합하는 애니메이션을 시작하고, false이면 숨겨 둔다 */
  animate: boolean
  onLoad: () => void
  onError: () => void
}

export default function SplitLogo({
  animate,
  onLoad,
  onError,
}: SplitLogoProps) {
  const hidden = 'invisible'
  return (
    <div
      aria-hidden="true"
      className="relative w-40"
      style={{ aspectRatio: `${MARK.width} / ${MARK.height}` }}
    >
      <img
        src={logoUrl}
        alt=""
        width={SOURCE_SIZE}
        height={SOURCE_SIZE}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
        className={`absolute max-w-none select-none ${animate ? 'animate-intro-logo-top motion-reduce:animate-none' : hidden}`}
        style={{ ...LAYER_GEOMETRY, clipPath: UPPER_CLIP }}
      />
      <img
        src={logoUrl}
        alt=""
        width={SOURCE_SIZE}
        height={SOURCE_SIZE}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
        className={`absolute max-w-none select-none ${animate ? 'animate-intro-logo-bottom motion-reduce:animate-none' : hidden}`}
        style={{ ...LAYER_GEOMETRY, clipPath: LOWER_CLIP }}
      />
    </div>
  )
}
