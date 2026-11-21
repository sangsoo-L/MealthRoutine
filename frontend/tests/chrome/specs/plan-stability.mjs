// [chrome 회귀] W01-2 안정화(권한·이탈·재진입)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S7 P3-2 실제 Chrome 검증: 확정 중 화면 이탈 무효화, 계정 변경, 이해도 조회 실패·미확인·지연·조회 중 계정 변경. 시나리오마다 새 프로필.
// node p32-verify.mjs [A|B|C|ALL]
import { start, ACCOUNTS } from '../lib/session.mjs'

ACCOUNTS.exercise = ['member.exercise@example.com', 'Mr-Dev-Exercise-2026']
const only = (process.argv[2] ?? 'ALL').toUpperCase()
const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const q = (s) => JSON.stringify(s)
const PLAN = '/records/exercise/plan'
const FLAG = 'mealthroutine.dev.mock.flag.'
const setFlag = (h, name, value) =>
  h.ev(`localStorage.setItem(${q(FLAG + name)}, ${q(value)})`)
const clearFlags = (h) =>
  h.ev(
    `['unavailable','failLoad','failSave','slowLoad'].forEach(n=>localStorage.removeItem(${q(FLAG)}+n))`,
  )
// W01의 초급 추천 진입은 접힌 보조 영역이다(운동·식단 대시보드 UI/UX 개선). 본문을 읽기 전에 펼쳐서,
// 진입이 보여야 하는 경우와 보이지 않아야 하는 경우를 모두 이전과 같은 의미로 검사한다(추천 화면 등 진입이 없는 화면에서는 아무 일도 하지 않는다).
const openBeginnerEntry = (h) =>
  h.ev(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true`,
  )
const mainText = async (h) => {
  await openBeginnerEntry(h)
  return h.text('main')
}
const draftRaw = (h) =>
  h.ev(
    `(()=>{const k=Object.keys(sessionStorage).find(k=>k.includes('workout-draft'));return k?sessionStorage.getItem(k):null})()`,
  )
const hasDraftItems = async (h) =>
  /"items":\[\{/.test((await draftRaw(h)) ?? '')
const clickLabel0 = (h, text) =>
  h.ev(
    `(()=>{const l=[...document.querySelectorAll('main label')].find(l=>l.innerText.includes(${q(text)}));if(!l)return false;const i=l.querySelector('input');(i||l).click();return true})()`,
  )
const preset0 = (h, minutes) =>
  h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.trim()===${q(minutes + '분')});if(!b)return false;b.click();return true})()`,
  )
// S8-UI-1: 조건 설정이 단계 화면이라 목표·시간을 고르면 다음 단계로 넘긴다(직접 선택은 4단계 운동 고르기까지).
const clickLabel = async (h, text) => {
  const ok = await clickLabel0(h, text)
  if (/(습관|체중 관리)/.test(text)) {
    await h.sleep(200)
    await h.click('^다음$')
    await h.sleep(450)
  }
  return ok
}
const preset = async (h, minutes) => {
  const ok = await preset0(h, minutes)
  await h.sleep(250)
  await h.click('^다음$')
  await h.sleep(500)
  // 직접 선택(4단계 모드)은 도구 단계를 지나 4단계 운동 고르기까지 넘긴다.
  for (let n = 0; n < 3; n++) {
    const t = await h.text('main')
    const m = t.match(/(\d)\/4단계/)
    if (!m || Number(m[1]) >= 4) break
    await h.click('^다음$')
    await h.sleep(500)
  }
  return ok
}
const entryShown = (h) =>
  h.ev(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기|직접 운동 선택하기/.test(a.innerText))`,
  )
const gotoResult = async (h) => {
  await h.go('/records/exercise', 1000)
  await h.until(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
    80,
  )
  await h.click('오늘의 운동 추천받기', 'main')
  await h.until(`location.pathname===${q(PLAN)}`, 60)
  await h.sleep(500)
  await clickLabel(h, '운동 습관 만들기')
  await preset(h, 20)
  await h.click('^운동 추천받기$')
  await h.until(`!!document.getElementById('plan-result-heading')`, 60)
  await h.sleep(300)
}
const run = (id) => only === 'ALL' || only === id
async function scenario(name, fn) {
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
  } catch (e) {
    check(`${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}
const backLink = `[...document.querySelectorAll('main a')].find(a=>/이전/.test(a.innerText))`
const confirmBtn = `[...document.querySelectorAll('main button')].find(b=>/^이 운동으로 목록 확인하기$/.test(b.innerText.trim()))`

