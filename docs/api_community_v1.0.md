# 커뮤니티 API 상세 명세 v1.0

- 작성일: 2026-11-25 (2026-11-26 C2 갱신)
- 상태: C1(자유게시판 목록·상세·작성), **C2(자유게시판 본인 글 수정·삭제, 상세 `mine`)** 반영. 댓글·좋아요·신고, 루틴 공유(`routine`)·초보자 Q&A(`question`) 작성·수정, 검색(`keyword`)·내 글 목록(`mine=true` 쿼리)은 아직 없다. 커뮤니티 단위가 추가될 때마다 같은 PR에서 갱신한다.
- 응답 형식·인증·공통 오류 코드는 [회원 API 명세](api_member_v1.0.md) "공통"과 같다.

## 공통

**인증**

- 목록·상세(`GET`)는 로그인 없이 쓸 수 있다(D-02). 토큰이 없을 때는 `Authorization` 헤더를 빼고 보낸다. 만료·잘못된 토큰을 붙이면 공개 API라도 401이다.
- 작성(`POST`)·수정(`PATCH`)·삭제(`DELETE`)는 로그인이 필요하다. **작성자는 서버가 access 토큰의 회원으로 정한다.** 요청 본문에 `userId`·`authorName` 등을 넣어도 무시된다.
- 상세(`GET /{postId}`)는 토큰이 있으면 `mine`(내가 쓴 글인지)을 채운다. 토큰이 없으면 `mine:false`. 회원 번호는 응답에 없다.

**게시판 값(`postType`)** — ERD 값 그대로(Q-11)

| 값 | 게시판 | 이번 상태 |
|---|---|---|
| `general` | 자유게시판 | 목록·상세·작성·**본인 글 수정·삭제** |
| `routine` | 루틴 공유 | 목록·상세만(작성은 400, 수정·삭제는 404) |
| `question` | 초보자 Q&A | 목록·상세만(작성은 400, 수정·삭제는 404) |
| `notice` | (사용 안 함) | 목록 필터·작성 모두 400, 목록·상세에 나오지 않음 |

**시각:** `createdAt`은 서울 시각이며 오프셋이 없다(`"2026-11-25T09:30:00"`). 프론트는 `+09:00`을 붙여 해석한다.

**오류 코드**

| HTTP | errorCode | 상황 |
|---|---|---|
| 400 | INVALID_REQUEST | 입력값 규칙 위반, JSON 형식 오류, 쿼리 값 오류, 숫자가 아닌 `postId` |
| 401 | LOGIN_REQUIRED / TOKEN_EXPIRED / INVALID_TOKEN | 작성·수정·삭제 시 토큰 없음 / 만료 / 잘못된 토큰(공개 GET에 잘못된 토큰을 붙인 경우 포함) |
| 403 | ACCOUNT_SUSPENDED | 정지된 계정 |
| 403 | ACCESS_DENIED | 남이 쓴 공개 자유게시판 글을 수정·삭제 |
| 404 | POST_NOT_FOUND | 없는 글, 숨김·삭제된 글, 0 이하 `postId`, (수정·삭제) 자유게시판이 아닌 글 — 모두 같은 응답(숨김 여부를 알리지 않음) |
| 500 | INTERNAL_ERROR | 서버 오류 |

수정·삭제의 오류 순서: **401 → 400 → 404 → 403.** 본문이 잘못되면 글이 있는지·누구 글인지 보기 전에 400이다. 남의 숨김·삭제·다른 게시판 글은 403이 아니라 404다.

## 게시글

| Method | URL | 요청 | 성공 |
|---|---|---|---|
| GET | `/api/v1/community/posts` | 쿼리: `postType`(선택), `page`(선택, 기본 0), `size`(선택, 기본 20) | 200, 아래 "목록" |
| GET | `/api/v1/community/posts/{postId}` | 없음 | 200, 아래 "상세" |
| POST | `/api/v1/community/posts` | `{"postType":"general","title":"...","content":"..."}` | **201** `{"postId": 12}` |
| PATCH | `/api/v1/community/posts/{postId}` | `{"title":"...","content":"..."}` | 200, "상세"와 같은 모양 |
| DELETE | `/api/v1/community/posts/{postId}` | 없음 | 200 `{"success":true,"message":"요청 성공"}` |

### 목록 `GET /api/v1/community/posts`

- 공개(`visible`) 글만, 최신순(`createdAt` 내림차순, 같은 시각이면 `postId` 내림차순).
- `postType`: `general`·`routine`·`question` 중 하나(소문자 그대로). 빼면 `notice`를 뺀 전체. 그 밖의 값은 400.
- `page`: 0부터. 음수·숫자 아님은 400. 마지막 페이지 뒤는 빈 `content`.
- `size`: 1~100. 범위 밖·숫자 아님은 400.
- 응답 `data`(팀 공통 페이지 형식):

```json
{
  "content": [
    { "postId": 12, "postType": "general", "title": "첫 글", "authorName": "닉네임", "createdAt": "2026-11-25T09:30:00" }
  ],
  "page": 0, "size": 20, "totalElements": 1, "totalPages": 1
}
```

- 본문(`content` 필드)·댓글 수·좋아요 수는 목록에 없다(댓글·좋아요 단위에서 필드를 추가한다).

### 상세 `GET /api/v1/community/posts/{postId}`

