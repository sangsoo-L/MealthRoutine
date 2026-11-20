
"""
MealthRoutine AI 식단 추천 API.

[현재 구현]
POST /internal/ai/diet-recommendations

[중요]
- /internal/ai/... 는 FastAPI 내부 임시 API 경로
- /api/v1/ai/... 는 기획서에 명시된 외부 API 기준안
- 최종 내부 API 경로는 Spring Boot 담당자와 협의 필요

[Mock 데이터 주의]
아래 음식 및 영양 수치는 API 구조 검증용 예시다.
실제 영양정보, 개인별 적정 섭취량, 알레르기,
식단 목표와의 적합성은 검증하지 않는다.

[향후 작업]
1. 음식 DB 기반 식품 ID 및 영양정보 연동
2. 사용자 식단 목표와 선호도 반영
3. 알레르기 및 제외 음식 조건 검증
4. LLM 기반 추천 로직 연결
5. Spring Boot와 통합 테스트
"""

from fastapi import APIRouter

from schemas.diet import (
    DietRecommendationRequest,
    DietRecommendationResponse,
    DietRecommendationFood,
)


router = APIRouter(
    prefix="/internal/ai",
    tags=["AI Diet - Mock"],
)


@router.post(
    "/diet-recommendations",
    response_model=DietRecommendationResponse,
    summary="AI 식단 추천 테스트",
    description="실제 AI 대신 임시 식단 데이터를 반환하는 API",
)
def recommend_diet(
    request: DietRecommendationRequest,
) -> DietRecommendationResponse:

    # API 통신 확인을 위한 임시 데이터.
    # 실제 음식 DB 조회 및 LLM 추천으로 교체할 예정이다.
    mock_meals = {
        "breakfast": [
            ("삶은 달걀", 100, 150),
            ("바나나", 100, 90),
        ],
        "lunch": [
            ("현미밥", 150, 230),
            ("닭가슴살", 100, 165),
        ],
        "dinner": [
            ("두부", 150, 120),
            ("샐러드", 150, 75),
        ],
        "snack": [
            ("사과", 150, 78),
        ],
    }

    selected_foods = mock_meals[request.meal_type]

    foods = [
        DietRecommendationFood(
            food_name=name,
            quantity_g=quantity,
            calories_kcal=calories,
        )
        for name, quantity, calories in selected_foods
    ]

    total_calories = sum(
        food.calories_kcal for food in foods
    )

    # target_calories_kcal은 현재 입력 검증만 수행한다.
    # 목표 칼로리에 맞춘 식단 조절은 추후 구현한다.

    return DietRecommendationResponse(
        source="mock",
        meal_type=request.meal_type,
        foods=foods,
        total_calories_kcal=total_calories,
        note=(
            "개발용 예시 식단입니다. "
            "실제 영양정보 및 개인별 조건은 반영되지 않았습니다."
        ),
    )
