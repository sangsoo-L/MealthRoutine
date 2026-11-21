import { useState } from 'react'
import Icon from '../icons/Icon.tsx'

/**
 * 운동 대표 미디어 영역(화면 폭 가득). 지금은 운동 이미지·영상이 없어 모든 운동이 공통 플레이스홀더를 쓴다(미디어가 있는 것처럼 보이지 않는다).
 * 운동 데이터가 대표 이미지(Exercise.imageUrl)를 갖게 되면 이 컴포넌트만 이미지로 바뀌고, 이미지를 불러오지 못하면 플레이스홀더로 돌아간다.
 * 영상·GIF가 생기면 이 컴포넌트 안에서 분기를 더한다(상세 본문은 바꾸지 않는다). 존재하지 않는 미디어 주소를 만들어 연결하지 않는다.
 * 본문 좌우 여백(20px)을 음수 여백으로 걷어 화면 가장자리까지 채운다.
 */
export default function ExerciseMedia({
  name,
  imageUrl,
}: {
  name: string
  imageUrl?: string
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const image = imageUrl && imageUrl !== failedUrl ? imageUrl : null

  return (
    <figure className="relative -mx-5 flex aspect-video items-center justify-center overflow-hidden bg-exercise-soft">
      {image ? (
        <img
          src={image}
          alt={`${name} 동작 이미지`}
          onError={() => setFailedUrl(image)}
          className="size-full object-cover"
        />
      ) : (
        <>
          {/* 장식용 원. 보조기기에는 읽히지 않는다. */}
          <span
            aria-hidden="true"
            className="absolute -top-10 -right-8 size-40 rounded-full bg-exercise/5"
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-14 -left-10 size-44 rounded-full bg-exercise/5"
          />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full border border-exercise/15 bg-surface text-exercise">
              <Icon name="dumbbell" size={30} />
            </span>
            <figcaption className="text-body leading-relaxed font-normal text-muted">
              운동 영상과 이미지는 준비 중이에요
            </figcaption>
          </div>
        </>
      )}
    </figure>
  )
}
