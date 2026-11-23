import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/authContext.ts'
import { PIN_PATHS } from '../../pin-settings/pinSettingsPolicy.ts'
import {
  usePinStatus,
  type PinStatus,
} from '../../pin-settings/usePinStatus.ts'
import {
  SETTINGS_PATH,
  type SettingsMenuGroup,
} from '../../settings/settingsMenu.ts'
import Icon from '../icons/Icon.tsx'
import { chipClass } from '../mypage/myStyles.ts'
import { rowActionClass, rowBaseClass } from './settingsStyles.ts'

/** 그룹 한 묶음: 소제목 + 행 목록(흰 카드, 행 사이 1px 경계). 행이 목록 항목(li)이라 보조기기가 개수를 읽어 준다. */
export function SettingsList({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="mb-2 px-1 text-support leading-snug font-semibold text-muted"
      >
        {title}
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {children}
      </ul>
    </section>
  )
}

/**
 * 이동 메뉴 행. 경로가 있으면 행 전체가 링크(오른쪽 화살표)이고, 없으면 눌리지 않는 행 + "준비 중" 칩이다.
 * 준비 중 행은 링크·버튼이 아니라서 키보드 포커스를 받지 않고, 칩 글자가 이름과 함께 읽혀 상태가 전달된다.
 */
function MenuRow({
  label,
  to,
  returnHere = false,
}: {
  label: string
  to: string | null
  returnHere?: boolean
}) {
  if (to === null) {
    return (
      <li>
        <div
          className={`${rowBaseClass} flex-wrap gap-y-1 font-normal text-muted`}
        >
          <span className="min-w-0">{label}</span>
          <span className={`${chipClass} bg-page`}>준비 중</span>
        </div>
      </li>
    )
  }
  return (
    <li>
      <Link
        to={to}
        state={returnHere ? { from: SETTINGS_PATH } : undefined}
        className={`${rowActionClass} font-semibold text-content`}
      >
        <span className="min-w-0">{label}</span>
        <Icon name="chevron-right" size={18} className="shrink-0 text-muted" />
      </Link>
    </li>
  )
}

/**
 * 2차 비밀번호 행(P11·P12). 이름은 "2차 비밀번호"로 두고 등록 여부를 보조 문구(칩)로 알린다.
 * - 미등록 → P11 등록, 등록됨 → P12 변경으로 이동한다.
 * - 확인 중·연결 전(운영 빌드)은 이동하지 않는 행이다. 등록 여부를 확인하기 전에는 어느 화면으로도 보내지 않는다.
 * - 확인 실패는 눌러서 다시 확인하는 버튼 행이다. 확인하지 못한 상태를 미등록으로 보지 않는다.
 */
function PinMenuRow({ label }: { label: string }) {
  const { user } = useAuth()
  const { status, reload } = usePinStatus(user?.id ?? null)
  return <PinMenuRowView label={label} status={status} reload={reload} />
}

export function PinMenuRowView({
  label,
  status,
  reload,
}: {
  label: string
  status: PinStatus
  reload: () => void
}) {
  if (status.kind === 'ready') {
    const registered = status.configured
    return (
      <li>
        <Link
          to={registered ? PIN_PATHS.change : PIN_PATHS.register}
          className={`${rowActionClass} font-semibold text-content`}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span>{label}</span>
            <span className={`${chipClass} bg-page`}>
              {registered ? '등록됨' : '미등록'}
            </span>
          </span>
          <Icon
            name="chevron-right"
            size={18}
            className="shrink-0 text-muted"
          />
        </Link>
      </li>
    )
  }
  if (status.kind === 'error') {
    return (
      <li>
        <button
          type="button"
          onClick={reload}
          className={`${rowActionClass} font-normal text-muted`}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span>{label}</span>
            <span className={`${chipClass} bg-page`}>
              확인하지 못했어요 · 다시 확인
            </span>
          </span>
        </button>
      </li>
    )
  }
  return (
    <li>
      <div
        className={`${rowBaseClass} flex-wrap gap-y-1 font-normal text-muted`}
      >
        <span className="min-w-0">{label}</span>
        <span className={`${chipClass} bg-page`}>
          {status.kind === 'checking' ? '확인 중' : '연결 전'}
        </span>
      </div>
    </li>
  )
}

export default function SettingsGroup({ group }: { group: SettingsMenuGroup }) {
  return (
    <SettingsList title={group.title}>
      {group.items.map((item) =>
        item.dynamic === 'pin' ? (
          <PinMenuRow key={item.label} label={item.label} />
        ) : (
          <MenuRow
            key={item.label}
            label={item.label}
            to={item.to}
            returnHere={item.returnHere}
          />
        ),
      )}
    </SettingsList>
  )
}
