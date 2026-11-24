
"""목표 열량 기반 AI 식단 추천. Spring 음식 DB 후보 자동 조회 지원.

POST /internal/ai/diet-recommendations/from-foods

Spring Boot 음식 검색 API로 실제 음식 후보를 자동 조회한다.
기존처럼 Spring Boot가 조회한 후보를 요청에 함께 실어도 된다.
FastAPI는 음식 ID 검증과 예상 영양정보 계산을 담당한다.
실제 저장과 최종 계산은 Spring Boot가 수행한다.
"""

import json
import logging
import os
from time import sleep
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from openai import InternalServerError, OpenAIError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from services.diet_food_catalog import fetch_diet_candidates, FOOD_TYPE_KINDS, matches_food_kind
from services.spring_food_catalog import SpringFoodApiError
from services.food_vision import (
    get_gemini_vision_client,
    normalize_food_name,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/internal/ai/diet-recommendations",
    tags=["AI Diet Recommendations"],
)

MealType = Literal[
    "breakfast",
    "lunch",
    "dinner",
    "snack",
]


class FoodOption(BaseModel):
    """Spring FoodResponse 기반 음식 정보."""

    foodId: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = None
    category: str | None = None

    servingSize: Decimal | None = Field(
        default=None, gt=0
    )
    servingUnit: str | None = None
    referenceServingSize: Decimal | None = Field(
        default=None, gt=0
    )

    caloriesKcal: Decimal | None = Field(
        default=None, ge=0
    )
    carbohydrateG: Decimal | None = Field(
        default=None, ge=0
    )
    proteinG: Decimal | None = Field(
        default=None, ge=0
    )
    fatG: Decimal | None = Field(
        default=None, ge=0
    )
    sugarG: Decimal | None = Field(
        default=None, ge=0
    )
    sodiumMg: Decimal | None = Field(
        default=None, ge=0
    )

    # 현재 Spring FoodResponse에는 없는 확장 필드.
    # 검증된 원재료 정보가 없으면 반드시 null로 유지.
    allergens: list[str] | None = None
    # DB 출처에서 원재료/알레르겐 표기를 충분히 검증한 경우에만 True.
    allergens_verified: bool = False


class UserDietContext(BaseModel):
    """선택적 개인화 정보. 최종 목표 열량 산출·검증은 Spring의 책임."""

    bmr_kcal: Decimal | None = Field(default=None, gt=0, le=5000)
    current_weight_kg: Decimal | None = Field(default=None, gt=0, le=500)
    target_weight_kg: Decimal | None = Field(default=None, gt=0, le=500)
    goal: Literal["weight_loss", "weight_gain", "maintenance", "fitness"] | None = None


class CatalogDietRequest(BaseModel):
    target_calories_kcal: Decimal = Field(gt=0, le=8000)

    meal_types: list[MealType] = Field(
        default_factory=lambda: [
            "breakfast",
            "lunch",
            "dinner",
        ],
        min_length=1,
        max_length=4,
    )

    available_foods: list[FoodOption] | None = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="생략하면 Spring 음식 DB에서 후보를 자동 조회합니다. 기존 수동 후보 전달도 지원합니다.",
    )

    allergies: list[str] = Field(
        default_factory=list,
        max_length=20,
    )

    preferences: str = Field(
        default="",
        max_length=500,
    )

    user_context: UserDietContext | None = None

    excluded_food_ids: list[int] = Field(
        default_factory=list,
        max_length=50,
    )

    # 실제 후보 검색과 결과 검증에 강제 적용한다. 선호 문구에만 넣지 않는다.
    food_type: Literal["음식·요리", "가공식품", "식재료"] | None = None
    food_kinds: list[Literal[
        "밥·죽", "면류", "국·찌개", "반찬", "샐러드", "소스·드레싱", "음료",
        "도시락", "간식", "유제품", "곡류", "육류", "채소", "과일", "수산물",
    ]] = Field(default_factory=list, max_length=15)

    # 기호상 피할 넓은 음식 범주. *메뉴명 기준*으로만 후보에서 제외한다.
    # 원재료·알레르기 검증과는 별개다.
    excluded_food_groups: list[Literal[
        "chicken", "beef", "pork", "fish", "seafood",
        "egg", "dairy", "coffee", "mushroom",
    ]] = Field(default_factory=list, max_length=9)


