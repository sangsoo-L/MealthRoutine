// Chrome 회귀 스크립트 공용 CDP 헬퍼(헤드리스 Chrome + DevTools Protocol). 앱 소스를 수정하지 않고, 추가 패키지 없이 Node 내장 기능(fetch·WebSocket)만 쓴다.
//
// 이전 헬퍼와 다른 점
// - 종료 코드: exitpolicy가 PASS/FAIL 결과를 종료 코드에 반영한다(0 통과 · 1 실패 · 2 환경 오류).
// - 실행 환경 오류(Chrome 없음·개발 서버 미연결·브라우저 연결 시간 초과)는 종료 코드 2로 즉시 알린다.
// - 포트: 스크립트가 넘기는 포트 번호를 쓰지 않고 비어 있는 포트를 고른다(앞선 실행이 남긴 Chrome과 부딪히지 않는다).
// - 출력: Chrome 프로필·스크린샷은 저장소가 아니라 OS 임시 폴더(CHROME_TEST_OUT)에 만든다.
// - 종료: 어떤 이유로 끝나든 이 스크립트가 띄운 Chrome을 닫는다.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, isAbsolute, join } from 'node:path'
import { BASE_URL, OUT_ROOT, findChrome, serverReachable } from './env.mjs'
import { failEnvironment } from './exitpolicy.mjs'

export { BASE_URL, OUT_ROOT, findChrome, serverReachable }

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Chrome을 띄워 한 페이지에 연결한다. out은 산출물 폴더 이름(상대 경로면 OUT_ROOT 아래의 폴더 이름만 쓴다), 두 번째 인자(포트)는 호환을 위해 받지만 무시한다.
 * 반환: { cdp, ev, vp, go, goSettled, sleep, check, res, problems, close, out }
 */
