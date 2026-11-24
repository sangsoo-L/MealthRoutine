# MealthRoutine (밀스루틴) 프론트엔드

운동·식단 건강관리 웹앱 **밀스루틴(MealthRoutine)** 의 프론트엔드입니다. 운동 탐색·루틴·오늘 운동 진행과 기록, 식단 기록과 목표, 초급 운동 추천, AI 코칭 안내(운동 플랜 예시·음식 사진 분석 화면·주간 리포트), 통합 AI 멤버십 안내, 커뮤니티(자유게시판·초보자 Q&A), 마이페이지·설정·고객지원 화면을 React로 구현했습니다.

> **현재는 백엔드 연동 전 단계입니다.** 서버 API 호출 코드는 아직 없습니다. 개발 서버(`npm run dev`)에서는 개발 전용 모의 계정과 브라우저 저장소(IndexedDB·sessionStorage)·탭 메모리 예시로 동작하고, **운영 빌드에는 이 개발용 데이터가 포함되지 않습니다**(운영 빌드는 서버가 필요한 화면에서 "연결 전·준비 중"을 안내하며 성공을 가장하지 않습니다).

## 기술 스택

| 구분      | 사용 기술                                                  |
| --------- | ---------------------------------------------------------- |
| 언어      | TypeScript (strict 모드), TSX                              |
| UI        | React 19                                                   |
| 라우팅    | React Router 8 (`createBrowserRouter`, 일반 경로 URL)      |
| 번들러    | Vite 8                                                     |
| 스타일    | Tailwind CSS v4 (CSS의 `@import "tailwindcss"`와 `@theme`) |
| 폰트      | Paperlogy (`src/assets/fonts/`, 아래 "폰트 라이선스")      |
| 코드 품질 | ESLint, Prettier, `tsc --noEmit`                           |
| 테스트    | Node 내장 테스트 러너(`node --test`), 헤드리스 Chrome 회귀 |

## 설치와 실행

Node.js **24 이상**(`package.json`의 `engines`)이 필요합니다. 검증한 환경은 Node.js 24.18.0, npm 11.16.0입니다.

```sh
npm ci            # 설치(package-lock.json 기준)
npm run dev       # 개발 서버. 터미널에 표시된 주소(기본 http://localhost:5173)를 연다. 로그인하려면 백엔드(localhost:8080)도 실행
npm run build     # 운영 빌드를 dist/에 생성
npm run preview   # 빌드 결과를 로컬에서 확인
```

## 환경변수 설정

**필수 환경변수는 없습니다.** 비밀 값·API 키도 쓰지 않습니다. 선택 변수는 하나입니다.

- `VITE_DEV_AUTH=true`(개발 서버 전용): 실제 백엔드 대신 개발용 모의 계정으로 로그인합니다. 비우면(기본) 실제 백엔드로 로그인합니다. 운영 빌드는 이 값과 상관없이 실제 백엔드를 씁니다. 설명은 `.env.example`에 있습니다.
- 실제 값은 Git에서 제외되는 `.env.development.local` 등에 둡니다. `.env`, `.env.*`는 Git에서 제외됩니다(`.env.example`만 예외).
- API 주소 환경변수는 없습니다. 브라우저는 같은 출처의 `/api`로만 호출하고, 개발 서버(`vite.config.js`의 `server.proxy`)가 `http://localhost:8080`으로 전달합니다(`npm run preview`도 같은 설정을 씁니다).
- 개발용 기능은 Vite가 제공하는 `import.meta.env.DEV`로 구분합니다. 이 값은 빌드 때 상수가 되어 운영 빌드에서 개발용 코드가 제거됩니다.
- Chrome 회귀 테스트에는 선택 환경변수가 있습니다(`tests/chrome/README.md`).

## 라우터와 SPA fallback (배포 시 필수)

라우터는 `createBrowserRouter`이고 URL은 `/login`, `/records/exercise`, `/community`처럼 일반 경로입니다(`#` 해시 라우터를 쓰지 않습니다). 따라서 **정적 호스팅에는 모든 경로를 `index.html`로 돌려주는 SPA fallback 설정이 반드시 필요합니다.** 없으면 새로고침·직접 접속 시 404가 납니다.

