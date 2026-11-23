"""Spring Boot 음식 검색 API 연동 및 안전한 음식 후보 정렬.

FastAPI는 Spring의 GET /api/v1/foods를 통해서만 DB를 조회한다.
정확하게 유일한 음식명 외에는 ID를 자동으로 제안하지 않고,
관련성 있는 후보를 우선 정렬해 사용자가 선택하도록 한다.
"""

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from services.food_vision import normalize_food_name, unique_food_names


MAX_DB_LOOKUPS = 12
SEARCH_PAGE_SIZE = 20
MAX_SEARCH_PAGES = 4  # 검색어별 최대 80건. 서버 부하와 대기 시간 제한.
TIMEOUT_SECONDS = 6
MAX_RELATED_MATCHES = 3

# 원본 DB는 '닭볶음(닭갈비)', '스파게티_까르보나라 파스타'처럼
# 음식의 종류가 이름·분류에 함께 들어간다. 잘못된 파생 메뉴를 상위에 두지 않기 위한 힌트.
_CATEGORY_HINTS = {
    "닭갈비": "볶음류",
    "제육볶음": "볶음류",
    "오삼불고기": "볶음류",
    "까르보나라": "면 및 만두류",
    "파스타": "면 및 만두류",
    "크림파스타": "면 및 만두류",
    "투움바파스타": "면 및 만두류",
    "스파게티": "면 및 만두류",
    "김밥": "밥류",
    "볶음밥": "밥류",
    "비빔밥": "밥류",
    "콜라": "음료 및 차류",
    "사이다": "음료 및 차류",
    "김치": "김치류",
    "배추김치": "김치류",
    "쌈장": "장류, 양념류",
    "짬뽕": "면 및 만두류",
    "피자": "빵 및 과자류",
}

# 원래 요리와 다른 완제품(예: 까르보나라 피자, 닭갈비 볶음밥)을 구분한다.
_DIFFERENT_DISH_TYPES = (
    "피자", "볶음밥", "주먹밥", "케이크", "고로케", "크로켓",
    "빙수", "아이스크림", "쿠키", "소스", "드레싱",
)
_TOKEN_SPLIT = re.compile(r"[\s_()\[\]/,·\-]+")