// ═══ A. 확정 중 화면 이탈 ═══
if (run('A'))
  await scenario('p32-A', async (h) => {
    await h.login('free')
    // A1 이탈: 확정 직후 "이전"으로 W01
    await gotoResult(h)
    await h.ev(`(()=>{${confirmBtn}.click();${backLink}.click()})()`)
    for (const ms of [200, 800, 1500]) await h.sleep(ms)
    check(
      'A-1 확정 직후 화면 이탈: 이탈한 W01에 머문다(W11로 자동 이동하지 않음)',
      (await h.path()) === '/records/exercise',
      await h.path(),
    )
    check(
      'A-2 이탈한 뒤 구성 초안이 만들어지지 않는다(기존 초안 교체 없음)',
      !(await hasDraftItems(h)),
    )
    // A3 브라우저 뒤로가기로 이탈
    await gotoResult(h)
    await h.ev(`(()=>{${confirmBtn}.click();history.back()})()`)
    await h.sleep(2000)
    check(
      'A-3 확정 직후 브라우저 뒤로가기: W11로 끌려가지 않고 초안도 없다',
      (await h.path()) !== '/records/exercise/review' &&
        !(await hasDraftItems(h)),
      await h.path(),
    )
    // A4 같은 화면에서 입력을 바꿔 요청이 낡아진 경우("조건 바꾸기")
    await gotoResult(h)
    await h.ev(
      `(()=>{${confirmBtn}.click();const b=[...document.querySelectorAll('main button')].find(b=>/^조건 바꾸기/.test(b.innerText.trim()));b&&b.click()})()`,
    )
    await h.sleep(1800)
    check(
      'A-4 확정 중 "조건 바꾸기": 추천 화면(조건 입력)에 머물고 W11 이동·초안 교체가 없다',
      (await h.path()).startsWith(PLAN) &&
        !(await hasDraftItems(h)) &&
        /어떤 목표로 운동하고 싶으세요/.test(await mainText(h)),
      await h.path(),
    )
    // A5 정상 확정은 그대로 W11
    await gotoResult(h)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(600)
    check(
      'A-5 정상 확정: W11로 이동하고 초안이 만들어진다',
      (await h.path()) === '/records/exercise/review' &&
        (await hasDraftItems(h)),
    )
    // A6 연속 클릭: 한 번만 처리(앞 단계에서 만든 초안은 비워 확인 패널 없이 이동하는 경우를 본다)
    await h.ev(
      `Object.keys(sessionStorage).filter(k=>k.includes('workout-draft')).forEach(k=>sessionStorage.removeItem(k))`,
    )
    await gotoResult(h)
    await h.ev(
      `(()=>{const b=${confirmBtn};b.click();b.click();b.click();b.click()})()`,
    )
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(1200)
    check(
      'A-6 연속 클릭: W11 한 번만 이동(이동 뒤에도 W11에 머문다)',
      (await h.path()) === '/records/exercise/review' &&
        (await h.ev(`history.length`)) < 30,
    )
    // A7 구성 중이던 초안이 있을 때: 확인 패널이 뜬 뒤 이탈하면 초안은 바뀌지 않는다
    const before = await draftRaw(h)
    await gotoResult(h)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(1200)
    const panel = /구성 중이던 운동 목록이 있어요/.test(await mainText(h))
    await h.ev(`${backLink}.click()`)
    await h.sleep(1200)
    check(
      'A-7 확인 패널을 연 뒤 화면을 떠나면 기존 초안은 그대로이고 W11로 가지 않는다',
      panel &&
        (await h.path()) === '/records/exercise' &&
        (await draftRaw(h)) === before,
      `panel=${panel}`,
    )
    // A8 확인 패널에서 입력을 바꾸면 낡은 확인은 사라진다
    await gotoResult(h)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(1200)
    const panel2 = /구성 중이던 운동 목록이 있어요/.test(await mainText(h))
    await h.click('^취소$')
    await h.sleep(300)
    check(
      'A-8 확인 패널 취소: 추천 화면에 머물고 기존 초안은 유지된다',
      panel2 &&
        (await h.path()).startsWith(PLAN) &&
        (await draftRaw(h)) === before,
    )
  })

