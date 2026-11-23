import { useCallback, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  PIN_PATHS,
  SIGNUP_PATH,
  SIGNUP_PIN_NEXT_PATH,
} from '../../pin-settings/pinSettingsPolicy.ts'
import type { PinSubmitResult } from '../../pin-settings/usePinSettings.ts'
import { useSignupExperienceActive } from '../../signup-experience/useOnboardingSubject.ts'
import { noticeClass, secondaryLinkClass } from '../auth/authStyles.ts'
import ExperienceBanner from '../signup-experience/ExperienceBanner.tsx'
import PinSettingsForm from './PinSettingsForm.tsx'
import { Heading } from './PinSettingsView.tsx'

/** 이 화면의 상태. member: 이미 로그인한 회원, experience: 개발용 가입 체험 중, unavailable: 이 빌드에서 가입을 처리할 수 없음 */
export type SignupPinState = 'member' | 'experience' | 'unavailable'

const TEXTS = {
  nextLabel: '2차 비밀번호',
  confirmLabel: '2차 비밀번호 확인',
  submitLabel: '다음',
  cancelLabel: '이전',
  cancelTo: SIGNUP_PATH,
} as const

const noop = async (): Promise<PinSubmitResult | null> => null

/**
 * P05 가입 설정 모드(`/signup/pin`)의 본문. 회원가입(A03) 다음 단계에서 신체 정보 보호용 2차 비밀번호(숫자 6자리)를 정한다.
 *
 * 실제 가입·2차 비밀번호 등록은 서버 몫이고 아직 연결되어 있지 않다. 그래서:
 * - 입력한 번호는 저장·전송하지 않고 버린다(URL·router state·localStorage·sessionStorage·개발용 PIN 저장소 어디에도 쓰지 않는다).
 * - "등록됐다"는 표시를 하지 않는다. 개발용 가입 체험 중에는 형식(6자리·두 번 일치)만 확인하고 다음 화면으로 이동하며, 저장되지 않는다는 안내를 폼 위에 항상 보인다.
 * - 체험 중이 아니면(운영 빌드·가입 정보 입력 전) 폼을 비활성으로 두고 이유를 알린다.
 * - 로그인한 회원은 가입 단계가 아니므로 상세 설정의 등록 화면(P11)으로 안내한다.
 */
export function SignupPinBody({
  state,
  onSubmit,
  banner = null,
}: {
  state: SignupPinState
  onSubmit: () => Promise<PinSubmitResult | null>
  /** 개발용 가입 체험 중임을 알리는 배너 자리(체험 상태에서만 쓴다). */
  banner?: ReactNode
}) {
  let body
  if (state === 'member') {
    body = (
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <h2 className="text-section-title leading-snug font-semibold text-content">
          이미 로그인한 회원이에요
        </h2>
        <p className="text-body leading-relaxed font-normal text-muted">
          가입 단계의 설정 화면이에요. 2차 비밀번호는 상세 설정에서 등록하거나
          바꿀 수 있어요.
        </p>
        <Link to={PIN_PATHS.register} className={secondaryLinkClass}>
          2차 비밀번호 등록으로 이동
        </Link>
      </div>
    )
  } else {
    const experience = state === 'experience'
    body = (
      <>
        {experience ? (
          banner
        ) : (
          <div role="status" className={`${noticeClass} mt-0`}>
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="font-semibold">지금은 설정할 수 없어요</strong>
              <p>
                {import.meta.env.DEV
                  ? '회원가입 화면에서 가입 정보를 입력하면 이어서 설정할 수 있어요.'
                  : '회원가입 서버가 아직 연결되지 않았어요. 연결되면 이 단계에서 설정할 수 있어요.'}
              </p>
            </div>
          </div>
        )}
        {experience ? (
          <div className={`${noticeClass} mt-0`}>
            <p>
              개발용 가입 체험이라 입력한 번호는 저장되지 않아요. 6자리와 확인
              입력이 맞는지만 확인하고 다음으로 넘어가요.
            </p>
          </div>
        ) : null}
        <PinSettingsForm
          mode="register"
          disabled={!experience}
          locked={false}
          submit={experience ? onSubmit : noop}
          texts={TEXTS}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <Heading
        title="2차 비밀번호 설정"
        description="키·몸무게·BMI 같은 신체 정보를 볼 때 쓰는 숫자 6자리 번호예요. 로그인 비밀번호와는 별개로 쓰여요."
      />
      {body}
      <section
        aria-labelledby="signup-pin-guidance-title"
        className="rounded-card border border-line bg-surface p-4"
      >
        <h2
          id="signup-pin-guidance-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          알아 두세요
        </h2>
        <ul className="mt-1 list-disc pl-5 text-support leading-relaxed font-normal text-muted">
          <li>로그인에는 필요하지 않고, 신체 정보를 열람할 때만 써요.</li>
          <li>로그인 비밀번호와 다른 번호를 권장해요.</li>
          <li>가입한 뒤에는 상세 설정에서 변경할 수 있어요.</li>
        </ul>
      </section>
    </div>
  )
}

/** 가입 설정 화면의 동작 연결. 번호는 읽지도 보관하지도 않고 다음 화면으로만 이동한다. */
export default function SignupPinView({ member }: { member: boolean }) {
  const navigate = useNavigate()
  const experienceActive = useSignupExperienceActive()
  const state: SignupPinState = member
    ? 'member'
    : experienceActive
      ? 'experience'
      : 'unavailable'

  const onSubmit = useCallback(async (): Promise<PinSubmitResult | null> => {
    // 폼이 6자리·확인 일치를 검증한 뒤에만 불린다. 값은 받지 않으므로 어디에도 남지 않는다.
    void navigate(SIGNUP_PIN_NEXT_PATH)
    return { ok: true }
  }, [navigate])

  return (
    <SignupPinBody
      state={state}
      onSubmit={onSubmit}
      banner={<ExperienceBanner />}
    />
  )
}
