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

# 프론트엔드의 음식 종류와 실제 식약처 음식 DB의 분류 및 검색어 연결.
# 각 종류를 선택하면 해당 검색어만 조회한다. 조건에 맞지 않는 음식으로 대체하지 않는다.
# 메뉴명/DB 분류에 의존하므로 원재료 및 알레르기 검증 용도로 사용하면 안 된다.
KIND_SEARCH_TERMS: dict[str, tuple[tuple[str, str, int], ...]] = {
    "밥·죽": (
        ("현미밥", "밥류", 3), ("쌀밥", "밥류", 2),
        ("잡곡밥", "밥류", 3), ("비빔밥", "밥류", 3),
        ("호박죽", "죽 및 스프류", 2),
    ),
    "면류": (
        ("국수", "면 및 만두류", 3), ("우동", "면 및 만두류", 3),
        ("라면", "면 및 만두류", 3), ("칼국수", "면 및 만두류", 3),
        ("냉면", "면 및 만두류", 3), ("짬뽕", "면 및 만두류", 3),
        ("짜장면", "면 및 만두류", 2), ("스파게티", "면 및 만두류", 3),
        ("파스타", "면 및 만두류", 3), ("쫄면", "면 및 만두류", 2),
    ),
    "국·찌개": (
        ("미역국", "국 및 탕류", 3), ("된장국", "국 및 탕류", 3),
        ("김치찌개", "찌개 및 전골류", 3),
        ("된장찌개", "찌개 및 전골류", 3),
        ("순두부찌개", "찌개 및 전골류", 3),
    ),
    "반찬": (
        ("달걀찜", "찜류", 3), ("두부조림", "조림류", 3),
        ("고등어구이", "구이류", 3),
        ("시금치나물", "나물·숙채류", 3),
        ("배추김치", "김치류", 3), ("콩나물무침", "나물·숙채류", 3),
    ),
    "샐러드": (("샐러드", "생채·무침류", 8),),
    "소스·드레싱": (
        ("드레싱", "장류, 양념류", 3),
        ("소스", "장류, 양념류", 3),
        ("고추장", "장류, 양념류", 2),
    ),
    "음료": (
        ("주스", "음료 및 차류", 3),
        ("아메리카노", "음료 및 차류", 3),
        ("우유", "음료 및 차류", 3),
    ),
    "도시락": (("도시락", "밥류", 6),),
    "간식": (("과자", "빵 및 과자류", 3), ("빵", "빵 및 과자류", 3)),
    "유제품": (
        ("요거트", "유제품류 및 빙과류", 3),
        ("치즈", "유제품류 및 빙과류", 3),
        ("우유", "유제품류 및 빙과류", 3),
    ),
    "곡류": (("쌀", "곡류", 4), ("귀리", "곡류", 3)),
    "육류": (("닭", "육류", 3), ("소고기", "육류", 3)),
    "채소": (("당근", "채소류", 3), ("양배추", "채소류", 3)),
    "과일": (("사과", "과일류", 3), ("바나나", "과일류", 3)),
    "수산물": (("연어", "어패류 및 기타 수산물", 3), ("고등어", "어패류 및 기타 수산물", 3)),
}

FOOD_TYPE_KINDS: dict[str, tuple[str, ...]] = {
    "음식·요리": ("밥·죽", "면류", "국·찌개", "반찬", "샐러드", "소스·드레싱", "음료"),
    "가공식품": ("도시락", "간식", "유제품", "소스·드레싱", "음료"),
    "식재료": ("곡류", "육류", "채소", "과일", "수산물"),
}


def matches_food_kind(food: dict, food_type: str | None, kinds: list[str] | None) -> bool:
    """실제 DB category/name이 화면 선택 조건에 부합하는지 보수적으로 확인."""
    requested = kinds or []
    if not requested:
        # 식품 구분만 지정한 경우에도 전혀 다른 종류가 섞이지 않게 한다.
        if food_type is None or food_type == "음식·요리":
            return True  # 기본 큐레이션은 모두 조리된 요리다.
        requested = list(FOOD_TYPE_KINDS[food_type])
    category = str(food.get("category") or "")
    name = normalize_food_name(str(food.get("name") or ""))
    for kind in requested:
        rules = KIND_SEARCH_TERMS.get(kind, ())
        if not any(category == db_cat for _, db_cat, _ in rules):
            continue
        # '면 및 만두류' 전체가 면류인 것은 아니다.
        if kind == "면류" and not any(
            token in name for token in (
                "국수", "우동", "라면", "칼국수", "냉면", "짬뽕",
                "짜장면", "자장면", "스파게티", "파스타", "쫄면", "면",
            )
        ):
            continue
        if kind == "도시락" and "도시락" not in name:
            continue
        if kind == "샐러드" and "샐러드" not in name:
            continue
        if kind == "소스·드레싱" and not any(x in name for x in ("드레싱", "소스", "고추장")):
            continue
        return True
    return False


def search_terms_for(food_type: str | None, kinds: list[str] | None) -> tuple[tuple[str, str, int], ...]:
    if not kinds and (food_type is None or food_type == "음식·요리"):
        return _DIET_SEARCH_TERMS
    selected = kinds or list(FOOD_TYPE_KINDS[food_type])
    return tuple(dict.fromkeys(term for kind in selected for term in KIND_SEARCH_TERMS[kind]))



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


def fetch_diet_candidates(authorization: str | None = None,
                          food_type: str | None = None,
                          food_kinds: list[str] | None = None) -> list[dict]:
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

    search_terms = search_terms_for(food_type, food_kinds)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(search, search_terms))

    available = []
    seen_ids = set()
    errors = []
    for (keyword, category, limit), entries in zip(search_terms, results):
        if isinstance(entries, SpringFoodApiError):
            errors.append(entries)
            continue
        for food in _ranked_foods(keyword, category, entries)[:limit]:
            if not matches_food_kind(food, food_type, food_kinds):
                continue
            if food["foodId"] in seen_ids:
                continue
            seen_ids.add(food["foodId"])
            available.append(food)
            if len(available) >= _MAX_CANDIDATES:
                return available

    if not available:
        if errors and len(errors) == len(search_terms):
            raise errors[0]
        if food_type is not None or food_kinds:
            return []  # 조건 불일치는 422로 안내; 다른 종류 음식으로 대체하지 않음.
        if errors:
            raise errors[0]
        raise SpringFoodApiError("식단 추천용 음식 후보를 찾지 못했습니다.")

    return available
