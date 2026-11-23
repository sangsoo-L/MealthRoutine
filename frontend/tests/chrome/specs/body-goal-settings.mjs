// [chrome 회귀] P06 키·몸무게 입력 · P10 건강 목표 상세 설정:
//   비회원 차단 · P09·P01·P02에서 진입과 "이전" · P06 입력 검증·저장(개발용 저장소)·가려진 등록 상태(값 비노출)·키 다시 입력·몸무게 기록 안내·
//   P05 열람과의 일치 · 연결 전·조회 실패·저장 실패 · P10 설정·변경·취소(P01과 일치)·연결 전·조회 실패·저장 실패 · 390/320/195/160px·320px 글자 200%
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only body-goal-settings`. 상세: tests/chrome/README.md
// 개발 서버 전용 모의 계정과 개발용 저장소(브라우저 프로필 안)만 쓰고, 시나리오마다 새 Chrome 프로필로 시작한다. 쓰는 번호·수치는 테스트용이다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const NAV = 'nav[aria-label="밀스루틴 주요 메뉴"]'
const PIN = '135790'
const BODY_KEY = 'mealthroutine.dev.mock.body.free'
const SECTION = `document.querySelector('section[aria-labelledby=my-body-title]')`

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

const h1 = (h) =>
  h.ev(`document.querySelector('main h1')?.innerText.trim() ?? ''`)
const hrefOf = (h, re, scope = 'main') =>
  h.ev(
    `[...document.querySelectorAll(${q(scope)}+' a')].find(a=>new RegExp(${q(re)}).test(a.innerText.trim()))?.getAttribute('href') ?? null`,
  )
const text = (h) => h.ev(`document.querySelector('main').innerText`)
const flag = (h, name, value) =>
  h.ev(
    value === null
      ? `localStorage.removeItem('mealthroutine.dev.mock.flag.'+${q(name)})`
      : `localStorage.setItem('mealthroutine.dev.mock.flag.'+${q(name)}, ${q(value)})`,
  )
const stored = (h) =>
  h.ev(`JSON.parse(localStorage.getItem(${q(BODY_KEY)}) ?? 'null')`)
const setText = (h, sel, v) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();set.call(el,${q(v)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
// 칸을 벗어나는 동작(헤드리스는 blur()가 포커스 이벤트를 내지 않을 수 있어 focusout도 직접 보낸다).
const blur = (h, sel) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});el.blur();el.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:null}))})()`,
  )
const BODY_INPUTS = `document.querySelectorAll('main form input[inputmode=decimal]')`
const openBodyReady = (h) =>
  mustUntil(
    h,
    `!!document.querySelector('[data-body-status]') || !!document.querySelector('[data-body-state]:not([data-body-state=loading])')`,
    120,
  )
const openBody = async (h) => {
  await h.go('/settings/body', 300)
  await openBodyReady(h)
}
const openGoal = async (h) => {
  await h.go('/settings/health-goal', 300)
  await mustUntil(
    h,
    `!!document.querySelector('[data-goal-form]') || !!document.querySelector('[data-goal-state]:not([data-goal-state=loading])')`,
    120,
  )
}
const saveBody = (h) => h.click('^저장하기$', 'main form')
const alertTexts = (h) =>
  h.ev(
    `[...document.querySelectorAll('main form [role=alert]')].map(e=>e.innerText.trim())`,
  )
const seedPin = async (h) => {
  const id = await h.ev(
    `JSON.parse(sessionStorage.getItem('mealthroutine.dev.session')).accountId`,
  )
  await h.ev(
    `(async()=>{const src=await import('/src/exercise-goal/exerciseGoalSource.ts');await src.createExerciseGoalRepository(${q(id)}).registerPin(${q(PIN)},${q(PIN)})})()`,
  )
}

