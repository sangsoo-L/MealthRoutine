"""Gemini 등 외부 LLM의 추천 결과를 시험하기 위한 응답 스키마.

[주의]
- 현재 Spring Boot ↔ FastAPI 최종 계약이 확정되지 않았다.
- 기존 운동/식단 Mock API의 요청·응답 구조를 변경하지 않는다.
- 음식·운동 ID 매칭 및 실제 영양정보 검증은 아직 수행하지 않는다.
- 이 스키마와 테스트 엔드포인트는 개발 단계 전용이며 외부 공개 대상이 아니다.
"""

from typing import Literal

from pydantic import BaseModel, Field


class LLMExerciseItem(BaseModel):
    """LLM이 생성하는 개별 운동 추천 내용."""

    exercise_name: str = Field(min_length=1, max_length=100)
    sets: int = Field(ge=1, le=6)
    reps: int = Field(ge=1, le=30)
    reason: str = Field(min_length=1, max_length=300)


class LLMExerciseGenerated(BaseModel):
    """LLM 원문을 검증할 때 사용하는 구조 (서버 고정 필드 제외)."""

    recommendations: list[LLMExerciseItem] = Field(min_length=1, max_length=3)


class LLMExercisePreviewResponse(LLMExerciseGenerated):
    """개발용 운동 추천 API 응답."""

    source: Literal["llm"] = "llm"
    note: str = "AI 생성 결과이며 실제 운동 DB 매칭 및 안전성 검증 전입니다."


class LLMDietFood(BaseModel):
    """LLM이 제시한 음식·중량·추정 열량 (검증된 영양 DB 값이 아님)."""

    food_name: str = Field(min_length=1, max_length=200)
    quantity_g: float = Field(gt=0, le=2000)
    calories_kcal: float = Field(ge=0, le=3000)


class LLMDietGenerated(BaseModel):
    """LLM에서 생성하도록 요구할 식단 결과."""

    foods: list[LLMDietFood] = Field(min_length=1, max_length=4)
    reason: str = Field(min_length=1, max_length=400)


class LLMDietPreviewResponse(LLMDietGenerated):
    """개발용 식단 추천 API 응답."""

    source: Literal["llm"] = "llm"
    total_calories_kcal: float = Field(ge=0)
    note: str = (
        "AI가 추정한 열량이며 음식 DB로 검증되지 않았습니다. "
        "알레르기·질환·개인별 영양 조건은 반영하지 않았습니다."
    )
