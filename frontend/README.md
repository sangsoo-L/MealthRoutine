# MealthRoutine (밀스루틴) 프론트엔드

운동·식단 건강관리 웹앱 **밀스루틴(MealthRoutine)** 의 프론트엔드입니다. 운동 탐색과 상세, 오늘 운동 목록 구성, 운동 진행과 결과 기록, 초급 운동 추천, 체중·신체 정보 기록, 마이페이지 등 화면을 React로 구현합니다.

> 현재는 백엔드 연동 전 단계입니다. 개발 서버에서는 개발 전용 모의 계정과 브라우저 저장소(IndexedDB·sessionStorage)로 동작하고, 운영 빌드에는 이 개발용 데이터가 포함되지 않습니다.

## 기술 스택

| 구분      | 사용 기술                                                  |
| --------- | ---------------------------------------------------------- |
| 언어      | TypeScript (strict 모드), TSX                              |
| UI        | React 19                                                   |
| 라우팅    | React Router (`createBrowserRouter`, 일반 경로 URL)        |
| 번들러    | Vite                                                       |
| 스타일    | Tailwind CSS v4 (CSS의 `@import "tailwindcss"`와 `@theme`) |
| 폰트      | Paperlogy (`src/assets/fonts/`)                            |
| 코드 품질 | ESLint, Prettier, `tsc --noEmit`                           |
| 테스트    | Node 내장 테스트 러너(`node --test`), 헤드리스 Chrome 회귀 |

## 설치

Node.js **24 이상**이 필요합니다. 검증한 환경은 Node.js 24.18.0, npm 11.16.0입니다.

```sh
npm ci
```

## 개발 서버 실행

```sh
npm run dev
```

터미널에 표시된 로컬 주소(기본 `http://localhost:5173`)를 엽니다. Chrome 회귀 테스트를 함께 쓸 때는 포트를 고정해 실행합니다(아래 "Chrome 회귀 테스트" 참고).

## 환경변수 설정

**필수 환경변수는 없습니다.** `.env` 파일을 만들 필요가 없고, 비밀 값이나 API 키도 쓰지 않습니다.

- `.env`, `.env.*`는 Git에서 제외됩니다(`.env.example`만 예외). 앞으로 환경변수가 필요해지면 비밀 값은 저장소에 커밋하지 않습니다.
- 개발용 기능은 Vite가 제공하는 `import.meta.env.DEV` 값으로 구분합니다. 이 값은 빌드 때 상수로 바뀌어 운영 빌드에서는 개발용 코드가 제거됩니다.
- Chrome 회귀 테스트에는 선택 환경변수가 있습니다(`tests/chrome/README.md`).

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
- `verify:dist`는 `build` 다음에 실행합니다. `dist/`가 없거나 비어 있으면 실패합니다(종료 코드 2). 개발용 모의 계정·시드 근거·개발용 안내 문구가 운영 번들에 남아 있으면 실패합니다(종료 코드 1).

## Node 테스트 실행

단위·렌더링 테스트이며 브라우저와 개발 서버 없이 실행합니다.

```sh
npm run test:node          # 전체 (node --test "tests/*.test.mjs" 와 같다)
npm run test:dashboard     # 대시보드 관련 일부
```

- `node --test tests/`처럼 **폴더를 인자로 주면 실패합니다.** 글롭(`"tests/*.test.mjs"`)을 쓰거나 위 npm 명령을 사용합니다.
- **Windows에서는 드라이브 문자가 대문자인 경로(`C:\...`)의 PowerShell에서 실행하세요.** 소문자 경로(`/c/...`, `c:\...`로 연 Git Bash 등)에서는 React 인스턴스가 둘로 갈라져 훅을 쓰는 컴포넌트 렌더링 테스트 일부가 실제 결함이 아닌데도 실패합니다. 실패하면 먼저 현재 경로의 드라이브 문자 대소문자를 확인합니다.
- 테스트는 Vite로 TypeScript 소스를 불러오므로 `npm ci`로 의존성을 설치한 상태여야 합니다. `.env` 같은 환경 파일은 필요 없습니다.

## Chrome 회귀 테스트

실제 Chrome(헤드리스)으로 화면 동작을 확인하는 스크립트 28개입니다. **개발 서버가 실행 중이어야 합니다.** 서버가 없으면 테스트가 시작되지 않고 환경 오류(종료 코드 2)로 끝납니다.

1. 터미널 1에서 개발 서버를 포트 5199로 고정해 띄웁니다.

   ```sh
   npm run dev -- --port 5199 --strictPort
   ```

2. 터미널 2에서 테스트를 실행합니다.

   ```sh
   npm run test:chrome                              # 전체 (약 26분)
   npm run test:chrome -- --list                    # 스크립트·그룹 목록(서버·Chrome 불필요)
   npm run test:chrome -- --group plan,a11y         # 그룹만
   npm run test:chrome -- --only w02-compose        # 스크립트만
   ```