class DraftFoodItem(BaseModel):
    food_id: int = Field(gt=0)
    quantity: float = Field(ge=0.1, le=5.0)


class DraftMeal(BaseModel):
    meal_type: MealType
    items: list[DraftFoodItem] = Field(
        min_length=1,
        max_length=8,
    )
    reason: str = Field(max_length=300)


class DraftDietPlan(BaseModel):
    meals: list[DraftMeal] = Field(
        min_length=1,
        max_length=4,
    )
    summary: str = Field(max_length=500)


NUTRIENTS = {
    "caloriesKcal": "calories_kcal",
    "carbohydrateG": "carbohydrate_g",
    "proteinG": "protein_g",
    "fatG": "fat_g",
    "sugarG": "sugar_g",
    "sodiumMg": "sodium_mg",
}

CALORIE_TOLERANCE = Decimal("0.20")
GEMINI_SERVER_RETRIES = 2  # 최초 1회 + 일시적 5xx에만 추가 최대 2회

# 메뉴명 기반 *기호* 제외 그룹. 알레르겐/원재료 검증이 아니며,
# 표기되지 않은 육수·소스·교차접촉 등은 판별할 수 없다.
FOOD_EXCLUSION_WORDS: dict[str, tuple[str, ...]] = {
    "chicken": ("닭", "치킨", "삼계탕", "백숙", "닭가슴", "계육"),
    "beef": ("소고기", "쇠고기", "한우", "우육", "차돌", "육회", "불고기", "갈비탕"),
    "pork": ("돼지", "돈육", "제육", "삼겹", "목살", "돈가스", "돈까스", "족발", "보쌈"),
    "fish": ("고등어", "연어", "참치", "삼치", "갈치", "꽁치", "명태", "대구", "조기", "멸치", "생선", "장어"),
    "seafood": ("해물", "해산물", "새우", "오징어", "문어", "낙지", "홍합", "조개", "바지락", "게살", "꽃게", "굴", "전복"),
    "egg": ("달걀", "계란", "오믈렛", "스크램블", "에그"),
    "dairy": ("우유", "치즈", "요거트", "요구르트", "버터", "크림", "라떼", "라테"),
    "coffee": ("커피", "아메리카노", "에스프레소", "카푸치노", "콜드브루", "카페라떼", "카페라테", "카페모카", "마키아토"),
    "mushroom": ("버섯", "표고", "느타리", "팽이", "양송이", "새송이"),
}


def _excluded_by_menu_name(name: str, groups: list[str]) -> bool:
    """이름에 명시된 재료·메뉴만 제외한다 (알레르기 안전 필터가 아님)."""
    normalized = normalize_food_name(name)
    return any(
        normalize_food_name(word) in normalized
        for group in groups
        for word in FOOD_EXCLUSION_WORDS[group]
    )



def _round2(value: Decimal) -> float:
    return float(
        value.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
    )


def _calculate_nutrients(
    food: FoodOption,
    quantity: Decimal,
) -> dict:
    """Spring과 동일하게 1인분 기준량으로 계산."""

    result = {
        output: None
        for output in NUTRIENTS.values()
    }

    if food.servingSize is None:
        return result

    portion = (
        food.referenceServingSize
        if food.referenceServingSize is not None
        else food.servingSize
    )

    ratio = (
        (portion * quantity) / food.servingSize
    ).quantize(
        Decimal("0.0001"),
        rounding=ROUND_HALF_UP,
    )

    for source, output in NUTRIENTS.items():
        value = getattr(food, source)

        if value is not None:
            result[output] = _round2(value * ratio)

    return result


