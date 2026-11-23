import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { PIN_LOCKED_STATE } from '../../body-access/bodyAccessNotice.ts'
import { grantBodyAccess } from '../../body-access/bodyAccessStore.ts'
import type { GoalAuthorization } from '../../exercise-goal/exerciseGoalTypes.ts'
import {
  BODY_UNLOCK_PATH,
  BODY_UNLOCK_RETURN_PATH,
  PIN_PATHS,
} from '../../pin-settings/pinSettingsPolicy.ts'
import type { PinStatus } from '../../pin-settings/usePinStatus.ts'
import {
  usePinVerify,
  type PinVerifyResult,
} from '../../pin-settings/usePinVerify.ts'
import {
  noticeClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'
import { Heading } from './PinSettingsView.tsx'
import PinVerifyForm from './PinVerifyForm.tsx'

function Guidance() {
  return (
    <section
      aria-labelledby="pin-verify-guidance-title"
      className="rounded-card border border-line bg-surface p-4"
    >
      <h2
        id="pin-verify-guidance-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        이렇게 보여요
      </h2>
      <p className="mt-1 text-support leading-relaxed font-normal text-muted">
        신체 정보는 1분 동안만 표시되며, 화면을 벗어나면 다시 가려져요.
      </p>
      {/* 개발 서버에서만 보이는 안내. 운영 빌드에서는 코드째 제거된다. */}
      {import.meta.env.DEV ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          개발 서버 전용 모의 기능이에요. 번호는 이 브라우저에 해시로만 남고
          실제 보안 수단이 아니에요.
        </p>
      ) : null}
    </section>
  )
}

/**
 * P05 신체 정보 확인 본문. 상태에 따라 화면이 갈린다.
 * - 확인 중: 안내만 · 조회 실패: 오류와 다시 시도 · 연결 전(운영 빌드): 안내와 비활성 폼 · 미등록: 등록 링크(P11)와 비활성 폼 ·
 *   잠금: 안내와 비활성 확인 · 그 밖: 입력 폼
 * - 등록 여부를 확인하지 못한 상태를 미등록으로 보지 않는다. 성공 화면은 없다(확인에 성공하면 곧바로 P01로 돌아간다).
 */
export function PinVerifyBody({
  status,
  locked,
  submit,
  onVerified,
  onLocked,
  reload,
  cancelTo,
}: {
  status: PinStatus
  locked: boolean
  submit: (pin: string) => Promise<PinVerifyResult | null>
  onVerified: (access: GoalAuthorization) => void
  onLocked: () => void
  reload: () => void
  cancelTo: string
}) {
  const form = (disabled: boolean) => (
    <PinVerifyForm
      disabled={disabled}
      locked={locked}
      submit={submit}
      onVerified={onVerified}
      onLocked={onLocked}
      cancelTo={cancelTo}
    />
  )

  let body: ReactNode
  if (status.kind === 'checking') {
    body = (
      <p
        role="status"
        className="rounded-card border border-line bg-surface p-4 text-center text-body font-normal text-muted"
      >
        등록 여부를 확인하고 있어요.
      </p>
    )
  } else if (status.kind === 'error') {
    body = (
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <p role="alert" className="text-body leading-relaxed text-danger">
          2차 비밀번호 등록 여부를 확인하지 못했어요. 잠시 후 다시 시도해
          주세요.
        </p>
        <button type="button" onClick={reload} className={secondaryButtonClass}>
          다시 확인하기
        </button>
        <Link to={cancelTo} className={secondaryLinkClass}>
          취소
        </Link>
      </div>
    )
  } else if (status.kind === 'unavailable') {
    // 운영 빌드: 서버 연결 전이라 확인할 수 없다. 폼은 비활성이며 입력을 처리하지 않고 수치도 없다.
    body = (
      <>
        <p role="status" className={`${noticeClass} mt-0`}>
          신체 정보 확인 기능은 서비스 연결을 준비하고 있어요.
        </p>
        {form(true)}
      </>
    )
  } else if (!status.configured) {
    body = (
      <>
        <div className={`${noticeClass} mt-0`}>
          <div className="flex min-w-0 flex-col gap-1">
            <strong className="font-semibold">
              먼저 2차 비밀번호를 등록해 주세요
            </strong>
            <p>등록된 번호가 있어야 신체 정보를 확인할 수 있어요.</p>
            <Link
              to={PIN_PATHS.register}
              state={{ from: BODY_UNLOCK_PATH, fromState: { from: cancelTo } }}
              className="inline-flex min-h-11 items-center font-semibold text-brand underline"
            >
              2차 비밀번호 등록 →
            </Link>
          </div>
        </div>
        {form(true)}
      </>
    )
  } else {
    body = form(false)
  }

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <Heading
        title="신체 정보 확인"
        description={
          <>
            2차 비밀번호를 입력하면
            <br />
            1분 동안 신체 정보를 확인할 수 있어요.
          </>
        }
      />
      {body}
      <Guidance />
    </div>
  )
}

/**
 * 계정의 등록 여부·확인 동작(훅)을 화면 본문에 연결한다.
 * 확인에 성공하면 열람 권한을 앱 수준 메모리에 넣고 P01(`/mypage`)로 `replace` 이동한다(P05가 뒤로 가기 기록에 남지 않는다).
 * 5회 불일치로 잠기면 P01로 돌아가며 "잠금 안내" 표지만 router state로 넘긴다(PIN·권한 토큰은 넘기지 않는다).
 */
export default function PinVerifyView({
  ownerId,
  cancelTo,
}: {
  ownerId: string
  cancelTo: string
}) {
  const navigate = useNavigate()
  const { status, locked, submit, reload } = usePinVerify(ownerId)
  return (
    <PinVerifyBody
      status={status}
      locked={locked}
      submit={submit}
      reload={reload}
      cancelTo={cancelTo}
      onVerified={(access) => {
        grantBodyAccess(ownerId, access)
        void navigate(BODY_UNLOCK_RETURN_PATH, { replace: true })
      }}
      onLocked={() => {
        void navigate(BODY_UNLOCK_RETURN_PATH, {
          replace: true,
          state: PIN_LOCKED_STATE,
        })
      }}
    />
  )
}