- Google Chrome이 설치되어 있어야 합니다. 설치 위치를 자동으로 찾으며, 못 찾으면 `CHROME_PATH`로 지정합니다.
- 개발 서버 주소를 바꾸려면 `CHROME_TEST_BASE_URL`을 설정합니다(기본 `http://localhost:5199`).
- 종료 코드는 `0` 전체 통과, `1` 테스트 실패, `2` 실행 환경 오류(Chrome 없음·개발 서버 미연결)입니다. 결과는 종료 코드만이 아니라 `PASS`/`FAIL` 건수로도 확인합니다.
- 스크린샷·Chrome 프로필·로그는 저장소가 아닌 OS 임시 폴더(`mealthroutine-chrome-tests`)에 만들어집니다.
- 자세한 사용법, 스크립트 목록, 작성 규칙은 `tests/chrome/README.md`를 봅니다.
- 실제 스크린 리더(NVDA·VoiceOver·TalkBack)로 읽는 소리와 스크린샷 비교는 이 테스트로 확인하지 못합니다.

## 폴더 구조

```
.
├─ index.html              Vite 진입 HTML
├─ package.json            스크립트·의존성
├─ vite.config.js          React·Tailwind Vite 플러그인
├─ eslint.config.js        ESLint 설정
├─ .prettierrc.json        Prettier 설정
├─ tsconfig.json           TypeScript 설정 (strict, src/ 검사)
├─ public/                 정적 리소스 (favicon 등)
├─ scripts/
│  └─ verify-dist.mjs      빌드 결과 검사
├─ src/
│  ├─ main.tsx, App.tsx    진입점, 라우터 연결
│  ├─ app/                 라우트 정의(router.tsx)와 라우트 handle 타입
│  ├─ layouts/             공통 레이아웃(AppShell: 본문 + 하단 탭)
│  ├─ pages/               화면(페이지) 컴포넌트
│  ├─ components/          화면별·공통 UI 컴포넌트
│  ├─ auth/                인증 인터페이스와 개발 전용 모의 계정(auth/dev/)
│  ├─ guards/              라우트 가드 인터페이스
│  ├─ exercise/            운동 카탈로그·추천·오늘 운동 목록·진행·기록 로직
│  ├─ exercise-goal/, health-goal/, body-measurements/, weight-log/,
│  │  weight-notification/, notifications/, settings/, mypage/,
│  │  onboarding-assessment/, signup-experience/   기능별 로직·타입
│  ├─ dev-mock/            개발 서버 전용 모의 저장소
│  ├─ styles/              global.css (Tailwind import, 폰트, 디자인 토큰)
│  └─ assets/              폰트(Paperlogy)·이미지
└─ tests/
   ├─ *.test.mjs           Node 단위·렌더링 테스트
   └─ chrome/              Chrome 회귀 테스트 (run.mjs, lib/, specs/, README.md)
```

## 테스트용 모의 계정

개발 서버(`npm run dev`)에서만 쓰는 **개발 전용 모의 계정**입니다. 서버에 만든 계정이 아니고 실제 인증이 아니며, 운영 빌드에는 포함되지 않아 로그인이 항상 실패합니다. 이메일은 `example.com` 가상 주소이며, 계정 정보 전체(비밀번호 포함)는 `src/auth/dev/devAccounts.ts`에 있습니다. Chrome 회귀 테스트도 같은 계정으로 로그인합니다.

| 이메일                        | 닉네임   | 회원 유형 |
| ----------------------------- | -------- | --------- |
| `member.free@example.com`     | 일반회원 | 일반      |
| `member.exercise@example.com` | 운동멤버 | 운동      |
| `member.meal@example.com`     | 식단멤버 | 식단      |
| `member.full@example.com`     | 종합멤버 | 종합      |

운영 계정·실제 비밀번호·토큰·API 키를 저장소나 테스트에 넣지 않습니다.

## 알려진 개발 환경 주의사항

- **Windows 경로 대소문자**: Node 테스트는 `C:\...`처럼 드라이브 문자가 대문자인 경로의 PowerShell에서 실행합니다(위 "Node 테스트 실행" 참고).
- **Chrome 테스트는 개발 서버가 필요합니다**: `--port 5199 --strictPort`로 띄운 서버가 떠 있어야 합니다. 5199 포트를 다른 프로그램이 쓰고 있으면 `--strictPort` 때문에 서버가 종료되므로, 포트를 비우거나 `CHROME_TEST_BASE_URL`을 맞춥니다.
- **Chrome 테스트는 느립니다**: 전체 실행에 약 26분이 걸립니다. PC 부하가 크면 고정 대기에 의존하는 일부 스크립트가 간헐적으로 실패할 수 있으니, 실패한 스크립트만 `--only`로 다시 실행해 봅니다.
- **`node --test tests/`는 쓰지 않습니다**: 폴더 인자는 지원되지 않아 실패합니다.
- **개발용 데이터 분리**: 개발용 계정·시드 근거·모의 저장소는 `import.meta.env.DEV` 분기 안에서만 불러옵니다. 새 코드에서 이 분기 밖으로 끌어오면 `npm run verify:dist`가 실패합니다.
- **`typecheck`는 빌드에 포함되지 않습니다**: `npm run build`만으로는 타입 오류를 잡지 못합니다.
- **개발 서버 저장소**: 개발 서버의 IndexedDB·sessionStorage 데이터는 브라우저·계정별로 남습니다. 화면 상태가 이상하면 사이트 데이터를 지우고 다시 확인합니다.
