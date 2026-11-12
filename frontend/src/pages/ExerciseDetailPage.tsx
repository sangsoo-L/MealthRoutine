import { useEffect, useRef, useState } from 'react'
import { Link, useMatches, useParams } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import ExerciseDetailView from '../components/exercise/ExerciseDetailView.tsx'
import BackLink from '../components/layout/BackLink.tsx'
import {
  loadExercise,
  type ExerciseDetailOutcome,
} from '../exercise/exerciseDetail.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

const noticePanel = 'rounded-card bg-surface px-5 py-6 text-center'

const secondaryButton = `mx-auto mt-5 flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${focusRing}`

function ListLink() {
  return (
    <Link to="/exercises" className={secondaryButton}>
      운동 찾기로 가기
    </Link>
  )
}

/** 조회 상태별 본문. 정상이면 상세, 그 밖에는 서로 다른 안내(미연결·실패·없는 운동·조회 중)다. */
function ExerciseDetailBody({
  outcome,
  onRetry,
}: {
  outcome: ExerciseDetailOutcome | 'loading'
  onRetry: () => void
}) {
  if (outcome === 'loading') {
    return (
      <>
        <h1 className="sr-only">운동 상세 안내</h1>
        <p
          role="status"
          className="py-10 text-center text-body font-normal text-muted"
        >
          운동 정보를 불러오는 중이에요…
        </p>
      </>
    )
  }

  if (outcome.status === 'ready') {
    return <ExerciseDetailView exercise={outcome.exercise} />
  }

  return (
    <>
      <h1 className="sr-only">운동 상세 안내</h1>
      {outcome.status === 'unavailable' ? (
        <div role="status" className={noticePanel}>
          <p className="text-section-title leading-snug font-semibold text-content">
            운동 정보를 준비하고 있어요
          </p>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            운동 데이터가 아직 연결되지 않아 상세 정보를 보여 드릴 수 없어요.
            운동 번호 문제는 아니에요.
          </p>
          <ListLink />
        </div>
      ) : outcome.status === 'error' ? (
        <div role="alert" className={noticePanel}>
          <p className="text-section-title leading-snug font-semibold text-content">
            운동 정보를 불러오지 못했어요
          </p>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            잠시 후 다시 시도해 주세요.
          </p>
          <button type="button" onClick={onRetry} className={secondaryButton}>
            다시 시도
          </button>
        </div>
      ) : (
        <div role="status" className={noticePanel}>
          <p className="text-section-title leading-snug font-semibold text-content">
            찾을 수 없는 운동이에요
          </p>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            삭제되었거나 주소가 잘못되었을 수 있어요. 운동 찾기에서 다시 골라
            주세요.
          </p>
          <ListLink />
        </div>
      )}
    </>
  )
}

/**
 * 운동 상세 안내(E02, `/exercises/:exerciseId`). 운동 탐색(E01)·통합검색의 결과에서 들어온다.
 * 운동은 E01·통합검색과 같은 운동 저장소의 `getById`로 조회한다(exercise/exerciseDetail.ts). 상세 전용 데이터는 없다.
 * 상태: 조회 중 · 운동 없음(notFound) · 데이터 소스 미연결(unavailable) · 조회 실패(error) · 정상(ready)을 서로 다른 화면으로 보여 준다.
 * "이전"은 화면이 직접 그린다(handle.bodyBack): 대표 미디어가 화면 폭을 가득 채우도록 본문 맨 위에 둔다. 목적지 규칙은 AppShell의 뒤로가기와
 * 같다(BackLink): 진입한 검색 화면(state.from, 검색어·조건 포함)이 있으면 그곳, 주소로 직접 열었으면 운동 탐색이다. 모든 상태에서 그린다.
 * 화면이 h1을 직접 가진다(handle.ownH1): 정상일 때는 운동명, 그 밖의 상태에서는 화면 이름(보조기기용)이다.
 */
export default function ExerciseDetailPage() {
  const { exerciseId = '' } = useParams()

  // 조회 결과는 어떤 요청의 것인지(key)와 함께 저장해, 현재 요청의 결과가 아직 없으면 "조회 중"으로 파생한다(이전 운동 결과가 덮어쓰지 않는다).
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${exerciseId}|${attempt}`
  const [result, setResult] = useState<{
    key: string
    outcome: ExerciseDetailOutcome
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadExercise(exerciseId).then((outcome) => {
      if (!cancelled) setResult({ key: requestKey, outcome })
    })
    return () => {
      cancelled = true
    }
  }, [exerciseId, requestKey])
  const outcome: ExerciseDetailOutcome | 'loading' =
    result?.key === requestKey ? result.outcome : 'loading'

  // "다시 시도"를 누르면 그 버튼이 사라지므로 포커스가 문서 맨 앞으로 빠지지 않게 이 화면의 바깥 틀로 옮긴다.
  // 틀은 조회 중·결과 화면에서도 그대로 남아 포커스가 유지된다(화면 안에서만 다루며 전역 포커스 관리는 하지 않는다).
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (attempt > 0) frameRef.current?.focus()
  }, [attempt])

  const matches = useMatches()
  const parent = getRouteHandle(matches.at(-1)?.handle).parent ?? null

  // "이전"은 포커스 틀 밖에 둔다: 틀 안에 있으면 재시도 뒤 Tab이 "다시 시도"보다 먼저 "이전"에 닿는다.
  return (
    <>
      <div className="mb-1">
        <BackLink parent={parent} />
      </div>
      <div ref={frameRef} tabIndex={-1} className="outline-none">
        <ExerciseDetailBody
          outcome={outcome}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    </>
  )
}