def _sum_known(
    values: list[float | None],
) -> float | None:
    if any(value is None for value in values):
        return None

    total = sum(
        (Decimal(str(value)) for value in values),
        Decimal("0"),
    )
    return _round2(total)


def _filter_candidates(
    request: CatalogDietRequest,
) -> list[FoodOption]:
    """제외 음식과 알레르기 검증 불가능한 후보 제거."""

    excluded = set(request.excluded_food_ids)

    candidates = [
        food
        for food in (request.available_foods or [])
        if food.foodId not in excluded
        and matches_food_kind(food.model_dump(), request.food_type, request.food_kinds)
        and not _excluded_by_menu_name(food.name, request.excluded_food_groups)
    ]

    if not request.allergies:
        return candidates

    requested_allergens = {
        normalize_food_name(name)
        for name in request.allergies
        if name.strip()
    }

    safe_candidates = []

    for food in candidates:
        # 미확인 원재료는 안전한 음식으로 취급하지 않는다.
        if food.allergens is None or not food.allergens_verified:
            continue

        food_allergens = {
            normalize_food_name(name)
            for name in food.allergens
        }

        if requested_allergens.isdisjoint(food_allergens):
            safe_candidates.append(food)

    return safe_candidates


def _generate(
    req: CatalogDietRequest,
    candidates: list[FoodOption],
) -> dict:
    """Gemini로 추천 후 실제 음식 ID와 영양소 검증."""

    catalog = {
        food.foodId: food
        for food in candidates
    }

    prompt_foods = []

    for food in candidates:
        one_serving = _calculate_nutrients(
            food,
            Decimal("1"),
        )

        prompt_foods.append({
            "food_id": food.foodId,
            "name": food.name,
            "brand": food.brand,
            "one_serving_nutrients": one_serving,
        })

    instructions = (
        "당신은 한국어 식단 계획 AI입니다. "
        "반드시 제공된 음식 후보만 사용하세요. "
        "목록에 없는 음식과 food_id를 만들지 마세요. "
        "food_id는 반드시 정수로 반환하세요. "
        "식사별 quantity는 0.1~5인분입니다. "
        "목표 열량은 요청된 전체 끼니의 합계입니다. "
        "가능한 한 목표 열량 ±15% 범위에 맞추세요. "
        "단, 열량을 맞추기 위해 부자연스럽게 "
        "과도한 인분을 추천하지 마세요. "
        "사용자의 음식 기호, 목표 체중, 체중 관리 목적, 기초대사량 정보가 있으면 고려하세요. "
        "하지만 최종 target_calories_kcal은 서버에서 정한 기준이므로 임의 변경하지 마세요. "
        "영양정보가 누락되었다면 수치를 만들지 마세요. "
        "요청된 meal_type을 각각 정확히 한 번 사용하세요. "
        "같은 끼니에 동일한 food_id를 중복 사용하지 마세요. "
        "의학적 진단이나 치료 목적의 식단을 제시하지 마세요. "
        "추천 이유는 간결한 한국어로 작성하세요."
    )

    user_content = json.dumps(
        {
            "target_calories_kcal": str(
                req.target_calories_kcal
            ),
            "meal_types": req.meal_types,
            "preferences": req.preferences,
            "user_context": (
                req.user_context.model_dump(mode="json")
                if req.user_context is not None else None
            ),
            "available_foods": prompt_foods,
        },
        ensure_ascii=False,
    )

    model = (
        os.getenv("LLM_MODEL", "").strip()
        or "gemini-2.5-flash"
    )

    # Gemini의 간헐적인 InternalServerError(HTTP 5xx)만 재시도한다.
    # 잘못된 입력/응답 검증 오류/429 등은 여기서 재시도하지 않는다.
    # _generate는 threadpool에서 실행되므로 짧은 sleep도 이벤트 루프를 막지 않는다.
    client = get_gemini_vision_client()
    for attempt in range(GEMINI_SERVER_RETRIES + 1):
        try:
            response = client.beta.chat.completions.parse(
                model=model,
                messages=[
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": user_content},
                ],
                response_format=DraftDietPlan,
            )
            break
        except InternalServerError as exc:
            if attempt == GEMINI_SERVER_RETRIES:
                raise
            delay = 0.5 * (2 ** attempt)  # 0.5초, 1초
            logger.warning(
                "식단 추천 Gemini 서버 오류(%s). %d/%d회 재시도 (%.1f초 후)",
                type(exc).__name__, attempt + 1, GEMINI_SERVER_RETRIES, delay,
            )
            sleep(delay)

    if (
        not response.choices
        or response.choices[0].message.parsed is None
    ):
        raise ValueError("AI 추천 결과가 비어 있습니다.")

    draft = response.choices[0].message.parsed

    expected = set(req.meal_types)
    actual = [
        meal.meal_type
        for meal in draft.meals
    ]

    if (
        len(actual) != len(set(actual))
        or set(actual) != expected
    ):
        raise ValueError(
            "AI가 요청된 끼니 구성을 지키지 않았습니다."
        )

    meals = []

    for meal in draft.meals:
        selected = []
        seen_ids = set()

        for item in meal.items:
            if item.food_id not in catalog:
                raise ValueError(
                    "AI가 존재하지 않는 food_id를 반환했습니다."
                )

            if item.food_id in seen_ids:
                raise ValueError(
                    "AI가 동일한 음식을 중복 선택했습니다."
                )

            seen_ids.add(item.food_id)

            food = catalog[item.food_id]
            quantity = Decimal(str(item.quantity))

            nutrients = _calculate_nutrients(
                food,
                quantity,
            )

            selected.append({
                "food_id": food.foodId,
                "food_name": food.name,
                "quantity": float(quantity),
                "nutrients": nutrients,
            })

        meal_totals = {
            f"estimated_{nutrient}": _sum_known([
                item["nutrients"][nutrient] for item in selected
            ])
            for nutrient in NUTRIENTS.values()
        }

        meals.append({
            "meal_type": meal.meal_type,
            "foods": selected,
            **meal_totals,
            "reason": meal.reason,
        })

    total_calories = _sum_known([
        meal["estimated_calories_kcal"]
        for meal in meals
    ])

    calorie_target_met = None
    calorie_deviation_percent = None

    warnings = [
        "영양정보는 미리보기이며, "
        "저장 시 Spring Boot에서 다시 계산해야 합니다."
    ]

    if total_calories is not None:
        target = req.target_calories_kcal
        actual_total = Decimal(str(total_calories))

        deviation = abs(actual_total - target) / target

        calorie_deviation_percent = _round2(
            deviation * Decimal("100")
        )

        calorie_target_met = (
            deviation <= CALORIE_TOLERANCE
        )

        if not calorie_target_met:
            warnings.append(
                "추천 식단의 열량이 목표에서 20% 이상 "
                "벗어났습니다. 음식과 인분 수를 확인하세요."
            )
    else:
        warnings.append(
            "일부 음식의 영양정보가 누락되어 "
            "총열량을 계산할 수 없습니다."
        )

    if req.excluded_food_groups:
        warnings.append(
            "선택한 음식 종류는 메뉴명에 나타난 경우에만 제외했습니다. "
            "원재료·육수·소스·알레르겐까지 보장하지 않습니다."
        )

    if req.allergies:
        warnings.append(
            "검증됐다고 명시된 알레르겐 정보로만 후보를 거른 결과입니다. "
            "원재료 표기, 동의어 및 교차 접촉 여부는 사용자가 확인해야 합니다."
        )

    # LLM의 요약이 실제 수치와 모순될 수 있으므로 서버 계산 결과를 우선한다.
    summary = draft.summary
    if calorie_target_met is False:
        summary = (
            f"추천 식단 예상 열량은 {total_calories}kcal이며, "
            f"목표 {req.target_calories_kcal}kcal와 "
            f"{calorie_deviation_percent}% 차이가 있습니다. "
            "음식 구성과 인분 수를 확인해 주세요."
        )
    elif calorie_target_met is None:
        summary = "영양정보가 부족하여 목표 열량 적합성을 판단할 수 없습니다."

    return {
        "status": "generated",
        "source": "gemini",
        "model": model,
        "target_calories_kcal": float(
            req.target_calories_kcal
        ),
        "estimated_total_calories_kcal": total_calories,
        "calorie_target_met": calorie_target_met,
        "calorie_deviation_percent": calorie_deviation_percent,
        "meals": meals,
        "summary": summary,
        "warnings": warnings,
    }


