// Chrome 회귀 테스트 실행기. 스크립트를 하나씩 별도 프로세스로 실행하고 종료 코드·PASS/FAIL 건수·실행 시간을 모아 보고한다.
//
//   node tests/chrome/run.mjs                    전체 실행
//   node tests/chrome/run.mjs --list             스크립트·그룹 목록
//   node tests/chrome/run.mjs --group plan,a11y  그룹만 실행(그룹: explore detail record workout dashboard history support routine meal workoutplan plan a11y)
//   node tests/chrome/run.mjs --only w02-compose,e02-to-w02
//   옵션: --timeout-sec N(스크립트당 제한, 기본 900) · --spec-dir <경로>(selftest용)
//
// 실행 전 개발 서버(npm run dev -- --port 5199 --strictPort)와 Chrome이 필요하다. 없으면 아무것도 실행하지 않고 종료 코드 2로 끝난다.
//
// 종료 코드: 0 전체 통과 · 1 하나라도 실패(검사 실패·스크립트 중단·시간 초과·종료 코드와 결과 불일치) · 2 실행 환경 오류(실패가 없을 때만)
// 스크립트별 상태: PASS · FAIL · ENV(환경 오류) · TIMEOUT · MISMATCH(종료 코드와 PASS/FAIL 결과가 어긋남)
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_URL, OUT_ROOT, findChrome, serverReachable } from './lib/env.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..', '..')

/** 그룹과 실행 순서. 이름은 specs/<이름>.mjs. */
export const GROUPS = {
  explore: [
    'e01-filter-results',
    'e01-condition-sheet',
    'e01-back-navigation',
    'retry-focus',
    'search-integrated',
    'search-suggestions',
    'search-journey',
  ],
  detail: [
    'e02-detail-member',
    'e02-detail-guest',
    'e02-detail-focus',
    'favorites-app',
    'favorites-harness',
  ],
  record: [
    'w02-compose',
    'w02-draft-model',
    'w13-picker',
    'w13-register',
    'e02-to-w02',
  ],
  workout: ['w14-w15-flow', 'w14-w15-timed'],
  dashboard: ['w01-dashboard'],
  history: ['w10-my-exercise', 'w16-previous-lists'],
  support: ['support-screens'],
  routine: ['routines-stats'],
  meal: ['meals-food', 'meals-history', 'meals-plan'],
  workoutplan: ['workout-plan'],
  plan: [
    'plan-steps',
    'plan-ui',
    'plan-integration',
    'plan-stability',
    'plan-tool-choices',
  ],
  a11y: ['a11y-tool-cards'],
  quiz: ['quiz'],
}

function parseArgs(argv) {
  const args = {
    list: false,
    groups: null,
    only: null,
    timeoutSec: 900,
    specDir: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--list') args.list = true
    else if (a === '--group')
      args.groups = argv[++i]?.split(',').filter(Boolean)
    else if (a === '--only') args.only = argv[++i]?.split(',').filter(Boolean)
    else if (a === '--timeout-sec') args.timeoutSec = Number(argv[++i])
    else if (a === '--spec-dir') args.specDir = resolve(argv[++i])
    else {
      console.error(`알 수 없는 옵션: ${a}`)
      process.exit(2)
    }
  }
  return args
}

