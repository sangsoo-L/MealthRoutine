# MealthRoutine AI 서버 연동 가이드 (2026-11-23 최종 정리)

## 역할 분담

- **React:** 사용자에게 사진·식단 조건 입력받고, AI 예측을 사용자에게 확인받음.
- **Spring Boot:** 인증·권한, MySQL 음식 검색, 사용자 목표 칼로리 산정, 확정 식단 기록 저장 및 재계산.
- **FastAPI:** YOLO/Gemini 이미지 추론, 식약처 음식 DB 후보 비교, 예상 총칼로리 계산, Spring 음식 검색 API에서 후보를 자동 확보해 AI 식단 추천.

기획서의 외부 `/api/v1/ai/...`는 Spring이 제공할 경로이며, 아래 `/internal/ai/...`는 **Spring이 호출하는 FastAPI 내부 API**입니다. 브라우저에서 FastAPI를 직접 호출하는 경우에는 CORS, 주소, 인증 정책을 별도로 맞춰야 합니다. 운영 시 내부 API를 무인증 상태로 인터넷에 공개하지 마세요.

## 1. 음식 사진 분석

**정식 API** `POST /internal/ai/food-analyses` (multipart/form-data)

필수 입력은 이미지 파일 `file` 하나입니다. 별도 옵션을 전달하지 않으면 자동으로 음식 인식, DB 검색, 인분/중량 추정과 열량 계산을 시도합니다.

```bash
curl -X POST 'http://127.0.0.1:8000/internal/ai/food-analyses' -F 'file=@food.jpg'
```

| 입력 | 형식 | 기본값 | 내용 |
| --- | --- | --- | --- |
| `file` | JPEG/PNG 파일 | 필수 | 최대 10 MiB, 2,000만 화소 |
| `include_alternatives` | query boolean | `true` | AI 음식명·대체 후보 분석 |
| `match_db` | query boolean | `true` | FastAPI → Spring `/api/v1/foods` 조회 |
| `estimate_portions` | query boolean | `true` | 사진으로 분량·중량·칼로리 추정 |
| `Authorization` | 선택 헤더 | 없음 | DB 조회 시 Spring으로 전달할 토큰 (필요한 경우) |

`curl -F`로 보내면 Content-Type은 자동 생성됩니다. 프론트에서도 `FormData`의 `file`만 보내면 됩니다. 실제 배포에는 Spring 라우팅을 통해 연결하는 것을 권장합니다.

주요 응답 필드:

| 필드 | 의미 |
| --- | --- |
| `foods` | 음식별 대표 이름, 대체 후보, 인분·중량·칼로리 예측, DB 참고 정보 |
| `estimated_total_calories_kcal` | 사진에 인식된 음식별 예상 열량의 합계. 계산 불가능한 음식이 있으면 `null` |
| `calorie_estimate_complete` | 모든 응답 음식에 열량 추정치가 있는지 |
| `calorie_estimate_omitted_foods` | 열량 미계산 음식 이름들 |
| `calorie_estimate_source` | 개별 음식의 채택 출처: `vision`, `db_exact`, `db_exact_group`, `db_related_reference`, `db_alias_reference`, 또는 `null` |
| `vision_estimated_calories_kcal` | Gemini가 사진에서 추정한 열량 |
| `db_reference_calories_kcal` | DB 영양정보와 추정량에서 계산된 참고 열량 (없으면 `null`) |
| `calorie_estimate_difference_pct` | AI/DB 추정값의 상대 차이율 (%) |
| `calorie_estimate_conflict` | DB와 AI 차이율이 25%를 초과하는지 |
| `db_reference_food_id(s)` | 계산 참고 DB 항목 식별자. 중복 실측값이면 ID 여러 개 가능 |
| `suggested_food_id` | 유일하게 정확 일치할 때만 제안되는 음식 ID. 확정·저장은 사용자가 확인한 뒤 Spring에서 |
| `db_matches`, `db_lookup_truncated` | 음식 검색 후보와 검색 제한 여부 |
| `status` | 인식 결과가 있으면 `review_required`, 없으면 `no_food_detected` |

DB 비교는 **음식 종류가 적절히 일치**해야 사용하며, AI와 DB 추정값의 상대 차이가 25% 이내일 때 DB 참고 열량을 채택합니다. DB에 해당 음식이 없거나 차이가 클 때에는 AI 추정값을 유지합니다. 여러 동일 이름 항목은 중위값 참고로 비교할 수 있으나 음식 ID를 임의로 확정하지 않습니다. 사용자가 실제 먹은 양과 사진 속 중량을 정확히 알 수 없으므로 **결과는 참고용 예상 열량이며 확정 식사 기록이 아닙니다.**

