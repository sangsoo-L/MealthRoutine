import { useState } from 'react'
import { Link } from 'react-router'
import type {
  BodyMeasurementInput,
  BodyMeasurementState,
} from '../../../body-measurements/bodyTypes.ts'
import { BODY_UNLOCK_PATH } from '../../../pin-settings/pinSettingsPolicy.ts'
import { BodyInfoForm } from '../../body-measurements/BodyInfoSheet.tsx'
import { noticeClass, secondaryButtonClass } from '../../auth/authStyles.ts'
import Icon from '../../icons/Icon.tsx'
import {
  cardClass,
  chipClass,
  focusRing,
  sectionTitleClass,
} from '../../mypage/myStyles.ts'

/** P06 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_BODY_SETTINGS = '/settings/body'

/** 서버 연결 전 안내. 입력·저장 수단이 없어 폼을 열지 않는다. */
export const BODY_UNAVAILABLE_TEXT =
  '신체 정보 입력 기능은 서비스 연결을 준비하고 있어요. 지금은 키·몸무게를 입력하거나 저장할 수 없어요.'

const linkClass = `inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`

/** 등록 여부 한 줄. 값은 읽지도 보여 주지도 않는다(PIN 보호): 등록됨은 가려서(***), 아직이면 미입력이다. */
function StatusRow({
  name,
  unit,
  registered,
}: {
  name: string
  unit: string
  registered: boolean
}) {
  return (
    <div
      data-body-status={name}
      className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
    >
      <dt className="text-body leading-snug font-normal text-content">
        {name}
      </dt>
      <dd className="flex items-center gap-2 text-body leading-snug font-normal text-muted">
        {registered ? (
          <>
            <span>
              <span aria-hidden="true">***</span>
              <span className="sr-only">숨김</span> {unit}
            </span>
            <span className={`${chipClass} bg-page`}>등록됨</span>
          </>
        ) : (
          <span className={`${chipClass} bg-page`}>미입력</span>
        )}
      </dd>
    </div>
  )
}

/**
 * P06 키·몸무게 입력(화면명세 v5.0). 기존 신체 정보 입력 폼(BodyInfoForm)을 시트가 아니라 전체 화면으로 재사용한다.
 *
 * - 현재 상태는 등록 여부만 보인다. 수치는 2차 비밀번호로 확인한 열람 권한이 있어야 볼 수 있어(P05) 이 화면은 값을 읽지도 보이지도 않으며,
 *   "2차 비밀번호로 신체 정보 보기"로 P05에 보낸다(열람 권한을 우회하지 않는다).
 * - 등록되지 않은 항목은 바로 입력하고, 등록된 키는 "다시 입력"으로 새 값을 덮어쓸 수 있다(이전 값은 보여 주지도 채우지도 않는다).
 *   등록된 몸무게는 이력이 있는 몸무게 기록(마이페이지)이 갱신을 맡아 여기서는 다시 입력하지 않는다(기록 이력과 현재값이 어긋나지 않게).
 * - 검증(소수점 첫째 자리, 키 1~300cm, 몸무게 1~500kg)과 저장은 기존 신체 정보 저장소(`save`)가 한다. 저장 완료 안내는 저장이 성공한 뒤에만 나온다.
 * - 조회 중·조회 실패(다시 시도)·연결 전(폼 없음, 저장 수단 없음)을 구분한다. BMI 미리보기는 등록된 값을 읽지 않으므로 두지 않는다.
 */
export default function BodySettingsView({
  body,
  save,
  onRetry,
  onCancel,
}: {
  body: BodyMeasurementState
  save: (input: BodyMeasurementInput) => Promise<void>
  onRetry: () => void
  /** 취소·돌아가기. 저장하지 않고 이전 화면으로 간다. */
  onCancel: () => void
}) {
  const [saved, setSaved] = useState(false)
  const status = body.status === 'ready' ? body.value : null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          키·몸무게 입력
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          키와 몸무게는 운동·식단 안내를 준비하는 데 쓰여요. 입력한 값은 2차
          비밀번호로만 볼 수 있어요.
        </p>
      </header>

      {body.status === 'loading' ? (
        <p
          role="status"
          data-body-state="loading"
          className={`${cardClass} text-body font-normal text-muted`}
        >
          신체 정보를 불러오는 중이에요…
        </p>
      ) : null}
      {body.status === 'unavailable' ? (
        <p
          role="status"
          data-body-state="unavailable"
          className={`${noticeClass} mt-0`}
        >
          {BODY_UNAVAILABLE_TEXT}
        </p>
      ) : null}
      {body.status === 'error' ? (
        <div className="flex flex-col gap-2">
          <div role="alert" data-body-state="error" className={cardClass}>
            <p className="text-section-title leading-snug font-semibold text-content">
              신체 정보를 불러오지 못했어요
            </p>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              입력한 정보가 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.
            </p>
          </div>
          <button
            type="button"
            data-body-retry=""
            onClick={onRetry}
            className={secondaryButtonClass}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {status ? (
        <>
          <section aria-labelledby="body-status-title" className={cardClass}>
            <h2 id="body-status-title" className={sectionTitleClass}>
              현재 등록 상태
            </h2>
            <dl className="mt-3 divide-y divide-line">
              <StatusRow name="키" unit="cm" registered={status.height} />
              <StatusRow name="몸무게" unit="kg" registered={status.weight} />
            </dl>
            <p className="mt-3 text-support leading-relaxed font-normal text-muted">
              등록한 값은 이 화면에 보이지 않아요. 확인하려면 2차 비밀번호가
              필요해요.
            </p>
            <Link
              to={BODY_UNLOCK_PATH}
              state={{ from: PATH_BODY_SETTINGS }}
              data-body-unlock=""
              className={linkClass}
            >
              2차 비밀번호로 신체 정보 보기
              <Icon name="chevron-right" size={18} />
            </Link>
          </section>

          <section aria-labelledby="body-form-title" className={cardClass}>
            <h2 id="body-form-title" className={sectionTitleClass}>
              {status.height && status.weight
                ? '키 다시 입력'
                : '키·몸무게 입력'}
            </h2>
            <div className="mt-3">
              <BodyInfoForm
                variant="page"
                status={status}
                save={async (input) => {
                  setSaved(false)
                  await save(input)
                }}
                close={onCancel}
                closing={false}
                editable={['height']}
                onSaved={() => setSaved(true)}
              />
            </div>
          </section>

          {status.weight ? (
            <p
              data-body-weight-note=""
              className="text-support leading-relaxed font-normal text-muted"
            >
              몸무게는 기록 이력과 함께 관리해요. 새 몸무게는 마이페이지의
              &lsquo;몸무게 기록&rsquo;에서 기록해 주세요.{' '}
              <Link
                to="/mypage#weight-log"
                state={{ from: PATH_BODY_SETTINGS }}
                data-body-weight-link=""
                className={linkClass}
              >
                몸무게 기록하기
              </Link>
            </p>
          ) : null}
        </>
      ) : null}

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. 저장이 성공한 뒤에만 안내가 나온다. */}
      <div role="status" className="empty:hidden">
        {saved ? (
          <p
            data-body-saved=""
            className="rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content"
          >
            저장했어요. 입력한 값은 2차 비밀번호로 확인할 수 있어요.
          </p>
        ) : null}
      </div>

      {status === null ? (
        <button
          type="button"
          data-body-back=""
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          돌아가기
        </button>
      ) : null}
    </div>
  )
}
