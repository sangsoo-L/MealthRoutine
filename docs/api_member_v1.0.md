# 회원 API 상세 명세 v1.0

- 작성일: 2026-11-23
- 상태: 단위 4(내 정보·프로필), 단위 6(아이디 찾기·비밀번호 변경), 단위 7(PIN), 단위 8(신체정보·건강 지표) 반영. 건강 목표(`/health/goals`)는 아직 없다(프론트와 계약 합의 후). 회원 단위가 추가될 때마다 같은 PR에서 갱신한다.
- 회원가입·로그인·토큰 재발급·로그아웃의 상세는 아직 이 문서에 없다(다음 갱신 때 추가). 단, 쿠키 요청 순서 규칙은 아래 "쿠키를 바꾸는 요청"에 적었다.

## 공통

**응답 형식** (현재 코드 기준)

```json
{ "success": true, "message": "요청 성공", "data": {} }
{ "success": false, "message": "요청 값이 올바르지 않습니다.", "errorCode": "INVALID_REQUEST" }
```

- 실패 응답에는 보통 `data`가 없다. **예외는 PIN 오류 두 가지**뿐이다: `PIN_INVALID`는 `data.remainingAttempts`, `PIN_LOCKED`는 `data.lockedUntil`(아래 "PIN").

- 필드별 오류 목록은 아직 없다. 어떤 값이 틀렸는지는 응답으로 알려 주지 않으므로 프론트에서도 같은 규칙으로 먼저 검사하는 것을 권한다.

**인증**

- 아이디 찾기(`POST /api/v1/auth/account-lookup`)를 뺀 이 문서의 API는 모두 로그인이 필요하다: `Authorization: Bearer <accessToken>`.
- 로그인이 필요 없는 API라도 만료·잘못된 토큰을 붙이면 401이다. 토큰이 없을 때는 헤더를 빼고 보낸다.
- 대상 회원은 토큰의 회원뿐이다. 요청 본문에 `userId` 등을 넣어도 다른 회원을 조회·수정할 수 없다.

**오류 코드**

| HTTP | errorCode | 상황 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력값 규칙 위반, JSON 형식 오류, 본문 없음 |
| 401 | LOGIN_REQUIRED / TOKEN_EXPIRED / INVALID_TOKEN | 토큰 없음 / 만료(재발급 후 재시도) / 잘못된 토큰 |
| 400 | PASSWORD_NOT_SET / CURRENT_PASSWORD_MISMATCH / PASSWORD_SAME_AS_CURRENT | 비밀번호 변경: 소셜 전용 계정 / 현재 비밀번호 틀림 / 새 비밀번호가 현재와 같음 |
| 400 | PIN_INVALID | PIN 틀림. `data.remainingAttempts`(잠기기까지 남은 횟수). **명세 7.3의 401에서 400으로 변경**(PIN7-2) |
| 403 | PIN_LOCKED / PIN_NOT_REGISTERED | PIN 5회 연속 실패로 잠김(`data.lockedUntil`) / PIN 미등록(PIN 등록 화면으로 안내) |
| 403 | PIN_REQUIRED / PIN_EXPIRED | PIN 보호 API에 쓸 수 있는 PIN 토큰이 없음 / PIN 토큰 만료 → 둘 다 PIN 입력 화면으로(아래 "신체정보·건강 지표") |
| 404 | MEASUREMENT_NOT_FOUND | 신체정보 기록이 없거나 다른 회원의 기록 |
| 409 | NICKNAME_ALREADY_EXISTS | 다른 회원이 쓰는 닉네임(대소문자 무시) |
| 409 | PIN_ALREADY_SET | 이미 PIN이 있는데 최초 설정(`PUT`)을 호출함 |
| 429 | TOO_MANY_REQUESTS | 아이디 찾기·비밀번호 변경·PIN 변경 시도가 1분 5회를 넘음. `Retry-After` 헤더(초)만큼 기다린 뒤 다시 시도 |
| 500 | INTERNAL_ERROR | 서버 오류 |

