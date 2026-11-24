# 운동 API 상세 명세 v1.0

- 작성일: 2026-11-05
- 상태: 미확정 (테이블 구조를 기준으로 작성한 초안, 팀 검토 필요)
- URL 목록은 `apiEndpoint.md`를 따른다.

## 공통

**응답 형식**

```json
{ "success": true, "message": "요청 성공", "data": {} }
{ "success": false, "message": "로그인이 필요합니다.", "errorCode": "LOGIN_REQUIRED" }
```

**페이지 응답** (`page`는 0부터, `size`는 1~100, 기본 20)

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

**회원 구분**

- 로그인 개발 전까지 `X-User-Id: 1` 헤더로 회원을 구분한다. (임시, 개발 환경 전용)
- 회원 API를 헤더 없이 호출하면 `401 LOGIN_REQUIRED`를 반환한다.
- 프론트엔드는 비회원이 회원 기능 버튼을 누르면 로그인 필요 안내를 보여 주고 `/login`으로 이동한다.

| 구분 | API |
|---|---|
| 비회원 가능 | 운동 검색·상세, 루틴 목록·상세(공개 범위 내) |
| 회원 전용 | 그 외 전부 |

**오류 코드**

| HTTP | errorCode | 상황 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력값 오류 |
| 401 | LOGIN_REQUIRED | 비회원, 없는 사용자 |
| 403 | ACCESS_DENIED | 다른 사용자의 데이터 |
| 404 | EXERCISE_NOT_FOUND, ROUTINE_NOT_FOUND, SESSION_NOT_FOUND, GOAL_NOT_FOUND, NOT_FOUND | 대상 또는 경로 없음 |
| 409 | INVALID_SESSION_STATUS | 이미 종료된 운동 기록의 상태 변경 |
| 409 | REQUEST_CONFLICT | 같은 `requestId`로 다른 내용을 다시 보냄 |
| 409 | REVISION_MISMATCH | `expectedRevision`이 현재 값과 다름. `data.currentRevision`에 현재 값 |
| 409 | SET_TARGETS_WOULD_BE_LOST | 세트별 목표가 있던 운동을 예전 방식 항목으로 바꾸는 PATCH. `discardSetTargets: true`가 필요 |
| 409 | DATA_CONFLICT | DB 제약 조건 충돌 |
| 500 | INTERNAL_ERROR | 서버 오류 |

**값 목록**

- `difficulty`: beginner, intermediate, advanced
- `visibility`: private(기본), shared, public
- 운동 기록 `status`: standby, in_progress, completed, interrupted, cancelled
- 목표 `status`: active, completed, paused, cancelled
- `preferenceExerciseEquipment`: body, dumbbell, band

PATCH에서 `null`이거나 생략한 필드는 바뀌지 않는다. `items`, `exercises`를 보내면 목록 전체를 교체한다.

## 운동

| Method | URL | 요청 | data |
|---|---|---|---|
| GET | /api/v1/exercises | `keyword`, `difficulty`, `exerciseType`, `equipment`, `page`, `size` | 운동 페이지 |
| GET | /api/v1/exercises/{exerciseId} | | 운동 |

운동: `exerciseId, name, instructions, difficulty, exerciseType, exerciseEquipment, description, cautions, sourceUrl`

## 즐겨찾기 (회원)

| Method | URL | data |
|---|---|---|
| GET | /api/v1/users/me/favorite-exercises | 운동 목록 |
| PUT | /api/v1/users/me/favorite-exercises/{exerciseId} | 없음 (이미 등록돼 있어도 성공) |
| DELETE | /api/v1/users/me/favorite-exercises/{exerciseId} | 없음 (등록돼 있지 않아도 성공) |

## 운동 루틴

| Method | URL | 권한 | 비고 |
|---|---|---|---|
| POST | /api/v1/workout-routines | 회원 | 201. 같은 `requestId` 재전송이면 200 |
| GET | /api/v1/workout-routines | 비회원 가능 | 내 루틴 + public. `items` 없음 |
| GET | /api/v1/workout-routines/{routineId} | 비회원 가능 | private은 소유자만, shared·public은 누구나 |
| PATCH | /api/v1/workout-routines/{routineId} | 소유자 | `expectedRevision` 선택 |
| DELETE | /api/v1/workout-routines/{routineId}?expectedRevision= | 소유자 | 운동 기록은 남고 루틴 연결만 해제. `expectedRevision` 선택 |