- S3 + CloudFront: 오류 응답 403·404를 `/index.html`(응답 코드 200)로 매핑합니다.
- Nginx: `location / { try_files $uri /index.html; }`
- 구체적인 배포 방식은 팀이 정합니다(이 저장소는 정하지 않았습니다). 앱은 도메인 루트(`/`)에서 서비스한다고 가정합니다(`vite.config.js`에 `base` 설정 없음).
- 퍼센트 인코딩이 깨진 주소(`/community/posts/%` 등)는 호스트가 앱에 전달하기 전에 404를 낼 수 있습니다(호스트 설정에 의존).
- 화면 ID와 URL: URL은 v5.0 화면 명세가 정의하지 않아 개발 중 정한 **임시 확정 값**이며, 라우트 정의는 `src/app/router.tsx`(라우트 `handle.screenId`가 화면 ID)에 있습니다. 모든 화면은 단일 `AppShell` 레이아웃(본문 + 하단 탭)을 씁니다.

## 개발용 Mock과 운영 환경의 차이

| 구분          | 개발 서버(`npm run dev`)                                                                                           | 운영 빌드(`npm run build`)                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 로그인        | 실제 백엔드(`/api` 전달). `VITE_DEV_AUTH=true`면 개발 전용 모의 계정(아래 표)                                      | 실제 백엔드. 배포 서버가 같은 출처의 `/api`를 백엔드로 전달해야 함     |
| 회원가입      | 실제 백엔드 가입(이름·닉네임·이메일·비밀번호·동의). `VITE_DEV_AUTH=true`면 기존 가입 체험(가짜 인증·`/signup/pin`) | 실제 백엔드 가입. 성공하면 로그인 화면으로 이동(자동 로그인 없음)      |
| 기록·목표 등  | 브라우저 IndexedDB·sessionStorage의 개발용 저장소                                                                  | 운동 목록·세션·기록·내일 계획은 IndexedDB. 그 외는 "연결 전·준비 중"   |
| 커뮤니티      | 탭 메모리 예시 글(새로고침하면 초기화)                                                                             | "아직 글을 볼 수 없어요"(글이 없다는 뜻이 아님), 작성 폼은 등록 비활성 |
| AI·사진 분석  | 로컬 예시 추천, `?devAnalysis=` 개발 검증 상태                                                                     | AI 호출 없음. 분석 서버 연결 전 안내                                   |
| 멤버십·사용량 | 서버 연결 전("연결 전")                                                                                            | 서버가 준 값만 표시, 지금은 연결 전. 결제·구독 성공을 만들지 않음      |

개발용 데이터는 `import.meta.env.DEV` 분기 안에서만 불러옵니다. 이를 어기면 `npm run verify:dist`가 실패합니다.

### 통합 AI 멤버십 정책

- **운동 AI와 식단 AI(사진 분석·주간 코칭 포함)는 사용 횟수를 통합**해서 씁니다. 운동·식단별 멤버십 상품 구분은 없습니다.
- 무료: **가입 후 최초 AI 5회**, 월간 초기화 없음.
- 베이직·프로: 통합 AI 사용 횟수 기반 **월간 갱신형**. 제공 횟수 **30회(베이직)·100회(프로)는 최종 승인 전 권장안**이고 화면에도 그렇게 표시합니다. 가격과 결제 정책은 미확정입니다.
- 일반 운동·식단 기록과 조회는 횟수를 차감하지 않습니다.
- **실제 사용량과 권한 판정은 서버 기준입니다.** 프론트엔드는 사용량을 계산·차감·저장하지 않고 서버가 준 값만 보여 줍니다(`src/membership/`). 서버 연결 전·값 없음·계약 불일치에서는 권한을 부여하지도 제한하지도 않습니다(`unknown`).

## 명령 요약

