import ExercisePlanGuideView from '../components/ai/exercise/ExercisePlanGuideView.tsx'

/**
 * I02 AI 운동 플랜 안내(`/ai/exercise`, 비회원 공개). 고정 예시 미리보기만 보여 주며 실제 AI 추천·저장·체험 횟수 처리는 하지 않는다.
 * 조건 선택(I02-1)이 구현되기 전까지 "운동 조건 선택하기"는 준비 중 안내다.
 */
export default function AiExercisePage() {
  return <ExercisePlanGuideView />
}
