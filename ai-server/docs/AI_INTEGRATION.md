# 밀스루틴 AI FastAPI 연동 규격 (2026-11-23)

## 범위와 책임

- **FastAPI:** 사진에서 음식명/대체 후보/가능할 경우 대략적인 인분 추정, 음식 DB 후보로 Gemini 식단 추천, 입력·추천 결과 검증, 영양 미리보기.
- **Spring Boot:** 로그인·권한 확인, 음식 DB 검색·원재료/알레르기 정보 검증, BMR/사용자 목표에서 목표 열량 산출, 실제 식사 기록/추천 저장·조회·수정·중복 방지, 확정 영양정보 재계산.
- **React:** 사진 선택·촬영, 추정 음식 및 양의 사용자 확인·수정, 실제 인분 입력, 음식 DB 선택, 식단 계획 등록/취소.
- 운동 추천 개발, AI 대화형 등록, 무료 체험 횟수/결제/포인트 차감은 이번 AI 백엔드 완료 범위에서 제외.

> 기획서의 `/api/v1/ai/...`는 Spring이 프론트에 공개하는 외부 경로다. 아래는 Spring이 호출할 **FastAPI 내부 경로**다. FastAPI는 인터넷에 인증 없이 공개하지 말고, Spring이 접근 가능한 내부 네트워크에서 실행한다.

## 1. 음식 사진 분석

`POST /internal/ai/food-analyses` — `multipart/form-data`

| 입력 | 타입 | 의미 |
| --- | --- | --- |
| `file` | 필수 파일 | 실제 JPEG 또는 PNG, 최대 10MiB 및 2,000만 화소 |
| `include_alternatives` | bool, 기본 false | 높은 YOLO 신뢰도에서도 Gemini를 호출해 대체 후보 확보 |
| `estimate_portions` | bool, 기본 false | 사진에 근거할 때만 대략적인 인분 추정. 미확정 시 null |
| `match_db` | bool, 기본 false | FastAPI에서 Spring `/api/v1/foods` 검색. 연동 시에는 Spring이 직접 조회하는 방법을 우선 권장 |
| `Authorization` | 선택 헤더 | `match_db=true`일 때에만 Spring 검색 API로 전달할 Bearer 토큰 |

시연에서 사진 기반 분량 추정과 DB 영양 미리보기를 모두 보고 싶으면 `estimate_portions=true&match_db=true`를 선택한다. 다만 실제 Spring 연동은 FastAPI가 음식 후보명을 반환하고 Spring이 자체 DB에서 후보를 조회하는 방식도 권장한다(왕복 호출 방지).

핵심 응답 예시(발췌):

```json
{
  "source": "gemini",
  "status": "review_required",
  "foods": [{
    "primary": "까르보나라 파스타",
    "alternatives": ["크림 파스타"],
    "confidence_score": null,
    "suggested_food_id": 210,
    "estimated_quantity": 1.5,
    "estimated_calories_kcal": 337.5
  }],
  "estimated_total_calories_kcal": 337.5,
  "db_matches": [],
  "db_match_enabled": true
}
```

`estimated_quantity`의 단위는 **인분 수**이며 g/ml가 아니다. **사진으로 실제 먹은 양을 알 수 없다.** 시각적 기준이 부족하면 null이다. `suggested_food_id`는 Spring 검색에서 음식명이 유일하게 정확히 일치한 경우에만 제안하며, 사용자가 확정하는 ID가 아니다. `estimated_calories_kcal`은 **인분 추정과 단일 DB ID, DB 영양정보가 모두 있을 때만** 계산한다. 불충분하면 null, 합계도 null이다. 모든 숫자는 확정값이 아닌 미리보기다. `status=no_food_detected`일 때는 음식 후보가 없다.

**식단 기록 저장**: React에서 사용자가 음식·수량을 확인/수정 → Spring이 `foodId`/`quantity`를 확정하여 `POST /api/v1/meal-records`에 저장 → DB 기준 영양을 재계산한다. 추정값을 직접 확정 데이터로 저장하면 안 된다.

## 2. AI 식단 추천 — 정식 경로

`POST /internal/ai/diet-recommendations` — `application/json`

다음 경로도 동일한 추천 함수를 사용한다: `/internal/ai/diet-recommendations/from-foods` (이전 시험용 경로와 호환).

Spring은 자신의 `foods` 테이블에서 실제 음식 후보를 추린 뒤 `available_foods`에 넣는다. FastAPI가 전송된 음식 외의 `foodId`를 생성하면 502를 반환한다.

```json
{
  "target_calories_kcal": 700,
  "meal_types": ["lunch"],
  "preferences": "단백질을 선호합니다",
  "allergies": [],
  "excluded_food_ids": [],
  "user_context": {
    "bmr_kcal": 1500,
    "current_weight_kg": 75,
    "target_weight_kg": 68,
    "goal": "weight_loss"
  },
  "available_foods": [
    {
      "foodId": 101, "name": "현미밥",
      "servingSize": 100, "servingUnit": "g",
      "referenceServingSize": 150, "caloriesKcal": 150,
      "carbohydrateG": 32, "proteinG": 3, "fatG": 1
    },
    {
      "foodId": 102, "name": "닭가슴살",
      "servingSize": 100, "servingUnit": "g",
      "referenceServingSize": 100, "caloriesKcal": 110,
      "proteinG": 23, "fatG": 2
    }
  ]
}
```

`target_calories_kcal`은 `meal_types`에 **선택된 끼니들의 목표 열량 합계**다. `meal_types=["lunch"]`이면 점심 목표, 하루 세 끼를 모두 넣으면 하루 목표를 전달해야 한다. 사용자의 BMR/목표 체중으로 적정 열량을 산출하는 비즈니스 규칙은 Spring에서 검증한다. FastAPI는 `user_context`를 참고 조건으로만 사용하며, 의료 처방을 생성하지 않는다.