```json
{
  "routineName": "하체 루틴",
  "description": "선택",
  "difficulty": "beginner",
  "visibility": "private",
  "requestId": "rt-7f3a9c",
  "items": [
    { "exerciseId": 1, "recordType": "weight", "restSeconds": 60,
      "sets": [{ "reps": 12, "weightKg": 40 }, { "reps": 10, "weightKg": 50 }] },
    { "exerciseId": 2, "targetSets": 3, "targetReps": 10, "targetDurationSeconds": null, "restSeconds": 60 }
  ]
}
```

- `routineName`, `items`(1~100개), `exerciseId`는 생성 시 필수다.
- `items`가 100개, 항목의 `sets`가 200개를 넘으면 그 자리에서 읽기를 멈추고 400이다. 아주 큰 목록을 보내도 서버가 전부 메모리에 올리지 않는다.
- `sequenceNumber`는 `items` 순서대로 서버가 1부터 부여한다.

**항목은 두 가지 모양 중 하나로 보낸다** (2026-11-24 추가)

- **세트별 목표:** `recordType` + `sets`(1~200개). 이때 `targetSets`·`targetReps`·`targetDurationSeconds`는 보내지 않는다. 서버가 세트 수와 첫 세트 값으로 채워서, 응답에서 `targetSets`·`targetReps`만 읽는 클라이언트도 대략적인 목표를 볼 수 있다. 서버 안에서 이 값을 읽는 코드는 없다. 루틴으로 세션을 시작하면 운동만 복사하고 목표 값은 복사하지 않는다.
- **예전 방식:** `targetSets`(필수), `targetReps`, `targetDurationSeconds`. 응답에 `recordType`·`sets`가 없다.
- `restSeconds`는 두 모양 모두 쓸 수 있다.
- **세트별 목표가 있던 운동을 예전 방식으로 바꾸는 PATCH는 409 `SET_TARGETS_WOULD_BE_LOST`다.** 예전 방식은 세트마다 다른 목표와 중량을 담을 수 없어서 세트별 목표가 사라지기 때문이다. 일부러 바꾸려면 PATCH 본문에 `"discardSetTargets": true`를 함께 보낸다.
  - 운동별로 비교한다. 세트별 목표가 있던 운동이 새 `items`에 예전 방식으로 들어 있고, 그 운동의 세트별 항목 수가 전보다 줄었을 때만 해당한다.
  - 플래그 없이 통과하는 경우: 원래 예전 방식이던 항목을 그대로 보내는 것(휴식 시간 등을 바꿔도), 세트별 항목은 그대로 두고 순서만 바꾸는 것, 운동을 아예 빼는 것(형식 전환이 아니라 삭제), `items` 없이 이름 등만 바꾸는 것.

`recordType`별로 세트에 쓸 수 있는 값은 아래와 같다. 표에 없는 값을 보내거나 필수 값이 빠지면 400이다. 값은 따옴표 없는 숫자만 받는다.

| recordType | 필수 | 선택 |
|---|---|---|
| reps (횟수) | reps | |
| weight (중량+횟수) | reps | weightKg |
| time (시간) | targetSeconds | |
| time_reps (시간+횟수) | reps, targetSeconds | |
| weight_time (중량+시간) | targetSeconds | weightKg |

- `reps`: 1~999 정수 / `targetSeconds`: 1~3600 정수 / `weightKg`: 0~999, 소수 둘째 자리까지
- `weightKg`는 끝의 0을 지워 저장한다. 50.00은 50, 22.50은 22.5로 돌려준다.

**중복 저장 방지(`requestId`)**

- 형식: 영문·숫자·`-`·`_`, 1~100자. 선택 값이다. **대소문자를 구분한다**(`RT-1`과 `rt-1`은 다른 요청). 프론트 로컬 저장소와 같은 규칙이고, 컬럼 정렬 규칙을 `utf8mb4_bin`으로 두었다.
- 같은 회원이 같은 `requestId`로 같은 내용을 다시 보내면 새로 만들지 않고 처음 만든 루틴을 돌려준다(200, `created: false`).
- 같은 `requestId`에 내용이 다르면 409 `REQUEST_CONFLICT`다.
- 새로 만들면 201, `created: true`다. `created`는 생성 응답에만 있다.
- **동시에 들어온 같은 요청:** 같은 회원의 `requestId` 생성 요청은 한 번에 하나씩 처리한다(회원 행 잠금). 두 번째 요청은 첫 요청이 끝난 뒤 조회하므로 동시에 보내도 결과는 위와 같다(같은 내용 200, 다른 내용 409 `REQUEST_CONFLICT`). `DATA_CONFLICT`로 끝나지 않는다.
- **수정한 뒤 같은 요청을 다시 보내면:** 지금 저장된 루틴과 비교한다. 수정으로 내용이 바뀌었으면 409 `REQUEST_CONFLICT`다. 프론트 로컬 저장소도 지금 값과 비교한다.
- **삭제한 뒤 같은 요청을 다시 보내면:** 그 `requestId`를 가진 루틴이 없으므로 새 루틴을 만든다(201, `created: true`). 프론트 로컬 저장소와 같은 동작이다.