```json
{ "postId": 12, "postType": "general", "title": "첫 글", "content": "본문", "authorName": "닉네임", "createdAt": "2026-11-25T09:30:00", "mine": false }
```

- `mine`: access 토큰의 회원이 이 글을 썼으면 `true`, 아니거나 비회원이면 `false`. 화면이 수정·삭제 버튼을 보일지 정하는 값일 뿐이고, 수정·삭제 때 서버가 작성자를 다시 확인한다. 탈퇴한 회원의 글은 누구에게도 `true`가 아니다(재가입은 새 회원).

### 작성자 이름(`authorName`)

| 작성자 상태 | 표시 |
|---|---|
| 탈퇴 완료(`deleted`) | `탈퇴한 회원` (이전 닉네임은 보내지 않음, 탈퇴 A안) |
| 그 밖 | 닉네임(`user_profiles.display_name`) |
| 프로필·닉네임이 없음 | `회원` |

### 작성 `POST /api/v1/community/posts`

| 필드 | 규칙 |
|---|---|
| `postType` | 필수, 문자열. 이번에는 `general`만 |
| `title` | 필수, 문자열. 앞뒤 공백을 뺀 뒤 1~250자 |
| `content` | 필수, 문자열. 앞뒤 공백을 뺀 뒤 1~5,000자 |

- 숫자·불리언·배열·객체·`null`·누락은 400. 저장되는 값은 앞뒤 공백을 뺀 값이다.
- 글자 수는 코드포인트로 센다(이모지 1개 = 1자, DB와 같음).
- 앞뒤에서 지우는 공백은 JavaScript `trim()`이 지우는 문자와 같다: 탭·줄 바꿈(LF·CR·U+2028·U+2029)·U+000B·U+000C·U+FEFF와 모든 유니코드 공백 문자(스페이스, NBSP U+00A0, 전각 공백 U+3000 등). 제어문자 U+001C~U+001F는 지우지 않는다(`trim()`과 같음).
- **중복 등록:** 같은 요청을 다시 보내면 글이 하나 더 생긴다(중복 방지 키 없음). 네트워크 오류·5xx·형식이 어긋난 성공 응답처럼 저장 여부를 알 수 없을 때는 자동으로 다시 보내지 말고, 목록에서 확인한 뒤 다시 보내도록 안내한다.

### 수정 `PATCH /api/v1/community/posts/{postId}` (C2)

- 대상: **공개(visible) 자유게시판(`general`) 글 중 내가 쓴 글만.** 그 밖은 위 오류 표대로.
- 본문: `title`·`content` **둘 다 필수**, 규칙은 작성과 같다(앞뒤 공백 제거 후 1~250자 / 1~5,000자, 코드포인트, 문자열만). `postType`·`userId`·`visibility` 등 다른 필드는 무시한다(게시판·작성자·공개 상태는 바뀌지 않는다).
- 성공 200: "상세"와 같은 모양(`mine: true`). 저장 시각(`updated_at`)은 서버 시계로 바뀐다. 공백 정리 뒤 제목·본문이 그대로면 아무것도 바꾸지 않고 200.
- **동시 수정:** 같은 글의 수정·삭제는 서버가 한 번에 하나씩 처리한다. 두 수정은 **나중에 처리된 쪽이 남는다**(버전 검사 없음). 결과를 모르는 수정(네트워크 오류·5xx)을 다시 보내면, 그 사이 다른 기기·탭에서 고친 내용을 덮어쓸 수 있다. 자동으로 다시 보내지 말고 사용자에게 알린 뒤 사용자가 고르게 한다.
- 삭제가 먼저 처리되면 기다리던 수정은 404다(삭제된 글이 수정으로 되살아나지 않는다).
- 요청을 보낸 뒤 화면에서 기다리기를 취소해도 서버가 이미 받은 수정은 반영될 수 있다(취소는 서버 처리를 되돌리지 않는다). 화면은 "저장되지 않았다"고 말하지 말고 다시 불러와 확인하게 한다.

### 삭제 `DELETE /api/v1/community/posts/{postId}` (C2)

- 대상은 수정과 같다. **soft delete**: 행·제목·본문은 남기고 `visibility`만 `deleted`로 바꾼다. 이후 목록에서 빠지고 상세는 404다.
- 성공 200 본문은 `{"success":true,"message":"요청 성공"}`이다. 공통 응답이 null 필드를 빼므로 **`data`·`errorCode` 키가 없다.**
- 이미 삭제된 글을 다시 지우면 404 `POST_NOT_FOUND`. 이 404는 숨김·없는 글과 구분되지 않으므로, 화면은 "삭제했어요"라고 단정하지 말고 "글을 찾을 수 없어요" 같은 중립 안내를 쓴다.

## DB

- C2(수정·삭제)는 기존 컬럼(`title`·`content`·`visibility`·`updated_at`)만 쓴다. DB 변경·migration은 없다.
- 새 DB는 `database/schema/001_create_tables.sql`에 `community_posts.post_id` 자동 번호(AUTO_INCREMENT)가 들어 있다.
- **기존 DB**는 `database/migration/20261125_community_posts_pk_auto_increment.sql`을 실행해야 글 작성이 된다(안 하면 서버는 뜨지만 작성이 500). 파일 맨 위의 실행 방법을 따른다. 운영 DB는 백업 후, 이 기능이 들어간 앱을 배포하기 전에 실행한다.
