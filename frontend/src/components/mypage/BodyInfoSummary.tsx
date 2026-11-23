import { useState } from 'react'
import { Link } from 'react-router'
import { PIN_LOCKED_MESSAGE } from '../../pin-settings/pinSettingsMessages.ts'
import type {
  BodyReveal,
  BodyRevealNotice,
} from '../../body-access/useBodyReveal.ts'
import { calculateBmi } from '../../body-measurements/bodyDisplay.ts'
import type {
  BodyMeasurementInput,
  BodyMeasurementState,
  BodyMeasurementStatus,
  BodyMeasurementValues,
} from '../../body-measurements/bodyTypes.ts'
import BodyInfoSheet from '../body-measurements/BodyInfoSheet.tsx'
import { MY_DESTINATIONS, MY_PAGE_PATH } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import { chipClass, focusRing, sectionTitleClass } from './myStyles.ts'

interface BodyInfoSummaryProps {
  body: BodyMeasurementState
  save: (input: BodyMeasurementInput) => Promise<void>
  /**
   * PIN 열람 상태(P05 확인 뒤). 없으면 항상 마스킹이다. 수치는 열람 권한이 있는 동안에만 이 값에 있고,
   * 권한이 끝나면(숨기기·1분·이탈·로그아웃·PIN 변경) 곧바로 사라진다.
   */
  reveal?: BodyReveal
  /** P05에서 5회 불일치로 돌아왔을 때의 잠금 안내. */
  lockedNotice?: boolean
}

const BODY_FIELDS = [
  { label: '키', key: 'height' },
  { label: '몸무게', key: 'weight' },
  { label: 'BMI', key: 'bmi' },
] as const

const MASKED: BodyReveal = {
  state: { status: 'masked' },
  notice: null,
  hide: () => {},
}

const NOTICE_TEXT: Record<BodyRevealNotice, string> = {
  expired: '열람 시간이 끝나 신체 정보를 다시 가렸어요.',
  hidden: '화면을 벗어나 신체 정보를 다시 가렸어요.',
  error: '신체 정보를 불러오지 못해 가려 두었어요. 다시 확인해 주세요.',
}

/** 열람 중인 항목의 표시 값. 등록되지 않은 항목은 "미등록", BMI는 키·몸무게가 모두 있어야 계산한다. */
function revealedText(
  key: (typeof BODY_FIELDS)[number]['key'],
  values: BodyMeasurementValues,
): string {
  if (key === 'height')
    return values.heightCm === null ? '미등록' : `${values.heightCm}cm`
  if (key === 'weight')
    return values.weightKg === null ? '미등록' : `${values.weightKg}kg`
  const bmi = calculateBmi(values.heightCm, values.weightKg)
  return bmi === null ? '계산 불가' : bmi.toFixed(1)
}

/**
 * P01 섹션 7. 나의 신체 정보: 키·몸무게·BMI(기본 마스킹)와 보호 안내 한 줄.
 *
 * 보안 원칙(API 정책 문서 §3-3):
 * - 기본은 마스킹이다. 이 컴포넌트가 받는 것은 등록 여부(`body`)와, PIN 열람 권한이 있는 동안에만 값이 담기는 `reveal`뿐이다.
 *   `reveal`이 없거나 권한이 끝나면 등록된 항목은 항상 마스킹(***)이고 수치는 어디에도 없다. 등록되지 않은 항목만 "미입력"으로 보인다.
 * - 수치를 읽는 일은 이 컴포넌트가 하지 않는다. P05에서 2차 비밀번호를 확인한 열람 권한으로 저장소가 읽어 주며(useBodyReveal),
 *   프론트엔드가 인증 성공을 흉내 내지 않는다. 운영 빌드(서버 연결 전)에는 열람 수단이 없어 "연결 전"으로만 보인다.
 * - 아직 입력하지 않은 항목이 있으면(조회를 마친 상태에서만) 홈 안내와 같은 입력 시트를 여는 버튼이 보인다. 조회 중·실패·연결 전에는
 *   누락으로 보지 않고 버튼도 두지 않는다. 저장하면 열람 중이던 수치는 낡은 값이므로 곧바로 다시 가린다.
 */
