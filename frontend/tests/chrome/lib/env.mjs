// Chrome 회귀 테스트의 환경 점검(개발 서버 주소·산출물 폴더·Chrome 경로·서버 응답). 부수효과가 없어 실행기와 selftest도 그대로 import한다.
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 개발 서버 주소. `npm run dev -- --port 5199 --strictPort`로 띄운다. CHROME_TEST_BASE_URL로 바꿀 수 있다. */
export const BASE_URL =
  process.env.CHROME_TEST_BASE_URL ?? 'http://localhost:5199'
/** 스크린샷·프로필 등 산출물 폴더(저장소 밖). */
export const OUT_ROOT =
  process.env.CHROME_TEST_OUT ?? join(tmpdir(), 'mealthroutine-chrome-tests')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/** 사용할 Chrome 실행 파일. CHROME_PATH가 있으면 그것만 쓴다(없는 경로면 환경 오류). 못 찾으면 null. */
export function findChrome() {
  if (process.env.CHROME_PATH) {
    return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null
  }
  return CHROME_CANDIDATES.find((path) => existsSync(path)) ?? null
}

/** 개발 서버가 응답하는지(첫 화면 요청). 응답하지 않으면 false. */
export async function serverReachable(base = BASE_URL, timeoutMs = 5000) {
  try {
    const response = await fetch(base, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.status < 500
  } catch {
    return false
  }
}