@router.post(
    "/from-foods",
    summary="실제 음식 DB 후보 기반 AI 식단 추천",
)
async def recommend_from_foods(
    request: CatalogDietRequest,
    authorization: str | None = Header(default=None),
):
    if len(set(request.meal_types)) != len(
        request.meal_types
    ):
        raise HTTPException(
            422,
            "meal_types에 중복된 끼니가 있습니다.",
        )

    if request.food_type and request.food_kinds and any(
        kind not in FOOD_TYPE_KINDS[request.food_type]
        for kind in request.food_kinds
    ):
        raise HTTPException(422, "식품 구분과 음식 종류 선택이 일치하지 않습니다.")

    if request.available_foods is None:
        try:
            if request.food_type is not None or request.food_kinds:
                retrieved = await run_in_threadpool(
                    fetch_diet_candidates, authorization, request.food_type, request.food_kinds
                )
            else:
                retrieved = await run_in_threadpool(fetch_diet_candidates, authorization)
            request = request.model_copy(update={
                "available_foods": [FoodOption.model_validate(item) for item in retrieved],
            })
        except SpringFoodApiError as exc:
            raise HTTPException(
                exc.status_code if exc.status_code in (401, 403) else 502,
                "식단 추천용 음식 DB 후보를 조회할 수 없습니다.",
            ) from exc
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                502, "Spring 음식 DB 응답 형식이 올바르지 않습니다."
            ) from exc

    food_ids = [
        food.foodId
        for food in request.available_foods
    ]

    if len(food_ids) != len(set(food_ids)):
        raise HTTPException(
            422,
            "available_foods에 중복된 foodId가 있습니다.",
        )

    candidates = _filter_candidates(request)

    if not candidates:
        if request.allergies:
            raise HTTPException(
                422,
                "알레르겐 원재료 정보가 검증된 추천 가능 음식이 "
                "없습니다. Spring에서 검증된 후보를 "
                "전달해야 합니다.",
            )

        raise HTTPException(
            422,
            "선택한 음식 종류와 제외 조건에 맞는 추천 후보가 없습니다. 조건을 변경해 주세요.",
        )

    try:
        return await run_in_threadpool(
            _generate,
            request,
            candidates,
        )

    except RuntimeError as exc:
        logger.error(
            "식단 추천 모델 설정 오류: %s",
            type(exc).__name__,
        )
        raise HTTPException(
            503,
            "AI 식단 추천 설정을 확인해야 합니다.",
        ) from exc

    except OpenAIError as exc:
        logger.warning(
            "식단 추천 LLM 호출 실패: %s",
            type(exc).__name__,
        )
        raise HTTPException(
            502,
            "외부 AI 식단 추천 호출에 실패했습니다.",
        ) from exc

    except (ValueError, TypeError) as exc:
        logger.warning(
            "AI 식단 추천 검증 실패: %s",
            type(exc).__name__,
        )
        raise HTTPException(
            502,
            "AI 추천 결과가 음식 DB 조건에 맞지 않습니다.",
        ) from exc
