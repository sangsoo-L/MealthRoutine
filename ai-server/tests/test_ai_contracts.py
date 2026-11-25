"""AI FastAPI 회귀 테스트. 외부 API/DB/모델 가중치를 호출하지 않는다.

프로젝트 ai-server 폴더에서: python -m pytest -q
"""
from io import BytesIO
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from main import app
from routers.diet_catalog import (
    CatalogDietRequest,
    DraftDietPlan,
    DraftFoodItem,
    DraftMeal,
    FoodOption,
    _calculate_nutrients,
    _filter_candidates,
    _generate,
)
from services.food_vision import FoodMenu


client = TestClient(app)


def foods_payload(**overrides):
    payload = {
        "target_calories_kcal": 700,
        "meal_types": ["lunch"],
        "available_foods": [
            {"foodId": 101, "name": "현미밥", "servingSize": 100,
             "referenceServingSize": 150, "caloriesKcal": 150,
             "carbohydrateG": 32, "proteinG": 3, "fatG": 1},
            {"foodId": 102, "name": "닭가슴살", "servingSize": 100,
             "referenceServingSize": 100, "caloriesKcal": 110,
             "proteinG": 23, "fatG": 2},
        ],
        "preferences": "단백질 위주",
        "allergies": [],
        "excluded_food_ids": [],
    }
    payload.update(overrides)
    return payload


def mock_vision_response(items=None, summary="목표에 맞는 식단입니다"):
    if items is None:
        items = [(101, 1), (102, 2)]
    generated = DraftDietPlan(
        meals=[DraftMeal(
            meal_type="lunch",
            reason="후보 안에서 선택",
            items=[DraftFoodItem(food_id=food_id, quantity=qty)
                   for food_id, qty in items],
        )],
        summary=summary,
    )
    obj = MagicMock()
    obj.beta.chat.completions.parse.return_value.choices[0].message.parsed = generated
    return obj


def jpeg_bytes():
    buf = BytesIO()
    Image.new("RGB", (40, 40), "white").save(buf, format="JPEG")
    return buf.getvalue()


def test_paths_and_health():
    assert client.get("/health").json() == {"status": "ok"}
    paths = app.openapi()["paths"]
    assert "/internal/ai/food-analyses" in paths
    assert "/internal/ai/diet-recommendations" in paths
    assert "/internal/ai/diet-recommendations/from-foods" in paths
    assert paths["/internal/ai/food-analyses"]["post"]


def test_production_diet_route_uses_real_generator():
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=mock_vision_response()):
        response = client.post("/internal/ai/diet-recommendations", json=foods_payload())
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == "gemini", "정식 API가 예전 Mock을 반환하면 안 된다"
    assert data["estimated_total_calories_kcal"] == 445
    assert data["calorie_target_met"] is False
    assert data["calorie_deviation_percent"] == 36.43
    assert "36.43%" in data["summary"]
    assert data["meals"][0]["foods"][0]["food_id"] == 101


def test_preview_diet_alias_uses_same_generator():
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=mock_vision_response()):
        response = client.post("/internal/ai/diet-recommendations/from-foods", json=foods_payload())
    assert response.status_code == 200
    assert response.json()["source"] == "gemini"


def test_user_context_supplied_in_llm_payload():
    proxy = mock_vision_response()
    data = foods_payload(user_context={
        "bmr_kcal": 1500, "current_weight_kg": 75,
        "target_weight_kg": 68, "goal": "weight_loss",
    })
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=proxy):
        response = client.post("/internal/ai/diet-recommendations", json=data)
    assert response.status_code == 200
    call = proxy.beta.chat.completions.parse.call_args
    input_data = json.loads(call.kwargs["messages"][1]["content"])
    assert input_data["user_context"]["bmr_kcal"] == "1500"
    assert input_data["user_context"]["target_weight_kg"] == "68"
    assert input_data["user_context"]["goal"] == "weight_loss"


def test_no_fabricated_food_ids():
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=mock_vision_response([(999, 1)])):
        response = client.post("/internal/ai/diet-recommendations", json=foods_payload())
    assert response.status_code == 502


def test_duplicate_food_id_is_rejected():
    options = foods_payload()["available_foods"]
    data = foods_payload(available_foods=[options[0], options[0]])
    assert client.post("/internal/ai/diet-recommendations", json=data).status_code == 422