await scenario('A-guest-and-entries', async (h) => {
  for (const path of ['/settings/body', '/settings/health-goal']) {
    await h.go(path, 300)
    await mustUntil(h, `!!document.querySelector('main')`, 100)
    await h.sleep(300)
    check(
      h,
      `A1. 비회원이 ${path}로 들어오면 로그인 안내를 보고 입력·목표가 없다`,
      (await h.has('로그인')) &&
        !(await h.ev(
          `!!document.querySelector('main form, [data-goal-form], [data-body-status]')`,
        )),
    )
  }
  await h.login('free')
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'A2. P09: 키·몸무게 → /settings/body, 건강 목표 → /settings/health-goal이 링크다',
    (await hrefOf(h, '^키·몸무게')) === '/settings/body' &&
      (await hrefOf(h, '^건강 목표')) === '/settings/health-goal',
  )
  await mustClick(h, '^키·몸무게')
  await waitPath(h, '^/settings/body$')
  await openBodyReady(h)
  check(
    h,
    'A3. P06: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '키·몸무게 입력' &&
      /키·몸무게 입력/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '마이' &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  await mustClick(h, '^건강 목표')
  await waitPath(h, '^/settings/health-goal$')
  await mustUntil(h, `!!document.querySelector('[data-goal-form]')`, 120)
  check(
    h,
    'A4. P10: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '건강 목표 상세 설정' &&
      /건강 목표 상세 설정/.test(await h.ev(`document.title`)) &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings$')
  check(h, 'A5. 브라우저 뒤로 가기는 상세 설정으로 돌아온다', true)
})

await scenario('B-body-flow', async (h) => {
  await h.login('free')
  await openBody(h)
  check(
    h,
    'B1. 미등록: 키·몸무게 모두 미입력, 입력칸 2개, 값·마스킹 숫자 없음',
    (await h.ev(`document.querySelectorAll('[data-body-status]').length`)) ===
      2 &&
      (await text(h)).match(/미입력/g)?.length === 2 &&
      (await h.ev(`${BODY_INPUTS}.length`)) === 2 &&
      (await h.ev(`${BODY_INPUTS}[0].type`)) === 'text' &&
      (await h.ev(`${BODY_INPUTS}[0].getAttribute('inputmode')`)) === 'decimal',
  )
  // 필수·형식·범위 오류
  await saveBody(h)
  await mustUntil(
    h,
    `document.querySelectorAll('main form [role=alert]').length >= 2`,
    40,
  )
  check(
    h,
    'B2. 빈 값으로 저장하면 두 칸 모두 입력 안내가 뜨고 첫 칸에 포커스가 간다',
    (await alertTexts(h)).some((t) => /키를 입력해 주세요/.test(t)) &&
      (await alertTexts(h)).some((t) => /몸무게를 입력해 주세요/.test(t)) &&
      (await h.ev(`document.activeElement === ${BODY_INPUTS}[0]`)),
  )
  await setText(h, 'main form input[inputmode=decimal]', 'abc')
  await blur(h, 'main form input[inputmode=decimal]')
  check(
    h,
    'B3. 숫자가 아니면 형식 안내가 뜬다',
    (await alertTexts(h)).some((t) => /숫자로 입력해 주세요/.test(t)),
  )
  await setText(h, 'main form input[inputmode=decimal]', '301')
  check(
    h,
    'B4. 범위를 벗어나면 키 1~300cm 안내가 뜬다',
    (await alertTexts(h)).some((t) => /1~300cm 사이로/.test(t)),
  )
  await setText(h, 'main form input[inputmode=decimal]', '170.55')
  check(
    h,
    'B5. 소수점 둘째 자리는 형식 오류다',
    (await alertTexts(h)).some((t) => /소수점은 첫째 자리까지/.test(t)),
  )
  check(
    h,
    'B6. 아직 저장되지 않았고 저장 완료 안내도 없다',
    !(await stored(h)) &&
      !(await h.ev(`!!document.querySelector('[data-body-saved]')`)),
  )
  // 정상 저장
  await setText(h, 'main form input[inputmode=decimal]', '170.5')
  await h.ev(
    `(()=>{const el=${BODY_INPUTS}[1];const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();set.call(el,'65.5');el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
  await saveBody(h)
  await mustUntil(h, `!!document.querySelector('[data-body-saved]')`, 120)
  const after = await stored(h)
  check(
    h,
    'B7. 저장하면 개발용 저장소에 값이 저장되고 저장 완료 안내와 등록 상태가 보인다',
    after?.heightCm === 170.5 &&
      after?.weightKg === 65.5 &&
      (await text(h)).match(/등록됨/g)?.length >= 2,
  )
  const page = await text(h)
  check(
    h,
    'B8. 저장 뒤에도 화면에 입력한 수치가 보이지 않는다(가려진 등록 상태만)',
    !/170\.5|65\.5/.test(page) &&
      /\*\*\*/.test(page) &&
      (await h.ev(`${BODY_INPUTS}.length`)) === 0,
  )
  check(
    h,
    'B9. 키는 다시 입력할 수 있고 몸무게는 기록 이력(마이페이지)으로 안내한다',
    (await h.ev(`!!document.querySelector('[data-body-reenter=height]')`)) &&
      !(await h.ev(`!!document.querySelector('[data-body-reenter=weight]')`)) &&
      (await hrefOf(h, '^몸무게 기록하기')) === '/mypage#weight-log',
  )
  // 키 다시 입력
  await mustClick(h, '키 다시 입력', 'main form')
  await mustUntil(h, `${BODY_INPUTS}.length === 1`, 40)
  check(
    h,
    'B10. 다시 입력은 빈 입력칸을 연다(이전 값을 채우지 않는다)',
    (await h.ev(`${BODY_INPUTS}[0].value`)) === '',
  )
  await mustClick(h, '그대로 두기', 'main form')
  await mustUntil(h, `${BODY_INPUTS}.length === 0`, 40)
  check(
    h,
    'B11. 그대로 두기를 누르면 입력칸이 닫힌다',
    (await stored(h))?.heightCm === 170.5,
  )
  await mustClick(h, '키 다시 입력', 'main form')
  await mustUntil(h, `${BODY_INPUTS}.length === 1`, 40)
  await setText(h, 'main form input[inputmode=decimal]', '171')
  await saveBody(h)
  await mustUntil(h, `!!document.querySelector('[data-body-saved]')`, 120)
  const edited = await stored(h)
  check(
    h,
    'B12. 키를 다시 입력해 저장하면 키만 바뀌고 몸무게는 그대로다',
    edited?.heightCm === 171 && edited?.weightKg === 65.5,
  )
  // P05로 확인하면 P01에서 바뀐 값이 보인다.
  await seedPin(h)
  await mustClick(h, '2차 비밀번호로 신체 정보 보기')
  await waitPath(h, '^/mypage/body/unlock$')
  await mustUntil(h, `!!document.querySelector('form[data-pin-verify]')`, 100)
  check(
    h,
    'B13. P06의 열람 링크가 P05로 이동하고 이전·취소는 P06이다',
    (await hrefOf(h, '^이전')) === '/settings/body',
  )
  await setText(h, '[name=pinVerify]', PIN)
  await h.ev(`document.querySelector('form[data-pin-verify]').requestSubmit()`)
  await waitPath(h, '^/mypage$')
  await mustUntil(h, `/171cm/.test(${SECTION}?.innerText ?? '')`, 100)
  check(
    h,
    'B14. 2차 비밀번호로 열람하면 P01에 저장한 값(키 171cm·몸무게 65.5kg)이 보인다',
    /171cm/.test(await h.ev(`${SECTION}.innerText`)) &&
      /65\.5kg/.test(await h.ev(`${SECTION}.innerText`)),
  )
})

await scenario('C-body-states', async (h) => {
  await h.login('free')
  // 저장 실패: 입력을 유지하고 성공을 표시하지 않는다.
  await openBody(h)
  await setText(h, 'main form input[inputmode=decimal]', '170')
  await h.ev(
    `(()=>{const el=${BODY_INPUTS}[1];const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();set.call(el,'60');el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
  await flag(h, 'failSave', 'body')
  await saveBody(h)
  await mustUntil(
    h,
    `/저장하지 못했어요/.test(document.querySelector('main').innerText)`,
    120,
  )
  check(
    h,
    'C1. 저장 실패: 안내가 뜨고 입력은 유지되며 저장 완료 안내가 없고 저장소도 바뀌지 않는다',
    (await h.ev(`${BODY_INPUTS}[0].value`)) === '170' &&
      !(await h.ev(`!!document.querySelector('[data-body-saved]')`)) &&
      !(await stored(h)),
  )
  await flag(h, 'failSave', null)
  // 조회 실패
  await flag(h, 'failLoad', 'body')
  await openBody(h)
  check(
    h,
    'C2. 조회 실패: 오류와 다시 시도이며 폼·미입력 표시가 없다',
    (await h.has('신체 정보를 불러오지 못했어요')) &&
      (await h.ev(`!!document.querySelector('[data-body-retry]')`)) &&
      !(await h.ev(
        `!!document.querySelector('main form, [data-body-status]')`,
      )),
  )
  await flag(h, 'failLoad', null)
  await mustClick(h, '^다시 시도')
  await openBodyReady(h)
  check(
    h,
    'C3. 다시 시도하면 불러온다',
    await h.ev(`!!document.querySelector('[data-body-status]')`),
  )
  // 연결 전
  await flag(h, 'unavailable', 'body')
  await openBody(h)
  check(
    h,
    'C4. 연결 전: 안내만 보이고 폼·저장 버튼·성공 표현이 없다(돌아가기만 있다)',
    (await h.has('신체 정보 입력 기능은 서비스 연결을 준비하고 있어요')) &&
      !(await h.ev(
        `!!document.querySelector('main form, [data-body-status]')`,
      )) &&
      !(await h.has('저장하기|저장했어요')) &&
      (await h.ev(`!!document.querySelector('[data-body-back]')`)),
  )
  await mustClick(h, '^돌아가기$')
  await waitPath(h, '^/settings$')
  check(h, 'C5. 연결 전에서 돌아가기는 상세 설정으로 이동한다', true)
  // P01: 연결 전에는 P06 링크가 없다.
  await h.go('/mypage', 300)
  await mustUntil(h, `!!${SECTION}`, 120)
  await h.sleep(500)
  check(
    h,
    'C6. P01: 연결 전에는 "키·몸무게 입력·수정" 링크를 두지 않는다',
    !(await h.ev(`!!${SECTION}.querySelector('a[href="/settings/body"]')`)),
  )
})

await scenario('D-goal-flow', async (h) => {
  await h.login('free')
  await openGoal(h)
  check(
    h,
    'D1. 목표 없음: 빈 안내와 간편 선택 세 가지·저장·취소, 현재 목표 값은 없다',
    (await h.has('아직 설정한 건강 목표가 없어요')) &&
      (await h.ev(
        `document.querySelectorAll('[data-goal-form] input[type=radio]').length`,
      )) === 3 &&
      !(await h.ev(`!!document.querySelector('[data-goal-current]')`)) &&
      (await h.ev(
        `!!document.querySelector('[data-goal-form] button[disabled]')`,
      )) === false,
  )
  check(
    h,
    'D2. 관련 링크: 운동 목표·식단 목표·알레르기·프로필',
    (await h.ev(
      `document.querySelector('[data-goal-link=exercise]').getAttribute('href')`,
    )) === '/records/exercise/goal' &&
      (await h.ev(
        `document.querySelector('[data-goal-link=meal]').getAttribute('href')`,
      )) === '/records/meal/goal' &&
      (await h.ev(
        `document.querySelector('[data-goal-link=profile]').getAttribute('href')`,
      )) === '/settings/profile',
  )
  // 식단 중심(30:70) 선택·저장
  await h.ev(
    `document.querySelector('[data-goal-form] input[type=radio][value="30"]').click()`,
  )
  await h.click('^저장하기$', '[data-goal-form]')
  await mustUntil(h, `!!document.querySelector('[data-goal-saved]')`, 120)
  check(
    h,
    'D3. 식단 중심을 저장하면 저장 완료 안내와 현재 목표(식단 중심 · 운동 30% · 식단 70%)가 보인다',
    /건강 목표를 저장했어요/.test(await text(h)) &&
      /식단 중심[\s\S]*운동 30% · 식단 70%/.test(
        await h.ev(`document.querySelector('[data-goal-current]').innerText`),
      ) &&
      (
        await h.ev(
          `document.querySelector('[data-goal-form]').previousElementSibling?.innerText ?? document.querySelector('#goal-form-title').innerText`,
        )
      ).includes('변경'),
  )
  await h.go('/mypage', 300)
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-goal-title]')`,
    120,
  )
  await mustUntil(
    h,
    `/식단 중심/.test(document.querySelector('section[aria-labelledby=my-goal-title]').innerText)`,
    80,
  )
  check(
    h,
    'D4. P01의 건강 목표가 P10에서 저장한 값과 같다',
    /운동 30% · 식단 70%/.test(
      await h.ev(
        `document.querySelector('section[aria-labelledby=my-goal-title]').innerText`,
      ),
    ),
  )
  // 취소: 선택만 바꾸고 취소하면 목표는 그대로
  await mustClick(
    h,
    '건강 목표 상세 설정',
    'section[aria-labelledby=my-goal-title]',
  )
  await waitPath(h, '^/settings/health-goal$')
  await mustUntil(h, `!!document.querySelector('[data-goal-form]')`, 120)
  check(
    h,
    'D5. P01에서 온 P10: 이전이 마이페이지이고 현재 목표에서 시작한다',
    (await hrefOf(h, '^이전')) === '/mypage' &&
      (await h.ev(
        `document.querySelector('[data-goal-form] input[type=radio]:checked').value`,
      )) === '30',
  )
  await h.ev(
    `document.querySelector('[data-goal-form] input[type=radio][value="70"]').click()`,
  )
  await mustClick(h, '^취소$', '[data-goal-form]')
  await waitPath(h, '^/mypage$')
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-goal-title]')`,
    120,
  )
  // 목표 조회가 끝나 현재 목표가 보일 때까지 기다린다(조회 중에는 목표를 읽을 수 없다).
  await mustUntil(
    h,
    `/식단 중심/.test(document.querySelector('section[aria-labelledby=my-goal-title]').innerText)`,
    80,
  )
  check(
    h,
    'D6. 취소하면 저장하지 않고 이전 화면으로 돌아가며 목표는 그대로다',
    /운동 30% · 식단 70%/.test(
      await h.ev(
        `document.querySelector('section[aria-labelledby=my-goal-title]').innerText`,
      ),
    ),
  )
  // 변경(균형 관리 50:50)
  await openGoal(h)
  await h.ev(
    `document.querySelector('[data-goal-form] input[type=radio][value="50"]').click()`,
  )
  await h.click('^저장하기$', '[data-goal-form]')
  await mustUntil(
    h,
    `/균형 관리/.test(document.querySelector('[data-goal-current]')?.innerText ?? '')`,
    120,
  )
  check(
    h,
    'D7. 변경하면 현재 목표가 균형 관리(운동 50% · 식단 50%)로 바뀐다',
    /운동 50% · 식단 50%/.test(
      await h.ev(`document.querySelector('[data-goal-current]').innerText`),
    ),
  )
})

