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
  COMPOSE_ERROR_MESSAGE,
  COMPOSE_TOO_LONG_MESSAGE,
  COMPOSE_UNAVAILABLE_TEXT,
  MEDICAL_NOTE,
  PRIVACY_WARNING,
  QA_CATEGORIES,
  QA_CATEGORY_LABEL,
  settleSubmittedPost,
  validateCompose,
  type CommunityBoard,
  type ComposeField,
  type NewPostInput,
  type SubmittedPost,
  type QaCategory,
} from '../../community/community.ts'
import {
  errorClass,
  noticeClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'

const card = 'rounded-card border border-line bg-surface p-4'
const sectionTitle =
  'flex items-center gap-2 text-section-title leading-snug font-semibold text-content'
const label =
  'mb-1.5 flex flex-wrap items-center gap-x-2 text-body font-normal text-content'
const tag = 'text-support font-semibold text-muted'
const help = 'mt-1 text-support leading-relaxed font-normal text-muted'
/** 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지). */
const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-invalid:border-danger aria-invalid:bg-danger-soft disabled:cursor-not-allowed'

const COPY: Record<
  CommunityBoard,
  {
    titlePlaceholder: string
    bodyPlaceholder: string
    submit: string
    submitting: string
    failed: string
    uncertain: string
  }
> = {
  free: {
    titlePlaceholder: '제목을 입력해 주세요',
    bodyPlaceholder: '일상·자랑·성과 이야기를 자유롭게 적어 주세요',
    submit: '글 등록',
    submitting: '글을 등록하고 있어요…',
    failed:
      '글을 등록하지 못했어요. 입력한 내용은 그대로 남아 있으니 다시 시도해 주세요.',
    uncertain:
      '글이 등록됐는지 확인하지 못했어요. 목록에서 글이 올라갔는지 확인한 뒤, 없을 때만 다시 등록해 주세요. 입력한 내용은 그대로 남아 있어요.',
  },
  qa: {
    // 명세 UX: 지식 부족형에게 질문 예시를 제공한다.
    titlePlaceholder: '예) 처음 운동을 시작하는데 일주일에 몇 번이 좋을까요?',
    bodyPlaceholder:
      '궁금한 점을 구체적으로 적어 주세요. 예) 지금 하는 운동, 식사 습관, 궁금한 이유',
    submit: '질문 등록',
    submitting: '질문을 등록하고 있어요…',
    failed:
      '질문을 등록하지 못했어요. 입력한 내용은 그대로 남아 있으니 다시 시도해 주세요.',
    uncertain:
      '질문이 등록됐는지 확인하지 못했어요. 목록에서 질문이 올라갔는지 확인한 뒤, 없을 때만 다시 등록해 주세요. 입력한 내용은 그대로 남아 있어요.',
  },
}

type Phase = 'idle' | 'invalid' | 'submitting' | 'failed' | 'uncertain'

/**
 * C02 자유게시판 글 작성 / C02-1 초보자 Q&A 질문 작성 폼(화면명세 v5.0).
 * - 자유게시판: 제목·내용. Q&A: 메인 카테고리(운동/식단, 필수·단일 선택)·질문 제목·질문 내용. 취소는 해당 목록으로 돌아간다.
 * - 제목·내용은 앞뒤 공백을 뺀 뒤 비어 있으면 막고, 서버와 같은 최대 글자 수(제목 250·내용 5,000)를 넘으면 막는다. Q&A는 카테고리를 고르지 않으면 막는다.
 *   오류는 칸을 벗어날 때와 제출할 때 알린다.
 * - 올린 글이 누구나 볼 수 있다는 개인정보 경고를 항상 보이고, Q&A는 답변이 의료 진단을 대신하지 않는다는 안내를 함께 둔다.
 * - 서버 연결(`submit`)이 없으면 등록 버튼을 비활성으로 두고 "등록되지도 저장되지도 않아요"를 알린다. 서버가 등록 응답을 준 때만 `onCreated`로 알리고
 *   등록 완료 화면을 따로 만들지 않는다(상세로 이동은 호출한 화면이 맡는다). 입력은 이 화면에서만 유지하고 저장하지 않는다.
 * - 처리 중에는 다시 제출해도 한 번만 나간다. 결과(C1-R2): 저장되지 않음이 확실하면(rejected) "등록하지 못했어요",
 *   저장 여부를 모르면(uncertain) "확인하지 못했어요. 목록에서 확인한 뒤 없을 때만 다시"로 나눠 알린다. 둘 다 입력은 유지하고 자동으로 다시 보내지 않는다.
 */
export default function CommunityComposeForm({
  board,
  submit,
  cancelTo,
  onCreated,
}: {
  board: CommunityBoard
  /** 서버 연결. 없으면(null) 등록할 수 없다. 서버가 성공 응답으로 글 id를 줘야 등록된 것이다. */
  submit:
    | ((input: NewPostInput, signal: AbortSignal) => Promise<SubmittedPost>)
    | null
  cancelTo: string
  onCreated: (id: string) => void
}) {
  const copy = COPY[board]
  const [category, setCategory] = useState<QaCategory | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [shown, setShown] = useState<readonly ComposeField[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const categoryRef = useRef<HTMLFieldSetElement>(null)
  const failedRef = useRef<HTMLParagraphElement>(null)
  const firstRef = useRef(true)
  const baseId = useId()
  const connected = submit !== null
  const busy = phase === 'submitting'

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (phase === 'failed' || phase === 'uncertain') failedRef.current?.focus()
  }, [phase])

  const check = validateCompose(board, { category, title, body })
  const invalidFields: readonly ComposeField[] = check.ok ? [] : check.errors
  const errorOf = (name: ComposeField): string | null =>
    shown.includes(name) && invalidFields.includes(name)
      ? name !== 'category' && !check.ok && check.tooLong.includes(name)
        ? COMPOSE_TOO_LONG_MESSAGE[name]
        : COMPOSE_ERROR_MESSAGE[name]
      : null
  const reveal = (name: ComposeField) =>
    setShown((current) =>
      current.includes(name) ? current : [...current, name],
    )

  function edited() {
    if (busyRef.current) return
    setPhase('idle')
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || submit === null) return
    const result = validateCompose(board, { category, title, body })
    if (!result.ok) {
      setShown(['category', 'title', 'body'])
      setPhase('invalid')
      const first = result.errors[0]
      if (first === 'category')
        categoryRef.current?.querySelector('input')?.focus()
      else if (first === 'title') titleRef.current?.focus()
      else bodyRef.current?.focus()
      return
    }
    busyRef.current = true
    setPhase('submitting')
    const controller = new AbortController()
    abortRef.current = controller
    let submitted: SubmittedPost
    try {
      submitted = await submit(result.input, controller.signal)
    } catch {
      // 연결이 결과를 분류하지 못한 예외: 서버가 저장했을 수 있다.
      submitted = { result: { kind: 'uncertain' }, isCurrent: () => true }
    }
    // 화면을 떠났거나(계정 변경으로 폼이 새로 그려진 경우 포함) 취소된 요청의 결과는 쓰지 않는다.
    if (controller.signal.aborted) return
    busyRef.current = false
    abortRef.current = null
    // 반영 직전에 로그인 작업을 다시 확인한다(C1-C1). 바뀌었으면 이동·실패 안내 대신 확인 안내만.
    settleSubmittedPost(submitted, {
      created: onCreated,
      rejected: () => setPhase('failed'),
      uncertain: () => setPhase('uncertain'),
    })
  }

  const categoryError = errorOf('category')
  const titleError = errorOf('title')
  const bodyError = errorOf('body')
  const titleId = `${baseId}-title`
  const bodyId = `${baseId}-body`

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={busy}
      data-community-compose={board}
      className="flex flex-col gap-4"
    >
      {connected ? null : (
        <p
          role="status"
          data-community-unavailable=""
          className={`${noticeClass} mt-0`}
        >
          {COMPOSE_UNAVAILABLE_TEXT}
        </p>
      )}

      {board === 'qa' ? (
        <section aria-labelledby={`${baseId}-category-title`} className={card}>
          <fieldset
            ref={categoryRef}
            className="min-w-0 border-0 p-0"
            aria-describedby={
              categoryError ? `${baseId}-category-error` : undefined
            }
          >
            <legend id={`${baseId}-category-title`} className={sectionTitle}>
              메인 카테고리 <span className={tag}>필수</span>
            </legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {QA_CATEGORIES.map((value) => (
                <label key={value} className="relative block min-w-0">
                  <input
                    type="radio"
                    name="qaCategory"
                    value={value}
                    checked={category === value}
                    onChange={() => {
                      setCategory(value)
                      reveal('category')
                      edited()
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-control border border-muted/75 bg-surface px-3 text-center text-body leading-snug font-normal text-content peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-semibold peer-checked:text-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                    {QA_CATEGORY_LABEL[value]}
                  </span>
                </label>
              ))}
            </div>
            <div role="alert">
              {categoryError ? (
                <p
                  id={`${baseId}-category-error`}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {categoryError}
                </p>
              ) : null}
            </div>
          </fieldset>
        </section>
      ) : null}

      <section aria-labelledby={`${baseId}-content-title`} className={card}>
        <h2 id={`${baseId}-content-title`} className={sectionTitle}>
          {board === 'qa' ? '질문 내용' : '글 내용'}
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <label htmlFor={titleId} className={label}>
              {board === 'qa' ? '질문 제목' : '제목'}{' '}
              <span className={tag}>필수</span>
            </label>
            <input
              ref={titleRef}
              id={titleId}
              name="postTitle"
              type="text"
              autoComplete="off"
              placeholder={copy.titlePlaceholder}
              value={title}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setTitle(event.target.value)
                edited()
              }}
              onBlur={() => reveal('title')}
              aria-required="true"
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? `${titleId}-error` : undefined}
              className={field}
            />
            <div role="alert">
              {titleError ? (
                <p
                  id={`${titleId}-error`}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {titleError}
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <label htmlFor={bodyId} className={label}>
              {board === 'qa' ? '질문 내용' : '내용'}{' '}
              <span className={tag}>필수</span>
            </label>
            <textarea
              ref={bodyRef}
              id={bodyId}
              name="postBody"
              rows={8}
              placeholder={copy.bodyPlaceholder}
              value={body}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setBody(event.target.value)
                edited()
              }}
              onBlur={() => reveal('body')}
              aria-required="true"
              aria-invalid={bodyError ? true : undefined}
              aria-describedby={bodyError ? `${bodyId}-error` : undefined}
              className={`${field} resize-y`}
            />
            <div role="alert">
              {bodyError ? (
                <p
                  id={`${bodyId}-error`}
                  className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
                >
                  {bodyError}
                </p>
              ) : null}
            </div>
            <p data-community-privacy="" className={help}>
              {PRIVACY_WARNING}
            </p>
            {board === 'qa' ? <p className={help}>{MEDICAL_NOTE}</p> : null}
          </div>
        </div>
      </section>

      <div role="status" className="empty:hidden">
        {phase === 'submitting' ? (
          <p
            data-community-state="submitting"
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            {copy.submitting}
          </p>
        ) : null}
        {phase === 'failed' ? (
          <p
            ref={failedRef}
            tabIndex={-1}
            data-community-state="failed"
            className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger focus:outline-none"
          >
            {copy.failed}
          </p>
        ) : null}
        {phase === 'uncertain' ? (
          <p
            ref={failedRef}
            tabIndex={-1}
            data-community-state="uncertain"
            className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger focus:outline-none"
          >
            {copy.uncertain}
          </p>
        ) : null}
        {phase === 'invalid' ? (
          <p data-community-state="invalid" className={`${errorClass} mt-0`}>
            {!check.ok && check.tooLong.length > 0
              ? '입력한 내용을 확인해 주세요.'
              : '필수 항목을 입력해 주세요.'}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={!connected || busy}
          data-community-submit=""
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {busy ? '등록 중…' : copy.submit}
        </button>
        {connected ? null : (
          <p className={help}>
            서버에 연결되면 글을 올릴 수 있어요. 그 전까지 입력 화면만 확인할 수
            있어요.
          </p>
        )}
        <Link
          to={cancelTo}
          data-community-cancel=""
          className={secondaryLinkClass}
        >
          취소
        </Link>
      </div>
    </form>
  )
}
