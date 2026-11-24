import { useEffect, useRef, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router'
import { PIN_SERVER_LOCKED_MESSAGE } from '../../pin-settings/pinSettingsMessages.ts'
import {
  BODY_UNLOCK_PATH,
  PIN_PATHS,
  pinReturnForwardState,
  type PinFormValues,
  type PinReturn,
  type PinSettingsMode,
} from '../../pin-settings/pinSettingsPolicy.ts'
import {
  usePinSettings,
  type PinSubmitResult,
} from '../../pin-settings/usePinSettings.ts'
import type { PinStatus } from '../../pin-settings/usePinStatus.ts'
import {
  noticeClass,
  primaryButtonClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'
import Icon from '../icons/Icon.tsx'
import PinSettingsForm from './PinSettingsForm.tsx'

const TITLE: Record<PinSettingsMode, string> = {
  register: '2차 비밀번호 등록',
  change: '2차 비밀번호 변경',
}

export function Heading({
  title,
  description,
  headingRef,
}: {
  title: string
  description?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand"
      >
        <Icon name="lock" size={20} />
      </span>
      <p className="text-support leading-snug font-semibold text-brand">
        신체 정보 보호
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-app-title leading-snug font-semibold text-content outline-none"
      >
        {title}
      </h1>
      {description ? (
        <p className="text-body leading-relaxed font-normal text-muted">
          {description}
        </p>
      ) : null}
    </header>
  )
}

/** 진입 화면으로 돌아가는 링크의 이름. 허용 목록(PIN_RETURN_PATHS)의 경로만 들어온다. */
const RETURN_LABEL: Record<string, string> = {
  [BODY_UNLOCK_PATH]: '신체 정보 확인으로 돌아가기',
  '/mypage': '마이페이지로',
}

function returnLabel(returnTo: PinReturn | null): string {
  return returnTo
    ? (RETURN_LABEL[returnTo.to] ?? '이전 화면으로')
    : '상세 설정으로'
}

function Guidance({
  mode,
  connection,
}: {
  mode: PinSettingsMode
  connection: PinConnection
}) {
  return (
    <section
      aria-labelledby="pin-guidance-title"
      className="rounded-card border border-line bg-surface p-4"
    >
      <h2
        id="pin-guidance-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        이럴 때 사용해요
      </h2>
      <p className="mt-1 text-support leading-relaxed font-normal text-muted">
        마이페이지에서 키·몸무게·BMI의 잠금을 해제할 때 사용해요. 로그인
        비밀번호와는 별도로 관리돼요.
      </p>
      {mode === 'change' ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          2차 비밀번호를 잊으셨나요? 재설정 기능은 준비 중이에요.
        </p>
      ) : null}
      {/* 개발 서버의 모의 모드에서만 보이는 안내. 서버 연결(개발 기본) 중에는 사실과 달라 숨긴다. 운영 빌드에서는 코드째 제거된다. */}
      {import.meta.env.DEV && connection === 'mock' ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          개발 서버 전용 모의 기능이에요. 번호는 이 브라우저에 해시로만 남고
          실제 보안 수단이 아니에요.
        </p>
      ) : null}
    </section>
  )
}

/** 모의 모드(개발용 저장소) / 서버 모드(F4). 잠금 안내·제출 차단·같은 번호 허용이 다르다. */
export type PinConnection = 'mock' | 'server'

/**
 * P11 등록·P12 변경 본문. 상태에 따라 화면이 갈린다.
 * - 확인 중: 안내만 · 조회 실패: 오류와 다시 시도 · 연결 전(운영 빌드): 안내와 비활성 폼 · 등록 여부가 분기와 다르면 안내와 이동 링크
 * - 등록 여부를 확인하지 못한 상태를 미등록으로 보지 않는다. 완료 화면은 저장소가 성공을 돌려준 뒤에만 나온다.
 * - `returnTo`: P05(신체 정보 확인) 등 허용된 화면에서 들어왔을 때의 복귀 지점이다. 없으면 기본 복귀(상세 설정·마이페이지)다.
 */