```json
{
  "status": "generated",
  "source": "gemini",
  "model": "gemini-3.5-flash-lite",
  "target_calories_kcal": 700,
  "estimated_total_calories_kcal": 445,
  "calorie_target_met": false,
  "calorie_deviation_percent": 36.43,
  "meals": [{
    "meal_type": "lunch",
    "foods": [
      {
        "food_id": 101,
        "food_name": "현미밥",
        "quantity": 1,
        "nutrients": {"calories_kcal": 225, "carbohydrate_g": 48, "protein_g": 4.5,
                      "fat_g": 1.5, "sugar_g": null, "sodium_mg": null}
      },
      {
        "food_id": 102,
        "food_name": "닭가슴살",
        "quantity": 2,
        "nutrients": {"calories_kcal": 220, "carbohydrate_g": null, "protein_g": 46,
                      "fat_g": 4, "sugar_g": null, "sodium_mg": null}
      }
    ],
    "estimated_calories_kcal": 445,
    "reason": "DB 음식 후보 기준으로 구성한 식단"
  }],
  "summary": "추천 열량의 목표 이탈 여부를 서버 계산값으로 안내",
  "warnings": ["영양정보는 미리보기입니다"]
}
```

위 응답은 **형식 설명용 예시**다. 표시된 열량 225 + 220 = 445kcal은 예시 입력값과 일치하며, 실제 출력은 서버가 각 음식 영양값을 합산한다. `quantity`의 단위는 g이 아니라 **인분 수**다. Spring에서 저장할 때도 같은 인분 의미로 전달해야 한다. 일부 영양정보가 없으면 0이 아니라 null을 반환한다. 목표 열량에서 20% 초과 편차가 있으면 `calorie_target_met=false`와 경고가 나온다. 이는 오류 감지이지 자동 보정은 아니다.

### 알레르기 처리

기존 Spring `FoodResponse`에는 원재료/알레르겐 정보가 **없다**. `allergies` 요청이 비어 있으면 일반 추천은 가능하다. 알레르기가 지정되면 후보별 `allergens`와 **`allergens_verified=true`**가 있는 음식만 필터링에 사용한다. 미검증·누락된 정보는 추천하지 않고, 검증된 후보가 하나도 없으면 422를 반환한다. 단순히 `allergens: []`를 채워 안전하다고 표시하지 말 것. 원재료명 동의어/제조 공정 교차접촉까지 완벽한 안전을 보장하지 않는다. 실제 서비스에서는 DB 원재료 출처와 교차접촉 확인이 별도로 필요하다.

## 3. 오류 및 상태

| HTTP | 의미 |
| --- | --- |
| 400 | 빈 이미지 등 잘못된 파일 내용 |
| 413 | 이미지 파일/화소 초과 |
| 415 | 파일 MIME/실제 이미지 형식 불일치 |
| 422 | 누락된 입력, 잘못된 수량/끼니, 중복된 음식 ID, 제외 음식만 존재, 알레르겐 검증 불가 |
| 500 | YOLO 실행 오류 |
| 502 | 외부 AI/DB 응답 실패, 허용되지 않은 음식 ID 등 결과 검증 실패 |
| 503 | AI API 키/제공업체 설정 오류 |

지금 구현은 이미지 LLM 실패 시 자동 재호출하지 않는다. 무료 Gemini 요금제의 429는 502로 반환되며 시연 전 호출 가능 여부를 확인해야 한다. FastAPI의 성공적인 200 응답은 식단 저장 성공이나 영양학적 적합성을 뜻하지 않는다.

## 4. 실행 및 검증

프로젝트 `ai-server` 경로에서:

```powershell
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
python -m compileall -q .
python -m pytest -q
python -m uvicorn main:app --reload
```

개발 키는 `ai-server/.env`에만 저장하고 `.env`를 Git에 커밋하지 않는다. `LLM_API_KEY`, `LLM_MODEL`, `FOOD_VISION_PROVIDER`, `FOOD_VISION_MODEL`을 확인한다. `requirements.txt`에 YOLO 런타임 `numpy`, `opencv-python`, `torch`가 포함되어 있다. 모델 가중치·설정 파일은 원래 프로젝트의 `food_model` 경로에 있어야 한다(본 검수 ZIP에는 포함되지 않음). PyTorch 설치는 CPU/운영체제에 따라 별도 공식 설치 경로가 필요할 수 있다.

Swagger: `http://127.0.0.1:8000/docs`; 실행 상태: `GET /health`.

`tests/test_ai_contracts.py`는 **Gemini/DB/YOLO 실제 호출 없이** 모의 응답으로 경계 조건을 검사한다. 실제 모델 추론과 Spring 통합은 각각 별도로 실호출 검증해야 한다.

## 5. 실제 서비스 연동 전 최종 체크

- [ ] Spring에서 FastAPI의 정식 사진/식단 JSON·multipart를 실제 호출해 200 응답 확인
- [ ] Spring `/api/v1/foods` 실제 DB 검색과 `foodId`/`servingSize` 필드 매핑 확인
- [ ] 사용자가 사진 후보·인분 수 확인/수정 후 실제 섭취로 저장되는 흐름 검증
- [ ] 사용자 목표 열량·개인화 문맥을 Spring에서 수집·전달하고 합리성 검증
- [ ] 실제 DB가 알레르겐 정보를 제공하지 않는 경우 안전 확인 메시지/차단 정책 합의
- [ ] 음식 사진 샘플과 식단 추천을 실제 Gemini로 다시 한 번 확인
- [ ] FastAPI를 외부에 노출하는 경우 서비스 간 인증·통신 보안 보완
