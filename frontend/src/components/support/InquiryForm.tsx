import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from 'react'
import { Link } from 'react-router'
import {
  DEFAULT_INQUIRY_TYPE,
  INQUIRY_ERROR_MESSAGE,
  INQUIRY_FIELD_LABEL,
  INQUIRY_TYPES,
  INQUIRY_TYPE_LABEL,
  PATH_MY_INQUIRIES,
  runCreateInquiry,
  validateInquiry,
  validateInquiryField,
  type InquiryField,
  type InquirySource,
  type InquirySubmitPhase,
  type InquiryType,
} from '../../inquiry/inquiry.ts'
import {
  errorClass,
  focusRing,
  noticeClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'

const card = 'rounded-card border border-line bg-surface p-4'
const sectionTitle =
  'flex items-center gap-2 text-section-title leading-snug font-semibold text-content'
const number = 'text-support font-semibold text-brand'
const label =
  'mb-1.5 flex flex-wrap items-center gap-x-2 text-body font-normal text-content'
const tag = 'text-support font-semibold text-muted'
const help = 'mt-1 text-support leading-relaxed font-normal text-muted'
/** 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지). */
const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-invalid:border-danger aria-invalid:bg-danger-soft disabled:cursor-not-allowed'

const PHASE_TEXT = {
  submitting: '문의를 접수하고 있어요…',
  failed:
    '문의를 보내지 못했어요. 입력한 내용은 그대로 남아 있으니 다시 시도해 주세요.',
} as const

/** 서버 연결 전 안내. 접수·저장되지 않았다는 사실을 분명히 알린다. */
export const INQUIRY_UNAVAILABLE_TEXT =
  '문의 접수 기능이 아직 서버에 연결되지 않았어요. 지금은 문의를 보낼 수 없고, 작성한 내용은 접수되지도 저장되지도 않아요.'

/**
 * S02 문의 작성 폼(화면명세 v5.0: 01 문의 유형 · 02 제목·내용 필수 · 답변 확인 위치 안내 · 문의 등록).
 * - 입력은 이 화면에 머무는 동안만 유지하며 어디에도 저장하지 않는다. 유형을 바꿔도 제목·내용은 그대로다.
 * - 제목·내용은 앞뒤 공백을 뺀 뒤 비어 있으면 차단한다. 글자 수 제한은 명세에 없어 만들지 않는다. 오류는 칸을 벗어날 때와 제출할 때 알린다.
 * - 서버 연결(source)이 없으면 제출 버튼을 비활성으로 두고 연결 전 안내를 보인다. 접수 완료·성공 화면을 만들지 않으며,
 *   접수는 서버가 접수 응답을 준 때만 `onSubmitted`로 알린다(P13 이동은 호출한 화면이 맡는다).
 * - 처리 중에는 다시 제출해도 한 번만 나간다. 실패하면 입력을 유지한 채 다시 제출할 수 있다.
 * `initial`은 시험에서만 쓴다(화면은 넘기지 않는다).
 */
export default function InquiryForm({
  source,
  cancelTo,
  onSubmitted,
  initial,
}: {
  source: InquirySource | null
  cancelTo: string
  onSubmitted?: () => void
  initial?: {
    phase?: InquirySubmitPhase
    type?: InquiryType
    title?: string
    body?: string
    shown?: readonly InquiryField[]
  }
}) {
  const [type, setType] = useState<InquiryType>(
    initial?.type ?? DEFAULT_INQUIRY_TYPE,
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [shown, setShown] = useState<readonly InquiryField[]>(
    initial?.shown ?? [],
  )
  const [state, setState] = useState<InquirySubmitPhase>(
    initial?.phase ?? { phase: 'idle' },
  )
  const submittingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const failedRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef(true)
  const baseId = useId()
  const connected = source !== null
  const phase = state.phase
  const busy = phase === 'submitting'

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (phase === 'failed') failedRef.current?.focus()
  }, [phase])

  const values = { title, body }
  const errorOf = (name: InquiryField): string | null =>
    shown.includes(name) && validateInquiryField(values[name])
      ? INQUIRY_ERROR_MESSAGE[name]
      : null
  const reveal = (name: InquiryField) =>
    setShown((current) =>
      current.includes(name) ? current : [...current, name],
    )

  // 입력을 고치면 이전 실패 안내를 거둔다(요청이 진행 중이면 상태는 건드리지 않는다).
  function edited() {
    if (submittingRef.current) return
    setState({ phase: 'idle' })
  }

  function handleType(next: InquiryType) {
    setType(next)
    edited()
  }
  function handleTitle(event: ChangeEvent<HTMLInputElement>) {
    setTitle(event.target.value)
    edited()
  }
  function handleBody(event: ChangeEvent<HTMLTextAreaElement>) {
    setBody(event.target.value)
    edited()
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || !connected) return
    const checked = validateInquiry({ type, title, body })
    if (!checked.ok) {
      setShown(['title', 'body'])
      setState({ phase: 'invalid' })
      ;(checked.errors[0] === 'title' ? titleRef : bodyRef).current?.focus()
      return
    }
    submittingRef.current = true
    setState({ phase: 'submitting' })
    const controller = new AbortController()
    abortRef.current = controller
    const result = await runCreateInquiry(
      source,
      checked.input,
      controller.signal,
    )
    if (controller.signal.aborted) return
    abortRef.current = null
    submittingRef.current = false
    if (result === null) {
      setState({ phase: 'idle' })
      return
    }
    setState(result)
    if (result.phase === 'done') onSubmitted?.()
  }

  const titleError = errorOf('title')
  const bodyError = errorOf('body')
  const titleId = `${baseId}-title`
  const bodyId = `${baseId}-body`
  const titleErrorId = `${baseId}-title-error`
  const bodyErrorId = `${baseId}-body-error`
  const typeHelpId = `${baseId}-type-help`

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={busy}
      data-inquiry-form=""
      className="flex flex-col gap-4"
    >
      {connected ? null : (
        <p
          role="status"
          data-inquiry-unavailable=""
          className={`${noticeClass} mt-0`}
        >
          {INQUIRY_UNAVAILABLE_TEXT}
        </p>
      )}

      <section aria-labelledby={`${baseId}-type-title`} className={card}>
        <fieldset
          className="min-w-0 border-0 p-0"
          aria-describedby={typeHelpId}
        >
          <legend id={`${baseId}-type-title`} className={sectionTitle}>
            <span className={number} aria-hidden="true">
              01
            </span>
            문의 유형
          </legend>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(8rem,100%),1fr))] gap-2">
            {INQUIRY_TYPES.map((value) => (
              <label key={value} className="relative block min-w-0">
                <input
                  type="radio"
                  name="inquiryType"
                  value={value}
                  checked={type === value}
                  onChange={() => handleType(value)}
                  className="peer sr-only"
                />
                <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-control border border-muted/75 bg-surface px-3 text-center text-body leading-snug font-normal text-content peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-semibold peer-checked:text-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                  {INQUIRY_TYPE_LABEL[value]}
                </span>
              </label>
            ))}
          </div>
          <p id={typeHelpId} className={help}>
            유형을 바꿔도 작성한 제목과 내용은 그대로 남아요.
          </p>
        </fieldset>
      </section>

      <section aria-labelledby={`${baseId}-content-title`} className={card}>
        <h2 id={`${baseId}-content-title`} className={sectionTitle}>
          <span className={number} aria-hidden="true">
            02
          </span>
          문의 내용
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <label htmlFor={titleId} className={label}>
              {INQUIRY_FIELD_LABEL.title} <span className={tag}>필수</span>
            </label>
            <input
              ref={titleRef}
              id={titleId}
              name="inquiryTitle"
              type="text"
              autoComplete="off"
              placeholder="어떤 문의인지 짧게 적어 주세요"
              value={title}
              onChange={handleTitle}
              onBlur={() => reveal('title')}
              aria-required="true"
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? titleErrorId : undefined}
              className={field}
            />
            <div role="alert">
              {titleError ? (
                <p
                  id={titleErrorId}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {titleError}
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor={bodyId} className={label}>
              {INQUIRY_FIELD_LABEL.body} <span className={tag}>필수</span>
            </label>
            <textarea
              ref={bodyRef}
              id={bodyId}
              name="inquiryBody"
              rows={6}
              placeholder="문의하실 내용을 자세히 적어 주세요"
              value={body}
              onChange={handleBody}
              onBlur={() => reveal('body')}
              aria-required="true"
              aria-invalid={bodyError ? true : undefined}
              aria-describedby={bodyError ? bodyErrorId : undefined}
              className={`${field} resize-y`}
            />
            <div role="alert">
              {bodyError ? (
                <p
                  id={bodyErrorId}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {bodyError}
                </p>
              ) : null}
            </div>
            {/* 명세 S02 UX: 민감 건강 정보는 최소한만 요청한다. */}
            <p className={help}>
              몸무게·건강 상태 같은 민감한 정보는 문의에 꼭 필요한 만큼만 적어
              주세요.
            </p>
          </div>
        </div>
      </section>

      <p
        data-inquiry-reply-guide=""
        className="text-support leading-relaxed font-normal text-muted"
      >
        답변은 상세 설정의 &lsquo;내 문의&rsquo;에서 확인할 수 있어요.{' '}
        <Link
          to={PATH_MY_INQUIRIES}
          data-inquiry-history-link=""
          className={`inline-flex min-h-11 items-center font-semibold text-brand underline ${focusRing}`}
        >
          내 문의 보기
        </Link>
      </p>

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */}
      <div role="status" className="empty:hidden">
        {phase === 'submitting' ? (
          <p
            data-inquiry-state="submitting"
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            {PHASE_TEXT.submitting}
          </p>
        ) : null}
        {phase === 'failed' ? (
          <div
            ref={failedRef}
            tabIndex={-1}
            data-inquiry-state="failed"
            className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger focus:outline-none"
          >
            {PHASE_TEXT.failed}
          </div>
        ) : null}
        {phase === 'invalid' ? (
          <p data-inquiry-state="invalid" className={`${errorClass} mt-0`}>
            필수 항목을 입력해 주세요.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={!connected || busy}
          data-inquiry-submit=""
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {busy ? '접수 중…' : '문의 등록'}
        </button>
        {connected ? null : (
          <p className={help}>
            서버에 연결되면 문의를 보낼 수 있어요. 그 전까지 입력 화면만 확인할
            수 있어요.
          </p>
        )}
        <Link
          to={cancelTo}
          data-inquiry-cancel=""
          className={secondaryLinkClass}
        >
          취소
        </Link>
      </div>
    </form>
  )
}
