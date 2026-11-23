"""식단 추천용 음식 후보를 Spring 음식 검색 API에서 자동 구성한다.

클라이언트는 목표 칼로리(및 선택 조건)만 보내도 된다.
Spring Boot의 읽기 전용 검색 API를 사용하며 MySQL에 직접 접속하지 않는다.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal, InvalidOperation

from services.food_vision import normalize_food_name
from services.spring_food_catalog import SpringFoodApiError, _search_foods

logger = logging.getLogger(__name__)

# 검색어와 음식 분류를 함께 제한해 과자나 가공식품이 단순 문자열 때문에 섞이지 않게 한다.
# 항목별 소수의 후보만 채택하여 편중을 줄이고, 응답은 총 50개 이하로 유지한다.
_DIET_SEARCH_TERMS = (
    ("현미밥", "밥류", 3),
    ("쌀밥", "밥류", 2),
    ("잡곡밥", "밥류", 3),
    ("달걀찜", "찜류", 3),
    ("달걀말이", "전·적 및 부침류", 2),
    ("두부조림", "조림류", 3),
    ("고등어구이", "구이류", 3),
    ("연어구이", "구이류", 2),
    ("시금치나물", "나물·숙채류", 3),
    ("콩나물무침", "나물·숙채류", 3),
    ("배추김치", "김치류", 2),
    ("미역국", "국 및 탕류", 3),
    ("된장국", "국 및 탕류", 3),
    ("참외", "과일류", 2),
    ("호박죽", "죽 및 스프류", 2),
    ("샐러드_닭가슴살", "생채·무침류", 2),
)

_MAX_CANDIDATES = 50


def _decimal(value):
    try:
        return Decimal(str(value)) if value is not None else None
    except (ValueError, InvalidOperation):
        return None


def _ranked_foods(query: str, category: str, entries: list[dict]) -> list[dict]:
    key = normalize_food_name(query)
    ranked = []
    for food in entries:
        if not isinstance(food, dict) or food.get("category") != category:
            continue
        name = str(food.get("name") or "")
        normalized = normalize_food_name(name)
        if key not in normalized:
            continue
        food_id = food.get("foodId")
        size = _decimal(food.get("servingSize"))
        calories = _decimal(food.get("caloriesKcal"))
        reference = _decimal(food.get("referenceServingSize"))
        if (not isinstance(food_id, int) or food_id <= 0 or
                size is None or size <= 0 or calories is None or calories <= 0 or
                food.get("servingUnit") not in ("g", "ml")):
            continue
        # 단위당 열량과 제공량이 비정상적인 제품을 자동 추천하지 않는다.
        if reference is not None and not (Decimal("20") <= reference <= Decimal("900")):
            continue
        portion = reference if reference is not None else size
        portion_kcal = calories * portion / size
        if not (Decimal("5") <= portion_kcal <= Decimal("1400")):
            continue

        completeness = sum(food.get(k) is not None for k in (
            "carbohydrateG", "proteinG", "fatG", "sugarG", "sodiumMg"
        ))
        # 메뉴명 정확 일치, 완전한 영양정보, 일반 식품을 우선한다.
        rank = (
            0 if normalized == key else 1,
            0 if not food.get("brand") else 1,
            -completeness,
            abs(len(normalized) - len(key)),
            food_id,
        )
        ranked.append((rank, food))

    ranked.sort(key=lambda item: item[0])
    unique = []
    seen_names = set()
    for _, food in ranked:
        signature = normalize_food_name(str(food["name"]))
        if signature in seen_names:
            continue
        seen_names.add(signature)
        unique.append(food)
    return unique


def fetch_diet_candidates(authorization: str | None = None) -> list[dict]:
    """Spring 검색 결과에서 균형 잡힌 후보를 조회한다 (최대 50건).

    일부 검색어에 결과가 없더라도 나머지 음식을 사용할 수 있지만,
    서버 전체가 조회 불가능하면 오류를 전달한다.
    """
    def search(term):
        keyword, _, _ = term
        try:
            return _search_foods(keyword, authorization)
        except SpringFoodApiError as exc:
            logger.warning("식단 후보 검색 일부 실패: keyword=%s, status=%s", keyword, exc.status_code)
            return exc

    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(search, _DIET_SEARCH_TERMS))

    available = []
    seen_ids = set()
    errors = []
    for (keyword, category, limit), entries in zip(_DIET_SEARCH_TERMS, results):
        if isinstance(entries, SpringFoodApiError):
            errors.append(entries)
            continue
        for food in _ranked_foods(keyword, category, entries)[:limit]:
            if food["foodId"] in seen_ids:
                continue
            seen_ids.add(food["foodId"])
            available.append(food)
            if len(available) >= _MAX_CANDIDATES:
                return available

    if not available:
        if errors:
            raise errors[0]
        raise SpringFoodApiError("식단 추천용 음식 후보를 찾지 못했습니다.")

    return available
