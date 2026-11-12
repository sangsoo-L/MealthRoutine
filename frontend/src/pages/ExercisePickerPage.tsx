import { useCallback, useRef } from 'react'
import { useMatches, useNavigate } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import { useAuth } from '../auth/authContext.ts'
import ExercisePicker, {
  type PickerCompleteResult,
} from '../components/exercise/picker/ExercisePicker.tsx'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import type { ExerciseCatalogState } from '../exercise/useExerciseCatalog.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'
import {
  addExercisesToDraft,
  MAX_ITEMS,
} from '../exercise/workoutDraftModel.ts'

/** 선택한 운동을 담는 W02(운동 목록 구성). 등록이 끝나면 항상 이 화면으로 돌아간다. */
const PATH_COMPOSE = '/records/exercise/compose'

/** W02가 등록 결과 안내를 읽는 라우터 state. */
export interface PickerResultState {
  added: number
  skipped: number
}

/**
 * W13 운동 검색·즐겨찾기 등록(운동 선택). 회원 전용이며 비회원은 라우트의 AuthGate가 기존 로그인 안내를 보여 준다(이 컴포넌트는 그리지 않는다).
 *
 * 등록(W13-C): 선택한 운동 id(선택 순서)를, 피커가 화면에 쓴 운동 목록(onComplete 두 번째 인자)에서 운동 객체로 바꿔 — 페이지가 따로 조회하지 않는다 — W02 초안(WorkoutDraftProvider)에 추가하고 W02로 돌아간다.
 * - 운동 목록(카탈로그)이 준비되지 않았으면(불러오는 중·연결 전·오류) 추가하지 않고 이유를 안내한다. 선택은 그대로 남는다.
 * - 이미 초안에 있는 운동과 상한(500개)을 넘는 운동은 건너뛴다. 하나도 추가되지 않으면 이동하지 않고 안내하며,
 *   일부만 추가되면 W02에서 추가·건너뜀 개수를 알린다.
 * - 선택한 id를 운동 목록에서 찾지 못하면(삭제된 운동 등) 일부만 몰래 추가하지 않고 아무것도 추가하지 않은 채 안내한다.
 *
 * 뒤로가기·취소 목적지는 useBackTarget 규칙을 따른다: 진입한 화면(state.from)을 알면 그곳, 모르면(주소 직접 입력 등) 라우트에 정의된 임시 상위 화면이다.
 * 계정이 바뀌면 key로 본체를 다시 만들어 이전 사용자의 선택·검색 상태가 남지 않게 한다.
 */
export default function ExercisePickerPage() {
  const { user } = useAuth()
  const matches = useMatches()
  const navigate = useNavigate()
  const backTo = useBackTarget(
    getRouteHandle(matches.at(-1)?.handle).parent ?? null,
  )
  const { status, draft, addExercises } = useWorkoutDraft()
  // 등록에 성공한 뒤 이동이 끝나기 전의 반복 클릭을 무시한다(같은 운동을 다시 추가하거나 이동 기록이 여러 개 쌓이지 않게).
  const registered = useRef(false)

  const handleComplete = useCallback(
    (
      ids: readonly string[],
      catalog: ExerciseCatalogState,
    ): PickerCompleteResult => {
      if (registered.current) return { ok: true }
      if (status !== 'ready') {
        return { ok: false, message: '로그인 후 운동을 등록할 수 있어요.' }
      }
      if (catalog.status === 'loading') {
        return {
          ok: false,
          message: '운동 정보를 불러오는 중이에요. 잠시 후 다시 눌러 주세요.',
        }
      }
      if (catalog.status !== 'ready') {
        return {
          ok: false,
          message:
            '운동 정보를 불러오지 못해 등록할 수 없어요. 선택한 운동은 그대로 있어요.',
        }
      }
      const byId = new Map(
        catalog.exercises.map((exercise) => [exercise.id, exercise]),
      )
      const exercises = ids.flatMap((id) => {
        const exercise = byId.get(id)
        return exercise ? [exercise] : []
      })
      if (exercises.length !== ids.length) {
        return {
          ok: false,
          message:
            '일부 운동의 정보를 찾을 수 없어 등록하지 않았어요. 선택을 확인해 주세요.',
        }
      }
      // 실제로 몇 개가 추가되는지 현재 초안으로 미리 계산한다(같은 함수라 addExercises와 결과가 같다).
      const added =
        addExercisesToDraft(draft, exercises).items.length - draft.items.length
      if (added === 0) {
        return {
          ok: false,
          message:
            draft.items.length >= MAX_ITEMS
              ? `운동은 최대 ${MAX_ITEMS}개까지 담을 수 있어요.`
              : '선택한 운동이 모두 이미 목록에 있어요.',
        }
      }
      registered.current = true
      addExercises(exercises)
      const result: PickerResultState = {
        added,
        skipped: exercises.length - added,
      }
      navigate(PATH_COMPOSE, { state: result })
      return { ok: true }
    },
    [status, draft, addExercises, navigate],
  )

  return (
    <ExercisePicker
      key={user?.id ?? ''}
      backTo={backTo}
      onComplete={handleComplete}
    />
  )
}
