// 운영 빌드(dist)에 개발용 근거·시드 데이터·테스트 전용 스위치 문자열이 들어갔는지 검사한다.
// 사용: `npm run build` 후 `npm run verify:dist` (또는 `node scripts/verify-dist.mjs [검사할 폴더]`). dist가 없거나 비어 있으면 실패한다.
// 개발 서버 전용 코드(import.meta.env.DEV)가 운영 번들에서 제거되는 것을 문자열로 확인하는 보조 검사이며, 번들러 설정을 대신하지 않는다.
// Node만 쓰며 추가 패키지가 필요 없다. 종료 코드: 0 통과, 1 금지 문자열 발견, 2 검사 대상 없음.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 검사할 폴더는 인자로 바꿀 수 있다(검사기 자체를 확인할 때 쓴다). 기본은 이 프로젝트의 dist다.
const DIST =
  process.argv[2] ?? fileURLToPath(new URL('../dist/', import.meta.url))

/** 운영 번들에 있으면 안 되는 문자열. reason은 실패 시 알려 줄 이유다. */
const FORBIDDEN = [
  [/127\.0\.0\.1:8000|\/internal\/ai\//, '개발용 FastAPI 주소와 내부 API 경로'],
  // 추천 규칙의 개발자용 근거(ruleEvidence.ts)와 시드 파일명
  [/exercise_routine_items/, '내부 시드 파일명(개발자용 근거)'],
  [/exercise_routines/, '내부 시드 파일명'],
  [/exercises\.json/, '내부 시드 파일명'],
  [/가상 루틴/, '개발용 가상 루틴 설명(개발자용 근거 또는 시드)'],
  [/프로젝트 시드/, '개발자용 근거 문구'],
  [/전문가 검수 자료가 아니다/, '개발자용 근거 문구'],
  [/RULE_EVIDENCE|ruleEvidence/, '개발자용 근거 모듈 이름'],
  // 운동 시드 데이터 본문(대표 운동의 이름·설명 문구)
  [/벽 종아리 스트레칭/, '운동 시드 데이터'],
  [/프론 Y 레이즈/, '운동 시드 데이터'],
  [/이마를 바닥 가까이 두고 엎드려/, '운동 시드 설명문'],
  // 개발용 mock 저장소·테스트 전용 스위치
  [/mealthroutine\.dev\.mock/, '개발용 mock 저장소 키'],
  [/slowLoad/, '테스트 전용 조회 지연 스위치'],
  [/SLOW_LOAD_MS|mock load failure/, '개발용 mock 저장소 코드'],
  // 개발 서버에서만 나오는 개발용 안내 문구(운영 번들에서는 코드째 제거되어야 한다)
  [/개발용 로그인/, '설정 화면의 개발용 로그인 안내'],
  [/개발용 임시 데이터/, '마이페이지의 개발용 데이터 안내'],
  [/개발용 예시 데이터|개발용 예시입니다/, '개발용 예시 데이터 안내'],
  // AI 식단 플랜(I03~I03-3)의 개발 전용 목표 검증 상태(?devGoal=)와 안내 문구(운영 번들에서는 코드째 제거되어야 한다)
  [/devGoal/, 'AI 식단 플랜의 개발 전용 목표 검증 상태 주소 값'],
  [/개발용 검증 상태/, 'AI 식단 플랜의 개발 전용 검증 상태 안내'],
  // 음식 사진 분석(I04·I04-1)의 개발 전용 검증 상태(?devAnalysis=)와 예시 결과(운영 번들에서는 코드째 제거되어야 한다)
  [/devAnalysis/, '사진 분석의 개발 전용 검증 상태 주소 값'],
  [/개발용 예시 결과예요/, '사진 분석의 개발용 예시 결과 표지 문장'],
  [/검증용 실패/, '사진 분석 개발 전용 연결(실패 검증)'],
  // 개발용 PIN 저장소(W01-1·D01-4·P11·P12 공유). 로컬 해시 저장·검증 코드는 운영 번들에 없어야 한다(서버 API 연결 전에는 등록·변경 불가).
  [/mealthroutine\.dev\.exercise-goal/, '개발용 PIN·운동 목표 저장 키'],
  [/PBKDF2/, '개발용 PIN 해시 코드(로컬 PIN 검증)'],
  [/개발 서버 전용 모의 기능/, 'P11·P12의 개발 서버 전용 안내'],
  // 커뮤니티(C01~C05)의 개발 전용 탭 메모리 예시 저장소와 예시 글(운영 번들에서는 코드째 제거되어야 한다)
  [
    /devCommunity|createDevCommunitySource|dev-free-1|dev-qa-1/,
    '커뮤니티 개발 전용 예시 저장소와 예시 글',
  ],
  [/개발용 커뮤니티 예시/, '커뮤니티 개발용 예시 안내 문장'],
  // 개발용 임시 계정(example.com 가상 주소)
  [/member\.[a-z]+@example\.com/, '개발용 임시 계정 주소'],
]

/**
 * 번들에 남아 있을 수 있지만 화면에 나오지 않도록 **표시 조건으로 막혀 있는** 개발용 안내 문구. 실패로 보지 않고 경고로만 알린다.
 * 운영 빌드에서 이 문구가 실제로 화면에 보이지 않는지는 운영 빌드를 열어 확인해야 한다(`npm run preview`로 열어 각 화면 확인).
 * 문구 자체를 번들에서 빼려면 해당 화면의 문구를 개발 서버 전용 코드로 옮겨야 한다.
 */
const GATED_NOTICES = [
  [/개발용 예시/, '이해도 확인 화면의 개발용 표시(저장소가 mock일 때만 표시)'],
  [/개발용 가입 체험/, '개발용 가입 체험 배너(체험 중일 때만 표시)'],
  [
    /개발용 초기값/,
    '마이페이지 이해도의 개발용 초기값 안내(초기값일 때만 표시)',
  ],
]

/** 운영 번들에 반드시 있어야 하는 문자열(검사가 빈 번들에 통과하지 않게 하는 대조군). */
const EXPECTED = [
  /밀스루틴/,
  // P05 신체 정보 확인: 운영 빌드(서버 연결 전)는 이 안내로 연결 전 상태를 보여 준다(개발용 인증을 쓰지 않는다).
  /신체 정보 확인 기능은 서비스 연결을 준비하고 있어요/,
]

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(js|html|css)$/.test(name)) yield path
  }
}