def test_duplicate_meals_rejected():
    data = foods_payload(meal_types=["lunch", "lunch"])
    assert client.post("/internal/ai/diet-recommendations", json=data).status_code == 422


def test_excluded_all_foods_rejected():
    data = foods_payload(excluded_food_ids=[101, 102])
    assert client.post("/internal/ai/diet-recommendations", json=data).status_code == 422


def test_allergy_unknown_is_not_claimed_safe():
    data = foods_payload(allergies=["우유"])
    assert client.post("/internal/ai/diet-recommendations", json=data).status_code == 422


def test_allergy_verified_filter():
    data = foods_payload(allergies=["우유"])
    data["available_foods"][0].update(allergens=["우유"], allergens_verified=True)
    data["available_foods"][1].update(allergens=[], allergens_verified=True)
    parsed = CatalogDietRequest.model_validate(data)
    candidates = _filter_candidates(parsed)
    assert [x.foodId for x in candidates] == [102]


def test_nutrient_missing_is_unknown_not_zero():
    food = FoodOption.model_validate({
        "foodId": 1, "name": "테스트", "servingSize": 100,
        "caloriesKcal": 100,
    })
    result = _calculate_nutrients(food, __import__("decimal").Decimal("1.5"))
    assert result["calories_kcal"] == 150
    assert result["protein_g"] is None


def test_invalid_positive_quantity():
    data = foods_payload()
    data["available_foods"][0]["servingSize"] = 0
    assert client.post("/internal/ai/diet-recommendations", json=data).status_code == 422


def test_photo_llm_portions_and_db_calories():
    fake_detector = SimpleNamespace(predict=lambda image: [{"name": "토마토소스스파게티", "confidence": 0.31}])
    fake_menus = [FoodMenu(primary="까르보나라 파스타", alternatives=["크림 파스타"], estimated_quantity=1.5)]
    fake_matches = ([{
        "query": "까르보나라 파스타", "suggested_food_id": 210,
        "exact_matches": [{"foodId": 210, "name": "까르보나라 파스타", "servingSize": 100,
                           "referenceServingSize": 150, "caloriesKcal": 150}],
        "related_matches": [],
    }], False)
    with patch("routers.food_preview.get_food_detector", return_value=fake_detector), \
         patch("routers.food_preview.analyze_food_with_vision", return_value=("gemini", fake_menus)), \
         patch("routers.food_preview.resolve_food_names", return_value=fake_matches):
        response = client.post(
            "/internal/ai/food-analyses?estimate_portions=true&match_db=true",
            files={"file": ("food.jpg", jpeg_bytes(), "image/jpeg")},
        )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == "gemini"
    assert data["foods"][0]["estimated_quantity"] == 1.5
    assert data["foods"][0]["suggested_food_id"] == 210
    assert data["foods"][0]["estimated_calories_kcal"] == 337.5
    assert data["estimated_total_calories_kcal"] == 337.5


def test_photo_yolo_without_llm_returns_unknown_portion():
    fake_detector = SimpleNamespace(predict=lambda image: [{"name": "김밥", "confidence": 0.9}])
    with patch("routers.food_preview.get_food_detector", return_value=fake_detector), \
         patch("routers.food_preview.analyze_food_with_vision") as fn:
        response = client.post(
            "/internal/ai/food-analyses?include_alternatives=false&match_db=false&estimate_portions=false",
            files={"file": ("food.jpg", jpeg_bytes(), "image/jpeg")},
        )
    assert response.status_code == 200
    fn.assert_not_called()
    assert response.json()["foods"][0]["estimated_quantity"] is None
    assert response.json()["foods"][0]["estimated_calories_kcal"] is None
    assert response.json()["estimated_total_calories_kcal"] is None


def test_photo_invalid_format_rejected():
    response = client.post(
        "/internal/ai/food-analyses",
        files={"file": ("not-food.txt", b"malicious", "text/plain")},
    )
    assert response.status_code == 415


def test_photo_no_recognition_status():
    fake_detector = SimpleNamespace(predict=lambda image: [])
    with patch("routers.food_preview.get_food_detector", return_value=fake_detector), \
         patch("routers.food_preview.analyze_food_with_vision", return_value=("gemini", [])):
        response = client.post(
            "/internal/ai/food-analyses",
            files={"file": ("food.jpg", jpeg_bytes(), "image/jpeg")},
        )
    assert response.status_code == 200
    assert response.json()["status"] == "no_food_detected"


