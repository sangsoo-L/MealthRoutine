"""음식 사진의 메뉴 단위 인식 및 대체 후보 생성 (OpenAI / Gemini)."""

import base64
import os
import unicodedata
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from PIL import Image
from pydantic import BaseModel, Field


# 기존 밀스루틴의 ai-server/.env를 사용한다.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class FoodMenu(BaseModel):
    """하나의 완성된 음식 또는 독립 반찬과 혼동 가능한 대체 메뉴."""

    primary: str = Field(description="가장 가능성이 높은 음식명")
    alternatives: list[str] = Field(
        default_factory=list,
        description="같은 음식에 대한 다른 예측 후보 (최대 3개)",
    )
    estimated_quantity: float | None = Field(
        default=None,
        ge=0.1,
        le=5.0,
        description=(
            "사진만으로 판단 가능한 경우의 대략적인 인분 수. "
            "크기 비교 기준이 부족하면 null. 정확한 중량이나 실제 섭취량이 아님"
        ),
    )
    estimated_weight_g: float | None = Field(
        default=None, ge=1, le=3000,
        description="사진 속 해당 음식 전체의 대략적인 무게(g). 근거가 부족하면 null",
    )
    estimated_volume_ml: float | None = Field(
        default=None, ge=1, le=3000,
        description="사진 속 해당 액체 음식 전체의 대략적인 부피(mL). 근거가 부족하면 null",
    )
    estimated_calories_kcal: float | None = Field(
        default=None,
        ge=0,
        le=5000,
        allow_inf_nan=False,
        description=(
            "사진에 보이는 해당 메뉴의 전체 양에 대한 대략적인 열량(kcal). "
            "1인분당 열량이 아니라 사진 속 양 전체의 예상치. "
            "중량·당 함량 등이 불명확하여 추정 불가능하면 null"
        ),
    )


class FoodAnalysis(BaseModel):
    foods: list[FoodMenu] = Field(
        description="사진에 보이는 독립적인 요리와 반찬 목록"
    )


FOOD_MENU_PROMPT = (
    "당신은 한국어 식단 기록을 위한 음식 사진 분석 전문가입니다. "
    "사진에 실제로 보이는 음식만 식단에 기록할 '메뉴 단위'로 식별하세요. "
    "라멘 한 그릇에 들어 있는 차슈, 달걀, 파, 버섯 등의 재료와 토핑은 "
    "별개의 메뉴로 나열하지 마세요. "
    "반면 따로 담긴 밥, 김치, 단무지, 샐러드, 음료 등은 각각 별개 메뉴입니다. "
    "각 메뉴의 primary는 사진에 근거한 가장 유력한 한국어 음식명 1개로 작성하세요. "
    "alternatives에는 해당 메뉴를 잘못 인식했을 때 사용자가 선택할 만한 "
    "외형·재료가 유사한 다른 완성 음식명을 최대 3개 제시하세요. "
    "대체 후보는 해당 메뉴의 재료명이나 토핑명이 아니어야 합니다. "
    "사진으로 구별할 근거가 없으면 지나치게 구체적인 종류를 단정하지 마세요. "
    "후보가 억지스럽다면 alternatives를 빈 배열로 두세요. "
    "estimated_quantity는 사진에 근거한 대략적인 인분 수(0.1~5)를 추정할 때만 작성하세요. "
    "사진만으로 분량을 가늠할 크기 단서가 부족하면 반드시 null로 두세요. "
    "estimated_weight_g는 사진 속 고형/반고형 음식의 총 중량(g), "
    "estimated_volume_ml는 음료 등 액체 음식의 총 부피(mL)입니다. "
    "접시·컵 크기처럼 판단 근거가 있는 경우에만 대략값을 추정하고, "
    "중량/부피를 판단할 수 없으면 반드시 null로 두세요. "
    "국물이 포함된 음식의 중량을 식재료만의 중량으로 착각하지 마세요. "
    "인분 수를 무게나 부피로 기계적으로 변환하지 마세요. "
    "실제로 먹은 양이나 정확한 g 중량을 확인했다고 주장하지 마세요. "
    "estimated_calories_kcal는 사진 속 해당 음식/음료의 보이는 양 **전체**에 대한 kcal 예상치입니다. "
    "1인분당 열량이 아닌 사진 속 총량의 열량을 반환하세요. "
    "일반적인 조리법, 접시 크기, 그릇 또는 컵 크기와 통상적인 1회분을 기준으로 합리적인 대략값을 "
    "가능한 한 숫자로 추정하세요. 음식이 여러 개면 메뉴별로 각각 추정하세요. "
    "음료가 보이면 음료 열량도 빠뜨리지 마세요. 제로/무가당 여부를 사진만으로 단정하지 마세요. "
    "사진만으로 판단할 수 없는 특수 음식이나 양이 전혀 구분되지 않는 경우에만 null을 반환하세요. "
    "열량은 사진만으로 확정할 수 없으므로 정확한 계산값처럼 주장하지 마세요. "
    "동일 음식은 중복 나열하지 말고, 음식이 보이지 않으면 foods를 빈 배열로 반환하세요. "
    "각 항목에 primary, alternatives, estimated_quantity, estimated_weight_g, "
    "estimated_volume_ml, estimated_calories_kcal를 포함하세요."
)

