
"""
MealthRoutine AI 식단 추천 요청·응답 모델.

[현재 구현 범위]
- 식단 추천 조건 검증
- Mock 추천 결과의 응답 형식 정의

[설계 관련 주의사항]
- 실제 식단 추천 알고리즘은 미구현
- 칼로리 제한 범위는 API 검증용 임시 기준
- 실제 추천에서는 음식 DB의 식품 ID 및 영양정보 활용 예정
- Spring Boot 담당자와 내부 API 계약 확정 필요
"""

from typing import Literal

from pydantic import BaseModel, Field


MealType = Literal["breakfast", "lunch", "dinner", "snack"]


class DietRecommendationRequest(BaseModel):
    """Spring Boot가 전달할 식단 추천 조건."""

    meal_type: MealType = Field(
        description="추천할 식사 유형"
    )

    target_calories_kcal: int = Field(
        gt=0,
        le=10000,
        description="일일 목표 칼로리. 검증 범위는 임시 기준"
    )


class DietRecommendationFood(BaseModel):
    """추천 식단에 포함되는 개별 음식."""

    food_name: str
    quantity_g: float = Field(gt=0)
    calories_kcal: float = Field(ge=0)


class DietRecommendationResponse(BaseModel):
    """AI 식단 추천 결과."""

    source: Literal["mock"]
    meal_type: MealType
    foods: list[DietRecommendationFood]
    total_calories_kcal: float
    note: str