export async function launch(out, _port, baseArg) {
  const base = process.env.CHROME_TEST_BASE_URL ?? baseArg ?? BASE_URL
  const chromePath = findChrome()
  if (!chromePath) {
    failEnvironment(
      'Chrome 실행 파일을 찾을 수 없어요. CHROME_PATH 환경 변수에 chrome.exe 경로를 지정해 주세요.',
    )
  }
  if (!(await serverReachable(base))) {
    failEnvironment(
      `개발 서버(${base})에 연결할 수 없어요. frontend에서 "npm run dev -- --port 5199 --strictPort"로 먼저 띄워 주세요.`,
    )
  }
  const outDir = isAbsolute(out) ? out : join(OUT_ROOT, basename(out))
  mkdirSync(outDir, { recursive: true })
  const port = await freePort()
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(outDir, `profile-${port}`)}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  let closed = false
  const stopChrome = () => {
    if (closed) return
    closed = true
    try {
      chrome.kill()
    } catch {
      // 이미 종료됨
    }
  }
  // 스크립트가 어떻게 끝나든(예외·process.exit) 띄운 Chrome은 남기지 않는다.
  process.on('exit', stopChrome)

  let target
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      target = list.find((x) => x.type === 'page')
    } catch {
      // 아직 준비 중
    }
  }
  if (!target) {
    stopChrome()
    failEnvironment(
      'Chrome에 연결하지 못했어요(20초 안에 브라우저 페이지가 열리지 않았어요).',
    )
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('CDP 연결 실패'))
  }).catch(() => {
    stopChrome()
    failEnvironment('Chrome DevTools 연결에 실패했어요.')
  })

  let id = 0
  const pending = new Map()
  const problems = []
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data)
    if (m.id) {
      pending.get(m.id)?.(m)
      pending.delete(m.id)
    } else if (
      m.method === 'Runtime.consoleAPICalled' &&
      ['error', 'warning'].includes(m.params.type)
    ) {
      problems.push(
        m.params.type +
          ': ' +
          m.params.args.map((a) => a.value ?? a.description).join(' '),
      )
    } else if (m.method === 'Runtime.exceptionThrown') {
      problems.push(
        'exception ' + (m.params.exceptionDetails.exception?.description ?? ''),
      )
    }
  }
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id
      pending.set(n, (m) =>
        m.error ? reject(new Error(m.error.message)) : resolve(m.result),
      )
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  // 간헐 실패 재현용 부하 옵션(평소에는 켜지 않는다).
  //   CHROME_TEST_CPU_THROTTLE=4   페이지 CPU를 N배 느리게(타이밍에 민감한 대기 부족을 드러낸다)
  //   CHROME_TEST_DISABLE_CACHE=1  브라우저 캐시를 끄고 매번 새로 받는다(첫 로드·개발 서버 변환 지연과 비슷한 조건)
  const throttle = Number(process.env.CHROME_TEST_CPU_THROTTLE ?? 0)
  if (throttle > 1)
    await cdp('Emulation.setCPUThrottlingRate', { rate: throttle })
  if (process.env.CHROME_TEST_DISABLE_CACHE === '1') {
    await cdp('Network.enable')
    await cdp('Network.setCacheDisabled', { cacheDisabled: true })
  }

  const ev = async (expression) => {
    // 실패 원인을 추적할 수 있도록 호출한 스크립트의 위치를 오류 메시지에 남긴다(페이지 안에서 난 예외는 위치 정보가 없다).
    const caller = (new Error().stack ?? '')
      .split('\n')
      .slice(2, 4)
      .map((line) =>
        line
          .trim()
          .replace(/^at /, '')
          .replace(/file:\/\/\/[^ )]*\/(?=[^/ )]+:\d+)/, ''),
      )
      .join(' <- ')
    const r = await cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      const description =
        r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
      throw new Error(`${description.split('\n')[0]} [호출 위치: ${caller}]`)
    }
    return r.result.value
  }
  const vp = (w, h, extra = {}) =>
    cdp('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 640,
      ...extra,
    })
  const go = async (path, wait = 900) => {
    await cdp('Page.navigate', { url: base + path })
    await sleep(wait)
    // 고정 대기만으로는 느린 환경에서 화면이 아직 비어 있는 채 읽는 간헐 실패가 난다. 본문(main) 또는 로그인 입력창이 그려질 때까지 기다린다(최대 10초, 끝내 없으면 그대로 진행).
    for (let i = 0; i < 100; i++) {
      const painted = await ev(
        `!!document.querySelector('main, input[type=email]')`,
      ).catch(() => false)
      if (painted) break
      await sleep(100)
    }
    // 로그인 화면은 첫 로드가 느릴 수 있어(평상시 최대 약 850ms, 부하·캐시 없음에서는 2~6초) 고정 대기만으로는 입력창을 못 찾는 간헐 실패가 났다.
    // 입력창이 그려지거나 다른 화면으로 이동(이미 로그인된 상태의 리디렉션)할 때까지 기다린다. 최대 15초.
    if (path.split('?')[0] === '/login') {
      for (let i = 0; i < 150; i++) {
        const ready = await ev(
          `!!document.querySelector('input[type=email]') || location.pathname !== '/login'`,
        ).catch(() => false)
        if (ready) break
        await sleep(100)
      }
    }
  }
  // 이동 후 "…중이에요" 로딩 문구가 사라질 때까지(최대 약 7초) 기다린다. 개발 서버의 모듈 변환 시간 편차로 고정 대기가 모자라는 것을 막는다.
  const goSettled = async (path, wait = 900) => {
    await go(path, wait)
    for (let i = 0; i < 45; i++) {
      const busy = await ev(
        `(()=>{const m=document.querySelector('main');if(!m)return true;return [...m.querySelectorAll('[role=status]')].some(n=>/중이에요/.test(n.innerText))})()`,
      )
      if (!busy) break
      await sleep(150)
    }
  }
  const res = []
  const check = (n, ok, d = '') => {
    res.push({ n, ok: !!ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
  }
  const close = () => {
    try {
      ws.close()
    } catch {
      // 이미 닫힘
    }
    stopChrome()
  }
  return {
    cdp,
    ev,
    vp,
    go,
    goSettled,
    sleep,
    check,
    res,
    problems,
    close,
    out: outDir,
    base,
  }
}