class SpringFoodApiError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _search_foods(name: str, authorization: str | None, page: int = 0) -> list[dict]:
    """Spring 검색 API의 단일 페이지 조회. 한글은 urlencode로 인코딩한다."""
    base_url = os.getenv("SPRING_API_BASE_URL", "http://localhost:8080").rstrip("/")
    params = urlencode({"keyword": name, "page": page, "size": SEARCH_PAGE_SIZE})
    request = Request(
        f"{base_url}/api/v1/foods?{params}",
        headers={"Accept": "application/json", **({"Authorization": authorization} if authorization else {})},
        method="GET",
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise SpringFoodApiError("Spring 음식 API 인증에 실패했습니다.", exc.code) from exc
        raise SpringFoodApiError(f"Spring 음식 API 오류 (HTTP {exc.code})") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise SpringFoodApiError("Spring 음식 API 서버에 연결할 수 없습니다.") from exc
    except (ValueError, UnicodeError) as exc:
        raise SpringFoodApiError("Spring 음식 API 응답을 해석하지 못했습니다.") from exc

    if not isinstance(payload, dict):
        raise SpringFoodApiError("Spring 음식 API의 응답 형식이 올바르지 않습니다.")
    if payload.get("success") is False:
        raise SpringFoodApiError("Spring 음식 검색 요청이 실패했습니다.")

    data = payload.get("data", payload)
    if not isinstance(data, dict):
        raise SpringFoodApiError("음식 검색 결과가 올바르지 않습니다.")
    if "content" not in data:
        raise SpringFoodApiError("음식 검색 응답에 content 필드가 없습니다.")
    content = data["content"]
    if not isinstance(content, list):
        raise SpringFoodApiError("음식 검색 목록이 올바르지 않습니다.")
    return [item for item in content if isinstance(item, dict)]


def _tokens(name: str) -> list[str]:
    return [normalize_food_name(piece) for piece in _TOKEN_SPLIT.split(name) if piece]


def _candidate_score(query: str, food: dict) -> int | None:
    """검색 문자열이 우연히 포함된 무관한 메뉴를 제외하고 음식 적합도를 계산한다.

    예: 콜라→쇼콜라는 토큰이 다르므로 제외하며,
    닭갈비→닭볶음(닭갈비), 까르보나라→스파게티_까르보나라 파스타는 보존.
    숫자 점수는 **정렬용**일 뿐 AI 신뢰도나 영양학적 유사도를 뜻하지 않는다.
    """
    key = normalize_food_name(query)
    food_name = str(food.get("name") or "")
    normalized = normalize_food_name(food_name)
    tokens = _tokens(food_name)
    if not key or not tokens:
        return None

    if normalized == key:
        return 200  # 자동 추천 판단은 resolve_food_names에서 별도 처리
    if key in tokens:
        score = 90
    elif len(key) >= 4 and any(
        "".join(tokens[start:end]) == key
        for start in range(len(tokens))
        for end in range(start + 2, min(len(tokens) + 1, start + 4))
    ):
        # '크림 파스타'처럼 둘 이상의 단어로 나뉘어 있는 음식명.
        score = 80
    elif len(key) >= 4 and any(token.startswith(key) for token in tokens):
        score = 60
    elif len(key) >= 4 and any(token.endswith(key) for token in tokens):
        score = 48
    else:
        # 단순 부분 문자열 검색은 거짓 양성을 많이 만든다.
        # 특히 '콜라'→'쇼콜라/콜라비/콜라겐/피나콜라다'를 허용하지 않는다.
        return None

    expected = _CATEGORY_HINTS.get(key)
    category = str(food.get("category") or "")
    # 김치/쌈장/짬뽕/피자는 음식 종류가 명확하므로 다른 음식의 부재료를 제외.
    if (key in {"김치", "배추김치", "쌈장", "짬뽕", "피자"}
            and expected and category and expected != category):
        return None
    if expected and category:
        score += 35 if category == expected else -45

    # 목표 메뉴에 '볶음밥' 등이 없다면 다른 종류의 파생 음식은 후순위.
    for different in _DIFFERENT_DISH_TYPES:
        if different not in key and different in normalized:
            score -= 35
            break

    # 너무 광범위한 추출 결과는 반환하지 않는다.
    return score if score >= 35 else None


def _collect_food_search(name: str, authorization: str | None) -> tuple[list[dict], bool]:
    """첫 페이지에 덜 적합한 음식만 있을 수 있으므로 최대 4페이지까지 조회."""
    collected: list[dict] = []
    seen: set[str] = set()
    incomplete = False

    for page in range(MAX_SEARCH_PAGES):
        # 첫 호출의 시그니처는 기존 mock 및 외부 사용과 호환되도록 보존.
        foods = _search_foods(name, authorization) if page == 0 else _search_foods(name, authorization, page)
        new_items = 0
        for food in foods:
            identifier = food.get("foodId")
            # 식별자가 없을 경우 JSON 표현으로 중복을 방지한다.
            dedup_key = str(identifier) if identifier is not None else json.dumps(food, ensure_ascii=False, sort_keys=True)
            if dedup_key not in seen:
                seen.add(dedup_key)
                collected.append(food)
                new_items += 1

        # 결과가 20개 미만이면 마지막 페이지다.
        if len(foods) < SEARCH_PAGE_SIZE:
            incomplete = False
            break
        incomplete = True
        if new_items == 0:
            # 테스트 스텁 혹은 서버가 계속 같은 페이지를 반환하는 경우 무한 반복 방지.
            break
    return collected, incomplete


def resolve_food_names(
    names: list[str], authorization: str | None
) -> tuple[list[dict], bool]:
    """음식 후보를 Spring DB와 대조하고 관련성 순서로 반환한다.

    유일한 *정확 일치* 외에는 suggested_food_id를 채우지 않는다.
    related_matches는 사용자 선택용 추천 후보이므로 영양정보를 자동 확정하지 않는다.
    """
    unique_names = unique_food_names(names)
    truncated = len(unique_names) > MAX_DB_LOOKUPS
    search_names = unique_names[:MAX_DB_LOOKUPS]
    results = []

    with ThreadPoolExecutor(max_workers=min(4, len(search_names) or 1)) as pool:
        search_results = list(pool.map(
            lambda name: _collect_food_search(name, authorization),
            search_names,
        ))

    for name, (foods, search_incomplete) in zip(search_names, search_results):
        key = normalize_food_name(name)
        exact_matches = [
            food for food in foods
            if normalize_food_name(str(food.get("name") or "")) == key
        ]
        ranked = []
        for food in foods:
            if normalize_food_name(str(food.get("name") or "")) == key:
                continue
            score = _candidate_score(name, food)
            if score is not None:
                ranked.append((score, food))

        ranked.sort(key=lambda pair: (
            -pair[0],
            len(str(pair[1].get("name") or "")),
            str(pair[1].get("name") or ""),
            str(pair[1].get("foodId") or ""),
        ))
        # 원자료는 같은 음식명이 측정 조건별로 중복된다.
        # 후보 화면에서는 서로 다른 메뉴명을 우선 보여주도록 정리한다.
        related_matches = []
        shown_names: set[tuple[str, str]] = set()
        for _, food in ranked:
            signature = (
                normalize_food_name(str(food.get("name") or "")),
                normalize_food_name(str(food.get("brand") or "")),
            )
            if signature in shown_names:
                continue
            shown_names.add(signature)
            related_matches.append(food)
            if len(related_matches) >= MAX_RELATED_MATCHES:
                break

        suggested_id = None
        if len(exact_matches) == 1 and not search_incomplete:
            suggested_id = exact_matches[0].get("foodId")

        results.append({
            "query": name,
            "suggested_food_id": suggested_id,
            "exact_matches": exact_matches,
            "related_matches": related_matches,
            "search_incomplete": search_incomplete,
        })

    return results, truncated
