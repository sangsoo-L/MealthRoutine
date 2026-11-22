
"""
AI 운동 추천 API의 요청·응답 데이터 모델.

Pydantic을 사용해 입력값과 출력값의 형식을 검증한다.

[주의사항]
- 현재 값과 제약조건 일부는 개발용 임시 기준이다.
- Spring Boot 담당자와 내부 API 계약을 확정한 후 조정한다.
- 이 파일은 DB Entity가 아니라 AI 서버의 데이터 모델이다.
"""

from typing import Literal

from pydantic import BaseModel, Field


class ExerciseRecommendationRequest(BaseModel):
    """Spring Boot가 AI 서버에 전달할 운동 추천 조건."""

    goal: Literal[
        "muscle_gain", "weight_loss", "fitness"
    ] = Field(description="운동 목표. 임시 분류")

    level: Literal[
        "beginner", "intermediate", "advanced"
    ] = Field(description="사용자 운동 수준")

    equipment: Literal[
        "body", "dumbbell", "band"
    ] = Field(description="사용 가능한 운동 장비")

    available_minutes: int = Field(
        ge=10,
        le=180,
        description="운동 가능 시간(분). 10~180분은 임시 기준",
    )


class ExerciseRecommendationItem(BaseModel):
    """추천된 개별 운동의 정보."""

    exercise_name: str
    sets: int = Field(ge=1)
    reps: int = Field(ge=1)


class ExerciseRecommendationResponse(BaseModel):
    """AI 서버가 Spring Boot에 반환할 추천 결과."""

    # 현재는 실제 AI가 아닌 임시 데이터를 반환하므로 mock으로 고정한다.
    # 실제 추천 엔진 연동 시 응답 구조 변경 여부를 재검토한다.
    source: Literal["mock"]

    recommendations: list[ExerciseRecommendationItem]
