
"""음식 사진 분석: YOLO + Gemini/OpenAI + Spring 음식 DB 검색."""

import io
import logging

from fastapi import (
    APIRouter,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from openai import OpenAIError
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from services.food_detector import get_food_detector
from services.food_vision import (
    FoodMenu,
    analyze_food_with_vision,
    normalize_food_name,
    unique_food_names,
)
from services.spring_food_catalog import (
    SpringFoodApiError,
    resolve_food_names,
)


router = APIRouter(
    prefix="/internal/ai/dev",
    tags=["AI Food Detection - DEV"],
)

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
LLM_FALLBACK_THRESHOLD = 0.50

VALID_CONTENT_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
}


def _menu_item(
    name: str,
    confidence: float | None,
    alternatives: list[str] | None = None,
) -> dict:
    """음식 하나의 대표 메뉴 및 대체 후보를 반환 형식으로 변환."""
    return {
        "primary": name,
        "alternatives": alternatives or [],
        "confidence_score": confidence,
        "suggested_food_id": None,
    }


def _match_alternatives(
    yolo_item: dict,
    vision_menus: list[FoodMenu],
    single_yolo_menu: bool,
) -> list[str]:
    """YOLO 결과에 대응하는 LLM 대체 후보를 추출한다."""
    name = yolo_item["name"]
    key = normalize_food_name(name)

    exact = next(
        (
            menu
            for menu in vision_menus
            if normalize_food_name(menu.primary) == key
        ),
        None,
    )

    if exact is not None:
        suggested = exact.alternatives

    elif single_yolo_menu and vision_menus:
        suggested = [
            vision_menus[0].primary,
            *vision_menus[0].alternatives,
        ]

    else:
        suggested = []

    return [
        item
        for item in unique_food_names(suggested)
        if normalize_food_name(item) != key
    ][:3]


