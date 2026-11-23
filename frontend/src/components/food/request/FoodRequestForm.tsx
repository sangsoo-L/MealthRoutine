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
  ATTACHMENT_ERROR_MESSAGE,
  FOOD_NAME_ERROR_MESSAGE,
  PATH_MY_FOOD_REQUESTS,
  runFoodRequest,
  validateAttachment,
  validateFoodName,
  type AttachmentError,
  type FoodNameError,
  type FoodRequestSource,
  type SubmitPhase,
} from '../../../food-request/foodRequest.ts'
import { PATH_MEAL_RECORD } from '../../../food/foodPaths.ts'
import {
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'

const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-meal focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-meal aria-invalid:border-danger aria-invalid:bg-danger-soft'
const label =
  'mb-1.5 flex flex-wrap items-center gap-x-2 text-body font-normal text-content'
const tag = 'text-support font-semibold text-muted'
const help = 'mt-1 text-support leading-relaxed font-normal text-muted'

const PHASE_TEXT = {
  preparing: '요청을 준비하고 있어요…',
  submitting: '음식 등록을 요청하고 있어요…',
  unavailable:
    '음식 등록 요청 기능이 아직 서버에 연결되지 않았어요. 요청은 접수되지 않았고 저장되지도 않았어요. 입력한 내용은 이 화면에 그대로 남아 있어요.',
  failed:
    '요청을 보내지 못했어요. 입력한 내용은 그대로 남아 있으니 다시 시도해 주세요.',
} as const

/**
 * F03 음식 등록 요청 폼. 입력은 이 화면에 머무는 동안만 유지하며 어디에도 저장하지 않는다.
 * - 필수는 음식 이름뿐이고 명세에 다른 입력 제한이 없어 길이 제한을 만들지 않는다. 브랜드·추가 설명은 선택, 영양표 사진은 선택(이미지·10MB 이하).
 * - 첨부 오류가 나면 사진을 첨부하지 않은 채 텍스트만 제출할 수 있다(명세).
 * - 서버 연결(source)이 없으면 요청하지 않고 "요청은 접수되지 않았어요"를 알린다. "요청 접수" 안내는 서버가 접수 응답을 준 때만 나온다.
 *   서버가 같은 요청이 이미 있다고 알리면 기존 요청 확인을 안내한다.
 * - 처리 중에는 다시 제출해도 한 번만 나간다. 실패하면 입력을 유지한 채 다시 제출할 수 있다.
 * `initial`은 시험에서만 쓴다(화면은 넘기지 않는다).
 */
export default function FoodRequestForm({
  source,
  initial,
}: {
  source: FoodRequestSource | null
  initial?: {
    phase?: SubmitPhase
    foodName?: string
    nameError?: FoodNameError
    attachmentError?: AttachmentError
  }
}) {
  const [foodName, setFoodName] = useState(initial?.foodName ?? '')
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [nameError, setNameError] = useState<FoodNameError | null>(
    initial?.nameError ?? null,
  )
  const [attachmentError, setAttachmentError] =
    useState<AttachmentError | null>(initial?.attachmentError ?? null)
  const [state, setState] = useState<SubmitPhase>(
    initial?.phase ?? { phase: 'idle' },
  )
  const submittingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef(true)
  const baseId = useId()
  const nameId = `${baseId}-name`
  const nameErrorId = `${baseId}-name-error`
  const brandId = `${baseId}-brand`
  const fileId = `${baseId}-file`
  const fileHelpId = `${baseId}-file-help`
  const descId = `${baseId}-desc`

  useEffect(() => () => abortRef.current?.abort(), [])
  const phase = state.phase
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (phase === 'unavailable' || phase === 'failed' || phase === 'done') {
      resultRef.current?.focus()
    }
  }, [phase])

  // 입력을 고치면 이전 오류·결과 안내를 지운다(요청이 진행 중이면 상태는 건드리지 않는다).
  function edited() {
    if (submittingRef.current) return
    setState({ phase: 'idle' })
  }

  function handleName(event: ChangeEvent<HTMLInputElement>) {
    setFoodName(event.target.value)
    setNameError(null)
    edited()
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    edited()
    if (file === null) {
      setAttachment(null)
      setAttachmentError(null)
      return
    }
    const error = validateAttachment(file)
    if (error) {
      // 첨부 오류: 사진은 첨부하지 않고 텍스트만 제출할 수 있다.
      event.target.value = ''
      setAttachment(null)
      setAttachmentError(error)
      return
    }
    setAttachment(file)
    setAttachmentError(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return
    const checked = validateFoodName(foodName)
    if (!checked.ok) {
      setNameError(checked.error)
      setState({ phase: 'invalid' })
      nameRef.current?.focus()
      return
    }
    setNameError(null)
    submittingRef.current = true
    setState({ phase: source === null ? 'preparing' : 'submitting' })
    const controller = new AbortController()
    abortRef.current = controller
    const result = await runFoodRequest(
      source,
      {
        foodName: checked.name,
        brand: brand.trim() === '' ? null : brand.trim(),
        description: description.trim() === '' ? null : description.trim(),
        attachment,
      },
      controller.signal,
    )
    if (controller.signal.aborted) return
    abortRef.current = null
    submittingRef.current = false
    setState(result)
  }

  const busy = phase === 'preparing' || phase === 'submitting'
  return (
    <form onSubmit={handleSubmit} noValidate data-request-form="">
      <div className={`${mealCard} flex flex-col gap-4`}>
        <div>
          <label htmlFor={nameId} className={label}>
            음식 이름 <span className={tag}>필수</span>
          </label>
          <input
            ref={nameRef}
            id={nameId}
            name="foodName"
            type="text"
            autoComplete="off"
            placeholder="예: 현미 즉석밥, 무가당 그릭요거트"
            value={foodName}
            onChange={handleName}
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            className={field}
          />
          <div role="alert">
            {nameError ? (
              <p
                id={nameErrorId}
                className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
              >
                {FOOD_NAME_ERROR_MESSAGE[nameError]}
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <label htmlFor={brandId} className={label}>
            브랜드 또는 판매처 <span className={tag}>선택</span>
          </label>
          <input
            id={brandId}
            name="brand"
            type="text"
            autoComplete="off"
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value)
              edited()
            }}
            className={field}
          />
        </div>
        <div>
          <label htmlFor={fileId} className={label}>
            영양표 사진 <span className={tag}>선택</span>
          </label>
          <input
            ref={fileRef}
            id={fileId}
            name="attachment"
            type="file"
            accept="image/*"
            onChange={handleFile}
            aria-describedby={fileHelpId}
            aria-invalid={attachmentError ? true : undefined}
            className={`${field} py-2.5 file:mr-3 file:rounded-control file:border-0 file:bg-meal-soft file:px-3 file:py-1.5 file:text-body file:font-semibold file:text-meal`}
          />
          {/* 개인정보 안내 문구는 명세의 "개인정보 안내" 항목을 채우려고 쓴 임시 문구다. 공식 개인정보 처리방침·업로드 정책으로 확정된 문구가 아니며, 정책이 확정되면 교체한다. */}
          <p id={fileHelpId} className={help}>
            영양정보가 보이는 사진 · 최대 10MB. 사진에 이름·연락처 같은
            개인정보가 보이지 않게 해 주세요.
          </p>
          <div role="alert">
            {attachmentError ? (
              <p
                data-request-attachment-error=""
                className="mt-1.5 text-support leading-relaxed font-semibold text-danger"
              >
                {ATTACHMENT_ERROR_MESSAGE[attachmentError]}
              </p>
            ) : null}
          </div>
          {attachment ? (
            <p data-request-attachment-name="" className={help}>
              첨부: {attachment.name}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={descId} className={label}>
            추가 설명 <span className={tag}>선택</span>
          </label>
          <textarea
            id={descId}
            name="description"
            rows={3}
            placeholder="등록에 도움이 되는 정보를 적어 주세요"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              edited()
            }}
            className={`${field} resize-y`}
          />
        </div>
      </div>

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */}
      <div role="status" className="mt-3 empty:hidden">
        {state.phase === 'preparing' || state.phase === 'submitting' ? (
          <p
            data-request-state={state.phase}
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            {PHASE_TEXT[state.phase]}
          </p>
        ) : null}
        {state.phase === 'unavailable' || state.phase === 'failed' ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            data-request-state={state.phase}
            className={`rounded-control px-3 py-2 text-support leading-relaxed font-normal focus:outline-none ${state.phase === 'failed' ? 'border border-danger/30 bg-danger-soft text-danger' : 'bg-page text-muted'}`}
          >
            {PHASE_TEXT[state.phase]}
          </div>
        ) : null}
        {state.phase === 'done' ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            data-request-state="done"
            className="rounded-control bg-meal-soft px-3 py-2 text-support leading-relaxed font-normal text-content focus:outline-none"
          >
            {state.result.kind === 'accepted'
              ? '음식 등록 요청이 접수되었어요.'
              : '비슷한 요청이 이미 있어요. 기존 요청을 확인해 주세요.'}{' '}
            접수 번호 {state.result.requestId}
            <Link
              to={PATH_MY_FOOD_REQUESTS}
              className={`mt-2 flex min-h-11 items-center font-semibold text-meal ${mealFocusRing}`}
            >
              내 요청 내역 보기
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="submit"
          aria-disabled={busy || undefined}
          className={`${mealPrimaryButton} aria-disabled:cursor-wait`}
        >
          {busy ? '요청 중…' : '음식 등록 요청하기'}
        </button>
        <p className={help}>
          요청을 기다리는 동안에도 직접 입력으로 무료로 기록할 수 있어요.
        </p>
        <Link
          to={PATH_MEAL_RECORD}
          data-request-manual=""
          className={mealSecondaryButton}
        >
          직접 입력으로 기록
        </Link>
      </div>
    </form>
  )
}