EXCLUDED_NAMES = {"00000000", "test1", "test3", "spoon"}
MAX_MENUS = 10
MAX_ALTERNATIVES = 3
MAX_IMAGE_PIXELS = 20_000_000


def normalize_food_name(name: str) -> str:
    """유니코드·공백·대소문자를 통일해 음식명 비교에 사용한다."""
    return "".join(unicodedata.normalize("NFC", name).split()).casefold()


def unique_food_names(names: list[str]) -> list[str]:
    """입력 순서를 유지하며 빈 문자열과 중복 음식을 제거한다."""
    result: list[str] = []
    seen: set[str] = set()
    excluded = {normalize_food_name(name) for name in EXCLUDED_NAMES}

    for raw in names:
        name = str(raw).strip()
        key = normalize_food_name(name)
        if not key or key in seen or key in excluded:
            continue
        seen.add(key)
        result.append(name)

    return result


def clean_food_menus(menus: list[FoodMenu]) -> list[FoodMenu]:
    """LLM 반환값을 메뉴 단위로 중복 제거하고 후보 수를 제한한다."""
    primaries = unique_food_names([menu.primary for menu in menus])[:MAX_MENUS]
    primary_keys = {normalize_food_name(name) for name in primaries}

    result: list[FoodMenu] = []
    used: set[str] = set()
    for menu in menus:
        primary = menu.primary.strip()
        key = normalize_food_name(primary)
        if key not in primary_keys or key in used:
            continue
        used.add(key)

        alternatives = [
            name
            for name in unique_food_names(menu.alternatives)
            if normalize_food_name(name) not in primary_keys
        ][:MAX_ALTERNATIVES]
        result.append(FoodMenu(
            primary=primary,
            alternatives=alternatives,
            estimated_quantity=menu.estimated_quantity,
            estimated_weight_g=menu.estimated_weight_g,
            estimated_volume_ml=menu.estimated_volume_ml,
            estimated_calories_kcal=menu.estimated_calories_kcal,
        ))
        if len(result) == MAX_MENUS:
            break

    return result


def _image_to_data_url(image_bytes: bytes) -> str:
    """JPG/PNG를 Gemini/OpenAI 호환 JPEG data URL로 변환한다."""
    with Image.open(BytesIO(image_bytes)) as image:
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise ValueError("이미지 해상도가 너무 큽니다.")
        with BytesIO() as buffer:
            image.convert("RGB").save(buffer, format="JPEG", quality=85)
            payload = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{payload}"


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY가 설정되지 않았습니다.")
    return OpenAI(api_key=api_key, timeout=90.0, max_retries=0)


@lru_cache(maxsize=1)
def get_gemini_vision_client() -> OpenAI:
    api_key = os.getenv("LLM_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("LLM_API_KEY가 설정되지 않았습니다.")
    return OpenAI(
        api_key=api_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        timeout=60.0,
        max_retries=0,
    )


def analyze_food_with_openai(image_bytes: bytes) -> list[FoodMenu]:
    """강사님 OpenAI Vision 분석 방식으로 메뉴와 대체 후보를 생성한다."""
    response = get_openai_client().responses.parse(
        model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        instructions=FOOD_MENU_PROMPT,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "사진 속 독립 메뉴별 대표 음식명과 대체 후보를 반환하세요.",
                    },
                    {
                        "type": "input_image",
                        "image_url": _image_to_data_url(image_bytes),
                        "detail": "high",
                    },
                ],
            }
        ],
        text_format=FoodAnalysis,
    )
    if response.output_parsed is None:
        raise ValueError("OpenAI 음식 분석 결과가 비어 있습니다.")
    return clean_food_menus(response.output_parsed.foods)


def analyze_food_with_gemini(image_bytes: bytes) -> list[FoodMenu]:
    """기존 Gemini 키와 OpenAI 호환 API로 이미지 분석한다."""
    model = (
        os.getenv("FOOD_VISION_MODEL", "").strip()
        or os.getenv("LLM_MODEL", "gemini-2.5-flash").strip()
    )
    response = get_gemini_vision_client().beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": FOOD_MENU_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "사진 속 독립 메뉴별 대표 음식명과 대체 후보를 반환하세요.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": _image_to_data_url(image_bytes)},
                    },
                ],
            },
        ],
        response_format=FoodAnalysis,
    )
    if not response.choices or response.choices[0].message.parsed is None:
        raise ValueError("Gemini 음식 분석 결과가 비어 있습니다.")
    return clean_food_menus(response.choices[0].message.parsed.foods)


def analyze_food_with_vision(image_bytes: bytes) -> tuple[str, list[FoodMenu]]:
    """FOOD_VISION_PROVIDER=gemini|openai 설정으로 이미지 모델을 선택한다."""
    provider = os.getenv("FOOD_VISION_PROVIDER", "gemini").strip().lower()
    if provider == "gemini":
        return provider, analyze_food_with_gemini(image_bytes)
    if provider == "openai":
        return provider, analyze_food_with_openai(image_bytes)
    raise RuntimeError("FOOD_VISION_PROVIDER는 gemini 또는 openai여야 합니다.")
