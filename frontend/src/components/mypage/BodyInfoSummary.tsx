import { useState } from 'react'
import type {
  BodyMeasurementInput,
  BodyMeasurementState,
  BodyMeasurementStatus,
} from '../../body-measurements/bodyTypes.ts'
import BodyInfoSheet from '../body-measurements/BodyInfoSheet.tsx'
import { MY_DESTINATIONS } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import MyLink from './MyLink.tsx'
import { focusRing, sectionTitleClass } from './myStyles.ts'

interface BodyInfoSummaryProps {
  body: BodyMeasurementState
  save: (input: BodyMeasurementInput) => Promise<void>
}

const BODY_FIELDS = [
  { label: '키', key: 'height' },
  { label: '몸무게', key: 'weight' },
  { label: 'BMI', key: 'bmi' },
] as const

/**
 * P01 섹션 7. 나의 신체 정보: 키·몸무게·BMI(기본 마스킹)와 보호 안내 한 줄.
 *
 * 보안 원칙(api-policy.md §3-3):
 * - 이 컴포넌트는 신체 정보 수치를 받지도 갖지도 않는다. 받는 것은 "등록 여부"뿐이라, 등록된 항목은 항상 마스킹(***)이고 수치가
 *   화면 코드·상태·개발용 예시 어디에도 존재하지 않는다. 등록되지 않은 항목만 "미입력"으로 보인다(여부는 민감 정보가 아니다).
 * - 2차 비밀번호(PIN) 확인은 인증 결과의 전달·검증 방식이 정해지지 않았고 확인 화면(P05)도 없다. 그래서 프론트엔드가 인증 성공을
 *   흉내 내지 않으며, 입력한 값을 PIN 없이 보여 주는 임시 열람 기능도 만들지 않는다. BMI도 수치를 알 수 없으므로 마스킹이다.
 * - 아직 입력하지 않은 항목이 있으면(조회를 마친 상태에서만) 홈 안내와 같은 입력 시트를 여는 버튼이 보인다. 조회 중·실패·연결 전에는
 *   누락으로 보지 않고 버튼도 두지 않는다.
 * - 확인 화면(P05)·키·몸무게 입력(P06) 경로가 채워지면 아래 연결 지점에 링크가 나타난다. 지금은 그리지 않는다.
 */
export default function BodyInfoSummary({ body, save }: BodyInfoSummaryProps) {
  // 시트를 열 때의 등록 여부를 기억한다. 저장 직후 상태가 바뀌어도 닫히는 동안 시트의 입력란이 바뀌지 않는다.
  const [sheetStatus, setSheetStatus] = useState<BodyMeasurementStatus | null>(
    null,
  )
  const unlockTo = MY_DESTINATIONS.bodyUnlock.to
  const status = body.status === 'ready' ? body.value : null
  const missing = status !== null && (!status.height || !status.weight)

  return (
    <section aria-labelledby="my-body-title" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="my-body-title" className={sectionTitleClass}>
          나의 신체 정보
        </h2>
        <span className="inline-flex items-center gap-1 text-support leading-snug font-semibold text-muted">
          <Icon name="lock" size={18} />
          보호 중
        </span>
      </div>

      {/* 3열이 기본이고, 폭이 모자라면(글자 확대) 2열·1열로 줄어 항목 이름이 글자 단위로 끊기지 않는다. */}
      <dl className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(max(4.5rem,calc((100%-16px)/3)),1fr))] gap-2">
        {BODY_FIELDS.map((field) => {
          // 등록되지 않은 키·몸무게만 "미입력"이다. BMI는 키·몸무게가 모두 있어도 수치를 알 수 없으므로 항상 마스킹이다.
          const notEntered =
            status !== null &&
            ((field.key === 'height' && !status.height) ||
              (field.key === 'weight' && !status.weight))
          return (
            <div
              key={field.key}
              className="rounded-control bg-page px-2 py-2 text-center"
            >
              <dt className="text-support leading-snug font-normal text-muted">
                {field.label}
              </dt>
              <dd className="text-section-title leading-snug font-semibold text-content">
                {notEntered ? (
                  <span className="text-support font-normal text-muted">
                    미입력
                  </span>
                ) : (
                  <>
                    <span aria-hidden="true">***</span>
                    <span className="sr-only">숨김</span>
                  </>
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      <p className="mt-2.5 text-support leading-snug font-normal text-muted">
        신체 정보는 2차 비밀번호로 보호돼요.
      </p>

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
      {unlockTo ? (
        <a
          href={unlockTo}
          className={`mt-1 inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          2차 비밀번호로 신체 정보 보기
          <Icon name="chevron-right" size={18} />
        </a>
      ) : null}
      <MyLink destination={MY_DESTINATIONS.bodyEdit}>
        키·몸무게 입력·수정
      </MyLink>

      {sheetStatus ? (
        <BodyInfoSheet
          variant="mypage"
          status={sheetStatus}
          save={save}
          onClose={() => setSheetStatus(null)}
        />
      ) : null}
    </section>
  )
}
