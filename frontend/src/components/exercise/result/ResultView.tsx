import { RECORD_COMPONENTS } from '../../../exercise/recordMode.ts'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { deriveRecordResultStatus } from '../../../exercise/workoutResult.ts'
import type { ResultSnapshot } from '../../../exercise/workoutResultController.ts'
import {
  cardsFromRecord,
  cardsFromSummary,
  formatResultDate,
  measuredLabel,
  resultStatusOf,
  timeLineOf,
} from '../../../exercise/workoutResultView.ts'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import {
  ExerciseCard,
  PanelView,
  RESULT_TITLE,
  ResultHeader,
  SaveBar,
  StatusPanels,
  type HeaderModel,
} from './ResultParts.tsx'
import type {
  ResultActions,
  ResultEditorState,
  ResultPanel,
} from './resultTypes.ts'

export const PATH_DASHBOARD = '/records/exercise'

const bodyCls =
  'mt-2 text-body leading-relaxed font-normal break-keep text-muted'

function Shell({
  children,
  screen,
}: {
  children: ReactNode
  /** 결과 화면 유형(W15 시간형 포함 / W15-1). 표시에는 쓰지 않고 검증용 표식으로만 남긴다. */
  screen?: string
}) {
  return (
    <div
      data-result-screen={screen}
      className="flex min-w-0 flex-col gap-5 break-keep wrap-anywhere"
    >
      {children}
    </div>
  )
}

function Title() {
  return (
    <h1 className="text-app-title leading-snug font-semibold text-content">
      {RESULT_TITLE}
    </h1>
  )
}

/** 결과를 보여 줄 수 없는 상태의 안내 카드(제목·설명·이동 버튼). 다른 계정의 정보나 다른 세션을 대신 보이지 않는다. */
function NoticeCard({
  title,
  body,
  tone = 'plain',
  actions,
  retry,
}: {
  title: string
  body: string
  tone?: 'plain' | 'alert'
  actions: ResultActions
  retry?: boolean
}) {
  return (
    <section
      role={tone === 'alert' ? 'alert' : 'status'}
      className={composeCard}
    >
      <h2 className={composeSectionTitle}>{title}</h2>
      <p className={bodyCls}>{body}</p>
      <div className="mt-4 flex flex-col gap-2">
        {retry ? (
          <button
            type="button"
            onClick={actions.requestReload}
            className={composePrimaryButton}
          >
            다시 시도
          </button>
        ) : null}
        <Link
          to={PATH_DASHBOARD}
          className={retry ? composeSecondaryButton : composePrimaryButton}
        >
          오늘의 운동으로 돌아가기
        </Link>
      </div>
    </section>
  )
}

/**
 * W15·W15-1 운동 결과 화면의 표시(저장소·라우터와 무관, props만 받는다). 시간형이 포함되면 W15, 없으면 W15-1이며 같은 화면이 그린다.
 *
 * - ready: 요약 · 운동별 결과 카드(목표/실제, 미완료 세트 구분) · 수정(횟수·중량·완료 해제) · 하단 저장 버튼.
 * - completed: 저장된 완료 기록의 읽기 전용 화면. 수정·저장 버튼이 없다.
 * - 그 밖(불러오는 중·준비 중·잘못된 주소·없음·손상·오류·종료)은 안내만 한다.
 */
