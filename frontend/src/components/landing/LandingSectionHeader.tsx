interface LandingSectionHeaderProps {
  id: string
  title: string
  description?: string
}

/** 일반 섹션의 공통 머리. 제목(h2)과 그 아래 설명이 본문 폭 전체를 쓴다. */
export default function LandingSectionHeader({
  id,
  title,
  description,
}: LandingSectionHeaderProps) {
  return (
    <div>
      <h2
        id={id}
        className="text-app-title leading-snug font-semibold text-balance text-content"
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
          {description}
        </p>
      ) : null}
    </div>
  )
}
