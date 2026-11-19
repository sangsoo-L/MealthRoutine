// Chrome 회귀 테스트 체계의 자체 검증: 실패가 종료 코드에 정확히 반영되는지 일부러 실패를 만들어 확인한다.
//
//   node tests/chrome/selftest.mjs               전체(A·B는 브라우저 불필요, C는 개발 서버와 Chrome 필요)
//   node tests/chrome/selftest.mjs --no-browser  A·B만
//
// A. 종료 정책(exitpolicy): 통과 0 · 실패 1(process.exit(0)를 직접 불러도) · 검사 0건 1 · 예외 1 · 환경 오류 2 · 의도적 실패 주입 1
// B. 실행기(run.mjs) 분류: PASS · FAIL · MISMATCH · ENV · TIMEOUT와 실행기 종료 코드
// C. 실제 스크립트: 의도적 실패 주입 시 종료 코드 1(이전에는 항상 0이던 스크립트), 환경 오류(Chrome 경로·서버 주소) 시 종료 코드 2
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import './lib/exitpolicy.mjs'
import { OUT_ROOT, findChrome, serverReachable } from './lib/env.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..', '..')
const POLICY_URL = pathToFileURL(join(HERE, 'lib', 'exitpolicy.mjs')).href
const noBrowser = process.argv.includes('--no-browser')

