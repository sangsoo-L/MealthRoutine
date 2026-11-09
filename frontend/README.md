# MealthRoutine frontend

React + Vite + Tailwind CSS v4 기반 TypeScript(TSX) 프론트엔드입니다. 이 디렉터리에서 명령을 실행합니다.

> 이 README는 **개인 개발 Repository**(`Binwoojin/mealthroutine`)의 `frontend/`용입니다. 이 Repository에는 기획 문서(`../documents/`)와 개인 개발 환경 설정(`../CLAUDE.md`, `../.claude/`)이 함께 있습니다. 팀 협업 Repository에 전달하는 README는 따로 작성하며, 이 문서를 그대로 복사하지 않습니다.

## 시작

Node.js 24 이상을 사용합니다. 검증 환경은 Node.js 24.18.0, npm 11.16.0입니다.

```sh
npm ci
npm run dev
```

터미널에 표시된 로컬 주소를 엽니다.

| 명령                   | 설명                                      |
| ---------------------- | ----------------------------------------- |
| `npm run typecheck`    | TypeScript 타입 검사 (`tsc --noEmit`)     |
| `npm run build`        | 운영 빌드를 `dist/`에 생성                |
| `npm run preview`      | 빌드 결과를 로컬에서 확인                 |
| `npm run lint`         | ESLint 검사 (경고 0 기준)                 |
| `npm run format:check` | Prettier 형식 검사 (파일을 변경하지 않음) |
| `npm run format`       | Prettier로 파일 정리 (파일을 변경함)      |

## 구성

- `src/main.tsx`: 앱 진입점과 StrictMode
- `src/App.tsx`: 라우터 진입 (`RouterProvider`)
- `src/app/router.tsx`: `createBrowserRouter` 라우트 정의
- `src/app/routeHandle.ts`: 라우트 `handle` 타입(`RouteHandle`, `TabKey`)과 하단 탭 정의
- `src/layouts/AppShell.tsx`: 공통 레이아웃 (AppBar + 본문 + BottomNav)
- `src/components/layout/`: `AppBar`, `BottomNav`
- `src/guards/RequireAuth.tsx`: 인증 가드 인터페이스 (현재 어떤 라우트에도 연결하지 않음)
- `src/pages/PagePlaceholder.tsx`: 대표 경로의 임시 화면과 404 임시 처리
- `src/styles/global.css`: Tailwind import, Paperlogy `@font-face`, `@theme` 디자인 토큰과 타입 스케일
- `tsconfig.json`: TypeScript 설정 (strict 모드, `src/`만 검사)
- `vite.config.js`: React와 Tailwind Vite 플러그인
- `eslint.config.js`, `.prettierrc.json`: 코드 검사와 포맷 설정

## TypeScript

- `tsconfig.json`은 `strict`를 켠 상태이며 `noEmit`으로 타입 검사만 합니다. 변환과 번들링은 Vite가 담당합니다.
- ESLint(`typescript-eslint` 권장 규칙)가 `any`와 `@ts-ignore`를 오류로 막습니다. 억제가 꼭 필요하면 이유를 적은 `@ts-expect-error`를 사용합니다.
- 라우트 `handle`의 타입(`RouteHandle`)은 `src/app/routeHandle.ts`에 한 번만 정의하고, 라우터와 레이아웃이 이를 가져다 씁니다.
- 설정 파일(`vite.config.js`, `eslint.config.js`)은 JavaScript로 두며 타입 검사 대상이 아닙니다.
- 타입 검사는 `npm run build`에 포함되어 있지 않으므로 `npm run typecheck`를 별도로 실행합니다.
- `typescript`는 `typescript-eslint`가 지원하는 6.0.x(`~6.0.3`)에 고정되어 있습니다. 7.x로 올리려면 `typescript-eslint` 지원 범위를 먼저 확인합니다.

## 라우팅

- `react-router`의 `createBrowserRouter`를 사용하며, URL은 `/login`, `/exercises`, `/mypage` 같은 일반 경로입니다. `HashRouter`는 사용하지 않습니다.
- 모든 화면은 하나의 `AppShell`을 공유합니다. 제목, 뒤로가기, 활성 탭, 하단탭 노출은 라우트의 `handle`(screenId, title, tab, focus, domain, parent)로 결정합니다.
- `/`는 인트로 스플래시이며 약 3초 뒤 홈(`/home`)으로 자동 이동합니다. 홈 경로(`/home`)는 기획 문서에 없는 임시 확정입니다.
- 현재 연결된 경로는 홈(`/home`), 로그인(`/login`), 운동 탐색(`/exercises`), 음식 검색(`/foods`), 운동 기록(`/records/exercise`), 식단 기록(`/records/meal`), AI 안내(`/ai`), 마이페이지(`/mypage`), 고객지원(`/support`)의 임시 화면과 404 임시 처리입니다.
- 나머지 화면과 경로는 기획 문서가 확정된 뒤 추가합니다.

## 스타일

- 스타일은 Tailwind CSS v4 유틸리티 클래스로 작성합니다. `tailwind.config.js`와 PostCSS 설정은 필요하지 않습니다.
- 색상, 폰트, 간격, 모서리 반경, 앱 너비(390px)는 `@theme` 토큰으로 정의합니다.
- 글자 크기는 `text-app-title`, `text-section-title`, `text-body`, `text-support`, `text-metric` 토큰을 우선 사용합니다.

## 폰트와 라이선스

- 폰트: Paperlogy (TTF 9종, v1.000) — `src/assets/fonts/`
- 공식 배포 페이지: https://freesentation.blog/paperlogyfont
- 라이선스: SIL Open Font License 1.1
- 라이선스 전문: `src/assets/fonts/OFL.txt` (저작권 표시: Copyright 2024 The PAPERLOGY Authors)

폰트 파일은 수정하지 않고 공식 배포본 그대로 사용합니다.

## 현재 범위와 배포

- API, 인증, AI 기능, Mock 데이터, jQuery, 별도 상태 관리 라이브러리는 포함하지 않습니다.
- 최종 배포는 AWS 별도 서버를 전제로 합니다. 배포 방식은 아직 정하지 않았고, 어떤 방식이든 실제 파일이 없는 경로를 `index.html`로 돌려주는 SPA fallback이 필요합니다. 이때 정적 파일 경로는 fallback에서 제외합니다.
- 검증 결과와 미검증 항목은 `VERIFICATION.md`에 기록합니다.
