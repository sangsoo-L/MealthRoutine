"""추천 영양 합계 회귀 테스트 (Gemini 호출 모의)."""
from unittest.mock import MagicMock

import pytest

from routers import diet_catalog as diet


@pytest.mark.parametrize("protein, expected_protein", [(8, 18.0), (None, None), (0, 10.0)])
def test_meal_nutrient_totals(monkeypatch, protein, expected_protein):
    foods = [
        diet.FoodOption(foodId=1, name="밥", servingSize=100,
                        referenceServingSize=200, caloriesKcal=200,
                        carbohydrateG=40, proteinG=5, fatG=1),
        diet.FoodOption(foodId=2, name="반찬", servingSize=100,
                        caloriesKcal=100, carbohydrateG=10,
                        proteinG=protein, fatG=0),
    ]
    draft = diet.DraftDietPlan(meals=[diet.DraftMeal(
        meal_type="lunch", items=[diet.DraftFoodItem(food_id=1, quantity=1),
                                 diet.DraftFoodItem(food_id=2, quantity=1)],
        reason="테스트")], summary="테스트")
    client = MagicMock()
    client.beta.chat.completions.parse.return_value.choices[0].message.parsed = draft
    monkeypatch.setattr(diet, "get_gemini_vision_client", lambda: client)
    result = diet._generate(diet.CatalogDietRequest(
        target_calories_kcal=700, meal_types=["lunch"]), foods)
    meal = result["meals"][0]
    assert meal["estimated_calories_kcal"] == 500
    assert meal["estimated_carbohydrate_g"] == 90
    assert meal["estimated_protein_g"] == expected_protein
    assert meal["estimated_fat_g"] == 2
    assert result["estimated_total_calories_kcal"] == 500