| 명령                     | 설명                                         |
| ------------------------ | -------------------------------------------- |
| `npm run dev`            | 개발 서버                                    |
| `npm run build`          | 운영 빌드를 `dist/`에 생성                   |
| `npm run preview`        | 빌드 결과를 로컬에서 확인                    |
| `npm run verify:dist`    | 빌드 결과에 개발용 데이터·문구가 없는지 검사 |
| `npm run typecheck`      | TypeScript 타입 검사                         |
| `npm run lint`           | ESLint 검사 (경고 0 기준)                    |
| `npm run format:check`   | Prettier 형식 검사 (파일을 바꾸지 않음)      |
| `npm run format`         | Prettier로 파일 정리 (파일을 바꿈)           |
| `npm run test:node`      | Node 테스트 전체 (`tests/*.test.mjs`)        |
| `npm run test:dashboard` | 운동 대시보드 관련 Node 테스트 일부          |
| `npm run test:chrome`    | Chrome 회귀 테스트 (개발 서버 필요)          |

## 빌드 및 정적 검사

변경을 올리기 전에 아래를 순서대로 실행합니다.

```sh
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run verify:dist
```

- `typecheck`는 `build`에 포함되어 있지 않으므로 따로 실행합니다.
- `verify:dist`는 `build` 다음에 실행합니다. `dist/`가 없거나 비어 있으면 실패하고(종료 코드 2), 개발용 계정·시드·예시 저장소·안내 문구가 운영 번들에 남아 있으면 실패합니다(종료 코드 1).

## 테스트 실행

### Node 테스트

단위·렌더링 테스트이며 브라우저와 개발 서버 없이 실행합니다.

```sh
npm run test:node          # 전체 (node --test "tests/*.test.mjs" 와 같다)
npm run test:dashboard     # 대시보드 관련 일부
```

- `node --test tests/`처럼 **폴더를 인자로 주면 실패합니다.** 글롭(`"tests/*.test.mjs"`)을 쓰거나 위 npm 명령을 사용합니다.
- **Windows에서는 드라이브 문자가 대문자인 경로(`C:\...`)의 PowerShell에서 실행하세요.** 소문자 경로(`/c/...`, `c:\...`로 연 Git Bash 등)에서는 React 인스턴스가 둘로 갈라져 훅을 쓰는 컴포넌트 렌더링 테스트 일부가 실제 결함이 아닌데도 실패합니다. 실패하면 먼저 현재 경로의 드라이브 문자 대소문자를 확인합니다.
- 테스트는 Vite로 TypeScript 소스를 불러오므로 `npm ci`로 의존성을 설치한 상태여야 합니다.

### Chrome 회귀 테스트

실제 Chrome(헤드리스)으로 화면 동작을 확인하는 스크립트입니다. **개발 서버가 실행 중이어야 합니다.** 서버가 없으면 환경 오류(종료 코드 2)로 끝납니다.

Chrome 회귀 테스트는 개발용 모의 계정으로 로그인하므로 **개발 서버를 `VITE_DEV_AUTH=true`로 띄웁니다.** 가장 쉬운 방법은 OS와 상관없이 `frontend/.env.development.local` 파일에 `VITE_DEV_AUTH=true` 한 줄을 넣는 것입니다(Git 제외 파일, 실제 백엔드로 확인할 때는 지우거나 주석 처리). 명령으로 줄 때는 다음과 같습니다.

```sh
VITE_DEV_AUTH=true npm run dev -- --port 5199 --strictPort     # macOS·Git Bash
$env:VITE_DEV_AUTH='true'; npm run dev -- --port 5199 --strictPort   # Windows PowerShell
```

```sh
npm run dev -- --port 5199 --strictPort        # 터미널 1 (위처럼 VITE_DEV_AUTH=true)
npm run test:chrome                            # 터미널 2: 전체(오래 걸립니다)
npm run test:chrome -- --list                  # 스크립트·그룹 목록(서버·Chrome 불필요)
npm run test:chrome -- --group community       # 그룹만
npm run test:chrome -- --only w02-compose      # 스크립트만
```

- Google Chrome이 필요합니다. 자동으로 찾으며 못 찾으면 `CHROME_PATH`로 지정합니다. 개발 서버 주소는 `CHROME_TEST_BASE_URL`(기본 `http://localhost:5199`)로 바꿉니다.
- 종료 코드: `0` 전체 통과, `1` 실패, `2` 실행 환경 오류. 결과는 `PASS`/`FAIL` 건수로도 확인합니다.
- 스크린샷·프로필·로그는 OS 임시 폴더(`mealthroutine-chrome-tests`)에 만들어집니다. 일부 스크립트는 PC 부하가 크면 간헐적으로 실패할 수 있어 그 스크립트만 `--only`로 다시 실행해 봅니다.
- 자세한 사용법과 스크립트 목록은 `tests/chrome/README.md`를 봅니다. 실제 스크린 리더로 읽는 소리와 스크린샷 비교는 이 테스트로 확인하지 못합니다.

