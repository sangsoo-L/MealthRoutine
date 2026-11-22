// Chrome 회귀 스크립트의 종료 코드 정책. 스크립트가 어떻게 끝나든(process.exit(0)를 직접 불러도) 실제 PASS/FAIL 결과를 종료 코드에 반영한다.
//
//   0  전체 통과(PASS가 1건 이상이고 FAIL이 0건)
//   1  테스트 실패(FAIL이 1건 이상, 검사가 하나도 실행되지 않음, 스크립트가 예외로 중단됨)
//   2  실행 환경 오류(Chrome을 찾지 못함·개발 서버에 연결할 수 없음·브라우저 연결 시간 초과). 테스트 결과를 믿을 수 없는 상태다.
//
// 동작: console.log로 출력되는 줄 중 "PASS  …"·"FAIL  …"로 시작하는 줄을 센다(모든 스크립트의 검사 결과 출력 형식).
// 종료 시점('exit' 이벤트)에 "RESULT pass=N fail=M"을 한 줄 출력하고, 코드가 0인데 FAIL이 있거나 검사가 0건이면 종료 코드를 1로 바꾼다.
// 이 모듈은 브라우저에 의존하지 않으므로 selftest가 브라우저 없이 정책만 따로 검증할 수 있다.

export const EXIT = Object.freeze({ PASS: 0, FAIL: 1, ENV: 2 })

const counts = { pass: 0, fail: 0 }
let installed = false

/** 지금까지 센 검사 결과(실행기와 selftest가 읽는다). */
export function currentCounts() {
  return { ...counts }
}

/** 환경 오류로 즉시 종료한다. 결과 줄은 남기지 않는다(테스트가 실행되지 않았다). */
export function failEnvironment(message) {
  console.error(`ENV-ERROR  ${message}`)
  process.exit(EXIT.ENV)
}

export function installExitPolicy() {
  if (installed) return
  installed = true

  const original = console.log.bind(console)
  console.log = (...args) => {
    const first = typeof args[0] === 'string' ? args[0] : ''
    if (/^PASS(\s|$)/.test(first)) counts.pass += 1
    else if (/^FAIL(\s|$)/.test(first)) counts.fail += 1
    original(...args)
  }

  process.on('exit', (code) => {
    // 환경 오류(2)는 결과를 믿을 수 없으므로 그대로 둔다.
    if (code === EXIT.ENV) return
    // 자체 검증용: 일부러 실패 1건을 더한다(종료 코드가 실패를 반영하는지 확인하는 데 쓴다).
    if (process.env.CHROME_TEST_FORCE_FAIL === '1') {
      original('FAIL  (의도적 실패: CHROME_TEST_FORCE_FAIL=1)')
      counts.fail += 1
    }
    let finalCode = code
    let reason = ''
    if (code === 0 && counts.fail > 0) {
      finalCode = EXIT.FAIL
      reason = ` (실패 ${counts.fail}건이 있어 종료 코드를 0에서 1로 바꿨어요)`
    } else if (code === 0 && counts.pass === 0) {
      finalCode = EXIT.FAIL
      reason = ' (검사가 하나도 실행되지 않았어요)'
    }
    original(
      `RESULT pass=${counts.pass} fail=${counts.fail} exit=${finalCode}${reason}`,
    )
    process.exitCode = finalCode
  })
}

installExitPolicy()