/** 한 스크립트를 실행하고 결과를 돌려준다. 시간 초과면 프로세스 트리(띄운 Chrome 포함)를 종료한다. */
function runSpec(name, file, timeoutSec, logDir) {
  return new Promise((done) => {
    const started = Date.now()
    const chunks = []
    const child = spawn(process.execPath, [file], {
      cwd: FRONTEND,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => chunks.push(d))
    child.stderr.on('data', (d) => chunks.push(d))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
      } else {
        child.kill('SIGKILL')
      }
    }, timeoutSec * 1000)
    child.on('close', (code) => {
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8')
      mkdirSync(logDir, { recursive: true })
      writeFileSync(join(logDir, `${name}.log`), output)
      const lines = output.split(/\r?\n/)
      const passLines = lines.filter((l) => /^PASS(\s|$)/.test(l)).length
      const failLines = lines.filter((l) => /^FAIL(\s|$)/.test(l)).length
      const resultLine = [...lines]
        .reverse()
        .find((l) => /^RESULT pass=/.test(l))
      const m = resultLine?.match(/^RESULT pass=(\d+) fail=(\d+) exit=(\d+)/)
      const pass = m ? Number(m[1]) : passLines
      const fail = m ? Number(m[2]) : failLines
      let status
      if (timedOut) status = 'TIMEOUT'
      else if (code === 2) status = 'ENV'
      else if (
        !m ||
        pass !== passLines ||
        (fail !== failLines && !/CHROME_TEST_FORCE_FAIL/.test(output))
      )
        status = 'MISMATCH'
      else if (code === 0 && fail === 0 && pass > 0) status = 'PASS'
      else if (code === 0 && fail > 0) status = 'MISMATCH'
      else status = 'FAIL'
      done({
        name,
        status,
        code,
        pass,
        fail,
        seconds: Math.round((Date.now() - started) / 1000),
        failed: lines.filter((l) => /^FAIL(\s|$)/.test(l)).slice(0, 5),
        tail: lines.filter(Boolean).slice(-4),
      })
    })
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const specDir = args.specDir ?? join(HERE, 'specs')

  if (args.list) {
    for (const [group, names] of Object.entries(GROUPS)) {
      console.log(`${group}: ${names.join(', ')}`)
    }
    return 0
  }

  let names
  if (args.only) names = args.only
  else if (args.groups) {
    names = args.groups.flatMap((g) => {
      if (!GROUPS[g]) {
        console.error(
          `알 수 없는 그룹: ${g} (사용 가능: ${Object.keys(GROUPS).join(' ')})`,
        )
        process.exit(2)
      }
      return GROUPS[g]
    })
  } else if (args.specDir) {
    names = readdirSync(specDir)
      .filter((f) => f.endsWith('.mjs'))
      .map((f) => f.replace(/\.mjs$/, ''))
      .sort()
  } else names = Object.values(GROUPS).flat()

  const missing = names.filter((n) => !existsSync(join(specDir, `${n}.mjs`)))

  // 사전 점검: 환경이 없으면 한 건도 실행하지 않는다(결과를 믿을 수 없다). selftest가 spec-dir로 부를 때는 브라우저가 필요 없으므로 건너뛴다.
  if (!args.specDir) {
    if (!findChrome()) {
      console.error(
        'ENV-ERROR  Chrome 실행 파일을 찾을 수 없어요(CHROME_PATH로 지정할 수 있어요).',
      )
      return 2
    }
    if (!(await serverReachable())) {
      console.error(
        `ENV-ERROR  개발 서버(${BASE_URL})에 연결할 수 없어요. "npm run dev -- --port 5199 --strictPort"로 먼저 띄워 주세요.`,
      )
      return 2
    }
  }

  const logDir = join(OUT_ROOT, 'logs')
  const results = []
  const startedAll = Date.now()
  console.log(`Chrome 회귀 ${names.length}개 실행(로그: ${logDir})`)
  for (const name of names) {
    if (missing.includes(name)) {
      const r = {
        name,
        status: 'ENV',
        code: null,
        pass: 0,
        fail: 0,
        seconds: 0,
        failed: [],
        tail: ['스크립트 파일이 없어요'],
      }
      results.push(r)
      console.log(`  ${r.status.padEnd(8)} ${name}  (파일 없음)`)
      continue
    }
    const r = await runSpec(
      name,
      join(specDir, `${name}.mjs`),
      args.timeoutSec,
      logDir,
    )
    results.push(r)
    console.log(
      `  ${r.status.padEnd(8)} ${name.padEnd(24)} pass=${String(r.pass).padStart(3)} fail=${r.fail} exit=${r.code} ${r.seconds}s`,
    )
  }

  const totals = results.reduce(
    (acc, r) => ({ pass: acc.pass + r.pass, fail: acc.fail + r.fail }),
    { pass: 0, fail: 0 },
  )
  const bad = results.filter((r) => r.status !== 'PASS')
  console.log('')
  console.log(
    `합계 PASS ${totals.pass} · FAIL ${totals.fail} · 스크립트 ${results.length - bad.length}/${results.length} 통과 · ${Math.round((Date.now() - startedAll) / 1000)}초`,
  )
  for (const r of bad) {
    console.log(`  [${r.status}] ${r.name}`)
    for (const l of r.failed) console.log(`      ${l.slice(0, 180)}`)
    if (
      r.status === 'ENV' ||
      r.status === 'TIMEOUT' ||
      r.status === 'MISMATCH'
    ) {
      for (const l of r.tail) console.log(`      … ${l.slice(0, 180)}`)
    }
  }
  mkdirSync(OUT_ROOT, { recursive: true })
  writeFileSync(
    join(OUT_ROOT, 'last-run.json'),
    JSON.stringify(
      { finishedAt: new Date().toISOString(), totals, results },
      null,
      2,
    ),
  )

  if (results.some((r) => ['FAIL', 'TIMEOUT', 'MISMATCH'].includes(r.status)))
    return 1
  if (results.some((r) => r.status === 'ENV')) return 2
  return 0
}

const code = await main()
process.exit(code)
