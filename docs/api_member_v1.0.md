# 회원 API 상세 명세 v1.0

- 작성일: 2026-11-23
- 상태: 단위 4(내 정보·프로필) 반영. 회원 단위가 추가될 때마다 같은 PR에서 갱신한다.
- 회원가입·로그인·토큰 재발급·로그아웃은 아직 이 문서에 없다(다음 갱신 때 추가).

## 공통

**응답 형식** (현재 코드 기준)

```json
{ "success": true, "message": "요청 성공", "data": {} }
{ "success": false, "message": "요청 값이 올바르지 않습니다.", "errorCode": "INVALID_REQUEST" }
```

- 필드별 오류 목록은 아직 없다. 어떤 값이 틀렸는지는 응답으로 알려 주지 않으므로 프론트에서도 같은 규칙으로 먼저 검사하는 것을 권한다.

**인증**

- 이 문서의 API는 모두 로그인이 필요하다: `Authorization: Bearer <accessToken>`.
- 대상 회원은 토큰의 회원뿐이다. 요청 본문에 `userId` 등을 넣어도 다른 회원을 조회·수정할 수 없다.

**오류 코드**

| HTTP | errorCode | 상황 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력값 규칙 위반, JSON 형식 오류, 본문 없음 |
| 401 | LOGIN_REQUIRED / TOKEN_EXPIRED / INVALID_TOKEN | 토큰 없음 / 만료(재발급 후 재시도) / 잘못된 토큰 |
| 409 | NICKNAME_ALREADY_EXISTS | 다른 회원이 쓰는 닉네임(대소문자 무시) |
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