if (!existsSync(DIST)) {
  console.error('dist가 없어요. 먼저 npm run build를 실행해 주세요.')
  process.exit(2)
}
const files = [...walk(DIST)]
if (files.length === 0) {
  console.error('dist에 검사할 파일이 없어요.')
  process.exit(2)
}
const text = files.map((f) => readFileSync(f, 'utf8')).join('\n')

let failed = 0
for (const [pattern, reason] of FORBIDDEN) {
  if (pattern.test(text)) {
    failed += 1
    console.error(`FAIL  ${pattern}  → ${reason}`)
  }
}
for (const pattern of EXPECTED) {
  if (!pattern.test(text)) {
    failed += 1
    console.error(
      `FAIL  대조군 ${pattern} 이(가) 번들에 없어요(검사 대상이 잘못됐을 수 있어요)`,
    )
  }
}
for (const [pattern, reason] of GATED_NOTICES) {
  if (pattern.test(text)) {
    console.warn(
      `WARN  ${pattern}  → ${reason}. 화면 표시는 조건으로 막혀 있다`,
    )
  }
}
console.log(
  `검사한 파일 ${files.length}개, 금지 패턴 ${FORBIDDEN.length}개, ${failed === 0 ? '통과' : `실패 ${failed}건`}`,
)
process.exit(failed === 0 ? 0 : 1)