## 내 정보

| Method | URL | 요청 | data |
|---|---|---|---|
| GET | /api/v1/users/me | | 내 정보 |

```json
{
  "userId": 1,
  "email": "gildong@example.com",
  "username": "홍길동",
  "nickname": "길동이",
  "role": "user",
  "accountStatus": "active",
  "passwordSet": true,
  "pinRegistered": false,
  "onboardingCompleted": false
}
```

- `username`은 실명, `nickname`은 프로필의 `displayName`과 **같은 값**이다(필드 이름만 다르다). 프로필이 없으면 `null`.
- `passwordSet`: 이메일 비밀번호가 있으면 `true`(소셜 전용 계정은 `false`). 비밀번호 변경 메뉴 표시용.
- `onboardingCompleted`: 초기 설문 기능이 정해질 때까지 **항상 `false`**(로그인 응답과 같음).

## 프로필

| Method | URL | 요청 | data |
|---|---|---|---|
| GET | /api/v1/users/me/profile | | 프로필 |
| PATCH | /api/v1/users/me/profile | 프로필 수정 | 수정 후 프로필 |

**프로필 (응답)**

```json
{
  "displayName": "길동이",
  "birthDate": "1990-05-05",
  "gender": "male",
  "regionCode": "SEOUL",
  "profileImageUrl": null,
  "exerciseLevel": "beginner",
  "phoneNumber": "010-1234-5678",
  "dietaryPreferences": ["오이", "고수"]
}
```

- 기본값은 두 저장소(프로필 / 기피 식재료)를 따로 본다. 둘은 따로 저장될 수 있다(예: 기피 식재료만 수정하면 프로필 없이 식재료만 저장됨).
  - 프로필이 저장되지 않았으면: `exerciseLevel`은 `"undecided"`, 나머지 프로필 필드는 `null`.
  - 기피 식재료가 저장되지 않았으면: `dietaryPreferences`는 `[]`.
- `profileImageUrl`은 응답 전용이다(프로필 이미지 API는 아직 없음).
- 몸무게·키·BMI는 여기에 없다(신체정보 API에서 다룬다).

**프로필 수정 (PATCH 요청)** — 바꿀 필드만 보낸다.

| 필드 | 규칙 | 지우기 |
|---|---|---|
| `displayName` | 한글·영문·숫자만. 한글이 있으면 2~8자, 없으면 2~16자. 공백·기호 불가(회원가입 닉네임과 같은 규칙) | 불가 |
| `birthDate` | `YYYY-MM-DD`, 1900-01-01 이상, 오늘보다 이전 | 불가 (`""`는 400) |
| `gender` | `female`, `male`, `other`, `undisclosed` (소문자 그대로) | 불가 (`""`는 400). 밝히지 않으려면 `undisclosed` |
| `regionCode` | 30자 이하 문자열 (코드 체계 미정) | `""` |
| `exerciseLevel` | `beginner`, `intermediate`, `advanced`, `undecided` | 불가 (`""`는 400) |
| `phoneNumber` | `01X` 휴대폰 번호, 하이픈 선택: `01012345678`, `010-1234-5678` | `""` |
| `dietaryPreferences` | 기피 식재료 문자열 배열, 각 1~30자, 최대 20개. 앞뒤 공백과 중복은 서버가 정리 | `[]` (배열 전체를 교체) |

- 필드를 **생략하거나 `null`이면 바뀌지 않는다.**
- 모든 값은 JSON 문자열(식재료는 문자열 배열)이어야 한다. `12`, `true` 같은 숫자·불리언은 문자열로 바꾸지 않고 400이다(예: `"displayName": 12`, `"dietaryPreferences": [1]`).
- `{}`처럼 바꿀 값이 하나도 없으면 아무것도 저장하지 않고 현재 프로필을 200으로 돌려준다.
- 규칙을 하나라도 어기면 400이고, 함께 보낸 다른 값도 저장되지 않는다.
- 정의되지 않은 필드(`profileImageUrl`, `nickname`, `userId`, `role` 등)는 무시한다. GET 응답을 그대로 고쳐 보내도 된다. 단 닉네임을 바꾸려면 `nickname`이 아니라 `displayName`을 보내야 한다.

