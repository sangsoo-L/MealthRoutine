import LandingSectionHeader from './LandingSectionHeader.tsx'
import { LANDING_HOW } from './landingContent.ts'
import { LANDING_IMAGES } from './landingImages.ts'

const IMAGE = LANDING_IMAGES.hero

/**
 * 기록 방법과 주간 리포트를 합친 섹션. 실제로 순서가 있는 내용이라 번호와 연결선으로 흐름을 보여 준다.
 * 기록 화면 자체는 아직 없으므로 앞으로 제공할 흐름을 설명하는 글이며, 링크를 두지 않는다.
 *
 * - 좌우 여백은 다른 전면 띠와 같은 px 고정이다. 글자를 키워도 섹션들의 왼쪽 시작선이 어긋나지 않는다.
 * - 머리: 왼쪽 제목·제공 예정 안내, 오른쪽 일러스트. 읽기 순서상 제목이 먼저다.
 *   글자를 키워 폭이 모자라면 컨테이너 쿼리로 세로로 쌓고, 일러스트를 키워 가운데에 두어 한쪽에 빈 공간이 남지 않게 한다.
 * - 연결선은 높이를 고정하지 않고 flex-1로 단계 높이를 따라가므로 글자를 키워도 끊기지 않는다. 마지막 단계에는 없다.
 * - 번호는 ol이 순서를 전하므로 장식(aria-hidden)이고, 제목 줄 높이를 번호 원과 같게 해 기준선을 맞춘다.
 *   목록 표시를 없앤 ol은 Safari·VoiceOver가 목록으로 읽지 않을 수 있어 role="list"를 명시한다.
 */
export default function LandingHowItWorks() {
  const lastIndex = LANDING_HOW.steps.length - 1

  return (
    <section
      aria-labelledby="landing-how-title"
      className="-mx-5 px-[20px] py-12"
    >
      <div className="@container">
        <div className="flex flex-col gap-4 @3xs:flex-row @3xs:items-center @3xs:gap-3">
          <div className="min-w-0 flex-1">
            <LandingSectionHeader
              id="landing-how-title"
              title={LANDING_HOW.title}
              description={LANDING_HOW.description}
            />
          </div>
          {IMAGE ? (
            <img
              src={IMAGE.src}
              width={IMAGE.width}
              height={IMAGE.height}
              alt={IMAGE.alt}
              loading="lazy"
              decoding="async"
              className="mx-auto h-auto w-4/5 shrink-0 @3xs:mx-0 @3xs:w-1/2 @3xs:max-w-48"
            />
          ) : null}
        </div>
      </div>
      <ol role="list" className="mt-8 flex flex-col">
        {LANDING_HOW.steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex w-7 shrink-0 flex-col items-center gap-1"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-support font-semibold text-surface">
                {index + 1}
              </span>
              {index < lastIndex ? (
                <span className="mb-1 w-0.5 flex-1 rounded-full bg-line" />
              ) : null}
            </div>
            <div
              className={`min-w-0 flex-1 ${index < lastIndex ? 'pb-6' : ''}`}
            >
              <h3 className="flex min-h-7 items-center text-section-title leading-snug font-semibold text-content">
                {step.title}
              </h3>
              <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
