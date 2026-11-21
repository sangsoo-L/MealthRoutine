import { focusRing } from './homeStyles.ts'
import { MISSING_TITLE, type MissingBodyField } from './homeBodyInfo.ts'

/**
 * 신체 정보가 누락된 회원에게 오늘의 추천 자리에 보이는 입력 유도 카드. 기존 추천 배너와 같은 틀(연한 블루 면·제목·설명·CTA)이다.
 *
 * - 수치를 받거나 보여 주지 않는다. 누락 여부만 안다(PIN 보호). 누락된 항목 이름만 제목에 쓴다.
 * - CTA는 기존 입력 시트(BodyInfoSheet)를 여는 버튼이다. 새 화면·경로를 만들지 않는다. 터치 영역은 44px 이상이다.
 * - 팝업을 "나중에 입력하기"로 닫아도 이 카드는 남는다. 저장이 끝나 누락이 사라지면 부모가 이 카드를 기존 추천으로 되돌린다.
 * - 개발 서버에서만 저장소가 개발용 임시 저장소임을 한 줄 알린다(운영 빌드에서는 DEV 분기가 제거된다).
 */
export default function HomeBodyInfoCard({
  missing,
  onOpen,
}: {
  missing: MissingBodyField
  onOpen: () => void
}) {
  return (
    <section
      aria-labelledby="home-bodyinfo-title"
      className="rounded-card bg-brand-soft px-[20px] py-6"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-support leading-snug font-semibold text-brand">
            오늘의 추천
          </p>
          <h2
            id="home-bodyinfo-title"
            className="mt-1 text-section-title leading-snug font-semibold text-balance text-content"
          >
            {MISSING_TITLE[missing]}
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
            입력하면 나에게 맞는 운동·식단 안내를 준비하는 데 도움이 돼요.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-surface text-metric"
        >
          📏
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onOpen}
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          지금 입력하기
          <span aria-hidden="true" className="ml-1">
            ›
          </span>
        </button>
      </div>
      {import.meta.env.DEV ? (
        <p className="mt-3 text-support leading-snug font-normal text-muted">
          개발 서버의 임시 저장소로 확인 중이에요.
        </p>
      ) : null}
    </section>
  )
}

/** 신체 정보 등록 상태를 불러오지 못했을 때 기존 추천 배너 아래에 붙는 재시도 안내. 실패를 "미등록"으로 말하지 않는다. */
export function HomeBodyInfoRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control bg-page px-4 py-2"
    >
      <p className="min-w-0 text-support leading-snug font-normal text-muted">
        신체 정보 등록 상태를 확인하지 못했어요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`min-h-11 cursor-pointer rounded-control px-2 text-body font-semibold text-brand hover:text-brand-hover ${focusRing}`}
      >
        다시 확인
      </button>
    </div>
  )
}
