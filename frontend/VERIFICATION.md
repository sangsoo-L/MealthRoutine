# 프론트엔드 환경 검증 결과

검증일: 2026-11-04 (한국 시간)
대상: `frontend/` (React + TypeScript 프론트엔드 개발 환경, 라우터 기본 구성까지. JavaScript(JSX)에서 TypeScript(TSX)로 전환한 뒤의 결과)

## 1. 환경 및 설치된 버전

| 구분                                                                             | 버전              |
| -------------------------------------------------------------------------------- | ----------------- |
| Node.js / npm                                                                    | 24.18.0 / 11.16.0 |
| React / react-dom                                                                | 19.3.1            |
| Vite / @vitejs/plugin-react                                                      | 8.3.5 / 6.2.1     |
| Tailwind CSS / @tailwindcss/vite                                                 | 4.3.4 / 4.3.4     |
| react-router                                                                     | 8.5.1             |
| ESLint (+ react-hooks 7.1.1, react-refresh 0.5.7, eslint-config-prettier 10.1.8) | 10.14.0           |
| Prettier                                                                         | 3.9.10            |
| TypeScript                                                                       | 6.0.3             |
| typescript-eslint                                                                | 8.72.1            |
| @types/react / @types/react-dom                                                  | 19.3.0 / 19.3.0   |

- 언어는 TypeScript(TSX)이며 `strict` 모드를 사용한다. JavaScript(JSX)에서 전환했고, 설정 파일(`vite.config.js`, `eslint.config.js`)은 JavaScript로 유지한다.
- `typescript`는 `~6.0.3`으로 고정했다. 최신 7.0.2는 `typescript-eslint` 8.72.1의 지원 범위(`<6.1.0`)를 벗어나 사용하지 않았다.
- 기존 의존성 버전은 변경하지 않았다. `package-lock.json`은 추가된 항목만 늘었다(삭제·버전 변경 없음).
- jQuery, 상태 관리 라이브러리, API 클라이언트는 포함하지 않는다.
- `tailwind.config.js`, `postcss.config.js`, `@tailwind` 지시문 등 Tailwind v3 방식 설정은 없다.

## 2. 명령 실행 결과

| 명령                                 | 결과                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `npm run typecheck` (`tsc --noEmit`) | 성공. 오류 0 (`strict`: true 확인)                                                                         |
| `npm run build`                      | 성공. 104개 모듈 변환, CSS 8.13 kB, JS 321.56 kB (gzip 101.41 kB). `dist/assets`에 Paperlogy 폰트 9개 포함 |
| `npm run lint` (`--max-warnings 0`)  | 성공. 경고·오류 0                                                                                          |
| `npm run format:check`               | 성공. 파일을 변경하지 않는 검사 명령만 사용                                                                |
| `npm audit`                          | **미실행**. TypeScript 패키지 설치 때 npm이 moderate 취약점 13건을 알렸으나 내용은 분석하지 않았다.        |

- `npm run typecheck`는 `npm run build`에 포함되어 있지 않으므로 별도로 실행한다.
- ESLint가 `any`와 `@ts-ignore`를 오류로 막는지 임시 입력으로 확인했다(`no-explicit-any`, `ban-ts-comment` 2건 검출, 파일은 만들지 않음).
- 타입 정보를 사용하는 ESLint 규칙(`recommendedTypeChecked`)은 적용하지 않았다.

## 3. 구성 내용

### 스타일 (Tailwind CSS v4)

- `src/styles/global.css`: `@import 'tailwindcss' source('../')`, Paperlogy `@font-face`, `@theme` 토큰으로 구성한다.
- Paperlogy는 로컬 TTF 9개(100~900)를 `src/assets/fonts/`에 두고 `font-display: swap`으로 등록한다. 개발 서버에서 Regular 파일이 200으로 응답하고, 빌드 결과에도 9개가 포함된다.
- 디자인 토큰: 색상 18개, `--font-sans`, `--container-app`(24.375rem), `--radius-card`, `--radius-control` 등을 확정된 디자인 토큰 기준 값으로 적용했다.
- 타입 스케일: `--text-app-title`(22px), `--text-section-title`(15px), `--text-body`(14px), `--text-support`(12px), `--text-metric`(26px).
- 글자 굵기는 역할별로 통일한다(제목·버튼·브랜드 라벨 600, 본문·보조 설명 400).
- Tailwind 기본 글자 크기 클래스는 막지 않았다(`--text-*: initial;` 미적용).

