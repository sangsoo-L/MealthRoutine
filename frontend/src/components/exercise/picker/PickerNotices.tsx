import type { ReactNode } from 'react'
import Icon from '../../icons/Icon.tsx'

export const pickerFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/** 운동 인디고 윤곽선 보조 버튼(운동 탐색 E01의 보조 버튼과 같은 모양). */
export const pickerSecondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${pickerFocusRing}`

/**
 * 안내 영역(로딩·미연결·오류·빈 결과)의 공통 틀. 문구와 모양은 운동 탐색(E01)의 결과 안내와 같다.
 * role: status는 상태 변화를 읽어 주고, alert는 오류를 바로 알린다.
 */
export function PickerNotice({
  role,
  title,
  body,
  children,
}: {
  role: 'status' | 'alert'
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <div
      role={role}
      className="rounded-card bg-surface px-5 py-6 text-center break-keep wrap-anywhere"
    >
      <p className="text-section-title leading-snug font-semibold text-content">
        {title}
      </p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {body}
      </p>
      {children ? (
        <div className="mt-5 flex justify-center">{children}</div>
      ) : null}
    </div>
  )
}

/** 목록을 불러오는 중. */
export function PickerLoading() {
  return (
    <p
      role="status"
      className="py-10 text-center text-body font-normal text-muted"
    >
      운동을 찾는 중이에요…
    </p>
  )
}

/** 목록 위·아래에 끼우는 작은 안내 상자(보조 안내). */
export const pickerInlineNotice =
  'rounded-card border border-line bg-surface p-4 text-body leading-relaxed font-normal text-content break-keep wrap-anywhere'

/**
 * 직접 검색의 검색 전 안내. 조건을 정하고 "검색하기"를 누르면 결과가 나온다는 것을 알린다(결과·개수는 검색한 뒤에만 보인다).
 * 아이콘은 검색 상태를 알리는 하나뿐이며 장식이다(의미는 글자가 전한다).
 */
export function PickerSearchGuide() {
  return (
    <div
      role="status"
      className="rounded-card bg-surface px-5 py-8 text-center break-keep wrap-anywhere"
    >
      <span
        aria-hidden="true"
        className="mx-auto flex size-12 items-center justify-center rounded-full bg-exercise-soft text-exercise"
      >
        <Icon name="search" size={21} />
      </span>
      <p className="mt-4 text-section-title leading-snug font-semibold text-content">
        어떤 운동을 찾고 계신가요?
      </p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        운동명이나 난이도, 운동 부위를 선택해 원하는 운동을 찾아보세요.
      </p>
    </div>
  )
}
