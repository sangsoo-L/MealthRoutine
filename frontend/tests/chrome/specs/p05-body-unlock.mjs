// [chrome 회귀] P05 신체 정보 확인(확인 모드) · P01 열람 연결:
//   P01 → P05 진입 · 잘못된 PIN(n/5)·5회 잠금과 P01 복귀 · 성공 후 P01 수치 표시 · 숨기기 · 60초 자동 가림 · 화면 이탈·탭 숨김·pagehide·새로고침 재마스킹 ·
//   다른 탭의 PIN 변경 무효화(별도 문서의 독립 모듈로 실제 storage 이벤트 발생) · 비회원·직접 URL · 미등록 → P11 등록 후 P05 복귀 ·
//   연결 전·조회 실패 · 390/320/195/160px 레이아웃(하단 탭 겹침·44px·320px 글자 200%) · 키보드 · 저장소에 권한·PIN이 남지 않음
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only p05-body-unlock`. 상세: tests/chrome/README.md
// 개발 서버 전용 모의 계정과 개발용 PIN 저장소(브라우저 프로필 안)만 쓰고, 시나리오마다 새 Chrome 프로필로 시작해 실제 계정·PIN을 건드리지 않는다.
// 쓰는 번호는 테스트용이다. 60초 자동 가림은 실제로 약 1분을 기다린다(B 시나리오).
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const PIN = '135790'
const NEW = '246801'
const SECTION = `document.querySelector('section[aria-labelledby=my-body-title]')`
const FORM = `!!document.querySelector('form[data-pin-verify]')`
const TOKEN_RE = '[a-f0-9]{48}'

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(h, `${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

const userId = (h) =>
  h.ev(
    `JSON.parse(sessionStorage.getItem('mealthroutine.dev.session')).accountId`,
  )
/** PIN 등록(저장소 직접)과 키·몸무게 시드. 화면 조작을 거치지 않는 준비 단계다. */
async function seedMember(
  h,
  { pin = PIN, register = true, height = 170.5, weight = 65 } = {},
) {
  const id = await userId(h)
  await h.ev(`(async()=>{
    ${
      register
        ? `const src = await import('/src/exercise-goal/exerciseGoalSource.ts'); await src.createExerciseGoalRepository(${q(id)}).registerPin(${q(pin)}, ${q(pin)});`
        : ''
    }
    const body = {v:1, updatedAt:new Date().toISOString()};
    ${height === null ? '' : `body.heightCm = ${height};`}
    ${weight === null ? '' : `body.weightKg = ${weight};`}
    localStorage.setItem('mealthroutine.dev.mock.body.'+${q(id)}, JSON.stringify(body));
  })()`)
  return id
}
const sectionText = (h) =>
  h.ev(`${SECTION}?.innerText.replace(/\\s+/g,' ').trim() ?? ''`)
const openMyPage = async (h) => {
  await h.go('/mypage', 300)
  await mustUntil(h, `!!${SECTION}`, 120)
}
const goUnlock = async (h) => {
  await openMyPage(h)
  await mustClick(h, '^2차 비밀번호로 신체 정보 보기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, FORM, 80)
}
const submitPin = async (h, pin) => {
  await h.setVal('[name=pinVerify]', pin)
  await h.ev(`document.querySelector('form[data-pin-verify]').requestSubmit()`)
}
const alertText = (h) =>
  h.ev(`document.querySelector('form [role=alert]')?.innerText.trim() ?? ''`)
const waitAlert = (h, re) =>
  mustUntil(
    h,
    `new RegExp(${q(re)}).test(document.querySelector('form [role=alert]')?.innerText ?? '')`,
    120,
  )
/** P01에서 P05로 가서 확인에 성공하고 열람 중인 P01에 도착한다. */
const unlockToMyPage = async (h, pin = PIN) => {
  await goUnlock(h)
  await submitPin(h, pin)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `/170\\.5cm/.test(${SECTION}?.innerText ?? '')`, 80)
}
/** 홈 화면이 실제로 그려질 때까지 기다린다(경로만 바뀐 상태에서 뒤로 가면 P01을 떠난 것이 아니다). */
const homeShown = (h) =>
  mustUntil(
    h,
    `document.querySelector('main h1')?.innerText.trim() === '홈'`,
    80,
  )
const masked = async (h) => {
  const t = await sectionText(h)
  return (
    !/\d+(\.\d)?\s?(cm|kg)/.test(t) &&
    (await h.ev(
      `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length`,
    )) === 3
  )
}
const hygiene = (h) =>
  h.ev(
    `JSON.stringify([Object.entries(localStorage).filter(([k])=>!k.startsWith('mealthroutine.dev.exercise-goal.pin.')&&!k.startsWith('mealthroutine.dev.mock.body.')), Object.entries(sessionStorage), history.state, location.href])`,
  )

await scenario('A-entry-success-hide', async (h) => {
  await h.login('free')
  await seedMember(h)
  await openMyPage(h)
  check(
    h,
    'A1. P01: 기본은 마스킹이고 수치가 없으며 P05 링크(연결됨)가 있다',
    (await masked(h)) &&
      (await h.ev(
        `[...${SECTION}.querySelectorAll('a')].find(a=>/2차 비밀번호로 신체 정보 보기/.test(a.innerText))?.getAttribute('href')`,
      )) === '/mypage/body/unlock' &&
      /보호 중/.test(await sectionText(h)),
  )
  await mustClick(h, '^2차 비밀번호로 신체 정보 보기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, FORM, 80)
  check(
    h,
    'A2. P05: h1 하나·제목·문서 제목·하단 탭 유지·이전은 P01',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h.ev(`document.querySelector('main h1').innerText.trim()`)) ===
        '신체 정보 확인' &&
      /신체 정보 확인/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `!!document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]')`,
      )) &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/mypage',
  )
  check(
    h,
    'A3. P05: 마스킹·숫자 키패드·자동완성 끔·6자리·취소 링크·1분 안내',
    (await h.ev(
      `(()=>{const i=document.querySelector('[name=pinVerify]');return i.type==='password'&&i.inputMode==='numeric'&&i.autocomplete==='off'&&i.maxLength===6})()`,
    )) &&
      (await h.has('1분 동안 신체 정보를 확인할 수 있어요')) &&
      (await h.has(
        '신체 정보는 1분 동안만 표시되며, 화면을 벗어나면 다시 가려져요',
      )) &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^취소$/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/mypage',
  )
  await submitPin(h, '123')
  await mustUntil(h, `!!document.querySelector('form [role=alert]')`, 40)
  check(
    h,
    'A4. 6자리 미만: 형식 안내(횟수에 넣지 않음)와 입력 포커스',
    /숫자 6자리로 입력해 주세요/.test(await alertText(h)) &&
      (await h.ev(`document.activeElement?.getAttribute('name')`)) ===
        'pinVerify',
  )
  await submitPin(h, '000000')
  await waitAlert(h, '일치하지 않아요\\. \\(1/5\\)')
  check(
    h,
    'A5. 불일치: 남은 횟수 (1/5)·입력 비움·입력 포커스·aria-invalid·오류 문구 연결(aria-describedby)',
    (await h.ev(`document.querySelector('[name=pinVerify]').value`)) === '' &&
      (await h.ev(`document.activeElement?.getAttribute('name')`)) ===
        'pinVerify' &&
      (await h.ev(
        `(()=>{const i=document.querySelector('[name=pinVerify]');const id=document.querySelector('form [role=alert]').id;return i.getAttribute('aria-invalid')==='true'&&i.getAttribute('aria-describedby').split(' ').includes(id)})()`,
      )),
  )
  // 처리 중 aria-busy를 관찰한다(제출 직후 짧게 true가 된다).
  await h.ev(
    `(()=>{window.__busy=false;const f=document.querySelector('form[data-pin-verify]');new MutationObserver(()=>{if(f.getAttribute('aria-busy')==='true')window.__busy=true}).observe(f,{attributes:true})})()`,
  )
  await submitPin(h, PIN)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `/170\\.5cm/.test(${SECTION}?.innerText ?? '')`, 80)
  check(
    h,
    'A6. 확인 중 aria-busy가 true가 된다',
    await h.ev(`window.__busy === true`),
  )
  const text = await sectionText(h)
  check(
    h,
    'A7. 성공: P01로 돌아와 키·몸무게·BMI가 보이고 열람 중 표시',
    /170\.5cm/.test(text) &&
      /65kg/.test(text) &&
      /22\.4/.test(text) &&
      /열람 중/.test(text),
    text,
  )
  check(
    h,
    'A8. 성공 화면(P05)은 뒤로 가기 기록에 남지 않는다(replace)',
    await (async () => {
      await h.ev(`history.back()`)
      await h.sleep(500)
      const p = await h.path()
      return !/\/mypage\/body\/unlock/.test(p)
    })(),
  )
  await h.go('/mypage', 300)
  await mustUntil(h, `!!${SECTION}`, 120)
  // A9의 점검은 열람 중 상태에서 해야 하므로 다시 확인한다.
  await unlockToMyPage(h)
  const dump = await hygiene(h)
  check(
    h,
    'A9. PIN·권한 토큰·수치가 URL·router state·sessionStorage·localStorage(개발용 저장소의 PIN 자격·신체 정보 제외)에 없다',
    !dump.includes(PIN) &&
      !new RegExp(TOKEN_RE).test(dump) &&
      !/170\.5|"weightKg"|accessToken|expiresAt/.test(dump),
    dump.slice(0, 200),
  )
  await h.click(
    '신체 정보 다시 숨기기',
    `section[aria-labelledby=my-body-title]`,
  )
  await mustUntil(
    h,
    `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length === 3`,
    40,
  )
  check(
    h,
    'A10. 숨기기: 즉시 마스킹·수치 제거·열람 링크 복귀·알림 없음',
    (await masked(h)) &&
      /2차 비밀번호로 신체 정보 보기/.test(await sectionText(h)) &&
      !/다시 가렸어요/.test(await sectionText(h)),
  )
})

