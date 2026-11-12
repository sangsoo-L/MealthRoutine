import type { ReactNode } from 'react'
import { useIsMember } from '../../auth/useIsMember.ts'
import { DIFFICULTIES } from '../../exercise/exerciseTaxonomy.ts'
import type { Exercise } from '../../exercise/exerciseTypes.ts'
import ExerciseMedia from './ExerciseMedia.tsx'
import ExerciseRoutineActions from './ExerciseRoutineActions.tsx'
import ExerciseTitleRow from './ExerciseTitleRow.tsx'

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2
        id={id}
        className="text-section-title leading-snug font-semibold text-content"
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * 난이도 배지. 단계 막대(초급 1·중급 2·고급 3칸)와 난이도 이름을 함께 보여 준다. 막대는 장식이고 의미는 글자가 전한다.
 */
function DifficultyBadge({
  difficulty,
}: {
  difficulty: Exercise['difficulty']
}) {
  const level = DIFFICULTIES.indexOf(difficulty) + 1
  return (
    <span
      role="group"
      aria-label="난이도"
      className="inline-flex items-center gap-2 rounded-full bg-exercise px-3 py-1 text-support leading-snug font-normal text-surface"
    >
      <span aria-hidden="true" className="flex items-end gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-1 rounded-full ${n <= level ? 'bg-surface' : 'bg-surface/35'} ${n === 1 ? 'h-2' : n === 2 ? 'h-2.5' : 'h-3'}`}
          />
        ))}
      </span>
      {difficulty}
    </span>
  )
}

const chipBase = 'rounded-full px-3 py-1 text-support leading-snug font-normal'

function ChipList({
  label,
  values,
  className,
}: {
  label: string
  values: readonly string[]
  className: string
}) {
  if (values.length === 0) return null
  return (
    // role="list": Tailwind가 목록 표시를 지워 Safari·VoiceOver가 목록으로 읽지 않는 것을 막는다.
    <ul role="list" aria-label={label} className="flex flex-wrap gap-2">
      {values.map((value) => (
        <li key={value} className={`${chipBase} ${className}`}>
          {value}
        </li>
      ))}
    </ul>
  )
}

const emptyText = 'text-body leading-relaxed font-normal text-muted'

/**
 * 운동 상세(E02)의 본문. 운동 저장소가 가진 값만 보여 준다.
 * - 설명(description)·출처(sourceUrl)는 현재 운동 데이터에 없으므로 만들어 채우지 않는다. 그래서 "운동 소개" 영역은 두지 않는다:
 *   소개에 둘 수 있는 값(분류·부위·도구)은 모두 상단 요약 칩이 이미 보여 주고, 같은 값을 한 번 더 늘어놓으면 방법·주의사항을 밀어낼 뿐이다.
 *   설명이 데이터에 생기면 그때 소개 영역을 추가한다.
 * - 이미지·영상도 없으므로 대표 미디어(ExerciseMedia)는 공통 플레이스홀더다.
 * - 동작 순서·주의사항이 비어 있으면 빈 목록 대신 안내 문장을 둔다.
 * 구성: 대표 미디어 → 운동명(회원은 즐겨찾기 별) → 난이도·분류·부위·도구 칩 → (회원만) 오늘 기록·내일 계획 → 운동 방법 → 주의사항.
 * 비회원 화면은 칩 다음에 운동 방법이 바로 이어진다.
 * 화면명세 v5.0 E02의 "운동명·난이도·부위·도구 → 오늘 기록·내일 계획 → 시각 안내 → 동작 순서와 주의사항" 구성 요소를 모두 담았다.
 */
export default function ExerciseDetailView({
  exercise,
}: {
  exercise: Exercise
}) {
  // 회원 전용 UI(즐겨찾기 별·오늘 기록·내일 계획)는 회원일 때만 렌더링한다. 비회원은 숨기는 것이 아니라 DOM에 없다.
  // 운동 정보 자체는 모두에게 공개다. 판정은 여기서 한 번만 하고 아래로 넘긴다.
  const isMember = useIsMember()

  return (
    // break-keep: 한글을 어절 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
    <article className="break-keep wrap-anywhere">
      <ExerciseMedia name={exercise.name} imageUrl={exercise.imageUrl} />

      <header className="mt-5">
        <ExerciseTitleRow exercise={exercise} isMember={isMember} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DifficultyBadge difficulty={exercise.difficulty} />
          <ChipList
            label="운동 분류"
            values={[exercise.category]}
            className="bg-exercise-soft text-exercise"
          />
          <ChipList
            label="운동 부위"
            values={exercise.targetMuscles}
            className="bg-exercise-soft text-exercise"
          />
          <ChipList
            label="운동 도구"
            values={exercise.equipment}
            className="border border-exercise/30 bg-surface text-exercise"
          />
        </div>
        {isMember ? <ExerciseRoutineActions exercise={exercise} /> : null}
      </header>

      <Section id="exercise-steps-title" title="운동 방법">
        {exercise.instructions.length === 0 ? (
          <p className={emptyText}>이 운동의 방법 안내가 아직 없어요.</p>
        ) : (
          // role="list": 위와 같은 이유. 단계 번호는 선으로 이어진 순서다(실제 순서가 있는 내용이라 번호를 쓴다).
          <ol role="list" className="flex flex-col">
            {exercise.instructions.map((step, index) => (
              <li
                key={index}
                className="relative flex items-start gap-3 pb-5 last:pb-0"
              >
                {index < exercise.instructions.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-8 bottom-0 left-3.5 w-px bg-line"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-exercise text-support leading-none font-semibold text-surface"
                >
                  {index + 1}
                </span>
                <span className="sr-only">{index + 1}단계.</span>
                <p className="min-w-0 pt-0.5 text-body leading-relaxed font-normal text-content">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section id="exercise-cautions-title" title="주의사항">
        {exercise.precautions.length === 0 ? (
          <p className={emptyText}>등록된 주의사항이 없어요.</p>
        ) : (
          <div className="rounded-card border border-warning/15 bg-warning-soft p-4">
            <ul
              role="list"
              className="flex list-disc flex-col gap-2 pl-5 marker:text-warning"
            >
              {exercise.precautions.map((text, index) => (
                <li
                  key={index}
                  className="text-body leading-relaxed font-normal text-content"
                >
                  {text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </article>
  )
}
