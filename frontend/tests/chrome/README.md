# Chrome 회귀 테스트

실제 Chrome(헤드리스)과 개발 서버에서 화면 동작을 검증하는 회귀 스크립트 모음이다. 단위·렌더링 테스트(`tests/*.test.mjs`, `node --test`)와 별개이며, 둘 다 통과해야 회귀가 없다고 본다.

## 실행

1. 개발 서버를 띄운다: `npm run dev -- --port 5199 --strictPort`
2. 실행기를 부른다.

```
npm run test:chrome                            # 전체(= node tests/chrome/run.mjs)
npm run test:chrome -- --list                  # 스크립트·그룹 목록(npm 뒤의 "--" 다음 인자는 실행기로 전달된다)
npm run test:chrome -- --group plan,a11y       # 그룹만(그룹: explore detail record workout dashboard history support routine meal workoutplan plan a11y quiz)
npm run test:chrome -- --only w02-compose      # 스크립트만(쉼표로 여러 개)
npm run test:chrome -- --timeout-sec 600       # 스크립트당 시간 제한(기본 900초)
node tests/chrome/run.mjs ...                  # npm 없이도 같다
node tests/chrome/specs/w02-compose.mjs        # 스크립트 하나를 직접 실행(일부는 시나리오 인자 지원: A·B·C…)
node tests/chrome/selftest.mjs                 # 종료 코드 자체 검증(일부러 실패를 만들어 확인, --no-browser는 브라우저 없이)
```

필요한 것은 Node 24, Chrome, 개발 서버뿐이다(추가 패키지 없음). 아래 환경 변수로 바꿀 수 있다.

| 환경 변수                   | 의미                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `CHROME_PATH`               | Chrome 실행 파일 경로(기본: 설치 위치를 자동 탐색)                                              |
| `CHROME_TEST_BASE_URL`      | 개발 서버 주소(기본 `http://localhost:5199`)                                                    |
| `CHROME_TEST_OUT`           | 스크린샷·프로필 폴더(기본: OS 임시 폴더, 저장소 안에 만들지 않음)                               |
| `CHROME_TEST_CPU_THROTTLE`  | 페이지 CPU를 N배 느리게(간헐 실패 재현용, 예: 4)                                                |
| `CHROME_TEST_DISABLE_CACHE` | `1`이면 브라우저 캐시를 끔(첫 로드와 비슷한 조건, 재현용)                                       |
| `CHROME_TEST_FORCE_FAIL`    | `1`이면 일부러 실패 1건을 더함(종료 코드 확인용)                                                |
| `ONLY`                      | 일부 스크립트(`e02-to-w02`·`w14-w15-flow`)만: 시나리오 이름을 주면 그것만 실행(선택, 기본 전체) |
| `DBG`                       | `plan-integration`만: 값이 있으면 화면 본문을 일부 더 출력(선택, 진단용)                        |

위 환경 변수는 모두 선택이다. 설정하지 않아도 실행되며, `.env` 같은 환경 파일이나 비밀 값이 필요하지 않다.

## 종료 코드

| 코드 | 의미                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 0    | 전체 통과(PASS가 1건 이상이고 FAIL이 0건)                                                              |
| 1    | 테스트 실패(FAIL 1건 이상 · 검사가 0건 · 스크립트가 예외로 중단 · 시간 초과 · 종료 코드와 결과 불일치) |
| 2    | 실행 환경 오류(Chrome 없음 · 개발 서버 미연결 · 브라우저 연결 시간 초과). 결과를 믿을 수 없는 상태     |

- 모든 스크립트는 `lib/exitpolicy.mjs`가 적용된다. 스크립트가 `process.exit(0)`을 직접 불러도 `FAIL`이 있으면 1로 바뀌고, 마지막에 `RESULT pass=N fail=M exit=C` 한 줄을 남긴다.
- 실행기는 스크립트마다 상태(PASS · FAIL · ENV · TIMEOUT · MISMATCH)와 PASS/FAIL 건수, 실행 시간을 보고한다. 실행기 종료 코드는 실패가 하나라도 있으면 1, 실패는 없고 환경 오류만 있으면 2다.
- 결과는 종료 코드만이 아니라 `PASS`/`FAIL` 건수로도 확인한다.