## 폴더 구조

```
.
├─ index.html              Vite 진입 HTML
├─ package.json            스크립트·의존성
├─ vite.config.js          React·Tailwind Vite 플러그인
├─ eslint.config.js        ESLint 설정
├─ .prettierrc.json        Prettier 설정
├─ .env.example            환경변수 안내(변수 없음)
├─ tsconfig.json           TypeScript 설정 (strict, src/ 검사)
├─ public/                 정적 리소스 (favicon)
├─ scripts/verify-dist.mjs 빌드 결과 검사
├─ src/
│  ├─ main.tsx, App.tsx    진입점, 라우터 연결
│  ├─ app/                 라우트 정의(router.tsx)와 라우트 handle 타입
│  ├─ layouts/, guards/    공통 레이아웃(AppShell), 라우트 가드(AuthGate 등)
│  ├─ pages/, components/  화면(페이지)과 화면별·공통 UI
│  ├─ auth/                인증 인터페이스(authBackend.ts)와 개발 전용 모의 계정(auth/dev/)
│  ├─ membership/          통합 AI 멤버십·사용량 계약과 AI 접근 상태
│  ├─ community/           커뮤니티 계약·검증·개발 전용 예시 저장소(community/dev/)
│  ├─ photo-analysis/, ai/ 음식 사진 분석·AI 코칭 계약과 로컬 예시
│  ├─ exercise/, food/, exercise-goal/, meal-goal/, health-goal/, body-measurements/,
│  │  weight-log/, notifications/, mypage/, growth-history/, quiz/, inquiry/, profile/,
│  │  support/, food-request/, onboarding-assessment/, signup-experience/   기능별 로직·타입
│  ├─ dev-mock/            개발 서버 전용 모의 저장소
│  ├─ styles/global.css    Tailwind import, 폰트, 디자인 토큰
│  └─ assets/              폰트(Paperlogy, 라이선스 포함)·이미지
└─ tests/
   ├─ *.test.mjs           Node 단위·렌더링 테스트
   └─ chrome/              Chrome 회귀 테스트 (run.mjs, lib/, specs/, README.md)
```

## 테스트용 모의 계정

개발 서버(`npm run dev`)를 **`VITE_DEV_AUTH=true`로 실행했을 때만** 쓰는 **개발 전용 모의 계정**입니다(기본 개발 서버는 실제 백엔드로 로그인). 서버에 만든 계정이 아니고 실제 인증이 아니며, 운영 빌드에는 포함되지 않습니다. 이메일은 `example.com` 가상 주소이며 계정 정보 전체(비밀번호 포함)는 `src/auth/dev/devAccounts.ts`에 있습니다. Chrome 회귀 테스트도 같은 계정으로 로그인합니다.

| 이메일                        | 닉네임   | 멤버십 유형 |
| ----------------------------- | -------- | ----------- |
| `member.free@example.com`     | 일반회원 | 일반        |
| `member.exercise@example.com` | 운동멤버 | 베이직      |
| `member.meal@example.com`     | 식단멤버 | 베이직      |
| `member.full@example.com`     | 종합멤버 | 프로        |

닉네임과 계정 식별자(`exercise`·`meal`·`full`)의 운동·식단·종합은 개발용 계정의 옛 이름일 뿐 멤버십 상품 구분이 아닙니다(저장 키·테스트 때문에 그대로 둠). 운영 계정·실제 비밀번호·토큰·API 키를 저장소나 테스트에 넣지 않습니다.

## 백엔드 API 인수인계

### 백엔드 개발·연동 현황 (먼저 읽어 주세요)

이 프론트엔드 패키지는 백엔드 구현 이전에 만든 것이라, 아래 인수인계 표는 **프론트엔드가 가정한 계약**을 기준으로 합니다. 팀 Repository의 현재 상태와 다음처럼 구분해서 이해해 주세요.