**응답에서 긴 `note` 필드는 제거했습니다.** 프론트가 안내 문구를 필요로 하면 짧게 ‘AI가 추정한 칼로리이며 실제 섭취량에 따라 달라질 수 있습니다’를 표시하세요. 해당 문구를 API 응답에 매번 넣지는 않습니다.

## 2. AI 식단 추천

**정식 API** `POST /internal/ai/diet-recommendations` (application/json)

**사용자는 목표 칼로리만 설정해도 됩니다.** `available_foods`를 생략하면 FastAPI가 Spring의 `GET /api/v1/foods`를 호출하여 밥·단백질·채소·반찬 등 다양한 음식 후보를 자동 조회하고 Gemini가 추천합니다. FastAPI는 MySQL에 직접 접속하지 않으며, 실제 Spring DB에 없는 `foodId`를 임의로 만들지 못하도록 검증합니다. 팀에서 음식 후보를 직접 전달해야 하는 기존 방식도 `available_foods` 입력 시 그대로 동작합니다. 과거 시험 경로 `/internal/ai/diet-recommendations/from-foods`도 호환성을 위해 유지합니다.

일반 사용 입력 예시 (이것만으로 추천 가능):

```json
{
  "target_calories_kcal": 700,
  "meal_types": ["lunch"]
}
```

기존 Spring 연동에서 음식 후보를 직접 전달하려는 경우만 아래의 선택 입력을 사용합니다:

```json
{
  "target_calories_kcal": 700,
  "meal_types": ["lunch"],
  "available_foods": [
    {
      "foodId": 101,
      "name": "현미밥",
      "servingSize": 100,
      "servingUnit": "g",
      "referenceServingSize": 150,
      "caloriesKcal": 150,
      "carbohydrateG": 32,
      "proteinG": 3,
      "fatG": 1
    },
    {
      "foodId": 102,
      "name": "닭가슴살",
      "servingSize": 100,
      "servingUnit": "g",
      "referenceServingSize": 100,
      "caloriesKcal": 110,
      "proteinG": 23,
      "fatG": 2
    }
  ]
}
```

`target_calories_kcal`은 `meal_types`에 해당하는 **전체 요청 끼니의 합계 목표 열량**입니다. `meal_types`의 기본값은 아침·점심·저녁 3개이며, `available_foods`는 **선택 입력**입니다. 입력 시 1~50개이고, 생략하면 Spring 검색으로 자동 선정합니다. `preferences`, `allergies`, `excluded_food_ids`, `user_context`는 선택 입력입니다. Spring 음식 검색 API가 실행 중이어야 자동 추천이 가능합니다. 위 수동 입력용 ID는 형식 예시이며 실제 DB의 값이 아닙니다. 자동 후보는 다양한 카테고리에서 선정하지만 개인 알레르기·질환에 대한 검증된 영양 처방이 아닙니다.

주요 응답 필드: `status`, `source`, `target_calories_kcal`, `estimated_total_calories_kcal`, `calorie_target_met`, `calorie_deviation_percent`, `meals`(음식 ID·인분·영양성분), `summary`, `warnings`.

- `quantity`는 **인분 수**이며 g/mL가 아닙니다.
- 미확인 영양값은 0으로 가정하지 않고 `null`로 둡니다.
- `warnings`는 기존 미리보기 안내 및 **목표 열량 편차, 영양정보 누락, 알레르기 검증** 관련 안내가 들어가는 배열로, 호환성을 위해 유지합니다.
- `note` 필드는 제거했습니다. 식단 저장 여부와 사용자 확인은 Spring·React에서 책임집니다.
- 알레르기가 전달되면 `allergens_verified=true`인 검증된 원재료 후보만 사용합니다. 현재 Spring FoodResponse에는 그 필드가 없으므로 미검증 음식은 안전하다고 가정하지 않습니다.

## 3. 오류 및 검증

| HTTP | 의미 |
| --- | --- |
| 400 | 빈 이미지·형식 손상 |
| 413 | 이미지 크기·해상도 제한 초과 |
| 415 | JPEG/PNG 이외 형식 또는 MIME 불일치 |
| 422 | 필수 입력 누락, 부적절한 식단·중복 ID, 알레르겐 검증 불가 |
| 500 | YOLO 추론 오류 |
| 502 | 외부 AI·Spring API 호출 실패, AI 생성 결과 검증 실패 |
| 503 | AI 키·모델 설정 오류 |

프로젝트 `ai-server`에서 실행:

```powershell
python -m pytest -q
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Swagger `http://127.0.0.1:8000/docs` / 상태 확인 `GET /health`. 자동 회귀 테스트는 외부 Gemini·Spring·YOLO 호출을 모의 처리합니다. 실제 배포 전 **React → Spring → FastAPI → Spring DB**, 사용자 확인 후 저장되는 통합 흐름은 팀원이 함께 검증해야 합니다.
