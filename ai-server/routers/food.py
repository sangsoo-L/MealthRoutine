
"""밀스루틴 정식 음식 사진 분석 API.

개발용으로 검증한 YOLO + Gemini/OpenAI 분석 함수를
정식 내부 API에서도 재사용한다.

정식 경로: POST /internal/ai/food-analyses
개발 경로: POST /internal/ai/dev/food-analyses
"""

from fastapi import APIRouter

from routers.food_preview import analyze_food_preview


router = APIRouter(
    prefix="/internal/ai",
    tags=["AI Food Analysis"],
)

router.add_api_route(
    path="/food-analyses",
    endpoint=analyze_food_preview,
    methods=["POST"],
    summary="음식 사진 AI 분석",
    description=(
        "YOLO와 Gemini/OpenAI를 이용하여 음식 사진을 분석합니다. "
        "대표 음식명과 대체 후보를 반환하며, "
        "match_db=true인 경우 Spring Boot 음식 검색 API와 연동합니다. "
        "분석 결과는 사용자 확인 후 저장해야 합니다."
    ),
    name="analyze_food",
)