| 구분                        | 현재 상태                                                                                                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 백엔드 구현                 | 팀 Repository의 `develop` 브랜치에서 **일부 기능이 구현 진행 중**입니다(예: 인증·회원, 프로필, 운동·루틴·세션, 식단 목표·음식·식단 기록, 퀴즈·보상). 어디까지 구현됐는지는 `develop` 브랜치의 `backend/`와 `docs/`를 기준으로 확인합니다. |
| 프론트엔드·백엔드 실제 연동 | **인증(로그인·로그아웃·새로고침 후 로그인 유지·내 정보)·회원가입과 API 호출 공통 코드만 연결**됐습니다(아래 "API 호출 공통 코드"). 그 밖의 화면은 아직이며 아래 연결 위치의 팩토리 함수는 운영 빌드에서 `null`을 돌려줍니다.              |
| API 요청·응답 계약          | **담당자와 대조해 확정해야 합니다.** 백엔드가 구현돼 있어도 프론트엔드의 타입·필드명(`MembershipInfo`, `PostSummary` 등)은 임의 가정이라 그대로 맞는다고 보지 않습니다.                                                                   |
| 참고할 API 문서             | 팀 Repository의 `docs/`(예: `api_member_v1.0.md`, `api_exercise_v1.0.md`)와 `backend/` 소스를 참고합니다. 이 패키지에는 해당 문서가 들어 있지 않습니다.                                                                                   |

- 아래 표의 "계약 확정: 아니오"는 **프론트엔드 쪽 계약이 확정되지 않았다**는 뜻이며 의도적으로 유지했습니다. 백엔드 구현이 있는 영역도 요청·응답 필드, 오류 응답, 인증 방식을 담당자와 대조한 뒤에 연결 코드를 작성합니다.
- 연결 순서와 우선순위는 팀이 정합니다. 프론트엔드 쪽에서 새로 결정한 것은 없습니다.

### API 호출 공통 코드

회원 파트(팀장)가 만든 인증 공통 기반입니다. 다른 파트는 **자기 도메인 연결 파일에서 `apiRequest`만 가져다 씁니다.** `src/api/`와 `src/auth/`의 인증 파일은 지정 담당(팀장)만 수정하고, 프론트 연결 PR은 WOOJIN 님이 리뷰합니다.

```ts
import { ApiError, apiRequest } from '../api/http.ts'

const me = await apiRequest<{ userId: number }>('GET', '/users/me') // 로그인 필요(기본)
// 비회원도 되는 조회는 auth: 'optional'(로그인했으면 토큰을 붙임). 경로는 각 파트의 API 문서를 따른다.
await apiRequest('POST', '/health/measurements', { body: { weightKg: 70 } })
await apiRequest('GET', '/health/metrics', {
  headers: { 'X-Pin-Token': pinToken },
})

try {
  await apiRequest('POST', '/users/me/pin/verify', { body: { pin } })
} catch (error) {
  if (error instanceof ApiError && error.errorCode === 'PIN_INVALID') {
    // error.data에 서버의 실패 상세(remainingAttempts 등)가 그대로 있다
  }
}
```