export function PinSettingsBody({
  mode,
  status,
  done,
  locked,
  submit,
  reload,
  returnTo = null,
  connection = 'mock',
  submitting = false,
}: {
  mode: PinSettingsMode
  status: PinStatus
  done: boolean
  locked: boolean
  submit: (values: PinFormValues) => Promise<PinSubmitResult | null>
  reload: () => void
  returnTo?: PinReturn | null
  /** 기본 mock(기존 동작). server면 잠금을 안내만 하고 제출을 막지 않으며 "잠금 상태 다시 확인"을 보인다(F4-D4·D7). */
  connection?: PinConnection
  /** 등록·변경 요청을 처리하는 중이면 "잠금 상태 다시 확인"을 막는다(재조회로 폼이 바뀌면 결과 안내가 사라진다). */
  submitting?: boolean
}) {
  const doneHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // 완료 안내로 포커스를 옮겨 보조기기가 결과를 읽게 한다.
    if (done) doneHeading.current?.focus()
  }, [done])

  if (done) {
    return (
      <div className="flex flex-col gap-6 break-keep wrap-anywhere">
        <section
          data-pin-done={mode}
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 text-center"
        >
          <Heading
            headingRef={doneHeading}
            title={
              mode === 'change'
                ? '2차 비밀번호를 변경했어요'
                : '2차 비밀번호를 등록했어요'
            }
            description={
              <>
                키·몸무게·BMI는 계속 가려져 있어요.
                <br />
                신체 정보의 잠금을 해제할 때 사용해 주세요.
              </>
            }
          />
          {returnTo ? (
            <>
              <Link
                to={returnTo.to}
                state={returnTo.state}
                className={primaryButtonClass}
              >
                {returnLabel(returnTo)}
              </Link>
              <Link
                to={returnTo.to === '/mypage' ? '/settings' : '/mypage'}
                className={secondaryLinkClass}
              >
                {returnTo.to === '/mypage' ? '상세 설정으로' : '마이페이지로'}
              </Link>
            </>
          ) : (
            <>
              <Link to="/settings" className={primaryButtonClass}>
                상세 설정으로
              </Link>
              <Link to="/mypage" className={secondaryLinkClass}>
                마이페이지로
              </Link>
            </>
          )}
        </section>
      </div>
    )
  }

  const description =
    mode === 'change' ? (
      <>
        현재 번호를 확인하고
        <br />
        새로운 숫자 6자리로 변경해 주세요.
      </>
    ) : (
      <>
        나만 확인할 수 있도록,
        <br />
        숫자 6자리로 신체 정보를 보호해요.
      </>
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
        <Link
          to={returnTo?.to ?? '/settings'}
          state={returnTo?.state}
          className={secondaryLinkClass}
        >
          {returnLabel(returnTo)}
        </Link>
      </div>
    )
  } else if (status.kind === 'unavailable') {
    // 운영 빌드: 서버 연결 전이라 등록·변경할 수 없다. 폼은 비활성이며 입력을 처리하지 않는다.
    body = (
      <>
        <p role="status" className={`${noticeClass} mt-0`}>
          지금은 2차 비밀번호를 {mode === 'change' ? '변경' : '등록'}할 수
          없어요. 서비스 연결이 준비되면 이용할 수 있어요.
        </p>
        <PinSettingsForm
          mode={mode}
          disabled
          locked={false}
          submit={submit}
          returnTo={returnTo}
        />
      </>
    )
  } else if (mode === 'register' && status.configured) {
    body = (
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <h2 className="text-section-title leading-snug font-semibold text-content">
          이미 등록되어 있어요
        </h2>
        <p className="text-body leading-relaxed font-normal text-muted">
          기존 번호를 바꾸려면 변경 화면을 이용해 주세요.
        </p>
        <Link
          to={PIN_PATHS.change}
          state={pinReturnForwardState(returnTo)}
          className={primaryButtonClass}
        >
          2차 비밀번호 변경
        </Link>
        <Link
          to={returnTo?.to ?? '/settings'}
          state={returnTo?.state}
          className={secondaryLinkClass}
        >
          {returnLabel(returnTo)}
        </Link>
      </div>
    )
  } else if (mode === 'change' && !status.configured) {
    body = (
      <>
        <div className={`${noticeClass} mt-0`}>
          <div className="flex min-w-0 flex-col gap-1">
            <strong className="font-semibold">
              먼저 2차 비밀번호를 등록해 주세요
            </strong>
            <p>등록된 번호가 있어야 변경할 수 있어요.</p>
            <Link
              to={PIN_PATHS.register}
              state={pinReturnForwardState(returnTo)}
              className="inline-flex min-h-11 items-center font-semibold text-brand underline"
            >
              2차 비밀번호 등록 →
            </Link>
          </div>
        </div>
        <PinSettingsForm
          mode={mode}
          disabled
          locked={false}
          submit={submit}
          returnTo={returnTo}
        />
      </>
    )
  } else if (connection === 'server') {
    // 서버 모드(F4-D4): 해제 시각을 계산하지 않는다. 잠금이면 안내와 재조회 버튼만 보이고 제출은 서버 판정에 맡긴다.
    body = (
      <>
        {locked ? (
          <div
            data-pin-lock-recheck=""
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
          >
            <p className="text-body leading-relaxed font-normal text-muted">
              2차 비밀번호 확인이 잠겨 있어요. 잠금이 풀렸는지 다시 확인할 수
              있어요.
            </p>
            <button
              type="button"
              onClick={reload}
              disabled={submitting}
              data-pin-lock-recheck-button=""
              className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-surface`}
            >
              잠금 상태 다시 확인
            </button>
          </div>
        ) : null}
        <PinSettingsForm
          mode={mode}
          disabled={false}
          locked={locked}
          lockMessage={PIN_SERVER_LOCKED_MESSAGE}
          blockWhenLocked={false}
          allowSamePin
          submit={submit}
          returnTo={returnTo}
        />
      </>
    )
  } else {
    body = (
      <PinSettingsForm
        mode={mode}
        disabled={false}
        locked={locked}
        submit={submit}
        returnTo={returnTo}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <Heading title={TITLE[mode]} description={description} />
      {body}
      <Guidance mode={mode} connection={connection} />
    </div>
  )
}

/** 계정의 등록 여부·처리 동작(훅)을 화면 본문에 연결한다. */
export default function PinSettingsView({
  ownerId,
  mode,
  returnTo = null,
}: {
  ownerId: string
  mode: PinSettingsMode
  returnTo?: PinReturn | null
}) {
  const { status, done, locked, submit, reload, connection, submitting } =
    usePinSettings(ownerId, mode)
  return (
    <PinSettingsBody
      mode={mode}
      status={status}
      done={done}
      locked={locked}
      submit={submit}
      reload={reload}
      returnTo={returnTo}
      connection={connection}
      submitting={submitting}
    />
  )
}