await scenario('E-goal-states', async (h) => {
  await h.login('free')
  await flag(h, 'failSave', 'goal')
  await openGoal(h)
  await h.ev(
    `document.querySelector('[data-goal-form] input[type=radio][value="70"]').click()`,
  )
  await h.click('^저장하기$', '[data-goal-form]')
  await mustUntil(
    h,
    `/저장하지 못했어요/.test(document.querySelector('main').innerText)`,
    120,
  )
  check(
    h,
    'E1. 저장 실패: 안내가 뜨고 선택이 유지되며 저장 완료 안내·현재 목표가 생기지 않는다',
    (await h.ev(
      `document.querySelector('[data-goal-form] input[type=radio]:checked').value`,
    )) === '70' &&
      !(await h.ev(
        `!!document.querySelector('[data-goal-saved], [data-goal-current]')`,
      )),
  )
  await flag(h, 'failSave', null)
  await flag(h, 'failLoad', 'goal')
  await openGoal(h)
  check(
    h,
    'E2. 조회 실패: 오류와 다시 시도이며 폼·목표 없음 표시가 없다',
    (await h.has('건강 목표를 불러오지 못했어요')) &&
      (await h.ev(`!!document.querySelector('[data-goal-retry]')`)) &&
      !(await h.ev(`!!document.querySelector('[data-goal-form]')`)) &&
      !(await h.has('아직 설정한 건강 목표가 없어요')),
  )
  await flag(h, 'failLoad', null)
  await mustClick(h, '^다시 시도')
  await mustUntil(h, `!!document.querySelector('[data-goal-form]')`, 120)
  check(h, 'E3. 다시 시도하면 불러온다', true)
  await flag(h, 'unavailable', 'goal')
  await openGoal(h)
  check(
    h,
    'E4. 연결 전: 안내만 보이고 폼·저장 버튼·성공 표현이 없다',
    (await h.has('건강 목표 기능은 서비스 연결을 준비하고 있어요')) &&
      !(await h.ev(`!!document.querySelector('[data-goal-form]')`)) &&
      !(await h.has('저장하기|저장했어요|아직 설정한 건강 목표가 없어요')),
  )
  await h.go('/mypage', 300)
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-goal-title]')`,
    120,
  )
  await h.sleep(500)
  check(
    h,
    'E5. P01: 연결 전에는 건강 목표 상세 설정 링크를 두지 않는다',
    !(await h.ev(`!!document.querySelector('[data-goal-detail-link]')`)),
  )
})