### 라우팅 (React Router)

- `createBrowserRouter`를 사용하고 `RouterProvider`는 `react-router/dom`에서 가져온다. 일반 경로(`/login`, `/exercises` 등)를 사용한다.
- `src/App.tsx`는 라우터 진입만 담당한다. 이전의 실행 확인용 화면은 제거되었다.
- 단일 `AppShell`(AppBar + 본문 + BottomNav)을 사용하고, 라우트 `handle`(screenId, title, tab, focus, domain, parent)로 제목·뒤로가기·활성 탭·하단탭 노출을 결정한다.
- 대표 경로 9개와 404 임시 처리만 연결했다. 각 화면은 임시 화면이다.
- `RequireAuth`는 인터페이스만 정의했고 어떤 라우트에도 연결하지 않았다. 현재 보호되는 화면은 없다.
- 기준 화면 명세는 34개 화면 명세다. 80개 화면 명세는 반영하지 않았다.

## 4. 라우팅 확인 결과

### 4-1. 서버 측 렌더링 확인 (브라우저 아님)

임시 스크립트로 `createBrowserRouter`만 메모리 라우터로 바꿔 경로별로 렌더링한 결과다. 라우트 정의는 그대로 사용했다. TypeScript 전환 후 다시 실행했고, 제목·뒤로가기·하단탭·활성 탭이 전환 전 결과와 모두 같았다. (스크립트는 확인 후 삭제했다.)

| 경로                | 제목                      | 뒤로가기  | 하단탭 | 활성 탭 |
| ------------------- | ------------------------- | --------- | ------ | ------- |
| `/`                 | 홈                        | 없음      | 노출   | 홈      |
| `/login`            | 로그인                    | `/`       | 숨김   | 없음    |
| `/exercises`        | 운동 탐색                 | `/`       | 노출   | 탐색    |
| `/foods`            | 음식 검색                 | `/`       | 노출   | 탐색    |
| `/records/exercise` | 운동 기록 대시보드        | `/`       | 노출   | 기록    |
| `/records/meal`     | 식단 기록 대시보드        | `/`       | 노출   | 기록    |
| `/ai`               | AI 서비스 안내            | `/`       | 노출   | AI      |
| `/mypage`           | 마이페이지                | `/`       | 노출   | 마이    |
| `/support`          | 고객지원                  | `/mypage` | 노출   | 마이    |
| 존재하지 않는 경로  | 페이지를 찾을 수 없습니다 | `/`       | 노출   | 없음    |

### 4-2. 개발 서버와 빌드 미리보기

- TypeScript 전환 후 다시 확인했다. `vite` 개발 서버와 `vite preview`(빌드 결과) 모두 `/`, `/login`, `/exercises`, `/records/exercise`, `/mypage`, 존재하지 않는 경로를 직접 요청하면 `index.html`을 HTTP 200으로 응답한다. 이는 Vite 서버의 기본 동작이다.
- 두 서버 모두 존재하지 않는 `/assets/missing.js`에도 `index.html`을 200으로 응답한다. 배포 서버에서는 정적 파일이 없을 때 404가 되도록 SPA fallback에서 정적 파일 경로를 제외해야 한다.
- 개발 서버 `/src/main.tsx`, `/src/app/router.tsx`, `/src/layouts/AppShell.tsx`가 200, 빌드 CSS가 200(`text/css`)으로 응답했다.
- 확인 후 두 서버 모두 종료했다.

## 5. 미검증 및 남은 사항