// ═══ B. 계정 변경 중 확정 ═══
if (run('B'))
  await scenario('p32-B', async (h) => {
    await h.login('free')
    await gotoResult(h)
    // 조회를 5초로 늘려 확정이 끝나기 전에 계정을 바꾼다(화면 이동은 새로고침 없이 클라이언트 라우팅으로)
    await setFlag(h, 'slowLoad', 'assessment')
    await h.ev(`${confirmBtn}.click()`)
    await h.sleep(150)
    await h.ev(
      `(()=>{history.pushState({}, '', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await h.until(
      `!![...document.querySelectorAll('button')].find(b=>/^로그아웃$/.test(b.innerText.trim()))`,
      40,
    )
    await h.click('^로그아웃$', 'body')
    await h.sleep(400)
    await h.ev(
      `(()=>{history.pushState({}, '', '/login');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
    )
    await h.sleep(300)
    // 다른 계정(exercise: 이해도 미확인)으로 로그인 — 이전 계정(free)의 확정이 아직 끝나기 전이어야 한다
    const [email, pw] = ACCOUNTS.exercise
    await h.until(`!!document.querySelector('input[type=email]')`, 60)
    await h.setVal('input[type=email]', email)
    await h.setVal('input[type=password]', pw)
    await h.ev(`document.querySelector('form').requestSubmit()`)
    await h.until(`location.pathname==='/home'`, 60)
    const t0 = Date.now()
    await h.sleep(7500) // 이전 계정의 확정(최대 약 5.3초)이 끝날 때까지
    check(
      'B-1 계정 변경 후 이전 계정의 확정이 끝나도 새 계정이 W11로 끌려가지 않는다',
      (await h.path()) !== '/records/exercise/review',
      `${await h.path()} (${Date.now() - t0}ms 대기)`,
    )
    check(
      'B-2 새 계정에는 이전 계정의 구성 초안이 없다',
      !(await hasDraftItems(h)),
    )
    await clearFlags(h)
  })

// ═══ C. 운동 이해도 조회 상태 ═══
if (run('C'))
  await scenario('p32-C', async (h) => {
    await h.login('free')
    // C1 정상
    await h.go('/records/exercise', 1500)
    await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      80,
    )
    check('C-1 정상(초급): W01에 추천 진입이 보인다', await entryShown(h))
    await h.go(`${PLAN}?mode=automatic`, 1500)
    await h.until(
      `/어떤 목표로 운동하고 싶으세요/.test(document.querySelector('main').innerText)`,
      80,
    )
    check(
      'C-2 정상(초급): URL 직접 접근 시 조건 입력이 열린다',
      /어떤 목표로 운동하고 싶으세요/.test(await mainText(h)),
    )
    // C3 미확인(조회 수단 없음)
    await setFlag(h, 'unavailable', 'assessment')
    await h.go('/records/exercise', 1500)
    await h.sleep(1200)
    check(
      'C-3 미확인: W01에 추천 진입이 없고 기존 영역은 그대로다',
      !(await entryShown(h)) &&
        /운동 관리/.test(await mainText(h)) &&
        /최근 운동 기록/.test(await mainText(h)),
    )
    await h.go(`${PLAN}?mode=automatic`, 1500)
    await h.sleep(900)
    check(
      'C-4 미확인: URL 직접 접근은 "이 기능을 쓸 수 없어요"로 막힌다',
      /이 기능을 쓸 수 없어요/.test(await mainText(h)) &&
        !/어떤 목표로 운동하고 싶으세요/.test(await mainText(h)),
    )
    await h.go('/records/exercise/compose', 1200)
    check(
      'C-5 미확인: 직접 구성(W02)은 그대로 열린다',
      !/이 기능을 쓸 수 없어요/.test(await mainText(h)),
    )
    await clearFlags(h)
    // C6 조회 실패
    await setFlag(h, 'failLoad', 'assessment')
    await h.go('/records/exercise', 1500)
    await h.sleep(1200)
    check(
      'C-6 조회 실패: W01에 추천 진입이 없고 기존 영역은 그대로다',
      !(await entryShown(h)) && /운동 관리/.test(await mainText(h)),
    )
    await h.go(`${PLAN}?mode=automatic`, 1500)
    await h.sleep(900)
    const failText = await mainText(h)
    check(
      'C-7 조회 실패: URL 직접 접근은 "운동 이해도를 확인하지 못했어요"로 막히고 다시 시도가 있다',
      /운동 이해도를 확인하지 못했어요/.test(failText) &&
        !/어떤 목표로 운동하고 싶으세요/.test(failText) &&
        /다시 시도/.test(failText),
    )
    await clearFlags(h)
    // C8 확정 시점의 조회 실패: 결과까지 본 뒤 조회가 실패하면 W11로 가지 않는다
    await gotoResult(h)
    await setFlag(h, 'failLoad', 'assessment')
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(1200)
    check(
      'C-8 확정 시점 조회 실패: 안내가 나오고 W11로 가지 않으며 초안도 없다',
      (await h.path()).startsWith(PLAN) &&
        /운동 이해도를 확인하지 못했어요/.test(await mainText(h)) &&
        !(await hasDraftItems(h)),
    )
    await clearFlags(h)
    // C9 조회 지연: 확인하는 동안 허용된 것처럼 보이지 않는다
    await setFlag(h, 'slowLoad', 'assessment')
    await h.go(`${PLAN}?mode=automatic`, 600)
    await h.sleep(800)
    const slow = await mainText(h)
    check(
      'C-9 조회 지연: 확인하는 중에는 조건 입력을 보이지 않고 로딩 안내만 보인다',
      /운동 이해도를 확인하는 중이에요/.test(slow) &&
        !/어떤 목표로 운동하고 싶으세요/.test(slow),
    )
    // 앞 단계(C-8)에서 결과 단계까지 갔던 임시 저장이 있어, 조회가 끝나면 조건 입력이 아니라 복원된 결과 단계가 열릴 수 있다.
    await h.until(
      `/어떤 목표로 운동하고 싶으세요|오늘의 운동이 준비됐어요/.test(document.querySelector('main').innerText)`,
      250,
      100,
    )
    check(
      'C-10 조회 지연이 끝나면(초급) 추천 화면(조건 입력 또는 복원된 결과)이 열린다',
      /어떤 목표로 운동하고 싶으세요|오늘의 운동이 준비됐어요/.test(
        await mainText(h),
      ) && !/이 기능을 쓸 수 없어요/.test(await mainText(h)),
    )
    await h.go('/records/exercise', 700)
    await h.sleep(600)
    check(
      'C-11 조회 지연 중 W01: 추천 진입이 아직 보이지 않는다',
      !(await entryShown(h)),
    )
    await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      250,
      100,
    )
    check('C-12 조회가 끝나면 W01에 추천 진입이 보인다', await entryShown(h))
    await clearFlags(h)
  })