await scenario('B-expires-after-60s', async (h) => {
  await h.login('free')
  await seedMember(h)
  await unlockToMyPage(h)
  const startedAt = Date.now()
  await h.sleep(30_000)
  check(
    h,
    'B1. 30초 뒤에도 수치가 보인다',
    /170\.5cm/.test(await sectionText(h)),
  )
  await mustUntil(
    h,
    `/다시 가렸어요/.test(${SECTION}?.innerText ?? '')`,
    400,
    100,
  )
  const elapsed = Date.now() - startedAt
  check(
    h,
    'B2. 60초 안팎에 자동으로 다시 가려지고 만료 안내가 보인다',
    (await masked(h)) &&
      /열람 시간이 끝나 신체 정보를 다시 가렸어요/.test(await sectionText(h)) &&
      elapsed >= 55_000 &&
      elapsed <= 68_000,
    `성공 뒤 ${elapsed}ms`,
  )
  check(
    h,
    'B3. 만료 뒤 DOM 어디에도 수치가 없다',
    !/170\.5|\b65kg|22\.4/.test(await h.text('body')),
  )
})

await scenario('C-leave-hidden-reload', async (h) => {
  await h.login('free')
  await seedMember(h)
  await unlockToMyPage(h)
  // 화면 이탈: 하단 탭으로 홈에 갔다가 마이로 돌아오면 다시 가려져 있다.
  await mustClick(h, '^홈$', 'nav[aria-label="밀스루틴 주요 메뉴"]')
  await waitPath(h, '^/home$')
  await homeShown(h)
  await mustClick(h, '^마이$', 'nav[aria-label="밀스루틴 주요 메뉴"]')
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `!!${SECTION}`, 80)
  check(h, 'C1. 화면 이탈 후 돌아오면 마스킹(수치 복구 없음)', await masked(h))
  // 이탈 뒤 브라우저 뒤로 가기로 와도 가려져 있다.
  await unlockToMyPage(h)
  await mustClick(h, '^홈$', 'nav[aria-label="밀스루틴 주요 메뉴"]')
  await waitPath(h, '^/home$')
  await homeShown(h)
  await h.ev(`history.back()`)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `!!${SECTION}`, 80)
  check(h, 'C2. 이탈 뒤 브라우저 뒤로 가기로 돌아와도 마스킹', await masked(h))
  // 탭 숨김
  await unlockToMyPage(h)
  await h.ev(
    `Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))`,
  )
  await mustUntil(
    h,
    `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length === 3`,
    40,
  )
  await h.ev(`delete document.hidden`)
  check(
    h,
    'C3. 탭이 숨겨지면 즉시 마스킹하고 안내한다',
    (await masked(h)) &&
      /화면을 벗어나 신체 정보를 다시 가렸어요/.test(await sectionText(h)),
  )
  // pagehide
  await unlockToMyPage(h)
  await h.ev(`window.dispatchEvent(new Event('pagehide'))`)
  await mustUntil(
    h,
    `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length === 3`,
    40,
  )
  check(h, 'C4. pagehide에서 즉시 마스킹', await masked(h))
  // 새로고침
  await unlockToMyPage(h)
  await h.cdp('Page.reload')
  await h.sleep(600)
  await mustUntil(h, `!!${SECTION}`, 150)
  await h.sleep(500)
  check(h, 'C5. 새로고침하면 마스킹(권한은 메모리에만 있다)', await masked(h))
  // 로그아웃
  await unlockToMyPage(h)
  await h.go('/settings', 300)
  await mustClick(h, '^로그아웃')
  await mustUntil(
    h,
    `location.pathname==='/home' || location.pathname==='/login'`,
    80,
  )
  await h.login('free')
  await openMyPage(h)
  check(h, 'C6. 로그아웃·재로그인 뒤에는 마스킹', await masked(h))
})