- **미검증**: 브라우저에서의 실제 렌더링, 링크 이동, 활성 탭과 하단탭 표시, 새로고침 동작, 스크롤 복원, 키보드 포커스 이동, 390px 화면의 시각 확인. 위 4-1은 브라우저 검증을 대신하지 않는다.
- **미검증**: HMR, 접근성 도구 검사, 자동화 테스트(테스트 설정 없음), `npm audit`.
- **TypeScript 전환 관련**: `useMatches()`의 `handle`은 `unknown`이라 `getRouteHandle()`에서 객체 여부만 확인한 뒤 `Partial<RouteHandle>`로 단언한다(필드별 런타임 검증은 하지 않음). `main.tsx`는 `#root`가 없을 때 명시적 오류를 던지도록 바뀌었다(타입 좁히기 목적, 정상 동작은 동일).
- **배포**: AWS 배포 방식은 미정이다. 어떤 방식이든 SPA fallback(실제 파일이 없는 경로는 `index.html` 반환)이 필요하며, 정적 파일 경로는 fallback에서 제외해야 한다.
- **코드 리뷰에서 확인된 보완 항목(미반영)**: 활성 탭의 색상만으로 구분되는 문제(대비 약 1.04:1), 루트 오류 화면(`errorElement`) 부재, H01 AppBar 제목 정책, `RequireAuth` 연결 방식, 라우트별 `document.title`, 가장자리 포커스 링.
- **기획 기준**: 화면 명세는 34개 기준이다. 80개 명세와의 비교·통합은 별도 결정 사항이다.

## 6. 폰트 라이선스 확인 결과 (Paperlogy)

확인일: 2026-11-04. 근거는 아래 두 공식 자료와 공식 배포 파일이다.

- 공식 배포 페이지: https://freesentation.blog/paperlogyfont — 라이선스는 SIL Open Font License(OFL), 배포 버전은 v1.000(일본어 미포함)과 v1.001(일본어 포함)로 표기되어 있다.
- 라이선스 전문: https://www.designptn.com/wp-content/uploads/2024/08/OFL-license.txt

| 항목                 | 결과                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 공식 배포본과의 일치 | 공식 배포 파일(GitHub `Freesentation/paperlogy`의 `Paperlogy-1.000.zip`)을 직접 내려받아 비교했다. 로컬 TTF 9개가 **v1.000 배포본과 SHA-256이 모두 일치**한다. v1.001 파일과는 크기·해시가 다르다(일본어 글리프 추가 버전). 사용 중인 버전은 v1.000이다. |
| 폰트 파일명          | `Paperlogy-1Thin.ttf` ~ `Paperlogy-9Black.ttf` (9개, 공식 배포본과 같은 이름)                                                                                                                                                                            |
| 폰트 내장 정보       | 버전 `Version 1.000`, 라이선스 설명 `SIL Open Font License, Version 1.1`, 저작권 문자열 `Copyright © 2024 PT&` (파일에 기록된 값 그대로)                                                                                                                 |
| 라이선스 전문        | 위 URL의 원문을 수정 없이 `src/assets/fonts/OFL.txt`로 추가했다. 4,380바이트, SHA-256 `603b2e7ef9effb9037b0b67f0530cacdc05e71a4e569032d7e4d98c2e6763135`, 첫 줄 `Copyright 2024 The PAPERLOGY Authors (https://freesentation.blog/paperlogy)`            |
| Reserved Font Name   | 라이선스 전문의 저작권 표시에 Reserved Font Name 지정 문구가 없고, 해당 용어는 정의 조항에만 나온다. 지정된 예약 이름은 없는 것으로 확인했다. 폰트 파일은 수정하지 않았다.                                                                               |
| 고지 누락 여부       | 공식 배포 zip(v1.000, v1.001)에는 라이선스 파일이 들어 있지 않다. 공식 GitHub 저장소 `main`의 `OFL.txt`, `LICENSE`, `OFL-license.txt` 경로도 404였다. 그래서 `OFL.txt`를 폰트 옆에 동봉했다.                                                             |

- **미확인**: 법률 검토는 하지 않았다. 저작권 표시가 라이선스 전문(The PAPERLOGY Authors)과 폰트 내장 문자열(PT&)에서 서로 다르게 적혀 있다는 점만 기록한다.
- **미확인**: 위 두 공식 URL과 공식 배포 파일 외의 자료는 확인하지 않았다.