## 구조

```
tests/chrome/
  run.mjs         실행기(사전 점검·그룹·시간·집계·종료 코드)
  selftest.mjs    종료 코드 자체 검증
  lib/
    exitpolicy.mjs  PASS/FAIL 집계와 종료 코드 정책
    env.mjs         개발 서버 주소·Chrome 경로·산출물 폴더(부수효과 없음)
    cdp.mjs         Chrome 실행·DevTools 연결·공용 동작(go·ev·check…)
    session.mjs     로그인·시드·W14 진행·스크린샷(시나리오마다 새 프로필)
    session-r2.mjs  start(port, name) 형태가 필요한 스크립트용 세션
    history.mjs     W10·W16용 시드(저장소 `now` 옵션으로 지난 날짜 목록·기록 생성)·읽기 실패 주입·저장소 전체 비교·스키마 확인·접근성 트리 이름·조회 멈춤(계정 전환 경쟁)·시간 초과를 던지는 대기(mustUntil·mustClick·settleScreen)
  specs/          회귀 스크립트(아래 표)
```

## 스크립트

| 그룹          | 스크립트                                                                                                                                 | 대상                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `explore`     | `e01-filter-results` `e01-condition-sheet` `e01-back-navigation` `retry-focus` `search-integrated` `search-suggestions` `search-journey` | E01 운동 탐색 · 통합검색 · 추천 검색어                                                                                                                                                                                                  |
| `detail`      | `e02-detail-member` `e02-detail-guest` `e02-detail-focus` `favorites-app` `favorites-harness`                                            | E02 운동 상세 · 즐겨찾기                                                                                                                                                                                                                |
| `record`      | `w02-compose` `w02-draft-model` `w13-picker` `w13-register` `e02-to-w02`                                                                 | W02 직접 구성 · W13 운동 선택 · E02 → W02 연결                                                                                                                                                                                          |
| `workout`     | `w14-w15-flow` `w14-w15-timed`                                                                                                           | W14 운동 진행 · W15 결과 저장·조회 · 시간형 정책                                                                                                                                                                                        |
| `dashboard`   | `w01-dashboard`                                                                                                                          | W01 대시보드(주간·최근 기록·오늘의 운동)                                                                                                                                                                                                |
| `history`     | `w10-my-exercise` `w16-previous-lists`                                                                                                   | W10 · W16(+ 저장소 listBefore, W14 복귀, 계정 전환 경쟁)                                                                                                                                                                                |
| `support`     | `support-screens`                                                                                                                        | 랜딩 연결 · P07 즐겨찾기 · S01·S01-1 공지 · S04 FAQ · P15 레벨 안내                                                                                                                                                                     |
| `routine`     | `routines-stats`                                                                                                                         | 운동 루틴 W06~W08 · IndexedDB v2(v1→v2 업그레이드) · 운동 기록 통계 · W01·P09 연결                                                                                                                                                      |
| `meal`        | `meals-food`, `meals-history`, `meals-plan`                                                                                              | 식단 F01·F02·D02·D01-1~3·D01 · IndexedDB v3(v1·v2→v3 업그레이드) · 음식 즐겨찾기 · 계정 격리                                                                                                                                            |
| `workoutplan` | `workout-plan`                                                                                                                           | 내일 운동 계획 W01→W02→W11→W10(day=tomorrow) · IndexedDB v5(workoutPlans) · 오늘/내일 초안 분리 · 날짜별 1개·자정 경계·계정 격리                                                                                                        |
| `plan`        | `plan-steps` `plan-ui` `plan-integration` `plan-stability` `plan-tool-choices`                                                           | W01-2 초급 추천(단계 UI · 통합 · 안정화 · 도구 선택)                                                                                                                                                                                    |
| `a11y`        | `a11y-tool-cards`                                                                                                                        | W01-2 도구 카드 접근성 트리(자동화 검증)                                                                                                                                                                                                |
| `quiz`        | `quiz`                                                                                                                                   | 운동·식단 퀴즈 H02(/quiz) · IndexedDB v6(dailyQuizzes·rewardLedger, v5→v6 업그레이드·기존 행 보존) · 하루 한 문제·재진입 고정 · 정답/오답 · 보상 내역 기준 PT·XP · 동시 제출 중복 방지 · 계정 격리 · 날짜 변경 · 320~1280 반응형·키보드 |