await scenario('F-profile-links', async (h) => {
  await h.login('free')
  await h.go('/mypage', 300)
  await mustUntil(h, `!!document.querySelector('[data-profile-link]')`, 120)
  check(
    h,
    'F1. P01: 프로필 머리글은 P02 링크이고 설정 버튼(P09)은 그대로다',
    (await h.ev(
      `document.querySelector('[data-profile-link]').getAttribute('href')`,
    )) === '/settings/profile' &&
      (await h.ev(
        `document.querySelector('a[aria-label="상세 설정"]').getAttribute('href')`,
      )) === '/settings',
  )
  await h.ev(`document.querySelector('[data-profile-link]').click()`)
  await waitPath(h, '^/settings/profile$')
  await mustUntil(h, `!!document.querySelector('form[data-profile-form]')`, 120)
  check(
    h,
    'F2. P01 → P02: 이전이 마이페이지로 돌아간다',
    (await hrefOf(h, '^이전')) === '/mypage',
  )
  check(
    h,
    'F3. P02에서 건강 목표(P10)·키·몸무게(P06)로 갈 수 있다',
    (await h.ev(
      `document.querySelector('[data-profile-link=goal]').getAttribute('href')`,
    )) === '/settings/health-goal' &&
      (await h.ev(
        `document.querySelector('[data-profile-link=body]').getAttribute('href')`,
      )) === '/settings/body',
  )
  await h.ev(`document.querySelector('[data-profile-link=body]').click()`)
  await waitPath(h, '^/settings/body$')
  await openBodyReady(h)
  check(
    h,
    'F4. P02 → P06: 이전이 프로필(P02)로 돌아간다',
    (await hrefOf(h, '^이전')) === '/settings/profile',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings/profile$')
  await h.go('/mypage', 300)
  await mustUntil(h, `!!${SECTION}`, 120)
  await mustUntil(h, `!!${SECTION}.querySelector('[data-body-edit-link]')`, 80)
  await h.ev(`${SECTION}.querySelector('[data-body-edit-link]').click()`)
  await waitPath(h, '^/settings/body$')
  await openBodyReady(h)
  check(
    h,
    'F5. P01 → P06: 이전이 마이페이지로 돌아간다',
    (await hrefOf(h, '^이전')) === '/mypage',
  )
  await h.click('^이전')
  await waitPath(h, '^/mypage$')
  check(h, 'F6. 이전을 누르면 마이페이지로 돌아온다', true)
})

await scenario('G-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll('main a, main button, main input, main summary')].filter(e=>!e.classList.contains('sr-only'));
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(e=>(e.innerText||e.name||e.tagName).trim().slice(0,14));
    const cards=[...document.querySelectorAll('main fieldset label')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5||r.height<43.5)}).length;
    window.scrollTo(0,document.documentElement.scrollHeight);
    const nav=document.querySelector(${q(NAV)});
    const navTop=nav?nav.getBoundingClientRect().top:Infinity;
    const last=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height>0).reduce((m,e)=>Math.max(m,e.getBoundingClientRect().bottom),0);
    return {ov:document.documentElement.scrollWidth-W,bad,small,cards,navOverlap:Math.round(last-navTop)}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await openBody(h)
    await saveBody(h)
    await mustUntil(
      h,
      `document.querySelectorAll('main form [role=alert]').length >= 2`,
      40,
    )
    const p06 = await h.ev(probe)
    check(
      h,
      `G1. ${width}px P06(오류 표시): 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      p06.ov <= 0 &&
        p06.bad === 0 &&
        p06.small.length === 0 &&
        p06.navOverlap <= 0,
      JSON.stringify(p06),
    )
    if (width === 390 || width === 320) {
      await h.ev(`window.scrollTo(0,0)`)
      await h.sleep(450)
      await h.shot(`p06-${width}.png`)
    }
    await openGoal(h)
    const p10 = await h.ev(probe)
    check(
      h,
      `G2. ${width}px P10: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      p10.ov <= 0 &&
        p10.bad === 0 &&
        p10.small.length === 0 &&
        p10.cards === 0 &&
        p10.navOverlap <= 0,
      JSON.stringify(p10),
    )
    if (width === 390 || width === 320) {
      await h.ev(`window.scrollTo(0,0)`)
      await h.sleep(450)
      await h.shot(`p10-${width}.png`)
    }
  }
  await h.vp(320, 844)
  for (const [open, file] of [
    [openBody, 'p06-320-text200.png'],
    [openGoal, 'p10-320-text200.png'],
  ]) {
    await open(h)
    await h.ev(`document.documentElement.style.fontSize='200%'`)
    await h.sleep(500)
    const big = await h.ev(probe)
    check(
      h,
      `G3. 320px·글자 200% ${file.slice(0, 3)}: 가로 스크롤·잘림·하단 탭 겹침 없음`,
      big.ov <= 0 && big.bad === 0 && big.navOverlap <= 0,
      JSON.stringify(big),
    )
    await h.ev(`window.scrollTo(0,0)`)
    await h.sleep(300)
    await h.shot(file)
    await h.ev(`document.documentElement.style.fontSize=''`)
  }
})