await scenario('D-lockout-returns-to-p01', async (h) => {
  await h.login('free')
  await seedMember(h)
  await goUnlock(h)
  for (const n of [1, 2, 3, 4]) {
    await submitPin(h, '000000')
    await waitAlert(h, `\\(${n}/5\\)`)
  }
  check(
    h,
    'D1. 4회까지는 남은 횟수 (n/5)가 늘고 P05에 머문다',
    (await h.path()) === '/mypage/body/unlock',
  )
  await submitPin(h, '000000')
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `!!${SECTION}`, 80)
  check(
    h,
    'D2. 5회째 불일치: P01로 복귀하고 잠금 안내가 보이며 마스킹 유지',
    /5회 일치하지 않아 잠시 제한됐어요/.test(await sectionText(h)) &&
      (await masked(h)),
    await sectionText(h),
  )
  await mustUntil(h, `!history.state?.usr?.pinNotice`, 40)
  const dump = await hygiene(h)
  check(
    h,
    'D3. 잠금 표지는 한 번 보인 뒤 router state에서 지워지고 PIN·토큰은 없다',
    !dump.includes(PIN) && !new RegExp(TOKEN_RE).test(dump),
    dump.slice(0, 200),
  )
  await h.cdp('Page.reload')
  await h.sleep(600)
  await mustUntil(h, `!!${SECTION}`, 150)
  check(
    h,
    'D4. 새로고침하면 잠금 안내가 남지 않는다',
    !/5회 일치하지 않아/.test(await sectionText(h)),
  )
  await mustClick(h, '^2차 비밀번호로 신체 정보 보기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, FORM, 80)
  await waitAlert(h, '5회 일치하지 않아 잠시 제한됐어요')
  check(
    h,
    'D5. 잠긴 동안 다시 들어가면 잠금 안내가 보이고 확인 버튼은 비활성이다',
    await h.ev(
      `document.querySelector('form[data-pin-verify] button[type=submit]').disabled`,
    ),
  )
  await submitPin(h, PIN)
  await h.sleep(500)
  check(
    h,
    'D6. 잠긴 동안에는 올바른 PIN도 통과하지 못한다',
    (await h.path()) === '/mypage/body/unlock',
  )
})