```json
{ "displayName": "새닉네임", "phoneNumber": "", "dietaryPreferences": ["오이"] }
```

**알려진 한계**

- 닉네임 중복은 서버가 조회해서 막는다(DB 고유 제약 없음). 두 사람이 **동시에** 같은 닉네임으로 가입·변경하면 드물게 중복될 수 있다.

## 아이디 찾기

| Method | URL | 요청 | data |
|---|---|---|---|
| POST | /api/v1/auth/account-lookup | `email`, `username`(실명) | `{"matched": true/false}` |

- 로그인 없이 호출한다. 이메일과 실명이 **둘 다** 같은 계정이 있을 때만 `matched: true`.
- 이메일만 맞거나 실명만 맞거나 둘 다 없으면 모두 똑같이 `matched: false`다. 화면 문구는 "이메일 또는 이름을 확인해 주세요."(LOOKUP-MSG-1).
- 이메일은 앞뒤 공백을 지우고 소문자로 바꿔 비교한다. 실명은 앞뒤 공백만 지우고 **대소문자까지 정확히** 비교한다.
- 실명은 회원가입과 같은 형식이어야 한다(한글 2~10자, 또는 영문 단어 2~30자). 형식이 틀리면 400.
- 정지·탈퇴 대기 계정도 찾을 수 있다. 탈퇴가 끝난 계정, 이메일 없이 가입한 소셜 계정은 찾을 수 없다.
- 같은 접속 IP에서 1분에 5번까지. 형식 오류 요청도 횟수에 들어간다. 넘으면 429와 `Retry-After`.

```json
{ "email": "gildong@example.com", "username": "홍길동" }
```

## 비밀번호 변경

| Method | URL | 요청 | 응답 |
|---|---|---|---|
| PATCH | /api/v1/users/me/password | `currentPassword`, `newPassword` | 204 (본문 없음) + refresh 쿠키 삭제 |

- 이메일로 가입한 계정만 쓸 수 있다. 소셜 전용 계정은 400 `PASSWORD_NOT_SET`.
- `newPassword`는 회원가입과 같은 규칙: 8~64자, 영문·숫자·특수문자 각 1개 이상, 공백·한글 불가. 현재와 같으면 400 `PASSWORD_SAME_AS_CURRENT`.
- 현재 비밀번호가 틀리면 400 `CURRENT_PASSWORD_MISMATCH`(401이 아니다 — 토큰은 정상이므로 재발급하지 않는다).
- 한 회원당 1분에 5번까지. 넘으면 429와 `Retry-After`.
- **성공하면:** 모든 기기의 refresh 로그인이 끝나고(이 기기 포함), 응답이 refresh 쿠키를 지운다. 이 요청에도 `credentials: 'include'`를 붙여야 브라우저가 쿠키 삭제를 반영한다.
- **주의:** 이미 받은 access 토큰은 만료(최대 30분)까지 서버가 거절하지 않는다. 프론트는 204를 받으면 가지고 있던 access 토큰을 **바로 버리고** 로그인 화면으로 이동한다.

```json
{ "currentPassword": "Passw0rd!", "newPassword": "NewPassw0rd#" }
```

## PIN (2차 비밀번호)

| Method | URL | 요청 | 응답 |
|---|---|---|---|
| PUT | /api/v1/users/me/pin | `newPin` | 200, data `{pinToken, expiresIn}` |
| GET | /api/v1/users/me/pin/status | | 200, data `{registered, locked, lockedUntil}` |
| POST | /api/v1/users/me/pin/verify | `pin` | 200, data `{pinToken, expiresIn}` |
| PATCH | /api/v1/users/me/pin | `newPin` + (`currentPin` 또는 `currentPassword`) | 204 (본문 없음) |

