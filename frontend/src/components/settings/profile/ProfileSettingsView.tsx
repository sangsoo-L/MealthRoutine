import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react'
import { Link } from 'react-router'
import {
  FIELD_STATUS_TEXT,
  NICKNAME_ERROR_MESSAGE,
  NICKNAME_MAX,
  NICKNAME_MIN,
  PATH_PROFILE,
  isProfileEmpty,
  profileFieldView,
  runUpdateNickname,
  validateNickname,
  type FieldView,
  type NicknameSavePhase,
  type ProfileRowKey,
  type ProfileSource,
  type ProfileState,
} from '../../../profile/profile.ts'
import {
  errorClass,
  noticeClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryButtonClass,
  secondaryLinkClass,
} from '../../auth/authStyles.ts'
import Icon from '../../icons/Icon.tsx'
import {
  cardClass,
  chipClass,
  focusRing,
  sectionTitleClass,
} from '../../mypage/myStyles.ts'

const number = 'text-support font-semibold text-brand'
const label =
  'mb-1.5 flex flex-wrap items-center gap-x-2 text-body font-normal text-content'
const tag = 'text-support font-semibold text-muted'
const help = 'mt-1 text-support leading-relaxed font-normal text-muted'
/** 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지). */
const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-invalid:border-danger aria-invalid:bg-danger-soft'

/** 서버 연결 전 안내. 아래 항목을 볼 수 없고 닉네임은 저장되지 않는다는 사실을 분명히 알린다. */
export const PROFILE_UNAVAILABLE_TEXT =
  '프로필·개인정보 기능이 아직 서버에 연결되지 않았어요. 표시가 "연결 전"인 항목은 불러올 수 없고, 닉네임을 바꿔도 저장되지 않아요.'

function SectionTitle({
  no,
  id,
  children,
}: {
  no: string
  id: string
  children: string
}) {
  return (
    <h2 id={id} className={`flex items-center gap-2 ${sectionTitleClass}`}>
      <span className={number} aria-hidden="true">
        {no}
      </span>
      {children}
    </h2>
  )
}

/** 읽기 전용 항목 한 줄. 값이 없으면 값 대신 상태 글자(연결 전·등록된 정보 없음 등)를 흐리게 보인다. */
function InfoRow({
  name,
  view,
  tagText,
  children,
}: {
  name: string
  view?: FieldView
  tagText?: string
  children?: ReactNode
}) {
  return (
    <div
      data-profile-row={name}
      className="flex min-w-0 flex-col gap-0.5 py-3 first:pt-0 last:pb-0"
    >
      <dt className="flex flex-wrap items-center gap-x-2 text-support leading-snug font-normal text-muted">
        {name}
        {tagText ? (
          <span className={`${chipClass} bg-page`}>{tagText}</span>
        ) : null}
      </dt>
      <dd className="min-w-0 text-body leading-snug font-normal wrap-break-word text-content">
        {children ??
          (view?.kind === 'value' ? (
            view.text
          ) : view ? (
            <span
              data-profile-status={view.status}
              className="font-normal text-muted"
            >
              {FIELD_STATUS_TEXT[view.status]}
            </span>
          ) : null)}
      </dd>
    </div>
  )
}

const SAVE_TEXT = {
  saving: '닉네임을 저장하고 있어요…',
  failed:
    '저장하지 못했어요. 입력한 내용은 그대로 남아 있으니 다시 시도해 주세요.',
  saved: '닉네임을 저장했어요.',
} as const

/**
 * P02 프로필과 개인정보 설정(화면명세 v5.0: 01 프로필 · 02 가입 개인정보 · 03 건강 관리 동의 · 저장·취소 · 계정 관리).
 * - 수정할 수 있는 것은 닉네임(2~20자)뿐이다. 서버 연결(source)이 없으면 저장 버튼을 비활성으로 두고 "저장되지 않아요"를 알린다.
 *   저장 완료 안내는 서버가 저장했을 때만 나온다. 취소는 저장하지 않고 돌아간다.
 * - 이름·휴대폰·본인인증 나이·성별·주소·알레르기·AI 활용 동의는 읽기 전용이며 서버가 준 값만 보인다(저장소가 없다). 연결 전은 "연결 전",
 *   서버가 값을 주지 않으면 "등록된 정보 없음"이다. 휴대폰은 일부만 보인다. 이 값들의 변경(본인인증·주소 검색·동의 저장)은 서버가 필요해 준비 중이다.
 * - 프로필 사진 변경도 업로드 수단이 없어 기본 이미지만 보인다(변경 버튼은 비활성).
 * - 계정 이메일은 읽기 전용이고 비밀번호 변경은 A04로 간다. 신체 정보(키·몸무게)와 건강 목표·잠금 관리는 마이페이지(P01·P06)의 책임이라
 *   이 화면은 값을 보이지 않고 마이페이지로 가는 링크만 둔다(P05 열람 권한을 우회하지 않는다).
 * `initial`은 시험에서만 쓴다(화면은 넘기지 않는다).
 */
