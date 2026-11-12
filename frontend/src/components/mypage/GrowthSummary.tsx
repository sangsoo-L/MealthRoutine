import type { ReactNode } from 'react'
import { MY_DESTINATIONS } from '../../mypage/destinations.ts'
import type {
  ActivityLevel,
  KnowledgeState,
  Slot,
} from '../../mypage/mypageTypes.ts'
import { summarizeKnowledgeTier } from '../../mypage/overallKnowledge.ts'
import { ASSESSMENT_LEVEL_LABEL } from '../../onboarding-assessment/assessmentLabels.ts'
import MyLink from './MyLink.tsx'
import { cardClass, focusRing, sectionTitleClass } from './myStyles.ts'

interface GrowthSummaryProps {
  level: Slot<ActivityLevel>
  knowledge: KnowledgeState
  onRetryKnowledge: () => void
}

/** 경험치 진행률(0~100). 기준 경험치가 0 이하이면 계산하지 않고 0으로 둔다. */
function progressPercent(experience: number, next: number): number {
  if (next <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((experience / next) * 100)))
}

const labelClass = 'text-support leading-snug font-normal text-muted'
const subClass = 'mt-1 text-support leading-snug font-normal text-muted'
const valueClass = 'mt-1 text-metric leading-none font-semibold'

/**
 * 활동 레벨 칸. 레벨 숫자가 핵심이다. 경험치 정책이 없어 진행값이 없으면 진행 막대·수치·"연결 전" 문구를 두지 않는다
 * (값을 만들지 않고, 없는 정보를 굳이 알리지도 않는다). 레벨 자체를 알 수 없을 때만 "연결 전"을 작게 알린다.
 */
function LevelCell({ level }: { level: Slot<ActivityLevel> }) {
  if (level.state !== 'ready') {
    return (
      <>
        <dt className={labelClass}>활동 레벨</dt>
        <dd>
          <p className={`${valueClass} text-muted`}>
            <span aria-hidden="true">Lv.–</span>
            <span className="sr-only">활동 레벨 연결 전</span>
          </p>
          <p className={subClass}>연결 전</p>
        </dd>
      </>
    )
  }

  const { level: lv, progress } = level.data
  const remaining = progress
    ? Math.max(0, progress.nextLevelExperience - progress.experience)
    : 0

  return (
    <>
      <dt className={labelClass}>활동 레벨</dt>
      <dd>
        <p className={`${valueClass} text-brand tabular-nums`}>Lv.{lv}</p>
        {progress ? (
          <>
            <div
              role="progressbar"
              aria-label="레벨 경험치"
              aria-valuemin={0}
              aria-valuemax={progress.nextLevelExperience}
              aria-valuenow={Math.min(
                progress.experience,
                progress.nextLevelExperience,
              )}
              aria-valuetext={`다음 레벨까지 ${remaining.toLocaleString('ko-KR')} EXP`}
              className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{
                  width: `${progressPercent(progress.experience, progress.nextLevelExperience)}%`,
                }}
              />
            </div>
            <p className={`${subClass} tabular-nums`}>
              다음 레벨까지 {remaining.toLocaleString('ko-KR')} EXP
            </p>
          </>
        ) : null}
      </dd>
    </>
  )
}

/**
 * 종합 이해도 칸. 운동·식단 결과를 하나의 대표 등급(summarizeKnowledgeTier)으로 보여 준다.
 * 불러오는 중·불러오지 못함·조회 수단 없음·값 없음(미확인)을 서로 다른 모양으로 구분하고, 값이 없으면 임의 등급을 만들지 않는다.
 */
function KnowledgeCell({
  knowledge,
  onRetry,
}: {
  knowledge: KnowledgeState
  onRetry: () => void
}) {
  let value: ReactNode
  if (knowledge.status === 'loading') {
    value = (
      <p role="status" className={`${valueClass} text-muted`}>
        <span aria-hidden="true">···</span>
        <span className="sr-only">이해도를 확인하는 중이에요</span>
      </p>
    )
  } else if (knowledge.status === 'error') {
    value = (
      <div role="alert">
        <p className={`${subClass} text-danger`}>불러오지 못했어요</p>
        <button
          type="button"
          onClick={onRetry}
          className={`inline-flex min-h-11 cursor-pointer items-center text-body font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          다시 시도
        </button>
      </div>
    )
  } else if (knowledge.status === 'unavailable') {
    value = <p className={subClass}>연결 전</p>
  } else {
    const { exercise, meal } = knowledge.levels
    const tier = summarizeKnowledgeTier(
      exercise?.tier ?? null,
      meal?.tier ?? null,
    )
    value = tier ? (
      <p className={`${valueClass} text-content`}>
        {ASSESSMENT_LEVEL_LABEL[tier]}
      </p>
    ) : (
      <p className={`${valueClass} text-muted`}>미확인</p>
    )
  }

  return (
    <>
      <dt className={labelClass}>운동·식단 이해도</dt>
      <dd>{value}</dd>
    </>
  )
}

/**
 * P01 섹션 2. 나의 성장: 활동 레벨과 종합 이해도를 나란히 보여 주는 낮은 카드.
 *
 * - 둘은 서로 다른 지표다. 레벨(Lv.N, 브랜드 파랑)은 경험치 누적, 이해도(초보·중급·고급, 본문색)는 이해도 확인 결과이며
 *   서로 계산하거나 대체하지 않는다. 칸마다 레이블이 있고, 두 칸은 나란히 놓이다가 좁으면(글자 확대) 위아래로 쌓인다.
 * - 안내 문장을 반복하지 않는다(값과 레이블이 설명의 전부다). 경험치 정책이 없어 진행률·EXP 수치를 만들지 않는다.
 * - 개발용 값 표시는 화면 맨 위의 DevDataNotice 한 줄이 맡는다.
 * - 경험치 내역(P14)·레벨 안내(P15)는 화면이 생겨 경로가 채워지면 같은 자리에 링크로 나타난다(MyLink). 지금은 그리지 않는다.
 */
export default function GrowthSummary({
  level,
  knowledge,
  onRetryKnowledge,
}: GrowthSummaryProps) {
  const hasLinks =
    MY_DESTINATIONS.experienceHistory.to !== null ||
    MY_DESTINATIONS.levelGuide.to !== null

  return (
    <section aria-labelledby="my-growth-title" className={cardClass}>
      <h2 id="my-growth-title" className={sectionTitleClass}>
        나의 성장
      </h2>

      {/* 두 칸은 나란히 놓이고, 폭이 모자라면(작은 화면·글자 확대) 위아래로 쌓인다. */}
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-32">
          <LevelCell level={level} />
        </div>
        <div className="min-w-0 flex-1 basis-32">
          <KnowledgeCell knowledge={knowledge} onRetry={onRetryKnowledge} />
        </div>
      </dl>

      {hasLinks ? (
        <div className="mt-1 flex flex-wrap gap-x-5">
          <MyLink destination={MY_DESTINATIONS.experienceHistory}>
            경험치 내역
          </MyLink>
          <MyLink destination={MY_DESTINATIONS.levelGuide}>레벨 안내</MyLink>
        </div>
      ) : null}
    </section>
  )
}
