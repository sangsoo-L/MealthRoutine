
"""Spring Boot 음식 검색 API 연동.

FastAPI에서 MySQL에 직접 연결하지 않고 Spring Boot의
GET /api/v1/foods API를 사용한다.

JWT는 Spring이 FastAPI에 전달한 Authorization 헤더를
Spring 음식 API 요청에만 재사용한다.
"""

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from services.food_vision import normalize_food_name, unique_food_names


MAX_DB_LOOKUPS = 12
SEARCH_PAGE_SIZE = 20
TIMEOUT_SECONDS = 6


class SpringFoodApiError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _search_foods(
    name: str,
    authorization: str | None,
) -> list[dict]:
    base_url = os.getenv(
        "SPRING_API_BASE_URL",
        "http://localhost:8080",
    ).rstrip("/")

    params = urlencode({
        "keyword": name,
        "page": 0,
        "size": SEARCH_PAGE_SIZE,
    })

    url = f"{base_url}/api/v1/foods?{params}"

    headers = {"Accept": "application/json"}

    if authorization:
        headers["Authorization"] = authorization

    request = Request(
        url,
        headers=headers,
        method="GET",
    )

    # 아래의 기존 try/except 및 응답 처리 코드는 유지

    try:
        with urlopen(
            request, timeout=TIMEOUT_SECONDS
        ) as response:
            payload = json.load(response)

    except HTTPError as exc:
        if exc.code in (401, 403):
            raise SpringFoodApiError(
                "Spring 음식 API 인증에 실패했습니다.",
                exc.code,
            ) from exc

        raise SpringFoodApiError(
            f"Spring 음식 API 오류 (HTTP {exc.code})"
        ) from exc

    except (URLError, TimeoutError, OSError) as exc:
        raise SpringFoodApiError(
            "Spring 음식 API 서버에 연결할 수 없습니다."
        ) from exc

    except (ValueError, UnicodeError) as exc:
        raise SpringFoodApiError(
            "Spring 음식 API 응답을 해석하지 못했습니다."
        ) from exc

    if not isinstance(payload, dict):
        raise SpringFoodApiError(
            "Spring 음식 API의 응답 형식이 올바르지 않습니다."
        )

    if payload.get("success") is False:
        raise SpringFoodApiError(
            "Spring 음식 검색 요청이 실패했습니다."
        )

    # 공통 응답 {success, message, data, errorCode} 지원
    # data 없이 페이지 객체를 직접 반환하는 방식도 지원
    data = payload.get("data", payload)

    if not isinstance(data, dict):
        raise SpringFoodApiError(
            "음식 검색 결과가 올바르지 않습니다."
        )

    content = data.get("content", [])

    if not isinstance(content, list):
        raise SpringFoodApiError(
            "음식 검색 목록이 올바르지 않습니다."
        )

    return [
        item for item in content
        if isinstance(item, dict)
    ]


def resolve_food_names(
    names: list[str],
    authorization: str | None,
) -> tuple[list[dict], bool]:
    """AI 음식명을 실제 Spring DB 음식과 대조한다.

    정확히 이름이 일치하는 음식과 검색 관련 음식을 구분한다.
    DB의 음식 ID를 추측해서 만들지 않는다.
    """

    unique_names = unique_food_names(names)
    truncated = len(unique_names) > MAX_DB_LOOKUPS
    results = []

    for name in unique_names[:MAX_DB_LOOKUPS]:
        foods = _search_foods(name, authorization)
        key = normalize_food_name(name)

        exact_matches = [
            food for food in foods
            if normalize_food_name(
                str(food.get("name") or "")
            ) == key
        ]

        related_matches = [
            food for food in foods
            if normalize_food_name(
                str(food.get("name") or "")
            ) != key
        ][:3]

        # 동일한 이름이라도 브랜드별로 여러 종류가 있을 수 있음
        # 하나의 음식만 정확히 일치할 때 자동 ID 제안
        suggested_id = None

        if len(exact_matches) == 1:
            suggested_id = exact_matches[0].get("foodId")

        results.append({
            "query": name,
            "suggested_food_id": suggested_id,
            "exact_matches": exact_matches,
            "related_matches": related_matches,
        })

    return results, truncated