export default function ProfileSettingsView({
  account,
  state,
  onRetry,
  source,
  cancelTo,
  initial,
}: {
  account: { nickname: string; email: string }
  state: ProfileState
  onRetry: () => void
  source: ProfileSource | null
  cancelTo: string
  initial?: {
    nickname?: string
    phase?: NicknameSavePhase
    shown?: boolean
  }
}) {
  const [nickname, setNickname] = useState(
    initial?.nickname ?? account.nickname,
  )
  const [shown, setShown] = useState(initial?.shown ?? false)
  const [phase, setPhase] = useState<NicknameSavePhase>(
    initial?.phase ?? 'idle',
  )
  // 서버가 저장한 닉네임. 저장하기 전에는 로그인 계정의 값이고, 변경 여부(dirty)의 기준이다.
  const [savedNickname, setSavedNickname] = useState(account.nickname)
  const savingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef(true)
  const baseId = useId()
  const formId = `${baseId}-form`
  const nicknameId = `${baseId}-nickname`
  const nicknameErrorId = `${baseId}-nickname-error`
  const connected = source !== null
  const busy = phase === 'saving'
  const checked = validateNickname(nickname)
  const nicknameError =
    shown && !checked.ok ? NICKNAME_ERROR_MESSAGE.length : null
  const dirty = nickname.trim() !== savedNickname

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (phase === 'failed' || phase === 'saved') resultRef.current?.focus()
  }, [phase])

  function handleNickname(event: ChangeEvent<HTMLInputElement>) {
    setNickname(event.target.value)
    if (!savingRef.current) setPhase('idle')
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current || !connected) return
    const result = validateNickname(nickname)
    if (!result.ok) {
      setShown(true)
      setPhase('invalid')
      inputRef.current?.focus()
      return
    }
    savingRef.current = true
    setPhase('saving')
    const controller = new AbortController()
    abortRef.current = controller
    const outcome = await runUpdateNickname(
      source,
      result.nickname,
      controller.signal,
    )
    if (controller.signal.aborted) return
    abortRef.current = null
    savingRef.current = false
    if (outcome === null) {
      setPhase('idle')
      return
    }
    if (outcome === 'saved') {
      setSavedNickname(result.nickname)
      setNickname(result.nickname)
    }
    setPhase(outcome)
  }

  const row = (key: ProfileRowKey) => profileFieldView(state, key)
  const profileEmpty = isProfileEmpty(state)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          프로필과 개인정보 설정
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          공개 프로필과 가입 개인정보, 건강 관리 동의를 확인해요.
        </p>
      </header>

      {state.status === 'unavailable' ? (
        <p
          role="status"
          data-profile-state="unavailable"
          className={`${noticeClass} mt-0`}
        >
          {PROFILE_UNAVAILABLE_TEXT}
        </p>
      ) : null}
      {state.status === 'loading' ? (
        <p
          role="status"
          data-profile-state="loading"
          className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
        >
          내 정보를 불러오는 중이에요…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="flex flex-col gap-2">
          <p
            role="alert"
            data-profile-state="error"
            className={`${errorClass} mt-0`}
          >
            내 정보를 불러오지 못했어요. 등록된 정보가 없는 것은 아니에요. 잠시
            후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            data-profile-retry=""
            onClick={onRetry}
            className={secondaryButtonClass}
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {profileEmpty ? (
        <p
          role="status"
          data-profile-state="empty"
          className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
        >
          아직 등록된 개인정보가 없어요. 선택 정보를 입력하지 않아도 기본 기록은
          이용할 수 있어요.
        </p>
      ) : null}

      <form
        id={formId}
        onSubmit={handleSubmit}
        noValidate
        aria-busy={busy}
        data-profile-form=""
        className="flex flex-col gap-4"
      >
        <section aria-labelledby={`${baseId}-s1`} className={cardClass}>
          <SectionTitle no="01" id={`${baseId}-s1`}>
            프로필
          </SectionTitle>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              role="img"
              aria-label="기본 프로필 이미지"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
            >
              <Icon name="user" size={30} />
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <button
                type="button"
                disabled
                data-profile-photo=""
                className="inline-flex min-h-11 cursor-not-allowed items-center rounded-control border border-dashed border-muted/60 bg-page px-3 text-body font-semibold text-muted"
              >
                사진 변경
              </button>
              <p className={help}>
                프로필 사진 변경은 서버 연결 후 이용할 수 있어요. 지금은 기본
                이미지만 보여요.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor={nicknameId} className={label}>
              닉네임 <span className={tag}>필수</span>
            </label>
            <input
              ref={inputRef}
              id={nicknameId}
              name="profileNickname"
              type="text"
              autoComplete="nickname"
              value={nickname}
              onChange={handleNickname}
              onBlur={() => setShown(true)}
              aria-required="true"
              aria-invalid={nicknameError ? true : undefined}
              aria-describedby={
                nicknameError
                  ? `${nicknameId}-help ${nicknameErrorId}`
                  : `${nicknameId}-help`
              }
              className={field}
            />
            <p id={`${nicknameId}-help`} className={help}>
              {NICKNAME_MIN}~{NICKNAME_MAX}자로 입력해 주세요.
            </p>
            <div role="alert">
              {nicknameError ? (
                <p
                  id={nicknameErrorId}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {nicknameError}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </form>

      <section aria-labelledby={`${baseId}-s2`} className={cardClass}>
        <SectionTitle no="02" id={`${baseId}-s2`}>
          가입 개인정보
        </SectionTitle>
        <dl className="mt-3 divide-y divide-line">
          <InfoRow name="계정 이메일" tagText="읽기 전용">
            {account.email}
          </InfoRow>
          <InfoRow name="비밀번호">
            <Link
              to="/password/reset"
              state={{ from: PATH_PROFILE }}
              data-profile-password=""
              className={`inline-flex min-h-11 items-center gap-1 font-semibold text-brand hover:text-brand-hover ${focusRing}`}
            >
              비밀번호 변경
              <Icon name="chevron-right" size={18} />
            </Link>
          </InfoRow>
          <InfoRow name="이름" view={row('name')} />
          <InfoRow name="휴대폰" view={row('phone')} />
          <InfoRow name="본인인증 나이·성별" view={row('identity')} />
          <InfoRow name="주소" view={row('address')} />
        </dl>
        <p className={help}>
          이름·휴대폰·주소는 본인인증과 주소 검색이 필요해 서버 연결 후 변경할
          수 있어요. 휴대폰 번호는 일부만 보여요.
        </p>
      </section>

      <section aria-labelledby={`${baseId}-s3`} className={cardClass}>
        <SectionTitle no="03" id={`${baseId}-s3`}>
          건강 관리 동의
        </SectionTitle>
        <dl className="mt-3 divide-y divide-line">
          <InfoRow name="알레르기" view={row('allergies')} />
          <InfoRow name="선택 AI 활용 동의" view={row('aiConsent')} />
        </dl>
        <p className={help}>
          알레르기와 동의 변경은 서버 연결 후 이용할 수 있어요.
        </p>
        <ul className="mt-1 flex flex-col">
          {[
            {
              to: '/settings/health-goal',
              label: '건강 목표 설정',
              key: 'goal',
            },
            { to: '/settings/body', label: '키·몸무게 입력', key: 'body' },
            {
              to: '/mypage',
              label: '신체 정보 잠금 관리(마이페이지)',
              key: 'lock',
            },
          ].map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                state={{ from: PATH_PROFILE }}
                data-profile-link={item.key}
                className={`inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
              >
                {item.label}
                <Icon name="chevron-right" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */}
      <div role="status" className="empty:hidden">
        {phase === 'saving' ? (
          <p
            data-profile-save="saving"
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            {SAVE_TEXT.saving}
          </p>
        ) : null}
        {phase === 'failed' || phase === 'saved' ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            data-profile-save={phase}
            className={`rounded-control px-3 py-2 text-support leading-relaxed font-normal focus:outline-none ${phase === 'failed' ? 'border border-danger/30 bg-danger-soft text-danger' : 'bg-brand-soft text-content'}`}
          >
            {SAVE_TEXT[phase]}
          </div>
        ) : null}
        {phase === 'invalid' ? (
          <p data-profile-save="invalid" className={`${errorClass} mt-0`}>
            닉네임을 확인해 주세요.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          form={formId}
          disabled={!connected || busy || !dirty}
          data-profile-submit=""
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {busy ? '저장하는 중…' : '저장'}
        </button>
        {connected ? null : (
          <p className={help}>
            서버에 연결되면 닉네임을 저장할 수 있어요. 그 전까지 입력 화면만
            확인할 수 있어요.
          </p>
        )}
        <Link
          to={cancelTo}
          data-profile-cancel=""
          className={secondaryLinkClass}
        >
          취소
        </Link>
      </div>
    </div>
  )
}