**동시 수정 감지(`revision`)**

- 루틴 응답에 `revision`이 있다. 생성하면 1이고 PATCH할 때마다 1씩 오른다.
- `revision`과 `requestId`는 **루틴 주인에게만** 응답에 나온다. 공개·공유 루틴을 비회원이나 다른 회원이 조회하면 두 필드가 없다(목록·상세 모두). 수정할 수 있는 사람이 주인뿐이고, `requestId`는 주인의 클라이언트가 만든 내부 값이기 때문이다.
- 다른 회원의 루틴이나 없는 루틴에 PATCH·DELETE를 보내면 잠금 없이 바로 403·404로 답한다. 동시 수정을 막는 행 잠금은 주인의 요청만 건다.
- PATCH 본문이나 DELETE 쿼리에 `expectedRevision`을 보내면, 현재 값과 다를 때 409 `REVISION_MISMATCH`, `data: { "currentRevision": 3 }`이다.
- 보내지 않으면 예전처럼 검사 없이 처리한다.

## 운동 기록 (회원, 본인 기록만)

| Method | URL | 요청 | 비고 |
|---|---|---|---|
| POST | /api/v1/workout-sessions | 아래 참고 | 201, 상태는 in_progress |
| GET | /api/v1/workout-sessions | `status`, `from`, `to`(YYYY-MM-DD), `page`, `size` | `exercises` 없음 |
| GET | /api/v1/workout-sessions/summary | `from`, `to` 필수 | 통계 |
| GET | /api/v1/workout-sessions/{sessionId} | | |
| PATCH | /api/v1/workout-sessions/{sessionId} | 아래 참고 | |
| PATCH | /api/v1/workout-sessions/{sessionId}/status | `{ "status": "completed" }` | completed, interrupted, cancelled만 허용 |

```json
{
  "routineId": 1,
  "startedAt": "2026-11-05T10:00:00",
  "exercises": [
    {
      "exerciseId": 1,
      "exerciseRoutineItemId": 1,
      "sets": [{ "reps": 10, "weightKg": 20, "durationSeconds": null, "distanceM": null, "restSeconds": 60 }]
    }
  ]
}
```

- 모든 필드는 선택이다. `startedAt`을 생략하면 현재 시각을 쓴다.
- `routineId`만 보내면 루틴의 운동을 복사한다.
- `setNumber`는 `sets` 순서대로 서버가 1부터 부여한다.
- `exerciseRoutineItemId`는 응답 값을 그대로 보낸다. 이 기록의 루틴에 속하고 운동이 같아야 한다.
- PATCH는 `startedAt`, `endedAt`, `feedbackRating`(1~5), `feedbackNote`, `exercises`를 받는다.
- 상태 변경 시 `endedAt`이 비어 있으면 현재 시각을 넣는다.

**통계**: completed 기록만 집계한다.

```json
{ "from": "2026-11-01", "to": "2026-11-07", "sessionCount": 3, "totalDurationSeconds": 5400, "totalVolumeKg": 1200.00 }
```

## 운동 목표 (회원, 본인 목표만)

| Method | URL | 비고 |
|---|---|---|
| POST | /api/v1/exercise-goals | 201 |
| GET | /api/v1/exercise-goals | 목록 |
| PATCH | /api/v1/exercise-goals/{goalId} | `status` 변경 가능 |

```json
{
  "goalName": "주 3회 운동",
  "targetValue": 70.5,
  "startDate": "2026-11-05",
  "endDate": "2026-12-05",
  "exerciseMin": 30,
  "preferenceExerciseEquipment": "dumbbell"
}
```

`goalName`, `startDate`, `exerciseMin`은 생성 시 필수다.
