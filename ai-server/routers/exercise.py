
"""
AI 운동 추천 API 라우터.

[현재 구현 상태]
- Pydantic을 통한 운동 추천 조건 검증
- 조건에 따른 테스트용 운동 추천 결과 반환
- 실제 AI 모델 및 외부 LLM 호출은 미구현

[내부 API 경로 안내]
현재 경로:
POST /internal/ai/exercise-recommendations

기획서의 외부 API:
POST /api/v1/ai/exercise-recommendations

두 경로는 역할이 다르며 반드시 일치할 필요는 없다.

현재 /internal/ai 경로는 개발용 임시 경로다.
Spring Boot 담당자와 API 계약을 협의하여 최종 확정한다.

[향후 작업]
1. 실제 운동 DB 정보와 연결
2. AI 또는 LLM 기반 추천 로직 연결
3. Spring Boot와 요청·응답 형식 확정
4. 오류 처리 및 통합 테스트

주의: 이 API는 현재 인증이 없는 프로토타입이다.
외부에 공개 배포하기 전에 접근 통제 방식을 확정해야 한다.
"""

from fastapi import APIRouter

from schemas.exercise import (
    ExerciseRecommendationRequest,
    ExerciseRecommendationResponse,
    ExerciseRecommendationItem,
)


# Spring Boot에서 호출할 FastAPI 내부 API의 임시 경로.
# 외부 서비스 API 경로와 혼동하지 않도록 /internal/ai 사용.
router = APIRouter(
    prefix="/internal/ai",
    tags=["AI Exercise - Mock"],
)


@router.post(
    "/exercise-recommendations",
    response_model=ExerciseRecommendationResponse,
    summary="AI 운동 추천 테스트",
    description="실제 AI 대신 임시 추천 결과를 반환하는 개발용 API",
)
def recommend_exercises(
    request: ExerciseRecommendationRequest,
) -> ExerciseRecommendationResponse:

    # 장비 종류에 따라 임시 운동 이름을 선택한다.
    # 실제 서비스에서는 운동 DB 기반 추천으로 대체할 예정이다.
    mock_exercises = {
        "body": "맨몸 스쿼트",
        "dumbbell": "덤벨 스쿼트",
        "band": "밴드 스쿼트",
    }

    exercise_name = mock_exercises[request.equipment]

    # 테스트용 조건 분기.
    # 실제 운동 추천 알고리즘이나 의학적 기준은 아니다.
    sets = 2 if request.available_minutes < 30 else 3
    reps = 10 if request.level == "beginner" else 12

    # 현재 goal은 요청 검증에만 사용된다.
    # 목표별 추천 로직은 추후 구현한다.

    return ExerciseRecommendationResponse(
        source="mock",
        recommendations=[
            ExerciseRecommendationItem(
                exercise_name=exercise_name,
                sets=sets,
                reps=reps,
            )
        ],
    )