export default function ResultView({
  snapshot,
  editor,
  panel,
  failureDismissed,
  actions,
}: {
  snapshot: ResultSnapshot
  editor: ResultEditorState | null
  panel: ResultPanel | null
  failureDismissed: boolean
  actions: ResultActions
}) {
  const { load } = snapshot
  if (load.status === 'loading') {
    return (
      <Shell>
        <Title />
        <p role="status" className={`${composeCard} text-body text-muted`}>
          운동 결과를 불러오는 중이에요…
        </p>
      </Shell>
    )
  }
  if (load.status === 'unavailable') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          title="운동 결과 기능을 준비 중이에요"
          body="지금은 이 환경에서 운동 기록을 저장할 수 없어요."
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'invalidSessionId') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          tone="alert"
          title="올바르지 않은 운동 주소예요"
          body="주소의 운동 정보를 확인할 수 없어요. 다른 운동으로 바꿔서 보여 주지 않아요."
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'notFound') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          tone="alert"
          title="운동을 찾을 수 없어요"
          body="이 운동을 볼 수 없어요. 삭제됐거나 이 계정에서 열 수 없는 운동일 수 있어요."
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'none') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          title="진행 중인 운동이 없어요"
          body="오늘의 운동에서 운동을 시작할 수 있어요."
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'corrupt') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          tone="alert"
          title="운동 데이터를 읽을 수 없어요"
          body="저장된 운동 데이터가 손상됐어요. 데이터는 지우지 않았어요."
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'error') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          tone="alert"
          title="운동 결과를 불러오지 못했어요"
          body="잠시 후 다시 시도해 주세요. 저장된 운동은 그대로예요."
          retry
          actions={actions}
        />
      </Shell>
    )
  }
  if (load.status === 'ended') {
    return (
      <Shell>
        <Title />
        <NoticeCard
          title="기록 없이 끝난 운동이에요"
          body="이 운동은 결과가 저장되지 않고 끝났어요. 저장된 운동 기록이 없어요."
          actions={actions}
        />
      </Shell>
    )
  }

  if (load.status === 'completed') {
    const record = snapshot.record
    if (!record) return null
    const totals = record.totals
    const ratio =
      totals.plannedSetCount === 0
        ? 0
        : totals.completedSetCount / totals.plannedSetCount
    const status =
      deriveRecordResultStatus(record) === 'full'
        ? { key: 'full' as const, label: '전체 완료' }
        : { key: 'partial' as const, label: '부분 완료' }
    const hasTime = record.exercises.some(
      (e) => RECORD_COMPONENTS[e.recordType].time,
    )
    const header: HeaderModel = {
      dateLabel: formatResultDate(record.startedAt),
      exerciseCount: record.exercises.length,
      completedSetCount: totals.completedSetCount,
      plannedSetCount: totals.plannedSetCount,
      percent: Math.round(ratio * 100),
      statusKey: status.key,
      statusLabel: status.label,
      timeLine: hasTime
        ? totals.measuredMs === null
          ? timeLineOf(null)
          : `측정 시간 합계 ${measuredLabel(totals.measuredMs)}`
        : null,
      readOnly: true,
    }
    return (
      <Shell>
        <ResultHeader model={header} />
        <p
          role="status"
          className="rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-normal text-exercise"
        >
          이미 저장된 운동 기록이에요. 수정하거나 다시 저장할 수 없어요.
        </p>
        {cardsFromRecord(record).map((card) => (
          <ExerciseCard
            key={card.exerciseId + card.itemIndex}
            card={card}
            editable={false}
            readOnly
            editor={null}
            actions={actions}
          />
        ))}
        <Link to={PATH_DASHBOARD} className={composePrimaryButton}>
          오늘의 운동으로 돌아가기
        </Link>
      </Shell>
    )
  }

  const { summary, draft } = snapshot
  if (!summary || !draft || !snapshot.session) return null
  const status = resultStatusOf(summary)
  const header: HeaderModel = {
    dateLabel: formatResultDate(snapshot.session.startedAt),
    exerciseCount: summary.exerciseCount,
    completedSetCount: summary.completedSetCount,
    plannedSetCount: summary.plannedSetCount,
    percent: summary.percent,
    statusKey: status.key,
    statusLabel: status.label,
    timeLine:
      summary.screenType === 'W15' ? timeLineOf(summary.measuredMs) : null,
    readOnly: false,
  }
  const cards = cardsFromSummary(summary, draft.base, draft.performed)
  return (
    <Shell screen={summary.screenType}>
      <ResultHeader model={header} />
      {panel ? <PanelView panel={panel} actions={actions} /> : null}
      <StatusPanels
        snapshot={snapshot}
        failureDismissed={failureDismissed}
        actions={actions}
      />
      {cards.map((card) => (
        <ExerciseCard
          key={card.exerciseId + card.itemIndex}
          card={card}
          editable={!snapshot.editLocked}
          readOnly={false}
          editor={editor}
          actions={actions}
        />
      ))}
      <SaveBar snapshot={snapshot} actions={actions} />
    </Shell>
  )
}
