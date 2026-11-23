import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { REGISTER_TEXT } from '../../../ai/exercisePlanRegister.ts'
import type { RegisterController } from '../../../ai/useExercisePlanRegister.ts'
import type { PlanResult } from '../../../ai/exercisePlanSelect.ts'
import type { DraftDay } from '../../../exercise/workoutDraftTypes.ts'
import {
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../../exercise/compose/composeStyles.ts'

const DAY_NAME: Record<DraftDay, string> = {
  today: '오늘 운동 목록',
  tomorrow: '내일 운동 계획',
}

/** `YYYY-MM-DD` → `M월 D일`. */
function dayLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

/**
 * I02-1 결과 아래의 "목록 등록" 영역. 등록 가능한 날짜 선택·구성 중인 초안 교체 확인·등록 불가 안내를 보여 준다.
 * 등록해도 저장되지 않는다: 눌러서 이동한 운동 목록 편집(W02)과 최종 검토(W11)에서 고치고 저장한다.
 */
export default function PlanRegisterPanel({
  plan,
  register,
}: {
  plan: PlanResult
  register: RegisterController
}) {
  const { phase, message, available } = register
  const registrable = plan.status === 'ok' && plan.items.length > 0
  const headingRef = useRef<HTMLHeadingElement>(null)
  const kind = phase.kind
  // 날짜 선택·교체 확인·차단 안내가 나타나면 그 제목으로 포커스를 옮겨 보조기기가 읽게 한다.
  useEffect(() => {
    if (kind === 'choose' || kind === 'confirm' || kind === 'blocked') {
      headingRef.current?.focus()
    }
  }, [kind])

  const busy =
    kind === 'checking' ||
    kind === 'moving' ||
    kind === 'choose' ||
    kind === 'confirm'
  const buttonDisabled = !registrable || !available || busy

  return (
    <div className="flex flex-col gap-2" data-plan-register={kind}>
      {kind === 'choose' ? (
        <section
          role="group"
          aria-labelledby="plan-register-choose"
          data-plan-register-choose=""
          className={composeCardActive}
        >
          <h3
            id="plan-register-choose"
            ref={headingRef}
            tabIndex={-1}
            className={`${composeSectionTitle} outline-none`}
          >
            {REGISTER_TEXT.chooseTitle}
          </h3>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {phase.note ?? REGISTER_TEXT.chooseBody}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {phase.options.map((day) => (
              <button
                key={day}
                type="button"
                data-register-day={day}
                onClick={() => register.choose(day)}
                className={
                  day === phase.options[0]
                    ? composePrimaryButton
                    : composeSecondaryButton
                }
              >
                {DAY_NAME[day]}으로 등록 ·{' '}
                {dayLabel(day === 'today' ? phase.today : phase.tomorrow)}
              </button>
            ))}
            <button
              type="button"
              onClick={register.cancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </section>
      ) : null}

      {kind === 'confirm' ? (
        <section
          role="alertdialog"
          aria-labelledby="plan-register-confirm"
          data-plan-register-confirm={phase.target}
          className={composeCardActive}
        >
          <h3
            id="plan-register-confirm"
            ref={headingRef}
            tabIndex={-1}
            className={`${composeSectionTitle} outline-none`}
          >
            구성 중이던 {DAY_NAME[phase.target]}이 있어요
          </h3>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            아직 저장하지 않고 편집 중인 {DAY_NAME[phase.target]} 초안이에요.
            추천 운동으로 바꾸면 이 초안은 사라져요. 이미 저장해 둔 목록과 운동
            기록은 그대로예요.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              data-register-replace=""
              onClick={register.confirmReplace}
              className={composePrimaryButton}
            >
              추천 운동으로 바꾸고 등록
            </button>
            <button
              type="button"
              onClick={register.cancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </section>
      ) : null}

      {kind === 'blocked' ? (
        <section
          role="alert"
          aria-labelledby="plan-register-blocked"
          data-plan-register-blocked=""
          className={composeCardActive}
        >
          <h3
            id="plan-register-blocked"
            ref={headingRef}
            tabIndex={-1}
            className={`${composeSectionTitle} outline-none`}
          >
            {REGISTER_TEXT.blockedTitle}
          </h3>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            {REGISTER_TEXT.blockedBody}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/records/exercise" className={composeSecondaryButton}>
              운동 기록으로 가기
            </Link>
            <button
              type="button"
              onClick={register.cancel}
              className={composeSecondaryButton}
            >
              닫기
            </button>
          </div>
        </section>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {kind === 'checking' ? (
          <p
            role="status"
            className="text-support leading-relaxed font-normal text-muted"
          >
            저장된 운동 목록을 확인하는 중이에요…
          </p>
        ) : null}
        {kind === 'moving' ? (
          <p
            role="status"
            className="text-support leading-relaxed font-normal text-muted"
          >
            운동 목록 편집 화면으로 이동하는 중이에요…
          </p>
        ) : null}
        {message ? (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            data-plan-register-message={message.tone}
            className="rounded-control bg-page px-3 py-2 text-support leading-relaxed font-semibold text-danger"
          >
            {message.text}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        data-plan-register-button=""
        aria-disabled={buttonDisabled || undefined}
        aria-describedby="plan-register-note"
        onClick={() => {
          if (!buttonDisabled) register.start()
        }}
        className={`${composePrimaryButton} aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted`}
      >
        목록 등록
      </button>
      <p
        id="plan-register-note"
        data-plan-register-note=""
        className="text-support leading-relaxed font-normal text-muted"
      >
        {!registrable
          ? '목록에 넣을 수 있는 추천 운동이 없어 등록할 수 없어요.'
          : !available
            ? '이 환경에서는 운동 목록 등록을 쓸 수 없어요.'
            : REGISTER_TEXT.restNote}
      </p>
    </div>
  )
}