// ═══ D. 조회 중 계정 변경 ═══
if (run('D'))
  await scenario('p32-D', async (h) => {
    const switchTo = async (who) => {
      await h.ev(
        `(()=>{history.pushState({}, '', '/settings');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
      )
      await h.until(
        `!![...document.querySelectorAll('button')].find(b=>/^로그아웃$/.test(b.innerText.trim()))`,
        40,
      )
      await h.click('^로그아웃$', 'body')
      await h.sleep(400)
      await h.ev(
        `(()=>{history.pushState({}, '', '/login');window.dispatchEvent(new PopStateEvent('popstate'))})()`,
      )
      await h.until(`!!document.querySelector('input[type=email]')`, 60)
      await h.sleep(300)
      const [email, pw] = ACCOUNTS[who]
      await h.setVal('input[type=email]', email)
      await h.setVal('input[type=password]', pw)
      await h.ev(`document.querySelector('form').requestSubmit()`)
      await h.until(`location.pathname==='/home'`, 60)
    }
    // D1: 초급(free)의 조회가 끝나기 전에 미확인(exercise) 계정으로 바꾼다 → 새 계정에는 진입이 절대 보이면 안 된다
    await h.login('free')
    await setFlag(h, 'slowLoad', 'assessment')
    await h.go('/records/exercise', 400) // free의 W01 조회 시작(5초 지연)
    await switchTo('exercise')
    const sawEntry = []
    await h.go('/records/exercise', 400)
    for (let i = 0; i < 40; i++) {
      sawEntry.push(
        await h.ev(
          `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기|직접 운동 선택하기/.test(a.innerText))`,
        ),
      )
      await h.sleep(250)
    }
    check(
      'D-1 초급 계정의 조회가 늦게 끝나도 새 계정(미확인)에는 추천 진입이 한 번도 보이지 않는다',
      !sawEntry.some(Boolean),
      `${sawEntry.filter(Boolean).length}/40 샘플에서 표시`,
    )
    await h.go(`${PLAN}?mode=automatic`, 600)
    await h.sleep(6500)
    check(
      'D-2 새 계정(미확인)의 URL 직접 접근은 지연이 끝나도 막혀 있다',
      /이 기능을 쓸 수 없어요/.test(await mainText(h)) &&
        !/어떤 목표로 운동하고 싶으세요/.test(await mainText(h)),
    )
    // D3: 반대로, 미확인 계정의 조회 중 초급 계정으로 바꾸면 새 계정의 값으로 정확히 보인다
    await h.go('/records/exercise', 400)
    await switchTo('free')
    await h.go('/records/exercise', 400)
    await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      250,
      150,
    )
    check(
      'D-3 미확인 계정의 조회 중 초급 계정으로 바꾸면 새 계정의 값으로 진입이 보인다',
      await entryShown(h),
    )
    await clearFlags(h)
  })

const failed = results.filter((r) => !r.ok)
console.log(
  `\n합계 ${results.length}건 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`,
)
for (const f of failed) console.log('  실패:', f.n)
process.exit(failed.length ? 1 : 0)
