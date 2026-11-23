"""정식 AI 식단 추천 라우터.

Spring은 음식 DB에서 추천 후보를 조회하여 이 API에 전달한다.
기존의 Mock 응답은 정식 경로에서 제거한다.
"""

from fastapi import APIRouter

from routers.diet_catalog import recommend_from_foods

router = APIRouter(prefix="/internal/ai", tags=["AI Diet Recommendations"])

router.add_api_route(
    path="/diet-recommendations",
    endpoint=recommend_from_foods,
    methods=["POST"],
    summary="DB 음식 후보 기반 AI 식단 추천 (정식)",
    description=(
        "Spring Boot가 전달한 음식 DB 후보와 사용자 조건으로 Gemini 식단 추천을 생성합니다. "
        "추천을 실제 식단에 저장하는 기능은 Spring Boot가 담당합니다."
    ),
    name="recommend_diet",
)