- **경로:** `/api/v1` 뒤 부분만 씁니다(`/users/me`). `/`로 시작하지 않거나 `//`·`://`·`\`가 들어간 경로는 요청 없이 오류입니다.
- **결과:** 성공하면 응답의 `data`, 204·빈 본문이면 `undefined`. 실패하면 `ApiError { status, errorCode, message, data, retryAfter }`. 서버에 닿지 못하면 `status 0`·`errorCode 'NETWORK'`, 응답 형식이 다르면 `'INVALID_RESPONSE'`. 취소(`signal`)는 원래 `AbortError`를 그대로 던집니다.
- **`auth`:** `'required'`(기본, 로그인 안 했으면 요청 없이 `401 LOGIN_REQUIRED`) / `'optional'`(비회원도 되는 조회) / `'none'`(토큰·세션을 전혀 쓰지 않음).
- **토큰은 다루지 않습니다.** access 토큰은 메모리에만 있고 꺼내는 함수도 없습니다. `401 TOKEN_EXPIRED`이면 공통 코드가 재발급 후 **한 번만** 다시 보냅니다. `INVALID_TOKEN`·`LOGIN_REQUIRED`·`403 ACCOUNT_SUSPENDED`는 로그인 상태를 끝냅니다(화면은 로그아웃 상태가 됨). 그 밖의 403(PIN 관련·`ACCESS_DENIED`)·4xx·5xx는 그 요청만 실패합니다.
- **자동 재전송 없음:** 네트워크 오류·500은 서버가 이미 처리했을 수 있어 다시 보내지 않습니다. 필요하면 화면에서 사용자에게 다시 시도하게 합니다.
- **헤더:** `X-Pin-Token` 같은 추가 헤더는 `headers`로 넘깁니다. `Authorization`·`X-Requested-With`, 본문이 있을 때 `Content-Type`은 넣을 수 없습니다(대소문자 무관).
- **본문:** 일반 객체·배열만 JSON으로 보냅니다. `FormData`·`Blob`(파일 업로드)은 아직 지원하지 않습니다. 추가할 때는 `Content-Type`을 직접 붙이지 않는 규칙으로 공통 코드를 확장합니다(담당과 협의).
- **`cookieChanging: true`:** refresh 쿠키를 만들거나 지우는 요청(예: 비밀번호 변경)에만 씁니다. `auth` 모드(`required`·`optional`·`none`)와 상관없이 로그인·로그아웃·재발급과 한 번에 하나씩 순서대로 보냅니다.
- **배포:** 브라우저는 같은 출처의 `/api`만 호출합니다. 배포 서버(역방향 프록시 등)가 `/api`를 백엔드로 전달해야 하며 refresh 쿠키(`Secure`)는 HTTPS에서만 저장됩니다(`localhost`는 예외). 배포 설정은 팀이 정합니다.
- **알려진 한계:** 탭 사이에는 재발급 순서를 맞추지 않습니다(재시도로 완화만). 새로고침했을 때 다른 탭에서 다른 계정으로 로그인돼 있으면 이 탭도 그 계정으로 바뀌고 이 탭의 임시 입력이 지워지며, 따로 안내하지 않습니다. 멤버십 유형(`entitlement`)은 멤버십 API 연결 전까지 임시로 `free`이고, 닉네임이 없는 회원은 `회원`으로 표시합니다.

### 연결 위치와 미확정 계약

**원칙: 요청·응답 형식은 거의 모두 미확정입니다.** 아래 "계약 확정"이 "아니오"인 항목의 엔드포인트·필드명은 프론트엔드가 가정한 모양이며 백엔드와 협의되기 전에는 확정으로 보지 않습니다. 모든 연결 자리는 `createXxxSource()`/`createXxxRepository()` 같은 **팩토리 함수**이며, 운영 빌드에서는 `null`을 돌려주고 화면이 "연결 전·준비 중"을 보입니다. 연결할 때는 같은 인터페이스를 구현한 객체를 돌려주도록 팩토리만 바꾸면 됩니다(화면·검증·상태 처리는 그대로 씁니다). 공통 미정 사항: Base URL, 인증 토큰 전달·갱신, 요청·응답 본문, 공통 응답 래퍼, HTTP 상태 코드, 오류 응답 형식, 페이지네이션, 날짜·시간대, 이미지 업로드 방식, AI 비동기 작업 상태값, PIN 인증 증명 전달 방식.

| 영역                  | 프론트엔드 연결 위치                                                                                                                                                                               | 계약 확정   | 미연결 시 동작                                                              | 백엔드와 협의할 사항                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 인증·회원가입         | `src/auth/authBackend.ts`, `serverBackend.ts`(로그인·로그아웃·시작 확인 **연결됨**), `src/api/`(공통 호출), `passwordReset.ts`, `pages/SignupPage.tsx`                                             | 로그인·가입 | 실제 가입. 개발 서버 `VITE_DEV_AUTH=true`만 모의. 소셜·메일 재설정 미연결   | 로그인·가입·소셜·재설정·토큰 갱신 형식과 오류, 로그인 응답의 멤버십 유형(`free`·`basic`·`pro`, 옛 `exercise`·`meal`·`full`은 모르는 값으로 조회 실패 처리)                                                                 |
| PIN(2차 비밀번호)     | `src/pin-settings/`(훅), `src/exercise-goal/exerciseGoalSource.ts`(PIN 저장·확인 경계)                                                                                                             | 아니오      | 등록·변경·확인 불가 안내(개발용 로컬 PIN은 운영 번들에 없음)                | 등록·변경·검증 API, PIN 인증 결과의 전달·검증 방식(몸무게·신체 정보는 PIN 인증 후에만 조회), 5회 불일치 잠금의 서버 책임                                                                                                   |
| 프로필·신체·건강 목표 | `profile/profile.ts`, `body-measurements/bodySource.ts`, `health-goal/goalSource.ts`, `weight-log/`, `notifications/`                                                                              | 아니오      | 각 화면이 연결 전 안내                                                      | 필드·단위, 몸무게 이력·월간 확인·알림 계약(명세에 알림 API 없음), 목표 저장 필드(운동·식단 비율)                                                                                                                           |
| 운동(탐색·루틴·기록)  | `exercise/exerciseSource.ts`, `favoriteSource.ts`, `workoutSource.ts`(목록·세션·기록·루틴), `workoutPlanSource.ts`                                                                                 | 아니오      | 목록·세션·기록·계획은 IndexedDB. 운동 탐색·루틴은 개발 서버만               | 운동 마스터·태그(난이도·부위·도구)·시드 출처와 이용 권리 확인, 루틴·세션·기록 모델, 날짜별 계획                                                                                                                            |
| 운동 AI               | `ai/exercisePlanSource.ts`(로컬 예시), `exercise/recommend/planSource.ts`(규칙 기반 초급 추천), 실제 AI API 연결 코드 없음                                                                         | 아니오      | 로컬 예시·규칙 기반만. 실제 AI 호출 없음                                    | 운동 추천 요청·결과·피드백 API(#62~64), 사용량 소진 시 응답                                                                                                                                                                |
| 음식 사진 분석        | `src/photo-analysis/photoAnalysisContract.ts`(`PhotoAnalysisSource.analyze`, 소진은 `PhotoAnalysisQuotaError`)                                                                                     | 아니오      | 분석 시작 불가, "분석 서버가 아직 연결되지 않았어요"                        | 업로드 방식·허용 형식·용량, 작업 ID·상태값, 결과 필드(`foods`·`totalKcal`·`partial`), 소진 거절 응답, 분석 음식→음식 ID 매핑과 식단 등록 API(현재는 식단 기록 화면 이동만), 사진 보관·삭제 정책                            |
| 통합 AI 멤버십·사용량 | `src/membership/membership.ts`(`MembershipSource`, `createMembershipSource`), `aiAccess.ts`, `useAiAccess.ts`                                                                                      | 아니오      | "연결 전". AI 접근 상태 `unknown`(권한 부여·제한 모두 하지 않음)            | 멤버십(`plan`)·사용량(`usage.limit`·`remaining`)·갱신일·운동·식단별 내역 조회, 권한 판정과 소진 시 AI 요청 오류, `GET /users/me/entitlements`와의 역할 분담, 유료 횟수(30·100회)·가격·결제 정책 확정, 결제·멤버십 변경 API |
| 커뮤니티              | `src/community/communitySource.ts`(`CommunitySource`: 목록·상세·작성·댓글/답변·응원), `community.ts`(타입·검증)                                                                                    | 아니오      | 목록·상세 "아직 글을 볼 수 없어요", 작성 등록 비활성                        | 게시판(자유·Q&A) 구분, Q&A 카테고리·답변(댓글 재사용 여부)·답변 자격(질문 영역 이해도 중급 이상) 서버 판정, 정렬·페이지네이션, 응원(게시글 좋아요 #88·#89), 수정·삭제·신고 화면(명세에 없음)                               |
| 식단(음식·기록·목표)  | `food/foodSource.ts`, `mealSource.ts`, `mealPlanSource.ts`, `foodFavoriteSource.ts`, `meal-goal/mealGoalSource.ts`, `ai/meal/mealPlanContract.ts`                                                  | 아니오      | 개발 서버만 샘플·IndexedDB. 운영은 준비 중. 식단 AI 추천 결과를 만들지 않음 | 음식 검색·영양 필드, 끼니 기록 모델, 식단 목표 계산 정책(검증 전이라 저장 불가), 식단 추천 API(#65~69)                                                                                                                     |
| 기타 연결 대기 화면   | `inquiry/inquiry.ts`, `support/notices.ts`·`faq.ts`, `food-request/foodRequest.ts`, `growth-history/`(경험치·포인트), `quiz/quizSource.ts`, `onboarding-assessment/assessmentSource.ts`, `mypage/` | 아니오      | 각 화면이 연결 전 안내(가짜 공지·내역을 만들지 않음)                        | 문의·음식 등록 요청·공지·경험치 내역 API(명세에 없음), 퀴즈·보상, 이해도 결과 조회                                                                                                                                         |

개발용 예시 저장소(IndexedDB 키, 탭 메모리 등)는 서버가 대신 보관하는 값을 흉내 낸 것입니다. 서버 연결 후에는 해당 개발용 모듈과 `dev/`·`dev-mock/` 폴더를 지웁니다. 삭제된 API(운동 루틴 좋아요 `POST /api/v1/workout-routines/{routineId}/likes`)는 쓰지 않으며 좋아요는 커뮤니티 게시글 좋아요로 통합됐습니다.

## 후속 개발 항목

- 운동 루틴 공유(커뮤니티 C01-1·C02-2·C03)와 루틴 상세의 "커뮤니티 공유" 버튼(현재 비활성).
- 커뮤니티 게시글·댓글 수정·삭제·신고(화면 명세 없음).
- 음식 사진 분석 결과의 식단 자동 등록과 추가 질문 대화, 실제 AI 연동.
- 결제·구독·멤버십 변경과 결제 내역, 멤버십 사용량 실데이터.
- 실제 인증·2차 비밀번호·서버 저장 전반, 알림, 공지·FAQ 운영 데이터.
- 라우트별 문서 제목·이동 후 포커스 관리(현재는 일부 화면만 직접 처리).

## 폰트 라이선스

화면 글꼴 **Paperlogy**는 **SIL Open Font License 1.1(OFL 1.1)** 로 배포되는 글꼴입니다(저작권 표기: Copyright 2024 The PAPERLOGY Authors, 배포처 https://freesentation.blog/paperlogy , 공식 저장소 https://github.com/Freesentation/paperlogy ). Reserved Font Name은 지정되어 있지 않습니다. 폰트 파일 9종(`Paperlogy-1Thin`~`9Black`.ttf, Version 1.000)은 공식 저장소의 `Paperlogy-1.000.zip`과 SHA-256이 모두 일치하며, `OFL.txt`는 공식 `OFL license.txt`와 바이트 단위로 같습니다. 한글 글리프는 G마켓산스를 기반으로 한다고 공식 크레딧에 적혀 있으나 별도 G마켓산스 파일은 포함하지 않으며 폰트로 따로 쓰지 않습니다. 글꼴을 이 저장소와 함께 재배포하므로 **라이선스 전문과 저작권 표기를 `src/assets/fonts/OFL.txt`로 함께 둡니다.** 글꼴 단독 판매와 라이선스 변경은 금지되며, 글꼴 파일을 수정해 배포하면 수정본도 OFL을 유지해야 합니다.

## 알려진 개발 환경 주의사항

- **Windows 경로 대소문자**: Node 테스트는 `C:\...`처럼 드라이브 문자가 대문자인 경로의 PowerShell에서 실행합니다.
- **Chrome 테스트는 개발 서버가 필요합니다**: `--port 5199 --strictPort`로 띄운 서버가 떠 있어야 합니다. 5199 포트가 사용 중이면 서버가 종료되므로 포트를 비우거나 `CHROME_TEST_BASE_URL`을 맞춥니다.
- **`typecheck`는 빌드에 포함되지 않습니다**: `npm run build`만으로는 타입 오류를 잡지 못합니다.
- **개발 서버 저장소**: IndexedDB·sessionStorage 데이터는 브라우저·계정별로 남습니다. 화면 상태가 이상하면 사이트 데이터를 지우고 다시 확인합니다.
- **개발용 데이터 분리**: 새 코드에서 개발용 모듈을 `import.meta.env.DEV` 분기 밖에서 불러오면 `npm run verify:dist`가 실패합니다.