def test_food_menu_cleanup_preserves_portion():
    from services.food_vision import clean_food_menus
    menus = clean_food_menus([FoodMenu(primary="김밥", estimated_quantity=1.2)])
    assert menus[0].estimated_quantity == 1.2


def test_spring_search_response_and_suggestion():
    from io import BytesIO
    from services.spring_food_catalog import _search_foods, resolve_food_names
    payload = {"success": True, "data": {"content": [
        {"foodId": 77, "name": "현미밥", "caloriesKcal": 165}
    ]}}
    with patch("services.spring_food_catalog.urlopen", return_value=BytesIO(json.dumps(payload).encode())):
        result = _search_foods("현미밥", None)
        assert result[0]["foodId"] == 77
    with patch("services.spring_food_catalog.urlopen", return_value=BytesIO(json.dumps(payload).encode())):
        matches, truncated = resolve_food_names(["현미밥"], None)
    assert matches[0]["suggested_food_id"] == 77
    assert not truncated


def test_spring_missing_content_is_not_empty_success():
    from io import BytesIO
    from services.spring_food_catalog import SpringFoodApiError, _search_foods
    payload = {"success": True, "data": {}}
    with patch("services.spring_food_catalog.urlopen", return_value=BytesIO(json.dumps(payload).encode())):
        with pytest.raises(SpringFoodApiError):
            _search_foods("현미밥", None)


def test_spring_many_results_do_not_autoselect():
    from services.spring_food_catalog import resolve_food_names
    results = [{"foodId": 77, "name": "현미밥"}]
    results.extend({"foodId": 1000 + n, "name": "현미밥 곡물"} for n in range(19))
    with patch("services.spring_food_catalog._search_foods", return_value=results):
        matches, _ = resolve_food_names(["현미밥"], None)
    assert matches[0]["suggested_food_id"] is None
    assert matches[0]["search_incomplete"] is True


def test_spring_connection_failure():
    from urllib.error import URLError
    from services.spring_food_catalog import SpringFoodApiError, _search_foods
    with patch("services.spring_food_catalog.urlopen", side_effect=URLError("down")):
        with pytest.raises(SpringFoodApiError):
            _search_foods("현미밥", None)


def test_photo_estimate_portions_forces_vision_even_when_yolo_confident():
    fake_detector = SimpleNamespace(predict=lambda image: [{"name": "김밥", "confidence": 0.93}])
    fake_menus = [FoodMenu(primary="김밥", estimated_quantity=1.25)]
    with patch("routers.food_preview.get_food_detector", return_value=fake_detector), \
         patch("routers.food_preview.analyze_food_with_vision", return_value=("gemini", fake_menus)) as fn:
        response = client.post(
            "/internal/ai/food-analyses?estimate_portions=true&match_db=false",
            files={"file": ("food.jpg", jpeg_bytes(), "image/jpeg")},
        )
    assert response.status_code == 200, response.text
    fn.assert_called_once()
    assert response.json()["foods"][0]["estimated_quantity"] == 1.25
    assert response.json()["estimated_total_calories_kcal"] is None


def test_allergy_verified_food_allows_inference_only_for_verified_choices():
    safe_option = foods_payload()["available_foods"][1]
    safe_option.update(allergens=[], allergens_verified=True)
    req = foods_payload(allergies=["우유"], available_foods=[safe_option])
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=mock_vision_response([(102, 1)])):
        response = client.post("/internal/ai/diet-recommendations", json=req)
    assert response.status_code == 200, response.text
    assert response.json()["meals"][0]["foods"][0]["food_id"] == 102


def test_internal_key_enforcement(monkeypatch):
    monkeypatch.setenv("AI_INTERNAL_KEY", "internal-test-key")
    path = "/internal/ai/diet-recommendations"
    assert client.get("/health").status_code == 200
    assert client.post(path, json=foods_payload()).status_code == 403
    assert client.post(path, headers={"X-Internal-Key": "incorrect"}, json=foods_payload()).status_code == 403
    with patch("routers.diet_catalog.get_gemini_vision_client", return_value=mock_vision_response()):
        assert client.post(path, headers={"X-Internal-Key": "internal-test-key"}, json=foods_payload()).status_code == 200