@router.post(
    "/food-analyses",
    summary="YOLO + LLM 음식 분석 및 Spring DB 검색 (개발용)",
)
async def analyze_food_preview(
    file: UploadFile = File(...),
    include_alternatives: bool = Query(
        False,
        description="YOLO 신뢰도가 높아도 LLM 대체 후보 생성",
    ),
    match_db: bool = Query(
        False,
        description="Spring Boot 음식 DB에서 음식명 검색",
    ),
    authorization: str | None = Header(
        default=None,
        description="Spring 음식 API 호출 시 전달할 선택적 Bearer 토큰",
    ),
):
    """음식 사진을 분석하고 선택적으로 Spring 음식 DB와 대조한다."""

    # 1. 이미지 MIME 타입 검사
    if file.content_type not in VALID_CONTENT_TYPES:
        await file.close()
        raise HTTPException(
            status_code=415,
            detail="JPG 또는 PNG 이미지만 지원합니다.",
        )

    # 2. 이미지 크기 검사
    try:
        image_bytes = await file.read(MAX_IMAGE_SIZE + 1)
    finally:
        await file.close()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="빈 파일입니다.",
        )

    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="이미지는 10MiB 이하여야 합니다.",
        )

    # 3. 이미지 실제 형식 및 유효성 검사
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format != VALID_CONTENT_TYPES[file.content_type]:
                raise HTTPException(
                    status_code=415,
                    detail="파일 형식과 이미지 내용이 일치하지 않습니다.",
                )

            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="이미지 해상도가 너무 큽니다.",
                )

            image.verify()

    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="올바르지 않거나 손상된 이미지입니다.",
        ) from exc

    # 4. YOLO 음식 인식
    try:
        detector = await run_in_threadpool(get_food_detector)

        yolo_items = await run_in_threadpool(
            detector.predict,
            image_bytes,
        )

    except Exception as exc:
        logger.exception("YOLO 음식 분석 실패")

        raise HTTPException(
            status_code=500,
            detail="자체 음식 인식 모델 실행에 실패했습니다.",
        ) from exc

    yolo_names = unique_food_names(
        [item["name"] for item in yolo_items]
    )

    min_confidence = min(
        (item["confidence"] for item in yolo_items),
        default=0.0,
    )

    # 5. Gemini 또는 OpenAI 보완 분석
    vision_provider: str | None = None
    vision_menus: list[FoodMenu] = []

    if (
        min_confidence < LLM_FALLBACK_THRESHOLD
        or include_alternatives
    ):
        try:
            vision_provider, vision_menus = (
                await run_in_threadpool(
                    analyze_food_with_vision,
                    image_bytes,
                )
            )

        except RuntimeError as exc:
            logger.error(
                "음식 LLM 설정 오류: %s",
                type(exc).__name__,
            )

            raise HTTPException(
                status_code=503,
                detail="음식 분석 제공업체 설정을 확인해야 합니다.",
            ) from exc

        except OpenAIError as exc:
            logger.warning(
                "음식 LLM 호출 실패: %s (HTTP %s)",
                type(exc).__name__,
                getattr(exc, "status_code", "N/A"),
            )

            raise HTTPException(
                status_code=502,
                detail="외부 AI 음식 분석에 실패했습니다.",
            ) from exc

        except (ValueError, OSError) as exc:
            logger.warning(
                "음식 LLM 분석 결과 오류: %s",
                type(exc).__name__,
            )

            raise HTTPException(
                status_code=502,
                detail="외부 AI 분석 결과를 처리하지 못했습니다.",
            ) from exc

    vision_names = [
        menu.primary
        for menu in vision_menus
    ]

    # 6. YOLO와 LLM의 대표 메뉴 비교
    matched: bool | None = None

    if vision_provider is not None:
        matched = (
            {
                normalize_food_name(name)
                for name in yolo_names
            }
            ==
            {
                normalize_food_name(name)
                for name in vision_names
            }
        )

    # 7. 최종 음식 및 대체 후보 구성
    source = "yolo"

    if (
        min_confidence < LLM_FALLBACK_THRESHOLD
        and vision_menus
    ):
        # YOLO의 신뢰도가 낮거나 미탐지된 경우
        # LLM의 메뉴 단위 분석 결과를 우선 사용한다.
        source = vision_provider

        foods = [
            _menu_item(
                menu.primary,
                None,
                menu.alternatives,
            )
            for menu in vision_menus
        ]

    else:
        # YOLO의 신뢰도가 높거나 LLM 결과가 없는 경우
        # 기존 YOLO 결과를 사용한다.
        foods = []

        for item in yolo_items:
            alternatives = (
                _match_alternatives(
                    item,
                    vision_menus,
                    len(yolo_items) == 1,
                )
                if include_alternatives
                else []
            )

            foods.append(
                _menu_item(
                    item["name"],
                    item["confidence"],
                    alternatives,
                )
            )

    # 8. Spring Boot 음식 DB 검색
    db_matches = []
    db_lookup_truncated = False

    if match_db:
        # 대표 음식명을 먼저 검색하고
        # 남는 검색 범위에 대체 후보를 포함한다.
        primary_names = [
            food["primary"]
            for food in foods
        ]

        alternative_names = [
            alternative
            for food in foods
            for alternative in food["alternatives"]
        ]

        search_names = unique_food_names(
            primary_names + alternative_names
        )

        try:
            db_matches, db_lookup_truncated = (
                await run_in_threadpool(
                    resolve_food_names,
                    search_names,
                    authorization,
                )
            )

        except SpringFoodApiError as exc:
            logger.warning(
                "Spring 음식 DB 검색 실패: HTTP %s",
                exc.status_code,
            )

            raise HTTPException(
                status_code=exc.status_code,
                detail=str(exc),
            ) from exc

        # 검색한 음식명과 실제 DB 검색 결과 연결
        match_map = {
            normalize_food_name(result["query"]): result
            for result in db_matches
        }

        # DB에서 음식명이 유일하게 일치한 경우에만
        # suggested_food_id를 채운다.
        for food in foods:
            result = match_map.get(
                normalize_food_name(food["primary"])
            )

            if result is not None:
                food["suggested_food_id"] = (
                    result["suggested_food_id"]
                )

    # 9. 기존 candidates 응답과의 호환성 유지
    candidates = [
        {
            "candidate_food_name": food["primary"],
            "confidence_score": food["confidence_score"],
            "suggested_food_id": food["suggested_food_id"],
        }
        for food in foods
    ]

    # 10. 최종 응답
    return {
        "source": source,
        "status": "review_required",
        "candidates": candidates,
        "foods": foods,
        "yolo_foods": yolo_names,
        "vision_provider": vision_provider,
        "vision_foods": vision_names,
        "matched": matched,
        "db_match_enabled": match_db,
        "db_matches": db_matches,
        "db_lookup_truncated": db_lookup_truncated,
        "note": (
            "AI 분석 결과는 사용자 확인이 필요합니다. "
            "음식 DB 매칭 및 저장 여부와 관계없이 "
            "최종 음식 선택은 사용자가 확인해야 합니다."
        ),
    }