## 작성 규칙

- 검사 결과는 `PASS  이름` / `FAIL  이름  → 상세` 형식으로 출력한다(`h.check` 또는 같은 형식의 `console.log`). 이 줄이 집계 대상이다.
- 관찰만 하고 판정하지 않는 내용은 `NOTE  …`로 출력한다(집계하지 않는다).
- 시나리오마다 `start(이름)`으로 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 이어서 쓰는 상태는 같은 프로필 안에서만 유지한다.
- 고정 시간 대기만으로 화면이 준비되었다고 가정하지 않는다(`h.until(조건)` 사용). 기다린 조건이 끝내 충족되지 않으면 조용히 넘어가지 않아야 한다: `h.until`·`h.click`은 실패해도 `false`만 돌려주므로, 반드시 필요한 대기·클릭은 `history.mjs`의 `mustUntil`·`mustClick`·`waitPath`·`settleScreen`(시간 초과 시 예외 → 시나리오가 `FAIL`로 기록하고 종료 코드 1)을 쓴다. 로그인 화면 이동(`go('/login')`)은 입력창이 나타날 때까지 자동으로 기다린다.
- 데이터는 개발 서버의 운동 시드와 개발 전용 모의 계정(아래 "테스트 계정")을 쓴다. 건수·이름을 고정하지 말고 데이터에서 계산한다.
- 앱 소스를 수정하지 않는다. 실패는 앱의 결함이거나 낡은 기대값이므로 원인을 구분해 기록한다.

## 테스트 계정

- 스크립트는 **개발 서버(`npm run dev`) 코드 안에만 있는 개발 전용 모의 계정**으로 로그인한다. 값은 `src/auth/dev/devAccounts.ts`와 같다(이메일은 `example.com` 가상 주소, 비밀번호는 실제 서비스·개인 계정에 쓰지 않는 개발 전용 값).
- 서버에 만든 계정이 아니며 실제 인증이 아니다. 운영 빌드(`npm run build`)에는 이 계정 데이터가 포함되지 않아 로그인이 항상 실패한다.
- 이 폴더에는 운영 계정·실제 비밀번호·토큰·API 키를 두지 않는다. 그런 값이 필요해지면 환경 변수로 받는다(저장소에 쓰지 않는다).
- 기본 계정은 `lib/session.mjs`의 `ACCOUNTS`(free·full)이고, 일부 스크립트는 같은 값을 직접 입력한다.

## 산출물과 Git 추적

- 스크린샷·Chrome 프로필·실행 로그는 저장소가 아니라 OS 임시 폴더(기본 `<임시 폴더>/mealthroutine-chrome-tests`, `CHROME_TEST_OUT`으로 변경)에 만든다. 저장소 안에는 산출물이 생기지 않으므로 별도의 Git 제외 설정이 필요 없다.
- 임시 폴더는 필요할 때 폴더째 지우면 된다(실행기는 다음 실행에서 다시 만든다). 마지막 실행 요약은 `last-run.json`, 스크립트별 로그는 `logs/`에 남는다.
- 추적 대상은 `run.mjs` · `selftest.mjs` · `lib/` · `specs/` · `README.md`다.

## 알려진 한계

- 실제 스크린 리더(NVDA·VoiceOver·TalkBack)로 읽는 소리는 검증하지 못한다. `a11y-tool-cards`는 Chrome이 계산한 접근성 트리만 확인한다.
- 시각적 일치(스크린샷 비교)는 하지 않는다. 레이아웃은 수치(가로 넘침·겹침·크기)로만 확인한다.
- 개발 서버와 개발용 저장소(IndexedDB·sessionStorage)를 쓰는 검증이다. 운영 빌드 동작은 `npm run build` + `npm run verify:dist`가 따로 확인한다.
