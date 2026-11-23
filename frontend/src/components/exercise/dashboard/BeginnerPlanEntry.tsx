import { Link } from 'react-router'
import { useAuth } from '../../../auth/authContext.ts'
import { useExerciseLevel } from '../../../exercise/useExerciseLevel.ts'
import { canUseBeginnerPlan } from '../../../exercise/recommend/access.ts'
import { PATH_PLAN } from '../../../exercise/recommend/planFlow.ts'
import { createBeginnerPlanSource } from '../../../exercise/recommend/planSource.ts'
import Icon from '../../icons/Icon.tsx'
import {
  composeFocusRing,
  composeSectionTitle,
} from '../compose/composeStyles.ts'

const entries = [
  {
    mode: 'automatic',
    title: '오늘의 운동 추천받기',
    body: '운동 목표와 시간을 선택하면 오늘 할 운동을 추천해 드려요.',
  },
  {
    mode: 'selected',
    title: '직접 운동 선택하기',
    body: '하고 싶은 운동을 고르면 세트와 목표 횟수를 자동으로 설정해 드려요.',
  },
] as const

/**
 * W01의 초급 전용 진입. 운동 이해도(운동 영역만, 식단 이해도는 보지 않음)가 beginner로 확인된 회원에게만 보이고,
 * 불러오는 중·조회 실패·중급·고급·미확인이면 아무것도 그리지 않는다(권한이 확인된 것처럼 보이지 않으며 기존 W01은 그대로다).
 * 추천에 쓸 운동 데이터가 연결되지 않은 빌드(운영)에서도 그리지 않는다. 화면 진입 자체의 권한 확인은 추천 화면이 다시 한다.
 * v5.0 AI 운동 플랜(W12의 "AI 추천")과 별개의 무료 규칙 기반 기능이며 W12의 버튼을 대체하지 않는다.
 *
 * W01에서는 오늘의 운동(주요 행동) 아래의 보조 행동이다. 큰 카드 두 개가 오늘 행동을 앞서지 않도록 접힌 상태로 두고,
 * 필요할 때 펼쳐 구성 방법(추천받기·직접 선택)을 고른다. 접혀 있어도 제목으로 무엇이 들어 있는지 알 수 있다.
 */
export default function BeginnerPlanEntry() {
  const { user } = useAuth()
  const level = useExerciseLevel(user?.id ?? null)
  if (
    level.status !== 'ready' ||
    level.failed ||
    !canUseBeginnerPlan(level.level) ||
    createBeginnerPlanSource() === null
  ) {
    return null
  }
  return (
    <section aria-labelledby="beginner-plan-title" data-beginner-plan>
      <details className="group rounded-card border border-line bg-surface">
        {/* summary는 보조기기에서 버튼으로 읽혀 안의 제목 역할이 사라지므로, 영역 이름은 aria-labelledby로 이 글자를 가리킨다. */}
        <summary
          className={`flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card p-4 [&::-webkit-details-marker]:hidden ${composeFocusRing}`}
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-control bg-exercise-soft text-exercise"
          >
            <Icon name="clipboard-plus" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              id="beginner-plan-title"
              className={`block ${composeSectionTitle}`}
            >
              오늘 뭘 할지 고민되나요?
            </span>
            <span className="mt-1 block text-support leading-relaxed font-normal break-keep text-muted">
              추천받기 · 직접 선택하기 중에서 골라요
            </span>
          </span>
          <Icon
            name="chevron-down"
            size={20}
            className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul role="list" className="divide-y divide-line border-t border-line">
          {entries.map((entry) => (
            <li key={entry.mode}>
              <Link
                to={`${PATH_PLAN}?mode=${entry.mode}`}
                state={{ fresh: true }}
                className={`flex min-h-11 items-center gap-3 p-4 hover:bg-page ${composeFocusRing}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body leading-snug font-semibold text-content">
                    {entry.title}
                  </span>
                  <span className="mt-1 block text-support leading-relaxed font-normal break-keep text-muted">
                    {entry.body}
                  </span>
                </span>
                <Icon
                  name="chevron-right"
                  size={18}
                  className="shrink-0 text-muted"
                />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