**PIN 형식:** 숫자 6자리 **문자열**(`"012345"`). 숫자 타입(`12345`)으로 보내면 앞자리 0이 사라질 수 있어 400이다. 공백·전각 숫자도 400. 쉬운 PIN(`123456`)과 같은 PIN으로의 변경은 막지 않는다.

**PIN 토큰:** 신체정보 조회·수정 등 PIN이 필요한 API(아래 "신체정보·건강 지표")에 `X-Pin-Token` 헤더로 보낸다(값은 토큰 그대로, `Bearer ` 없이). `expiresIn`은 초(600 = 10분). 로그인용 토큰이 아니므로 `Authorization`에 넣으면 401이다.

**최초 설정 (`PUT`)**
- PIN이 없을 때 한 번만. 이미 있으면 409 `PIN_ALREADY_SET`(변경은 `PATCH`).
- 성공하면 PIN 토큰도 함께 준다. 바로 신체정보 화면으로 넘어가면 되고 PIN을 다시 입력받을 필요가 없다.

**상태 (`GET /status`)**
- `registered`: PIN 등록 여부(`GET /users/me`의 `pinRegistered`와 같은 값). `locked`: 지금 잠겨 있는지. `lockedUntil`: 잠금 해제 시각(잠기지 않았으면 `null`).

**확인 (`POST /verify`)**
- 틀리면 400 `PIN_INVALID`, `data.remainingAttempts`(4 → 3 → 2 → 1).
- **연속 5번** 틀리면 그 응답부터 403 `PIN_LOCKED`, `data.lockedUntil`(5번째 실패 + 10분, 초 단위로 올림. 형식 `"2026-11-23T12:10:00"`, 서버 시간대 기준). 잠긴 동안은 맞는 PIN도 403.
- 맞히면 실패 횟수가 0으로 돌아간다. 잠금이 끝나면 다시 5번 시도할 수 있다.
- PIN이 없으면 403 `PIN_NOT_REGISTERED` → PIN 등록 화면으로 안내.

```json
{ "pin": "012345" }
{ "success": false, "message": "PIN이 올바르지 않습니다.", "data": { "remainingAttempts": 4 }, "errorCode": "PIN_INVALID" }
{ "success": false, "message": "PIN 입력이 잠겼습니다. 잠시 후 다시 시도해 주세요.", "data": { "lockedUntil": "2026-11-23T12:10:00" }, "errorCode": "PIN_LOCKED" }
```

**변경·복구 (`PATCH`)**

| 계정 | 보내는 값 | 결과 |
|---|---|---|
| 모두 | `currentPin` | 평소 변경. 틀리면 400 `PIN_INVALID`이고 **확인(`verify`)과 같은 실패 횟수**에 들어간다. 잠긴 동안은 403 `PIN_LOCKED` |
| 이메일 가입 | `currentPassword` | PIN 분실·잠금 시 복구. **잠긴 동안에도 가능**, 성공하면 잠금과 실패 횟수가 풀린다. 비밀번호가 틀리면 400 `CURRENT_PASSWORD_MISMATCH`(PIN 실패 횟수에는 들어가지 않음) |
| 이메일 가입 | 둘 다 없음 | 400 `INVALID_REQUEST` |
| 소셜 전용 | `currentPassword` | 400 `PASSWORD_NOT_SET` |
| 소셜 전용 | 둘 다 없음 | 로그인 상태만으로 재설정 허용(Q-24) |
| 모두 | `currentPin`과 `currentPassword`를 함께 | 400 `INVALID_REQUEST` |

- PIN이 없으면 403 `PIN_NOT_REGISTERED`(먼저 `PUT`).
- 한 회원당 1분에 5번까지(형식 오류 포함). 넘으면 429와 `Retry-After`. 비밀번호 변경과는 따로 세므로, 두 API를 합치면 비밀번호를 1분에 최대 10번 확인할 수 있다(알려진 한계).

```json
{ "newPin": "246810", "currentPin": "012345" }
{ "newPin": "246810", "currentPassword": "Passw0rd!" }
```

