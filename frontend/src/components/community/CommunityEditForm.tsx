import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from 'react'
import {
  COMPOSE_ERROR_MESSAGE,
  COMPOSE_TOO_LONG_MESSAGE,
  EDIT_RESULT_TEXT,
  PRIVACY_WARNING,
  settlePostWrite,
  validateCompose,
  type ComposeField,
  type PostDetail,
  type PostEditInput,
  type SubmittedWrite,
  type UpdatePostResult,
} from '../../community/community.ts'
import {
  errorClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryButtonClass,
} from '../auth/authStyles.ts'

const card = 'rounded-card border border-line bg-surface p-4'
const sectionTitle =
  'text-section-title leading-snug font-semibold text-content'
const label =
  'mb-1.5 flex flex-wrap items-center gap-x-2 text-body font-normal text-content'
const tag = 'text-support font-semibold text-muted'
const help = 'mt-1 text-support leading-relaxed font-normal text-muted'
/** 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지). */
const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-invalid:border-danger aria-invalid:bg-danger-soft disabled:cursor-not-allowed'
const alertBox =
  'rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger focus:outline-none'

/**
 * idle: 입력 중. invalid: 검사 실패. saving: 저장 중.
 * gone·rejected·uncertain·unconfirmed: 결과 안내(입력은 그대로 남는다). 성공(updated)·남의 글(forbidden)은 화면이 처리한다.
 */
type Phase =
  | 'idle'
  | 'invalid'
  | 'saving'
  | 'gone'
  | 'rejected'
  | 'uncertain'
  | 'unconfirmed'

/**
 * 내 자유게시판 글 수정 폼(C2-D7, 상세 화면 안 편집 모드). 제목·내용을 현재 값으로 채우고, 작성과 같은 규칙으로 검사한다(ERR-2).
 * - 처리 중에는 다시 제출해도 한 번만 나간다. 결과는 `settlePostWrite`로 반영 직전에 다시 판정한다(C2-IMPL-3).
 * - 결과를 모르면(uncertain) **자동으로 다시 보내지 않는다.** 다른 기기·탭의 수정을 덮어쓸 수 있다고 알리고(C2-R3, C2-D4),
 *   사용자가 [다시 저장] 또는 [편집 그만두고 최신 글 보기]를 고른다.
 * - 글을 찾을 수 없으면(gone) "삭제됐어요"라고 단정하지 않고(C2-R4) 입력을 남긴다(복사할 수 있게).
 * - 취소하면 진행 중 요청의 대기를 중단한다(화면이 작업도 무효로 한다). 단, 이미 보낸 수정은 서버에 반영될 수 있으므로
 *   저장 중 취소는 "저장되지 않음"이 아니다(C2-C2). 화면이 반영됐을 수 있다고 알리고 다시 불러오기를 남긴다.
 */
