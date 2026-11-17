"""음식 사진: 자체 학습 YOLO + Gemini/OpenAI 보완 분석 (개발용)."""

import io
import logging

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
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


router = APIRouter(
    prefix="/internal/ai/dev",
    tags=["AI Food Detection - DEV"],
)
logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
LLM_FALLBACK_THRESHOLD = 0.50
VALID_CONTENT_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG"}


def _menu_item(
    name: str,
    confidence: float | None,
    alternatives: list[str] | None = None,
) -> dict:
    """음식 하나의 대표 메뉴와 예비 후보를 응답 형식으로 변환한다."""
    return {
        "primary": name,
        "alternatives": alternatives or [],
        "confidence_score": confidence,
        "suggested_food_id": None,  # 실제 food_id는 Spring Boot에서 매칭
    }


def _match_alternatives(
    yolo_item: dict,
    vision_menus: list[FoodMenu],
    single_yolo_menu: bool,
) -> list[str]:
    """사용자가 YOLO 예측을 거부했을 때 LLM 대체 후보를 제공한다."""
    name = yolo_item["name"]
    key = normalize_food_name(name)
    exact = next(
        (
            menu for menu in vision_menus
            if normalize_food_name(menu.primary) == key
        ),
        None,
    )

    if exact is not None:
        suggested = exact.alternatives
    elif single_yolo_menu and vision_menus:
        # 사진에서 단일 메뉴로 탐지했을 때만 LLM의 다른 대표 예측을 후보에 넣는다.
        suggested = [vision_menus[0].primary, *vision_menus[0].alternatives]
    else:
        # 복수 메뉴를 탐지한 경우 잘못된 음식끼리 후보를 연결하지 않는다.
        suggested = []

    return [
        item
        for item in unique_food_names(suggested)
        if normalize_food_name(item) != key
    ][:3]


@router.post(
    "/food-analyses",
    summary="YOLO + LLM 음식 분석 및 대체 메뉴 후보 (개발용)",
)
async def analyze_food_preview(
    file: UploadFile = File(...),
    include_alternatives: bool = Query(
        False,
        description="YOLO 신뢰도가 높더라도 대체 후보가 필요할 때 LLM 호출",
    ),
):
    """사진의 독립 메뉴를 찾고, 필요시 대체 후보 최대 3개를 생성한다."""
    if file.content_type not in VALID_CONTENT_TYPES:
        await file.close()
        raise HTTPException(415, "JPG 또는 PNG 이미지만 지원합니다.")

    try:
        image_bytes = await file.read(MAX_IMAGE_SIZE + 1)
    finally:
        await file.close()

    if not image_bytes:
        raise HTTPException(400, "빈 파일입니다.")
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(413, "이미지는 10MiB 이하여야 합니다.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format != VALID_CONTENT_TYPES[file.content_type]:
                raise HTTPException(415, "파일 형식과 이미지 내용이 일치하지 않습니다.")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(413, "이미지 해상도가 너무 큽니다.")
            image.verify()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, ValueError) as exc:
        raise HTTPException(400, "올바르지 않거나 손상된 이미지입니다.") from exc

    # YOLO는 모델을 한 번 로딩하고 재사용한다. CPU 추론은 워커 스레드에서 수행.
    try:
        detector = await run_in_threadpool(get_food_detector)
        yolo_items = await run_in_threadpool(detector.predict, image_bytes)
    except Exception as exc:
        logger.exception("YOLO 음식 분석 실패")
        raise HTTPException(500, "자체 음식 인식 모델 실행에 실패했습니다.") from exc

    yolo_names = unique_food_names([item["name"] for item in yolo_items])
    min_confidence = min(
        (item["confidence"] for item in yolo_items),
        default=0.0,
    )

    vision_provider: str | None = None
    vision_menus: list[FoodMenu] = []

    # 기존 정책 유지: YOLO 최소 신뢰도 50% 미만 또는 사용자 명시 요청 시 외부 LLM 호출
    if min_confidence < LLM_FALLBACK_THRESHOLD or include_alternatives:
        try:
            vision_provider, vision_menus = await run_in_threadpool(
                analyze_food_with_vision, image_bytes
            )
        except RuntimeError as exc:
            logger.error("음식 LLM 설정 오류: %s", type(exc).__name__)
            raise HTTPException(503, "음식 분석 제공업체 설정을 확인해야 합니다.") from exc
        except OpenAIError as exc:
            logger.warning(
                "음식 LLM 호출 실패: %s (HTTP %s)",
                type(exc).__name__, getattr(exc, "status_code", "N/A"),
            )
            raise HTTPException(502, "외부 AI 음식 분석에 실패했습니다.") from exc
        except (ValueError, OSError) as exc:
            logger.warning("음식 LLM 분석 결과 오류: %s", type(exc).__name__)
            raise HTTPException(502, "외부 AI 분석 결과를 처리하지 못했습니다.") from exc

    vision_names = [menu.primary for menu in vision_menus]
    matched: bool | None = None
    if vision_provider is not None:
        matched = (
            {normalize_food_name(name) for name in yolo_names}
            == {normalize_food_name(name) for name in vision_names}
        )

    source = "yolo"
    if min_confidence < LLM_FALLBACK_THRESHOLD and vision_menus:
        # 낮은 신뢰도 또는 미탐지: LLM의 '메뉴 단위' 결과를 우선한다.
        source = vision_provider
        foods = [
            _menu_item(menu.primary, None, menu.alternatives)
            for menu in vision_menus
        ]
    else:
        # 높은 신뢰도이거나 LLM 미탐지: YOLO 결과 유지.
        foods = []
        for item in yolo_items:
            alternatives = (
                _match_alternatives(item, vision_menus, len(yolo_items) == 1)
                if include_alternatives else []
            )
            foods.append(
                _menu_item(item["name"], item["confidence"], alternatives)
            )

    # 기존 개발용 candidates 형식 유지 (대표 메뉴만 포함)
    candidates = [
        {
            "candidate_food_name": food["primary"],
            "confidence_score": food["confidence_score"],
            "suggested_food_id": None,
        }
        for food in foods
    ]

    return {
        "source": source,
        "status": "review_required",
        "candidates": candidates,
        "foods": foods,
        "yolo_foods": yolo_names,
        "vision_provider": vision_provider,
        "vision_foods": vision_names,
        "matched": matched,
        "note": (
            "AI 분석 결과는 사용자 확인이 필요합니다. "
            "음식 DB 매칭 및 저장 전입니다."
        ),
    }