**서버가 PIN 토큰을 무효화하지 않는다 (PIN7-5, 알려진 한계)**
- 서버는 PIN 토큰의 서명과 만료만 확인한다. 그래서 **PIN 변경·복구, 로그아웃, 비밀번호 변경 뒤에도 이미 발급된 PIN 토큰은 발급 후 최대 10분 동안 유효하다.**
- 즉 아직 유효한 access 토큰과 PIN 토큰을 **둘 다** 가진 요청은 그 남은 기간 동안 PIN이 필요한 API에 접근할 수 있다. (access 토큰이 없거나 거절되면 — 예: 탈퇴 대기·정지 계정 — 그 단계에서 막힌다.)
- **PIN 잠금도 마찬가지다:** 잠금은 새 PIN 확인(`verify`, `currentPin`)만 막는다. 잠기기 전에 받은 PIN 토큰은 만료될 때까지 신체정보 API에 쓸 수 있다(단위 8에서 테스트로 확인).
- 프론트 규칙: PIN 토큰은 **메모리(변수·상태)에만** 두고 localStorage·쿠키에 저장하지 않는다. 다음 때 **바로 버린다** — 로그아웃, 비밀번호 변경 204, PIN 변경·복구 204, 재로그인이 필요해 로그인 화면으로 갈 때, PIN 관련 403 응답(단위 8의 `PIN_REQUIRED`·`PIN_EXPIRED` 포함), 신체정보 화면을 벗어날 때(권장). **프론트에서 버리는 것은 노출을 줄일 뿐, 서버에서 토큰을 무효화하는 것은 아니다.**

**대기 (알려진 한계)**
- 같은 회원의 PIN 요청은 서버가 한 번에 하나씩 처리한다(동시에 여러 번 틀려도 5회를 넘지 않게). 그동안 **같은 회원의** 로그인·토큰 재발급·비밀번호 변경이 잠시 기다릴 수 있다. 보통은 짧지만 PIN 요청이 몰리면 대기도 길어질 수 있다.

## 신체정보·건강 지표

| Method | URL | PIN | 요청 | 응답 |
|---|---|---|---|---|
| POST | /api/v1/health/measurements | 불필요 | 본문(아래) | 201, data `{measurementId}` |
| GET | /api/v1/health/measurements | **필요** | 쿼리 `from`, `to`, `limit` | 200, data `{items: [측정 기록]}` |
| PATCH | /api/v1/health/measurements/{measurementId} | **필요** | 본문(바꿀 필드만) | 200, data 측정 기록 1건 |
| GET | /api/v1/health/metrics | **필요** | | 200, data 건강 지표(아래) |

**PIN이 필요한 API:** `Authorization`(로그인)과 함께 `X-Pin-Token: <pinToken>`(`PUT /users/me/pin` 또는 `POST /users/me/pin/verify`가 준 토큰)을 보낸다.

| 상황 | 응답 | 프론트 |
|---|---|---|
| PIN을 등록하지 않은 회원(어떤 토큰을 보내든) | 403 `PIN_NOT_REGISTERED` | PIN 등록 화면 |
| 헤더 없음·빈 값·잘못된 값·`Bearer `를 붙인 값·access 토큰·**다른 회원의** PIN 토큰 | 403 `PIN_REQUIRED` | PIN 입력 화면 |
| 만료된 PIN 토큰(발급 10분 후부터, 누구의 토큰이든) | 403 `PIN_EXPIRED` | PIN 입력 화면 |
| 내 PIN 토큰, 만료 전 | 통과 | |

- 세 오류 모두 `data` 없음, `WWW-Authenticate` 헤더 없음. 이 403이 오면 갖고 있던 PIN 토큰을 버린다.
- **오류가 나오는 순서:** 로그인 문제(401, 정지 계정 403 `ACCOUNT_SUSPENDED`) → 입력값 오류(400) → PIN(403) → 기록 없음(404). 그래서 입력값이 틀리면 PIN이 없어도 400이고, 다른 회원의 기록 번호는 PIN을 통과해야만 404로 보인다(PIN 없이 남의 기록이 있는지 알 수 없음).
- PIN 토큰이 서버에서 무효화되지 않는 한계는 위 "PIN"의 설명과 같다.