export default function BodyInfoSummary({
  body,
  save,
  reveal = MASKED,
  lockedNotice = false,
}: BodyInfoSummaryProps) {
  // 시트를 열 때의 등록 여부를 기억한다. 저장 직후 상태가 바뀌어도 닫히는 동안 시트의 입력란이 바뀌지 않는다.
  const [sheetStatus, setSheetStatus] = useState<BodyMeasurementStatus | null>(
    null,
  )
  const unlockTo = MY_DESTINATIONS.bodyUnlock.to
  const status = body.status === 'ready' ? body.value : null
  const missing = status !== null && (!status.height || !status.weight)
  const revealing = reveal.state.status !== 'masked'
  // 열람 수단이 없는 빌드(운영·서버 연결 전)에서는 이동 대신 "연결 전"만 보인다.
  const unlockAvailable = unlockTo !== null && body.status !== 'unavailable'
  const noticeText = reveal.notice
    ? NOTICE_TEXT[reveal.notice]
    : lockedNotice
      ? PIN_LOCKED_MESSAGE
      : null

  async function saveAndMask(input: BodyMeasurementInput) {
    await save(input)
    reveal.hide()
  }

  return (
    <section aria-labelledby="my-body-title" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="my-body-title" className={sectionTitleClass}>
          나의 신체 정보
        </h2>
        <span className="inline-flex items-center gap-1 text-support leading-snug font-semibold text-muted">
          <Icon name={revealing ? 'eye' : 'lock'} size={18} />
          {revealing ? '열람 중' : '보호 중'}
        </span>
      </div>

      {/* 3열이 기본이고, 폭이 모자라면(글자 확대) 2열·1열로 줄어 항목 이름이 글자 단위로 끊기지 않는다. */}
      <dl
        aria-busy={reveal.state.status === 'loading'}
        className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(max(4.5rem,calc((100%-16px)/3)),1fr))] gap-2"
      >
        {BODY_FIELDS.map((field) => {
          // 등록되지 않은 키·몸무게만 "미입력"이다. BMI는 열람 전에는 수치를 알 수 없으므로 항상 마스킹이다.
          const notEntered =
            status !== null &&
            ((field.key === 'height' && !status.height) ||
              (field.key === 'weight' && !status.weight))
          // 열람 중일 때만 값이 있다. 마스킹·불러오는 중에는 null이라 수치가 만들어지지 않는다.
          const shown =
            reveal.state.status === 'revealed'
              ? revealedText(field.key, reveal.state.values)
              : null
          return (
            <div
              key={field.key}
              className="rounded-control bg-page px-2 py-2 text-center"
            >
              <dt className="text-support leading-snug font-normal text-muted">
                {field.label}
              </dt>
              <dd className="text-section-title leading-snug font-semibold text-content">
                {shown !== null ? (
                  <span
                    className={
                      shown === '미등록' || shown === '계산 불가'
                        ? 'text-support font-normal text-muted'
                        : undefined
                    }
                  >
                    {shown}
                  </span>
                ) : notEntered ? (
                  <span className="text-support font-normal text-muted">
                    미입력
                  </span>
                ) : (
                  <>
                    <span aria-hidden="true">***</span>
                    <span className="sr-only">
                      {reveal.state.status === 'loading'
                        ? '불러오는 중'
                        : '숨김'}
                    </span>
                  </>
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="mt-2.5 text-support leading-snug font-normal text-muted">
        {revealing
          ? '1분 뒤 또는 화면을 벗어나면 다시 가려져요.'
          : '신체 정보는 2차 비밀번호로 보호돼요.'}
      </p>

      {noticeText ? (
        <p
          role="status"
          className="mt-2 text-support leading-snug font-normal text-content"
        >
          {noticeText}
        </p>
      ) : null}

      {missing ? (
        <button
          type="button"
          onClick={() => status && setSheetStatus(status)}
          className={`-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1 px-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          키·몸무게 입력하기
          <Icon name="chevron-right" size={18} />
        </button>
      ) : null}
      {revealing ? (
        <button
          type="button"
          onClick={reveal.hide}
          className={`mt-1 -ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1 px-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          <Icon name="eye-off" size={18} />
          신체 정보 다시 숨기기
        </button>
      ) : unlockAvailable ? (
        <Link
          to={unlockTo}
          state={{ from: MY_PAGE_PATH }}
          className={`mt-1 inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          2차 비밀번호로 신체 정보 보기
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : unlockTo !== null ? (
        // 연결 전: 이용할 수 있는 기능처럼 강조하지 않는다(링크·파란 글자 없음).
        <p className="mt-1 flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-body leading-snug font-normal text-muted">
          <span>2차 비밀번호로 신체 정보 보기</span>
          <span className={chipClass}>연결 전</span>
        </p>
      ) : null}
      {/* P06 키·몸무게 입력·수정. 연결 전(조회·저장 수단 없음)에는 이용할 수 있는 기능처럼 보이지 않게 링크를 두지 않는다. 진입한 곳(P01)으로 돌아오게 알린다. */}
      {MY_DESTINATIONS.bodyEdit.to !== null && body.status !== 'unavailable' ? (
        <Link
          to={MY_DESTINATIONS.bodyEdit.to}
          state={{ from: MY_PAGE_PATH }}
          data-body-edit-link=""
          className={`inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand transition-colors hover:text-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          키·몸무게 입력·수정
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : null}

      {sheetStatus ? (
        <BodyInfoSheet
          variant="mypage"
          status={sheetStatus}
          save={saveAndMask}
          onClose={() => setSheetStatus(null)}
        />
      ) : null}
    </section>
  )
}
