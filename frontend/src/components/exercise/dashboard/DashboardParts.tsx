import type { ReactNode } from 'react'
import { Link } from 'react-router'
import Icon from '../../icons/Icon.tsx'
import type { IconName } from '../../icons/iconTypes.ts'

export const dashboardFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/** W01 안내·오류 카드의 공통 모양. */
export const dashboardCard = 'rounded-card border border-line bg-surface p-4'

export const dashboardSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

/**
 * 영역 하나의 틀. 제목(h2)과 연결된 섹션이며, 다시 시도를 눌렀을 때 포커스를 받을 수 있게 tabIndex=-1이다(눈에 보이는 윤곽선은 그리지 않는다).
 * 다시 시도 버튼은 상태가 바뀌면 사라지므로, 포커스가 문서 처음으로 빠지지 않게 이 영역으로 옮긴다.
 */
export function DashboardSection({
  labelId,
  children,
}: {
  labelId: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={labelId}
      tabIndex={-1}
      className={`min-w-0 rounded-control ${dashboardFocusRing}`}
    >
      {children}
    </section>
  )
}

/** "준비 중" 표시. 글자로 알리므로 색만으로 전하지 않는다. */
export function PendingBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-normal text-exercise">
      준비 중
    </span>
  )
}

/**
 * 운동 관리 행. 목적지가 없는 행(준비 중·불러오는 중·오류)은 링크처럼 보이게 하지 않는다.
 * `to`가 있으면(이동할 곳이 하나뿐인 행) 행 전체가 하나의 링크이고 오른쪽에 `linkLabel`과 화살표를 둔다.
 * 링크 안에 다른 링크·버튼을 넣지 않는다(오류의 다시 시도처럼 안에 버튼이 필요한 상태에서는 `to`를 넘기지 않는다).
 */
export function ManagementRow({
  titleId,
  title,
  icon,
  children,
  trailing,
  to,
  linkLabel,
}: {
  titleId: string
  title: string
  icon: IconName
  children: ReactNode
  trailing?: ReactNode
  to?: string
  linkLabel?: string
}) {
  // 링크 행은 줄바꿈을 허용한다: 넓으면 한 줄, 글자를 크게 키운 좁은 폭(200% 확대)에서는 오른쪽 이동 글자가 다음 줄로 내려가 가로로 넘치지 않는다.
  // 본문의 기준 폭(basis-32)이 그 판단 기준이다(본문이 이 폭보다 좁아져야 하면 줄을 바꾼다).
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-control bg-page text-muted"
      >
        <Icon name={icon} size={20} />
      </span>
      <div className={to ? 'min-w-0 grow basis-32' : 'min-w-0 flex-1'}>
        <h3 id={titleId} className={dashboardSectionTitle}>
          {title}
        </h3>
        {children}
      </div>
    </>
  )
  if (to) {
    return (
      <div role="group" aria-labelledby={titleId}>
        <Link
          to={to}
          className={`flex min-h-11 flex-wrap items-start gap-3 p-4 hover:bg-page ${dashboardFocusRing}`}
        >
          {body}
          <span className="ml-auto flex shrink-0 items-center gap-1 self-center text-support font-semibold text-exercise">
            {trailing}
            {linkLabel}
            <Icon name="chevron-right" size={18} />
          </span>
        </Link>
      </div>
    )
  }
  return (
    <div role="group" aria-labelledby={titleId} className="p-4">
      <div className="flex items-start gap-3">
        {body}
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </div>
  )
}

/**
 * 아직 연결되지 않은 동작(버튼 모양). aria-disabled라 누르면 아무 일도 일어나지 않고, 보조기기에는 사용할 수 없는 버튼으로 읽힌다.
 * 아직 완성되지 않은 흐름에 이동·저장·성공 표시를 만들지 않는다. 회색 면이라 사용할 수 있는 버튼처럼 강조하지 않는다.
 * - 기본은 눈에 보이는 "· 준비 중" 글자를 함께 둔다.
 * - 같은 카드 안에 이미 준비 중 안내가 있으면 `showSuffix={false}`로 반복을 줄이고, `describedBy`로 그 안내를 연결해 보조기기가 이유를 읽게 한다.
 */
export function PendingButton({
  children,
  describedBy,
  showSuffix = true,
}: {
  children: ReactNode
  describedBy?: string
  showSuffix?: boolean
}) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-describedby={describedBy}
      className={`flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-control bg-line px-4 py-2 text-center text-body font-semibold text-muted ${dashboardFocusRing}`}
    >
      {children}
      {showSuffix ? (
        <span className="text-support font-normal">· 준비 중</span>
      ) : null}
    </button>
  )
}

/**
 * 운동 목록 만들기를 쓸 수 없을 때(운동 목록 저장소가 연결되지 않은 빌드)의 CTA. 눌러도 이동하지 않는 비활성 버튼이며, 비활성인 이유를 글자로 안내한다.
 * 저장소가 있는 개발 서버에서는 CreateListLink를 쓴다.
 * 안내 문장이 곧 이 카드의 "준비 중" 표시라 배지·접미 글자를 따로 두지 않는다.
 */
export function CreateListCta({ id }: { id: string }) {
  const reasonId = `${id}-reason`
  return (
    <div className="flex flex-col gap-2">
      <PendingButton describedBy={reasonId} showSuffix={false}>
        운동 목록 만들기
      </PendingButton>
      <p
        id={reasonId}
        className="text-support leading-relaxed font-normal break-keep text-muted"
      >
        최종 검토 기능을 준비 중이에요.
      </p>
    </div>
  )
}

/** 오늘 저장한 운동 목록이 없을 때의 CTA. 운동 목록 구성 방법 선택(W12)으로 이동한다. */
export function CreateListLink() {
  return (
    <Link
      to="/records/exercise/new"
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-exercise px-4 py-2 text-body font-semibold text-surface hover:bg-exercise/90 ${dashboardFocusRing}`}
    >
      운동 목록 만들기
      <Icon name="arrow-right" size={18} />
    </Link>
  )
}

/** 영역을 불러오는 중. */
export function SlotLoading({ label }: { label: string }) {
  return (
    <p
      role="status"
      className={`${dashboardCard} text-center text-body font-normal text-muted`}
    >
      {label}
    </p>
  )
}

/** 영역을 불러오지 못함. 다시 시도를 누르면 이 영역으로 포커스를 옮기고 다시 불러온다. */
export function SlotError({
  title,
  onRetry,
}: {
  title: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className={`${dashboardCard} text-center break-keep wrap-anywhere`}
    >
      <p className={dashboardSectionTitle}>{title}</p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={(event) => {
          event.currentTarget.closest<HTMLElement>('section')?.focus()
          onRetry()
        }}
        className={`mx-auto mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${dashboardFocusRing}`}
      >
        다시 시도
      </button>
    </div>
  )
}