**입력값 (POST·PATCH 공통)** — 의학적 정상 범위가 아니라 **이 서비스가 받는 입력 범위**다.

| 필드 | 범위 | 형식 |
|---|---|---|
| `heightCm` | 1 ~ 300 | JSON **숫자**, 소수 첫째 자리까지(`170`, `170.5`) |
| `weightKg` | 1 ~ 500 | 〃 |
| `bodyFatPct` | 1 ~ 80 | 〃 |
| `skeletalMuscleKg` | 1 ~ 200 | 〃 |
| `measuredAt` | 1900-01-01T00:00:00 ~ 지금 | 문자열 `"YYYY-MM-DDTHH:mm:ss"`(시간대 없음, 서버 시간대 기준) |

- 문자열 숫자(`"170"`), 지수 표기(`1.7e2`), 소수 둘째 자리(`170.55`), 범위 밖, 미래 시각, `measuredAt`의 `""`·공백은 400 `INVALID_REQUEST`.
- 이 밖의 필드(`bmi`, `userId`, `source` 등)는 무시한다. 기록은 항상 로그인한 회원의 것이다.

**등록 (`POST`)**
- 항상 **새 기록 1건을 추가**한다(이전 기록을 고치지 않음). `heightCm`·`weightKg` 중 하나 이상 필수(체지방·골격근만은 400). 키와 몸무게를 따로 보내도 된다.
- `measuredAt`을 빼거나 `null`이면 서버의 현재 시각(초 단위).
- 응답은 `measurementId`만이다. PIN 없이 쓰는 API라 입력값·BMI를 돌려주지 않는다(PIN 우회 방지).

```json
{ "heightCm": 175.0, "weightKg": 70.2, "measuredAt": "2026-11-23T08:30:00" }
{ "success": true, "message": "요청 성공", "data": { "measurementId": 123 } }
```

**목록 (`GET`)**
- `from`, `to`: 날짜 `YYYY-MM-DD`(1900-01-01 ~ 9999-12-31), **양 끝 날짜 포함**(`measuredAt` 기준). 빼면 제한 없음. 범위 밖이거나 `from`이 `to`보다 늦으면 400.
- `limit`: 1~100, 기본 30.
- 순서: `measuredAt` 최신순, 같으면 `measurementId` 큰 순. 기록이 없으면 `items: []`.

**측정 기록 (목록 항목·PATCH 응답)**

```json
{ "measurementId": 123, "measuredAt": "2026-11-23T08:30:00", "heightCm": 175.00, "weightKg": 70.20,
  "bodyFatPct": null, "skeletalMuscleKg": null, "bmi": 22.92 }
```

- 숫자는 소수 둘째 자리까지(DB와 같음). 입력하지 않은 값은 `null`.
- `bmi`는 **저장하지 않고 응답할 때 계산**한다. 그 기록에 키와 몸무게가 **둘 다** 있을 때만 값이 있고 아니면 `null`(소수 둘째 자리, 반올림).

**수정 (`PATCH`)**
- 보낸 필드만 바뀐다. 빼거나 `null`이면 그대로다. **값을 지우는 방법은 없다.** `{}`이면 아무것도 바꾸지 않고 현재 기록을 준다.
- 다른 회원의 기록이나 없는 번호는 404 `MEASUREMENT_NOT_FOUND`(PIN 통과 후).
- 같은 기록을 동시에 수정하면 서버가 하나씩 처리한다. **서로 다른 필드는 둘 다 반영**되고, 같은 필드는 나중에 처리된 요청의 값이 남는다.
- 수정 이력은 남지 않는다(DB에 수정일 컬럼이 없음).

**건강 지표 (`GET /health/metrics`)** — 모든 값은 **추정값**이다.

