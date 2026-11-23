"""정식 AI 식단 추천 라우터.

음식 목록이 없으면 FastAPI가 Spring 음식 검색 API에서 후보를 자동 조회한다.
Spring이 명시적 음식 후보를 전달하던 기존 방식도 유지한다.
기존의 Mock 응답은 정식 경로에서 제거한다.
"""

from fastapi import APIRouter

from routers.diet_catalog import recommend_from_foods

router = APIRouter(prefix="/internal/ai", tags=["AI Diet Recommendations"])

router.add_api_route(
    path="/diet-recommendations",
    endpoint=recommend_from_foods,
    methods=["POST"],
    summary="목표 칼로리 기반 AI 식단 추천 (정식)",
    description=(
        "목표 칼로리만 전달하면 Spring 음식 DB 후보를 자동 조회해 Gemini 식단 추천을 생성합니다. 음식 목록 직접 전달도 지원합니다. "
        "추천을 실제 식단에 저장하는 기능은 Spring Boot가 담당합니다."
    ),
    name="recommend_diet",
)
