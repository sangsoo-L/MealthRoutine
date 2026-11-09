import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import { HOME_GUIDE_TEXT, type HomeGuideTopic } from './homeContent.ts'
import { DOMAIN_TONE, focusRing } from './homeStyles.ts'

interface SearchGuideTopicProps {
  topic: HomeGuideTopic
}

/**
 * HomeDiscovery의 항목. 회원 홈이 사용하고 비회원 랜딩(H01)은 렌더링하지 않는다.
 *
 * 검색 사용법 소개 한 건(운동 검색 또는 음식 검색): 제목, 검색 화면 미리보기, 시작하기 링크.
 *
 * 미리보기는 눌러 볼 수 없는 예시 그림이라 role="img"로 하나의 설명만 전달하고,
 * 점선 테두리로 "실제 검색 결과가 아닌 예시"임을 눈에도 드러낸다.
 * 세 가지 조건은 한 줄씩 늘어놓지 않고 칩으로 묶어 폭이 허락하면 한 줄에 놓이게 해 길이를 줄였다.
 * 좌우 안쪽 여백(px-[16px], px-[12px])은 상자가 겹쳐 있어서 글자 확대 때 본문 폭을 잠식하지 않도록 px로 고정한다.
 */
export default function SearchGuideTopic({ topic }: SearchGuideTopicProps) {
  const tone = DOMAIN_TONE[topic.tone]

  return (
    <article className="rounded-card border border-line bg-surface px-[20px] py-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-card text-metric ${tone.tile}`}
        >
          {topic.emoji}
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <small className={`block text-support font-normal ${tone.label}`}>
            {topic.category}
          </small>
          <h3 className="text-section-title leading-snug font-semibold text-content">
            {topic.title}
          </h3>
        </div>
      </header>

      <div
        role="img"
        aria-label={topic.previewLabel}
        className={`mt-4 rounded-control border border-dashed px-[12px] py-3 ${tone.panel}`}
      >
        <span className="block text-support font-normal text-muted">
          {HOME_GUIDE_TEXT.previewCaption}
        </span>
        <div
          className={`mt-2 flex min-h-11 items-center gap-2 rounded-control border bg-surface px-[12px] text-body font-normal text-muted ${tone.line}`}
        >
          <Icon name="search" size={18} className="shrink-0" />
          <span className="min-w-0">{topic.query}</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {topic.filters.map((filter) => (
            <li
              key={filter.label}
              // 글자를 키워 폭이 모자라면 칩 안에서 라벨과 값이 위아래로 나뉘고, 단어는 끊기지 않는다.
              // 그래서 칩 모서리는 완전한 알약(rounded-full)이 아니라 컨트롤 반경을 쓴다.
              className={`flex max-w-full flex-wrap items-center gap-x-1 rounded-control border bg-surface py-1.5 pr-[8px] pl-[12px] text-support ${tone.line}`}
            >
              <span className="font-normal text-muted">{filter.label}</span>
              <span className="flex items-center gap-1">
                <strong className={`font-semibold ${tone.value}`}>
                  {filter.value}
                </strong>
                <Icon
                  name="chevron-down"
                  size={18}
                  className="shrink-0 text-muted"
                />
              </span>
            </li>
          ))}
        </ul>
        {topic.extra ? (
          <span className="mt-2 block text-support font-normal text-muted">
            {topic.extra}
          </span>
        ) : null}

        <div className="flex items-center gap-2 py-3 text-support font-normal text-muted">
          <span
            aria-hidden="true"
            className={`h-px flex-1 border-t ${tone.line}`}
          />
          <span className="flex items-center gap-1">
            <span aria-hidden="true">↓</span>
            <span>{HOME_GUIDE_TEXT.next}</span>
          </span>
          <span
            aria-hidden="true"
            className={`h-px flex-1 border-t ${tone.line}`}
          />
        </div>

        <div
          className={`flex items-center gap-3 rounded-control border bg-surface px-[12px] py-3 ${tone.line}`}
        >
          {/* 글자를 키워 폭이 모자라면 글이 아이콘 아래로 내려가 단어가 끊기지 않는다. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-app-title ${tone.tile}`}
            >
              {topic.resultEmoji}
            </span>
            <div className="min-w-0 flex-1 basis-32">
              <strong className="block text-body leading-snug font-semibold text-content">
                {topic.resultTitle}
              </strong>
              <span className="block text-support font-normal text-muted">
                {topic.resultMeta}
              </span>
            </div>
          </div>
          <span aria-hidden="true" className="shrink-0 text-muted">
            →
          </span>
        </div>
      </div>

      <Link
        to={topic.to}
        className={`mt-4 flex min-h-12 items-center justify-between gap-3 rounded-control border px-[16px] py-2 text-body font-semibold transition-colors motion-reduce:transition-none ${tone.cta} ${focusRing}`}
      >
        <span className="min-w-0">{topic.ctaLabel}</span>
        <span aria-hidden="true" className="shrink-0">
          →
        </span>
      </Link>
    </article>
  )
}