```json
{
  "basedOn": { "heightCm": 175.00, "heightMeasuredAt": "2026-11-19T12:00:00",
               "weightKg": 70.00, "weightMeasuredAt": "2026-11-20T12:00:00" },
  "bmi": 22.86, "bmr": 1674, "activityFactor": 1.375, "tdee": 2301,
  "formula": "Mifflin-St Jeor", "isEstimated": true,
  "missingFields": [], "notCalculableFields": []
}
```

- **기준값:** 키가 있는 기록 중 가장 최근 것의 키, 몸무게가 있는 기록 중 가장 최근 것의 몸무게를 **각각** 쓴다(서로 다른 기록일 수 있음, 순서는 목록과 같음). 그래서 `basedOn`에 키·몸무게의 측정 시각이 따로 있다. **발췌본 7.2의 `basedOn{measurementId, measuredAt, …}`에서 변경**(HEALTH8-7).
- 생년월일·성별·운동 수준은 프로필(`/users/me/profile`)의 값. 나이는 서버 날짜 기준 만 나이.
- BMI = 몸무게(kg) ÷ 키(m)², 소수 둘째 자리 / BMR(기초대사량) = 10×kg + 6.25×cm − 5×나이 + (남 +5, 여 −161, `other`·`undisclosed` −78), 정수 / TDEE(하루 소비 열량) = 반올림 **전** BMR × 활동계수, 정수 / 활동계수: `beginner` 1.375, `intermediate` 1.55, `advanced` 1.725, `undecided`(프로필 없음 포함) 1.2. 반올림은 모두 사사오입(0.5는 올림).
- **`missingFields`:** 아직 없는 입력(순서 고정 `heightCm`, `weightKg`, `birthDate`, `gender`). BMI는 키·몸무게, BMR·TDEE는 넷 다 필요하다. 계산하지 못한 값은 `null`. 화면은 이 목록으로 "입력해 주세요"를 안내한다.
- **`notCalculableFields`:** 입력은 다 있는데 반올림 전 BMR이 **0 이하**이면 `bmr`·`tdee`가 `null`이고 `["bmr","tdee"]`(평소 `[]`). 화면은 "입력값을 확인해 주세요"로 안내한다. 다른 값으로 보정하지 않는다(**발췌본 7.2에 추가된 필드**, HEALTH8-16).
  - 반올림 전 BMR이 0보다 크면 정상 결과다. 매우 작으면 정수로 반올림해 `bmr: 0`, `tdee: 0`이 나올 수 있다(예: 키 15.7cm·몸무게 2.2kg·25세 남성 → BMR 0.125). 서버는 "작지만 양수인 BMR"을 따로 거르지 않는다(기준을 만들면 의료 판단이 되기 때문, 알려진 한계).
- BMI 구간 판정(정상·과체중 등), 목표 열량 가감, 미성년자 계산 제한은 하지 않는다.

**알려진 한계·참고**
- 서버 시간대: `measuredAt` 기본값과 나이 계산은 **서버 시간대**를 따른다. 지금 로컬 개발 환경은 한국 시간이고, 배포 환경 시간대는 아직 정하지 않았다.
- CORS를 나중에 켜면 허용 헤더에 `X-Pin-Token`을 넣어야 한다(지금은 CORS 설정 없음).
- "키·몸무게가 등록되어 있는지"만 PIN 없이 알려 주는 API는 없다(프론트 요청 사항, 별도 결정 예정).

## 쿠키를 바꾸는 요청 (프론트 연동 규칙)

- 로그인, 토큰 재발급(`/auth/token/refresh`), 로그아웃, 비밀번호 변경은 refresh 쿠키를 만들거나 지운다.
- 이 네 요청은 **한 번에 하나씩, 앞 요청의 응답을 처리한 뒤에** 다음 요청을 보낸다. 늦게 도착한 응답(예: 비밀번호 변경의 쿠키 삭제)이 그사이 새로 받은 로그인 쿠키를 지울 수 있기 때문이다.
