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
| POST | /api/v1/workout-routines | 회원 | 201 |
| GET | /api/v1/workout-routines | 비회원 가능 | 내 루틴 + public. `items` 없음 |
| GET | /api/v1/workout-routines/{routineId} | 비회원 가능 | private은 소유자만, shared·public은 누구나 |
| PATCH | /api/v1/workout-routines/{routineId} | 소유자 | |
| DELETE | /api/v1/workout-routines/{routineId} | 소유자 | 운동 기록은 남고 루틴 연결만 해제 |

```json
{
  "routineName": "하체 루틴",
  "description": "선택",
  "difficulty": "beginner",
  "visibility": "private",
  "items": [
    { "exerciseId": 1, "targetSets": 3, "targetReps": 10, "targetDurationSeconds": null, "restSeconds": 60 }
  ]
}
```

- `routineName`, `items`(1~100개), `exerciseId`, `targetSets`는 생성 시 필수다.
- `sequenceNumber`는 `items` 순서대로 서버가 1부터 부여한다.

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