await scenario('E-guest-direct-and-register-return', async (h) => {
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, `!!document.querySelector('main')`, 80)
  check(
    h,
    'E1. 비회원이 주소로 들어오면 로그인 안내를 보고 입력·확인 폼이 없다',
    (await h.has('로그인')) && !(await h.ev(FORM)),
  )
  await h.login('free')
  await seedMember(h, { register: false })
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 80)
  await mustUntil(
    h,
    `/먼저 2차 비밀번호를 등록해 주세요/.test(document.querySelector('main').innerText)`,
    80,
  )
  check(
    h,
    'E2. 회원의 직접 URL 접근: P05가 열리고 이전은 P01이다(state 없음)',
    (await h.has('먼저 2차 비밀번호를 등록해 주세요')) &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/mypage',
  )
  check(
    h,
    'E3. 미등록: 입력·확인 비활성이고 등록 링크가 P11을 가리킨다',
    (await h.ev(`document.querySelector('[name=pinVerify]').disabled`)) &&
      (await h.ev(
        `document.querySelector('form[data-pin-verify] button[type=submit]').disabled`,
      )) &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/2차 비밀번호 등록/.test(a.innerText))?.getAttribute('href')`,
      )) === '/settings/pin/register',
  )
  // 등록 화면에서 취소하면 P05로 돌아온다.
  await mustClick(h, '2차 비밀번호 등록')
  await waitPath(h, '^/settings/pin/register$')
  await mustUntil(h, `!!document.querySelector('form[data-pin-form]')`, 80)
  check(
    h,
    'E4. P05에서 온 P11: 이전·취소가 모두 P05를 가리킨다',
    (await h.ev(
      `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
    )) === '/mypage/body/unlock' &&
      (await h.ev(
        `[...document.querySelectorAll('main form a')].find(a=>/^취소$/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/mypage/body/unlock',
  )
  await h.click('^취소$', 'main form')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, `!!document.querySelector('form[data-pin-verify]')`, 80)
  // 등록하고 P05로 돌아온다.
  await mustClick(h, '2차 비밀번호 등록')
  await waitPath(h, '^/settings/pin/register$')
  await mustUntil(h, `!!document.querySelector('form[data-pin-form]')`, 80)
  await h.setVal('[name=pinNew]', PIN)
  await h.setVal('[name=pinConfirm]', PIN)
  await h.ev(`document.querySelector('form[data-pin-form]').requestSubmit()`)
  await mustUntil(
    h,
    `!!document.querySelector('[data-pin-done=register]')`,
    120,
  )
  check(
    h,
    'E5. P11 등록 완료: 신체 정보 확인으로 돌아가기(P05)와 마이페이지 링크, 가림 유지 안내',
    (await h.ev(
      `[...document.querySelectorAll('main a')].find(a=>/신체 정보 확인으로 돌아가기/.test(a.innerText))?.getAttribute('href')`,
    )) === '/mypage/body/unlock' &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^마이페이지로$/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/mypage' &&
      (await h.has('키·몸무게·BMI는 계속 가려져 있어요')),
  )
  await mustClick(h, '신체 정보 확인으로 돌아가기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, `!!document.querySelector('form[data-pin-verify]')`, 80)
  check(
    h,
    'E6. 등록 직후 P05: 폼이 열리고 아직 열람 권한은 없다(등록이 열람을 만들지 않는다)',
    !(await h.ev(`document.querySelector('[name=pinVerify]').disabled`)),
  )
  await submitPin(h, PIN)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `/170\\.5cm/.test(${SECTION}?.innerText ?? '')`, 80)
  check(h, 'E7. 등록한 PIN으로 확인하면 P01에서 수치가 보인다', true)
})

await scenario('F-other-tab-pin-change', async (h) => {
  await h.login('free')
  const id = await seedMember(h)
  await unlockToMyPage(h)
  check(h, 'F1. 탭 A: 열람 중', /170\.5cm/.test(await sectionText(h)))
  // 탭 B: 같은 출처의 별도 문서(iframe)에서 독립된 모듈 인스턴스(권한 Map 따로)로 PIN을 바꾼다.
  // 같은 저장소에 쓰므로 탭 A에는 실제 storage 이벤트가 전달된다.
  await h.ev(`(async()=>{
    const f=document.createElement('iframe');f.id='tab-b';f.style.display='none';document.body.appendChild(f);
    await new Promise((r)=>setTimeout(r,50));
    const m=await f.contentWindow.eval("import('/src/exercise-goal/local/localExerciseGoalRepository.ts')");
    await m.createLocalExerciseGoalRepository(${q(id)}).changePin(${q(PIN)},${q(NEW)},${q(NEW)});
  })()`)
  await mustUntil(
    h,
    `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length === 3`,
    60,
  )
  check(
    h,
    'F2. 탭 B가 PIN을 바꾸면 탭 A는 즉시 다시 가려지고 안내한다',
    (await masked(h)) &&
      /열람 시간이 끝나 신체 정보를 다시 가렸어요/.test(await sectionText(h)),
    await sectionText(h),
  )
  check(
    h,
    'F3. 탭 A의 DOM 어디에도 수치가 남지 않는다',
    !/170\.5|\b65kg|22\.4/.test(await h.text('body')),
  )
  await h.ev(`document.getElementById('tab-b')?.remove()`)
  await mustClick(h, '^2차 비밀번호로 신체 정보 보기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, FORM, 80)
  await submitPin(h, PIN)
  await waitAlert(h, '일치하지 않아요')
  check(
    h,
    'F4. 이전 PIN으로는 더 이상 확인되지 않는다',
    (await h.path()) === '/mypage/body/unlock',
  )
  await submitPin(h, NEW)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `/170\\.5cm/.test(${SECTION}?.innerText ?? '')`, 80)
  check(h, 'F5. 바뀐 PIN으로 확인하면 다시 볼 수 있다', true)
  // 이벤트 없이도: 열람 중에 자격이 바뀌면 다음 확인(창 포커스)에서 가려진다.
  await h.ev(`(async()=>{
    const f=document.createElement('iframe');f.id='tab-c';f.style.display='none';document.body.appendChild(f);
    await new Promise((r)=>setTimeout(r,50));
    const m=await f.contentWindow.eval("import('/src/exercise-goal/local/localExerciseGoalRepository.ts')");
    await m.createLocalExerciseGoalRepository(${q(id)}).changePin(${q(NEW)},${q(PIN)},${q(PIN)});
  })()`)
  await mustUntil(
    h,
    `${SECTION}.querySelectorAll('dd [aria-hidden=true]').length === 3`,
    60,
  )
  check(h, 'F6. 두 번째 변경에서도 동일하게 무효화된다', await masked(h))
})

await scenario('G-layout-keyboard', async (h) => {
  await h.login('free')
  await seedMember(h)
  const probe = (scope) => `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll(${q(scope)}+' a, '+${q(scope)}+' button, '+${q(scope)}+' input')];
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5&&!e.closest('.sr-only')}).map(e=>(e.innerText||e.name||e.tagName).trim().slice(0,12));
    window.scrollTo(0,document.documentElement.scrollHeight);
    const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]');
    const navTop=nav?nav.getBoundingClientRect().top:Infinity;
    const last=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height>0).reduce((m,e)=>Math.max(m,e.getBoundingClientRect().bottom),0);
    return {ov:document.documentElement.scrollWidth-W,bad,small,navOverlap:Math.round(last-navTop)}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await goUnlock(h)
    const p5 = await h.ev(probe('main'))
    check(
      h,
      `G1. ${width}px P05: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      p5.ov <= 0 && p5.bad === 0 && p5.small.length === 0 && p5.navOverlap <= 0,
      JSON.stringify(p5),
    )
    await h.sleep(450)
    await h.shot(`p05-${width}.png`)
    await submitPin(h, PIN)
    await waitPath(h, '^/mypage$')
    await mustUntil(h, `/170\\.5cm/.test(${SECTION}?.innerText ?? '')`, 80)
    const p1 = await h.ev(probe('section[aria-labelledby=my-body-title]'))
    check(
      h,
      `G2. ${width}px P01(열람 중): 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      p1.ov <= 0 && p1.bad === 0 && p1.small.length === 0 && p1.navOverlap <= 0,
      JSON.stringify(p1),
    )
    if (width === 390 || width === 320) {
      await h.ev(`${SECTION}.scrollIntoView({block:'start'})`)
      await h.sleep(450)
      await h.shot(`p01-revealed-${width}.png`)
    }
  }
  // 320px에서 글자 200% 확대(루트 글자 크기를 두 배로)
  await h.vp(320, 844)
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, FORM, 80)
  await h.ev(`document.documentElement.style.fontSize='200%'`)
  await h.sleep(300)
  const big = await h.ev(probe('main'))
  check(
    h,
    'G3. 320px·글자 200%: P05 가로 스크롤·잘림·하단 탭 겹침 없음',
    big.ov <= 0 && big.bad === 0 && big.navOverlap <= 0,
    JSON.stringify(big),
  )
  await h.sleep(450)
  await h.shot('p05-320-text200.png')
  await h.ev(`document.documentElement.style.fontSize=''`)
  // 키보드: 입력 → 보기 토글 → 확인 → 취소 순서, Enter로 제출
  await h.vp(390, 844)
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, FORM, 80)
  await h.ev(`document.querySelector('[name=pinVerify]').focus()`)
  const order = []
  for (let i = 0; i < 3; i += 1) {
    await h.press('Tab', 'Tab', 9)
    order.push(
      await h.ev(
        `(()=>{const a=document.activeElement;return (a?.getAttribute('aria-label')||a?.innerText||a?.tagName||'').trim().slice(0,20)})()`,
      ),
    )
  }
  check(
    h,
    'G4. 키보드 포커스 순서: 입력 → 보기 토글 → 확인 → 취소',
    /보기/.test(order[0]) && /^확인$/.test(order[1]) && /^취소$/.test(order[2]),
    JSON.stringify(order),
  )
  await h.setVal('[name=pinVerify]', '000000')
  await h.ev(`document.querySelector('[name=pinVerify]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await waitAlert(h, '일치하지 않아요')
  check(h, 'G5. 입력 칸에서 Enter로 제출하면 확인이 실행된다', true)
  await h.ev(`document.querySelector('form [aria-pressed]').click()`)
  check(
    h,
    'G6. 보기 토글은 aria-pressed로 상태를 알리고 입력 칸 형식을 바꾼다',
    (await h.ev(
      `document.querySelector('form [aria-pressed]').getAttribute('aria-pressed')`,
    )) === 'true' &&
      (await h.ev(`document.querySelector('[name=pinVerify]').type`)) ===
        'text',
  )
})

await scenario('H-unavailable-and-failures', async (h) => {
  await h.login('free')
  await seedMember(h)
  // 서버 연결 전과 같은 상태(운영 빌드를 흉내): 신체 정보 조회 수단이 없다.
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','body')`,
  )
  await openMyPage(h)
  // 신체 정보 조회가 끝나 "연결 전"이 확정될 때까지 기다린다(조회 중에는 연결 전으로 단정하지 않는다).
  await mustUntil(h, `/연결 전/.test(${SECTION}?.innerText ?? '')`, 100)
  const t = await sectionText(h)
  check(
    h,
    'H1. P01: 연결 전이면 링크 없이 "연결 전"으로만 보이고 수치가 없다',
    /2차 비밀번호로 신체 정보 보기/.test(t) &&
      /연결 전/.test(t) &&
      !(await h.ev(
        `!!${SECTION}.querySelector('a[href="/mypage/body/unlock"]')`,
      )) &&
      (await masked(h)),
    t,
  )
  // PIN 서비스 연결 전
  await h.ev(
    `localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable');localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exerciseGoal')`,
  )
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 80)
  await mustUntil(
    h,
    `/서비스 연결을 준비하고 있어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  check(
    h,
    'H2. P05: PIN 서비스 연결 전이면 지정 안내만 보이고 입력·확인이 비활성이며 성공 표현이 없다',
    (await h.has('신체 정보 확인 기능은 서비스 연결을 준비하고 있어요')) &&
      (await h.ev(`document.querySelector('[name=pinVerify]').disabled`)) &&
      (await h.ev(
        `document.querySelector('form[data-pin-verify] button[type=submit]').disabled`,
      )) &&
      !(await h.has('열람 중')),
  )
  // 조회 실패: 미등록으로 보지 않는다.
  await h.ev(
    `localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable');localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exerciseGoal')`,
  )
  await h.go('/mypage/body/unlock', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 80)
  await mustUntil(
    h,
    `/확인하지 못했어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  check(
    h,
    'H3. P05: 등록 여부 조회 실패는 오류와 다시 시도이며 미등록 안내가 아니다',
    (await h.has('다시 확인하기')) &&
      !(await h.has('먼저 2차 비밀번호를 등록해 주세요')),
  )
  await h.ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
  await mustClick(h, '^다시 확인하기')
  await mustUntil(h, FORM, 80)
  check(h, 'H4. 다시 확인하면 폼이 열린다', true)
  // 수치 조회 실패: 열람 권한을 닫고 안내한다.
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','body')`,
  )
  await submitPin(h, PIN)
  await waitPath(h, '^/mypage$')
  await mustUntil(
    h,
    `/불러오지 못해 가려 두었어요/.test(${SECTION}?.innerText ?? '')`,
    120,
  )
  check(
    h,
    'H5. 수치를 불러오지 못하면 가린 채 안내한다(값을 지어내지 않는다)',
    await masked(h),
  )
})
