"""기존 Mock API를 변경하지 않고 LLM 추천을 실험하는 개발 전용 라우터.

[구현 목적]
- 실제 Gemini 등 외부 LLM이 운동·식단 추천 JSON을 반환하는지 검증한다.
- 담당자 간 내부 연동 규격을 확정하기 전이므로 임시 개발 경로를 사용한다.

[중요]
- Spring Boot 측 API 명세나 기존 Mock 엔드포인트를 대체하지 않는다.
- 모델이 생성한 운동명·음식명은 DB의 실존 ID와 검증·매핑되지 않았다.
- 실제 서비스 공개 전에는 인증, 접근 제한, 모델 검증, 사용량 통제가 필요하다.
- API 키는 이 파일에 작성하지 않고 ai-server/.env 에만 저장한다.
"""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

from schemas.diet import DietRecommendationRequest
from schemas.exercise import ExerciseRecommendationRequest
from schemas.llm_preview import (
    LLMDietGenerated,
    LLMDietPreviewResponse,
    LLMExerciseGenerated,
    LLMExercisePreviewResponse,
)
from services.llm import (
    LLMConfigurationError,
    LLMRequestError,
    LLMResponseError,
    create_llm_client,
)


# Windows/VS Code에서 ai-server 폴더를 기준으로 실행해도 같은 .env를 읽는다.
# 운영 환경에서 주입한 환경변수가 있으면 덮어쓰지 않는다.
load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env", override=False)

router = APIRouter(prefix="/internal/ai/dev", tags=["AI LLM Preview - DEV"])


# 사용자에게 API 키나 외부 서버 응답의 세부 내용을 노출하지 않는다.
def _raise_llm_http_error(exc: Exception) -> None:
    if isinstance(exc, LLMConfigurationError):
        raise HTTPException(status_code=503, detail="LLM 설정이 준비되지 않았습니다.") from exc
    if isinstance(exc, LLMRequestError):
        raise HTTPException(status_code=502, detail="외부 LLM 호출에 실패했습니다.") from exc
    if isinstance(exc, LLMResponseError):
        raise HTTPException(status_code=502, detail="LLM 응답 형식 검증에 실패했습니다.") from exc
    raise exc


@router.post(
    "/exercise-recommendations",
    response_model=LLMExercisePreviewResponse,
    summary="[개발 전용] LLM 운동 추천",
)
async def preview_llm_exercises(
    request: ExerciseRecommendationRequest,
) -> LLMExercisePreviewResponse:
    """기존 운동 Mock과 같은 입력을 받아 Gemini가 실제 결과를 생성하는지 확인."""

    system_prompt = (
        "당신은 운동 계획 초안을 작성하는 도우미입니다. "
        "사용자의 목표(goal), 운동 수준(level), 도구(equipment), 가능 시간(available_minutes)을 반영해 "
        "무리하지 않는 운동 1~3개를 한국어로 추천하세요. "
        "goal은 muscle_gain=근력 향상, weight_loss=체중 관리, fitness=체력 향상입니다. "
        "equipment는 body=맨몸, dumbbell=덤벨, band=밴드입니다. "
        "반드시 아래 JSON 형식을 사용하세요: "
        '{"recommendations":[{"exercise_name":"운동명","sets":3,"reps":10,'
        '"reason":"추천 이유"}]}. '
        "sets는 1~6, reps는 1~30 사이 정수여야 합니다. "
        "건강 상태를 진단하거나 효과를 보장하지 마세요."
    )
    try:
        generated = await create_llm_client().generate_json(
            system_prompt=system_prompt,
            input_data=request.model_dump(),
            response_model=LLMExerciseGenerated,
        )
    except (LLMConfigurationError, LLMRequestError, LLMResponseError) as exc:
        _raise_llm_http_error(exc)

    # 응답에 source='llm'을 서버가 직접 설정해 Mock과 구별한다.
    return LLMExercisePreviewResponse(recommendations=generated.recommendations)


@router.post(
    "/diet-recommendations",
    response_model=LLMDietPreviewResponse,
    summary="[개발 전용] LLM 식단 추천",
)
async def preview_llm_diet(request: DietRecommendationRequest) -> LLMDietPreviewResponse:
    """실제 LLM이 식단을 생성하는지 테스트. 영양정보 DB 검증은 추후 연동."""

    system_prompt = (
        "당신은 일반적인 식사 아이디어를 제안하는 도우미입니다. "
        "meal_type에 해당하는 한 끼 식사(또는 간식)의 음식 1~4개를 한국어로 추천하세요. "
        "target_calories_kcal은 일일 목표 열량으로, 한 끼의 목표 열량이 아닙니다. "
        "음식별 중량(g)과 대략적인 열량(kcal)을 숫자로 제시하세요. "
        "이 수치는 실제 DB 기반 검증값이 아니라 추정치입니다. "
        "반드시 아래 JSON 형식을 사용하세요: "
        '{"foods":[{"food_name":"음식명","quantity_g":150,'
        '"calories_kcal":230}],"reason":"추천 이유"}. '
        "영양 정보의 정확성을 보장하거나 특정 질환을 위한 식단이라고 주장하지 마세요. "
        "현재 알레르기 정보가 없으므로 알레르기 안전성을 보장하지 마세요."
    )
    try:
        generated = await create_llm_client().generate_json(
            system_prompt=system_prompt,
            input_data=request.model_dump(),
            response_model=LLMDietGenerated,
        )
    except (LLMConfigurationError, LLMRequestError, LLMResponseError) as exc:
        _raise_llm_http_error(exc)

    # 총열량은 LLM이 별도로 생성하지 않고 반환된 음식별 추정값을 합산한다.
    # 실제 서비스에서는 Spring Boot의 음식 DB 기준으로 재계산해야 한다.
    total_kcal = round(sum(food.calories_kcal for food in generated.foods), 2)
    return LLMDietPreviewResponse(
        foods=generated.foods,
        reason=generated.reason,
        total_calories_kcal=total_kcal,
    )