const check = (name, ok, detail = '') =>
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`,
  )

const dir = join(OUT_ROOT, 'selftest')
mkdirSync(dir, { recursive: true })
/** 임시 스크립트를 만들어 실행하고 종료 코드와 출력을 돌려준다. */
function runScript(name, body, env = {}) {
  const file = join(dir, name)
  writeFileSync(file, body)
  const r = spawnSync(process.execPath, [file], {
    cwd: FRONTEND,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 120000,
  })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}
const withPolicy = (body) => `import '${POLICY_URL}'\n${body}\n`

// ─── A. 종료 정책 ──────────────────────────────────────────
console.log('--- A. 종료 정책(exitpolicy)')
let r = runScript('a-pass.mjs', withPolicy(`console.log('PASS  하나')`))
check(
  'A-1 전체 통과 → 종료 코드 0, RESULT pass=1 fail=0',
  r.code === 0 && /RESULT pass=1 fail=0 exit=0/.test(r.out),
  `${r.code}`,
)
r = runScript(
  'a-fail-exit0.mjs',
  withPolicy(
    `console.log('PASS  하나')\nconsole.log('FAIL  둘')\nprocess.exit(0)`,
  ),
)
check(
  'A-2 FAIL이 있는데 process.exit(0)로 끝나도 → 종료 코드 1',
  r.code === 1 && /RESULT pass=1 fail=1 exit=1/.test(r.out),
  `${r.code}`,
)
r = runScript('a-fail-natural.mjs', withPolicy(`console.log('FAIL  하나')`))
check('A-3 FAIL이 있고 자연 종료해도 → 종료 코드 1', r.code === 1, `${r.code}`)
r = runScript(
  'a-zero.mjs',
  withPolicy(`console.log('아무 검사도 실행하지 않음')`),
)
check(
  'A-4 검사가 하나도 실행되지 않으면 → 종료 코드 1("통과"로 보고하지 않음)',
  r.code === 1 && /검사가 하나도 실행되지 않았어요/.test(r.out),
  `${r.code}`,
)
r = runScript(
  'a-throw.mjs',
  withPolicy(`console.log('PASS  하나')\nthrow new Error('중간에 중단')`),
)
check('A-5 예외로 중단되면 → 종료 코드 1', r.code === 1, `${r.code}`)
r = runScript(
  'a-env.mjs',
  withPolicy(
    `import { failEnvironment } from '${POLICY_URL}'\nconsole.log('PASS  하나')\nfailEnvironment('환경이 없어요')`,
  ),
)
check(
  'A-6 환경 오류는 → 종료 코드 2(결과 줄 없음)',
  r.code === 2 && /ENV-ERROR/.test(r.out) && !/RESULT/.test(r.out),
  `${r.code}`,
)
r = runScript('a-force.mjs', withPolicy(`console.log('PASS  하나')`), {
  CHROME_TEST_FORCE_FAIL: '1',
})
check(
  'A-7 CHROME_TEST_FORCE_FAIL=1이면 통과하는 스크립트도 → 종료 코드 1, 의도적 실패 줄 출력',
  r.code === 1 && /의도적 실패/.test(r.out) && /fail=1/.test(r.out),
  `${r.code}`,
)
r = runScript(
  'a-many.mjs',
  withPolicy(
    `for (let i=0;i<5;i++) console.log('PASS  ok'+i)\nconsole.log('FAIL  x')\nconsole.log('FAIL  y')`,
  ),
)
check(
  'A-8 PASS/FAIL 건수가 실제 출력과 같다(PASS 5·FAIL 2)',
  /RESULT pass=5 fail=2 exit=1/.test(r.out),
  r.out.split('\n').find((l) => /RESULT/.test(l)),
)

// ─── B. 실행기 분류 ────────────────────────────────────────
console.log('--- B. 실행기(run.mjs) 분류')
const specDir = join(dir, 'specs')
mkdirSync(specDir, { recursive: true })
const spec = (name, body) => writeFileSync(join(specDir, `${name}.mjs`), body)
spec('s-pass', withPolicy(`console.log('PASS  통과')`))
spec(
  's-fail',
  withPolicy(
    `console.log('PASS  하나')\nconsole.log('FAIL  실패')\nprocess.exit(0)`,
  ),
)
spec(
  's-crash',
  withPolicy(`console.log('PASS  하나')\nthrow new Error('중단')`),
)
// 종료 정책을 쓰지 않는 옛 스크립트: FAIL이 있는데 종료 코드 0 → 실행기가 불일치로 잡아야 한다
spec(
  's-mismatch',
  `console.log('PASS  하나')\nconsole.log('FAIL  실패')\nconsole.log('RESULT pass=1 fail=1 exit=0')\nprocess.exit(0)`,
)
spec(
  's-env',
  withPolicy(
    `import { failEnvironment } from '${POLICY_URL}'\nfailEnvironment('환경 없음')`,
  ),
)
spec(
  's-hang',
  withPolicy(`console.log('PASS  하나')\nsetInterval(() => {}, 1000)`),
)

const runner = join(HERE, 'run.mjs')
function runRunner(only, extra = []) {
  const a = spawnSync(
    process.execPath,
    [runner, '--spec-dir', specDir, '--only', only, ...extra],
    { cwd: FRONTEND, env: process.env, encoding: 'utf8', timeout: 120000 },
  )
  return { code: a.status, out: `${a.stdout}${a.stderr}` }
}
const statusOf = (out, name) =>
  out.match(new RegExp(`^\\s+(\\w+)\\s+${name}\\b`, 'm'))?.[1]
r = runRunner('s-pass')
check(
  'B-1 통과 스크립트만 → 실행기 종료 코드 0, 상태 PASS',
  r.code === 0 && statusOf(r.out, 's-pass') === 'PASS',
  `${r.code} ${statusOf(r.out, 's-pass')}`,
)
r = runRunner('s-fail')
check(
  'B-2 FAIL이 있는 스크립트(process.exit(0))는 → 상태 FAIL, 실행기 종료 코드 1',
  r.code === 1 && statusOf(r.out, 's-fail') === 'FAIL',
  `${r.code} ${statusOf(r.out, 's-fail')}`,
)
r = runRunner('s-crash')
check(
  'B-3 예외로 중단된 스크립트는 → 상태 FAIL, 종료 코드 1',
  r.code === 1 && statusOf(r.out, 's-crash') === 'FAIL',
  `${r.code} ${statusOf(r.out, 's-crash')}`,
)
r = runRunner('s-mismatch')
check(
  'B-4 종료 코드 0인데 FAIL이 있는 옛 방식 스크립트는 → 상태 MISMATCH, 종료 코드 1',
  r.code === 1 && statusOf(r.out, 's-mismatch') === 'MISMATCH',
  `${r.code} ${statusOf(r.out, 's-mismatch')}`,
)
r = runRunner('s-env')
check(
  'B-5 환경 오류 스크립트만 → 상태 ENV, 실행기 종료 코드 2',
  r.code === 2 && statusOf(r.out, 's-env') === 'ENV',
  `${r.code} ${statusOf(r.out, 's-env')}`,
)
r = runRunner('s-env,s-fail')
check(
  'B-6 환경 오류와 실패가 섞이면 → 종료 코드 1(실패가 우선)',
  r.code === 1,
  `${r.code}`,
)
r = runRunner('s-hang', ['--timeout-sec', '3'])
check(
  'B-7 시간 초과 스크립트는 중단되고 → 상태 TIMEOUT, 종료 코드 1',
  r.code === 1 && statusOf(r.out, 's-hang') === 'TIMEOUT',
  `${r.code} ${statusOf(r.out, 's-hang')}`,
)
r = runRunner('s-pass,s-fail,s-crash')
check(
  'B-8 합계가 실제 결과와 같다(PASS 3 · FAIL 1)',
  /합계 PASS 3 · FAIL 1/.test(r.out),
  r.out.split('\n').find((l) => /합계/.test(l)),
)
r = runRunner('s-none')
check(
  'B-9 없는 스크립트 이름은 → 상태 ENV, 종료 코드 2(조용히 건너뛰지 않음)',
  r.code === 2 && /ENV/.test(r.out),
  `${r.code}`,
)

// ─── C. 실제 스크립트 ──────────────────────────────────────
if (noBrowser) {
  console.log('--- C. 실제 스크립트: --no-browser로 건너뜀(미실행)')
} else if (!findChrome() || !(await serverReachable())) {
  console.log(
    '--- C. 실제 스크립트: Chrome 또는 개발 서버가 없어 실행하지 못했어요(미검증)',
  )
  check(
    'C-0 실제 스크립트 검증에 필요한 환경(Chrome·개발 서버)',
    false,
    '개발 서버를 띄우고 다시 실행해 주세요',
  )
} else {
  console.log(
    '--- C. 실제 스크립트(이전에는 실패해도 종료 코드 0이던 e01-filter-results 사용)',
  )
  const real = join(HERE, 'specs', 'e01-filter-results.mjs')
  const run = (env) => {
    const a = spawnSync(process.execPath, [real], {
      cwd: FRONTEND,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 180000,
    })
    return { code: a.status, out: `${a.stdout}${a.stderr}` }
  }
  r = run({})
  check(
    'C-1 정상 실행 → 종료 코드 0, 모든 검사 통과',
    r.code === 0 && /RESULT pass=4 fail=0 exit=0/.test(r.out),
    `${r.code} ${r.out.split('\n').find((l) => /RESULT/.test(l))}`,
  )
  r = run({ CHROME_TEST_FORCE_FAIL: '1' })
  check(
    'C-2 의도적 실패 주입 → 종료 코드 1(원래 코드는 process.exit(0)로 항상 0이었다)',
    r.code === 1 && /fail=1 exit=1/.test(r.out),
    `${r.code} ${r.out.split('\n').find((l) => /RESULT/.test(l))}`,
  )
  r = run({ CHROME_PATH: join(dir, '없는-chrome.exe') })
  check(
    'C-3 Chrome 경로가 잘못되면 → 종료 코드 2(환경 오류)',
    r.code === 2 && /ENV-ERROR/.test(r.out),
    `${r.code}`,
  )
  r = run({ CHROME_TEST_BASE_URL: 'http://127.0.0.1:9' })
  check(
    'C-4 개발 서버에 연결할 수 없으면 → 종료 코드 2(환경 오류)',
    r.code === 2 && /ENV-ERROR/.test(r.out),
    `${r.code}`,
  )
  const a = spawnSync(
    process.execPath,
    [runner, '--only', 'e01-filter-results'],
    {
      cwd: FRONTEND,
      env: { ...process.env, CHROME_TEST_FORCE_FAIL: '1' },
      encoding: 'utf8',
      timeout: 180000,
    },
  )
  check(
    'C-5 실행기로 실제 스크립트에 의도적 실패를 주입하면 → 실행기 종료 코드 1, 상태 FAIL',
    a.status === 1 && statusOf(a.stdout, 'e01-filter-results') === 'FAIL',
    `${a.status} ${statusOf(a.stdout, 'e01-filter-results')}`,
  )
}