export default function CommunityEditForm({
  initialTitle,
  initialBody,
  submit,
  onUpdated,
  onForbidden,
  onCancel,
  onShowLatest,
}: {
  initialTitle: string
  initialBody: string
  submit: (
    input: PostEditInput,
    signal: AbortSignal,
  ) => Promise<SubmittedWrite<UpdatePostResult>>
  onUpdated: (detail: PostDetail) => void
  onForbidden: () => void
  /** 저장 중에 취소했으면 true: 이미 보낸 수정이 서버에 반영됐을 수 있다(화면이 그렇게 안내한다). */
  onCancel: (wasSaving: boolean) => void
  /** 입력을 버리고 편집을 끝낸 뒤 글을 다시 불러온다. */
  onShowLatest: () => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [body, setBody] = useState(initialBody)
  const [shown, setShown] = useState<readonly ComposeField[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  const baseId = useId()
  const saving = phase === 'saving'

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (
      phase === 'gone' ||
      phase === 'rejected' ||
      phase === 'uncertain' ||
      phase === 'unconfirmed'
    )
      resultRef.current?.focus()
  }, [phase])

  const check = validateCompose('free', { category: null, title, body })
  const invalidFields: readonly ComposeField[] = check.ok ? [] : check.errors
  const errorOf = (name: 'title' | 'body'): string | null =>
    shown.includes(name) && invalidFields.includes(name)
      ? !check.ok && check.tooLong.includes(name)
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

  async function save() {
    if (busyRef.current) return
    const result = validateCompose('free', { category: null, title, body })
    if (!result.ok) {
      setShown(['title', 'body'])
      setPhase('invalid')
      if (result.errors[0] === 'title') titleRef.current?.focus()
      else bodyRef.current?.focus()
      return
    }
    busyRef.current = true
    setPhase('saving')
    const controller = new AbortController()
    abortRef.current = controller
    let submitted: SubmittedWrite<UpdatePostResult>
    try {
      submitted = await submit(
        { title: result.input.title, body: result.input.body },
        controller.signal,
      )
    } catch {
      submitted = {
        result: { kind: 'uncertain' },
        currency: () => (controller.signal.aborted ? 'stale' : 'current'),
      }
    }
    if (abortRef.current === controller) abortRef.current = null
    busyRef.current = false
    // 화면을 떠났거나 취소·다른 글로 이동·새 작업이면 아무것도 하지 않는다(stale).
    settlePostWrite(submitted, {
      updated: (r) => onUpdated(r.detail),
      forbidden: () => onForbidden(),
      gone: () => setPhase('gone'),
      rejected: () => setPhase('rejected'),
      uncertain: () => setPhase('uncertain'),
      unconfirmed: () => setPhase('unconfirmed'),
    })
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    void save()
  }

  function cancel() {
    const wasSaving = busyRef.current
    abortRef.current?.abort()
    abortRef.current = null
    busyRef.current = false
    onCancel(wasSaving)
  }

  const titleError = errorOf('title')
  const bodyError = errorOf('body')
  const titleId = `${baseId}-title`
  const bodyId = `${baseId}-body`

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={saving}
      data-community-edit=""
      className="flex flex-col gap-4"
    >
      <section aria-labelledby={`${baseId}-heading`} className={card}>
        <h2 id={`${baseId}-heading`} className={sectionTitle}>
          글 수정
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <label htmlFor={titleId} className={label}>
              제목 <span className={tag}>필수</span>
            </label>
            <input
              ref={titleRef}
              id={titleId}
              name="postTitle"
              type="text"
              autoComplete="off"
              value={title}
              disabled={saving}
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
              내용 <span className={tag}>필수</span>
            </label>
            <textarea
              ref={bodyRef}
              id={bodyId}
              name="postBody"
              rows={8}
              value={body}
              disabled={saving}
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
            <p className={help}>{PRIVACY_WARNING}</p>
          </div>
        </div>
      </section>

      <div role="status" className="empty:hidden">
        {saving ? (
          <p
            data-community-edit-state="saving"
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            글을 수정하고 있어요…
          </p>
        ) : null}
        {phase === 'gone' ||
        phase === 'rejected' ||
        phase === 'uncertain' ||
        phase === 'unconfirmed' ? (
          <p
            ref={resultRef}
            tabIndex={-1}
            data-community-edit-state={phase}
            className={alertBox}
          >
            {EDIT_RESULT_TEXT[phase]}
          </p>
        ) : null}
        {phase === 'invalid' ? (
          <p
            data-community-edit-state="invalid"
            className={`${errorClass} mt-0`}
          >
            {!check.ok && check.tooLong.length > 0
              ? '입력한 내용을 확인해 주세요.'
              : '필수 항목을 입력해 주세요.'}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={saving}
          data-community-edit-submit=""
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {saving
            ? '저장 중…'
            : phase === 'uncertain'
              ? '다시 저장'
              : '수정 완료'}
        </button>
        {phase === 'uncertain' || phase === 'unconfirmed' ? (
          <button
            type="button"
            data-community-edit-latest=""
            onClick={() => {
              abortRef.current?.abort()
              onShowLatest()
            }}
            className={secondaryButtonClass}
          >
            편집 그만두고 최신 글 보기(입력한 내용은 사라져요)
          </button>
        ) : null}
        <button
          type="button"
          data-community-edit-cancel=""
          onClick={cancel}
          className={secondaryButtonClass}
        >
          취소
        </button>
        <p data-community-edit-cancel-help="" className={help}>
          {saving
            ? '지금 취소해도 이미 보낸 수정은 반영될 수 있어요.'
            : '저장하기 전에 취소하면 고친 내용은 저장되지 않아요.'}
        </p>
      </div>
    </form>
  )
}
