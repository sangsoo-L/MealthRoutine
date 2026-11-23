
"""음식 사진 분석: YOLO + Gemini/OpenAI + Spring 음식 DB 검색."""

import io
import logging
from decimal import Decimal
from statistics import median

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

from routers.diet_catalog import FoodOption, _calculate_nutrients
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
    _candidate_score,
    _CATEGORY_HINTS,
)


router = APIRouter(
    prefix="/internal/ai/dev",
    tags=["AI Food Detection - DEV"],
)

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
LLM_FALLBACK_THRESHOLD = 0.50
DB_CALORIE_AGREEMENT_TOLERANCE = 0.25  # Gemini 및 DB 계산치의 상대 차이 25% 이하

# 사진 속 구체적인 음식 종류를 모를 때 임의의 완제품/브랜드로 칼로리를 덮어쓰지 않는다.
GENERIC_DISHES_WITHOUT_DB_REFERENCE = {
    "피자", "파스타", "김치", "고기구이", "돼지고기구이", "탄산음료", "음료", "국수",
}
# 음식명 전체가 다른 대체 요리보다 실제로 같은 음식인 동의어에만 사용한다.
SAFE_DB_ALIASES = {"김치": {"배추김치"}}

VALID_CONTENT_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
}


def _menu_item(
    name: str,
    confidence: float | None,
    alternatives: list[str] | None = None,
    estimated_quantity: float | None = None,
    vision_calories_kcal: float | None = None,
    estimated_weight_g: float | None = None,
    estimated_volume_ml: float | None = None,
) -> dict:
    """음식별 사진 추정 열량을 별도 출처로 표기한다."""
    return {
        "primary": name,
        "alternatives": alternatives or [],
        "confidence_score": confidence,
        "suggested_food_id": None,
        "estimated_quantity": estimated_quantity,
        "estimated_weight_g": estimated_weight_g,
        "estimated_volume_ml": estimated_volume_ml,
        "estimated_calories_kcal": vision_calories_kcal,
        "calorie_estimate_source": "vision" if vision_calories_kcal is not None else None,
        "calorie_reference_food_id": None,
        "vision_estimated_calories_kcal": vision_calories_kcal,
        "db_reference_calories_kcal": None,
        "db_reference_food_id": None,
        "db_reference_food_ids": [],
        "calorie_estimate_difference_pct": None,
        "calorie_estimate_conflict": False,
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


def _vision_estimates_for(
    name: str, vision_menus: list[FoodMenu]
) -> tuple[float | None, float | None, float | None, float | None]:
    """같은 대표 메뉴명에만 사진 인분·중량·부피·열량 추정값을 연결한다."""
    key = normalize_food_name(name)
    for menu in vision_menus:
        if normalize_food_name(menu.primary) == key:
            return (menu.estimated_quantity, menu.estimated_calories_kcal,
                    menu.estimated_weight_g, menu.estimated_volume_ml)
    return None, None, None, None


def _db_reference_calories(
    match: dict, quantity: float | None,
    weight_g: float | None = None,
    volume_ml: float | None = None,
    *, allow_large_reference: bool = False,
) -> float | None:
    """해당 음식의 식품영양성분표를 사진 추정량에 적용한다.

    사진의 g/mL 추정이 있으면 100g/100mL당 열량을 먼저 적용한다.
    그렇지 않으면 DB 제공량과 AI 추정 인분 수를 참고한다.
    g와 mL는 임의로 서로 환산하지 않는다.
    """
    try:
        food = FoodOption.model_validate(match)
        if food.servingSize is None or food.caloriesKcal is None:
            return None
        unit = str(food.servingUnit or "").strip().lower()
        if weight_g is not None and unit == "g":
            return _calculate_nutrients_by_amount(food, Decimal(str(weight_g)))
        if volume_ml is not None and unit == "ml":
            return _calculate_nutrients_by_amount(food, Decimal(str(volume_ml)))
        if quantity is None:
            return None
        # 연관 제품의 밀키트/대형 묶음 제공량을 1인분으로 사용하지 않는다.
        if (not allow_large_reference and food.referenceServingSize is not None
                and food.referenceServingSize > 600):
            return None
        if (food.referenceServingSize is not None and
                food.referenceServingSize > 1500):
            return None
        return _calculate_nutrients(food, Decimal(str(quantity)))["calories_kcal"]
    except (ValueError, TypeError, ArithmeticError):
        return None


def _calculate_nutrients_by_amount(food: FoodOption, amount: Decimal) -> float | None:
    if food.servingSize is None or food.caloriesKcal is None:
        return None
    return round(float(food.caloriesKcal * amount / food.servingSize), 2)


def _credible_related(query: str, candidate: dict) -> bool:
    """특정 요리의 비교 대상으로만 유사 제품 열량을 허용한다."""
    from services.food_vision import normalize_food_name
    key = normalize_food_name(query)
    if key in GENERIC_DISHES_WITHOUT_DB_REFERENCE:
        return False
    score = _candidate_score(query, candidate)
    if score is None or score < 80:
        return False
    expected_category = _CATEGORY_HINTS.get(key)
    actual_category = candidate.get("category")
    if expected_category and actual_category and expected_category != actual_category:
        return False
    return True


def _reference_from_matches(
    query: str, result: dict, food: dict,
) -> tuple[float | None, str | None, list[int]]:
    """중복 정확 일치는 열량 중위값으로 비교하고, ID를 임의 확정하지 않는다."""
    amounts = (food["estimated_quantity"], food["estimated_weight_g"],
               food["estimated_volume_ml"])
    exact = result.get("exact_matches") or []
    if exact:
        observations = []
        for entry in exact:
            kcal = _db_reference_calories(entry, *amounts, allow_large_reference=True)
            if kcal is not None:
                observations.append((kcal, entry.get("foodId")))
        if not observations:
            return None, None, []
        kcal = round(float(median(x[0] for x in observations)), 2)
        ids = [x[1] for x in observations if x[1] is not None]
        return kcal, ("db_exact" if len(observations) == 1 else "db_exact_group"), ids
    for entry in result.get("related_matches") or []:
        if not _credible_related(query, entry):
            continue
        kcal = _db_reference_calories(entry, *amounts)
        if kcal is not None:
            return kcal, "db_related_reference", [entry["foodId"]] if entry.get("foodId") is not None else []
    return None, None, []


def _resolve_calorie_reference(
    food: dict, match_map: dict[str, dict]
) -> tuple[float | None, str | None, list[int]]:
    """대표 음식 우선. 대체 후보는 미리 지정된 동일 음식 동의어만 허용."""
    key = normalize_food_name(food["primary"])
    primary = match_map.get(key)
    if primary is not None:
        kcal, source, ids = _reference_from_matches(food["primary"], primary, food)
        if kcal is not None:
            return kcal, source, ids
    for alias in food["alternatives"]:
        if normalize_food_name(alias) not in SAFE_DB_ALIASES.get(key, set()):
            continue
        result = match_map.get(normalize_food_name(alias))
        if result is None:
            continue
        kcal, _, ids = _reference_from_matches(alias, result, food)
        if kcal is not None:
            return kcal, "db_alias_reference", ids
    return None, None, []


@router.post(
    "/food-analyses",
    summary="YOLO + LLM 음식 분석 및 Spring DB 검색 (개발용)",
)
async def analyze_food_preview(
    file: UploadFile = File(...),
    include_alternatives: bool = Query(
        True,
        description="YOLO 신뢰도가 높아도 LLM 대체 후보 생성",
    ),
    match_db: bool = Query(
        True,
        description="Spring Boot 음식 DB에서 음식명 검색",
    ),
    estimate_portions: bool = Query(
        True,
        description="사진의 대략적 인분 수 및 열량 추정(기본 활성). 실제 섭취량은 사용자 확인",
    ),
    authorization: str | None = Header(
        default=None,
        description="Spring 음식 API 호출 시 전달할 선택적 Bearer 토큰",
    ),
):
    """사진 한 장만 보내면 음식 인식·DB 대조·예상 열량을 기본 수행한다."""

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
        or estimate_portions
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
                menu.estimated_quantity,
                menu.estimated_calories_kcal,
                menu.estimated_weight_g,
                menu.estimated_volume_ml,
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

            (vision_quantity, vision_calories,
             vision_weight, vision_volume) = _vision_estimates_for(item["name"], vision_menus)
            foods.append(
                _menu_item(
                    item["name"], item["confidence"], alternatives,
                    vision_quantity, vision_calories, vision_weight, vision_volume,
                )
            )

        # YOLO는 대표 음식에 강점이 있지만 반찬/음료를 누락할 수 있다.
        # 단일 YOLO 메뉴와 Gemini의 첫 메뉴는 같은 음식일 수 있으므로 중복 추가하지 않는다.
        covered = {normalize_food_name(item["name"]) for item in yolo_items}
        covered.update(normalize_food_name(alt)
                       for entry in foods for alt in entry["alternatives"])
        if len(yolo_items) == 1 and vision_menus:
            covered.add(normalize_food_name(vision_menus[0].primary))
        for menu in vision_menus:
            if normalize_food_name(menu.primary) in covered:
                continue
            foods.append(_menu_item(
                menu.primary, None, menu.alternatives, menu.estimated_quantity,
                menu.estimated_calories_kcal, menu.estimated_weight_g,
                menu.estimated_volume_ml,
            ))
            covered.add(normalize_food_name(menu.primary))

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

        # 음식 선택과 열량 참고는 분리한다. 중복 정확 일치는 중위값으로 교차 검증.
        for food in foods:
            result = match_map.get(normalize_food_name(food["primary"]))
            if result is not None:
                food["suggested_food_id"] = result.get("suggested_food_id")
            db_calories, estimate_source, reference_ids = _resolve_calorie_reference(food, match_map)
            if db_calories is None:
                continue
            food["db_reference_calories_kcal"] = db_calories
            food["db_reference_food_ids"] = reference_ids
            food["db_reference_food_id"] = reference_ids[0] if len(reference_ids) == 1 else None
            vision_calories = food["vision_estimated_calories_kcal"]
            if vision_calories is not None:
                difference_ratio = abs(db_calories - vision_calories) / max(db_calories, vision_calories, 1.0)
                food["calorie_estimate_difference_pct"] = round(difference_ratio * 100, 1)
                if difference_ratio > DB_CALORIE_AGREEMENT_TOLERANCE:
                    food["calorie_estimate_conflict"] = True
                    continue
            food["estimated_calories_kcal"] = db_calories
            food["calorie_estimate_source"] = estimate_source
            food["calorie_reference_food_id"] = (reference_ids[0]
                                                  if len(reference_ids) == 1 else None)

    # 9. 기존 candidates 응답과의 호환성 유지
    candidates = [
        {
            "candidate_food_name": food["primary"],
            "confidence_score": food["confidence_score"],
            "suggested_food_id": food["suggested_food_id"],
        }
        for food in foods
    ]

    # 음식 하나라도 열량 근거가 없으면 전체 합계를 과장하지 않는다.
    calorie_estimate_complete = bool(foods) and all(
        food["estimated_calories_kcal"] is not None for food in foods
    )
    # 탐지됐지만 실제 합계에 반영되지 않은 음식의 이름을 명시한다.
    omitted_foods = [food["primary"] for food in foods
                     if food["estimated_calories_kcal"] is None]
    if calorie_estimate_complete:
        estimated_total_calories_kcal = round(
            sum(food["estimated_calories_kcal"] for food in foods), 2
        )
    else:
        estimated_total_calories_kcal = None

    # 10. 최종 응답
    return {
        "source": source,
        "status": "review_required" if foods else "no_food_detected",
        "candidates": candidates,
        "foods": foods,
        "estimated_total_calories_kcal": estimated_total_calories_kcal,
        "calorie_estimate_complete": calorie_estimate_complete,
        "calorie_estimate_omitted_foods": omitted_foods,
        "yolo_foods": yolo_names,
        "vision_provider": vision_provider,
        "vision_foods": vision_names,
        "matched": matched,
        "db_match_enabled": match_db,
        "db_matches": db_matches,
        "db_lookup_truncated": db_lookup_truncated,
    }
