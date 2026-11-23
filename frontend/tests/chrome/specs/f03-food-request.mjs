// [chrome 회귀] F03 음식 등록 요청 · P04 내 요청 내역: F01·P09 연결과 복귀 · 입력 검증·첨부 검증 · 연결 전 안내(접수 아님) · 비회원 · 직접 접근 · 320~390px
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only f03-food-request`. 상세: tests/chrome/README.md
// 서버 연결이 없어 "요청 접수"와 요청 내역(요청 있음)은 나오지 않는다. 그 상태의 화면은 Node 테스트가 주입한 값으로 확인한다. 아무것도 저장하지 않는다.
import { start } from '../lib/session.mjs'
import { mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const FORM = `!!document.querySelector('[data-request-form]')`
const HAS_BACK = `[...document.querySelectorAll('main a')].some(a=>/^이전/.test(a.innerText.trim()))`

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

const backHref = (h) =>
  h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
  )
const nameInput = `document.querySelector('input[name=foodName]')`
const submit = (h) => h.ev(`document.querySelector('form').requestSubmit()`)
const alertText = (h) =>
  h.ev(
    `[...document.querySelectorAll('main [role=alert]')].map(a=>a.innerText.trim()).join(' ')`,
  )
/** 파일 입력에 가짜 파일을 넣고 change를 낸다(크기만 만든 Blob이라 실제 이미지가 아니다). */
const attach = (h, name, type, bytes) =>
  h.ev(`(()=>{const i=document.querySelector('input[type=file]');const dt=new DataTransfer();
    dt.items.add(new File([new Uint8Array(${bytes})],${JSON.stringify(name)},{type:${JSON.stringify(type)}}));
    i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}))})()`)

await scenario('A-guest', async (h) => {
  for (const path of ['/foods/request', '/mypage/requests']) {
    await h.go(path, 300)
    await mustUntil(
      h,
      `/로그인 후 이용할 수 있어요/.test(document.body.innerText)`,
      60,
    )
    check(
      h,
      `A1. 비회원이 ${path}를 열면 로그인 안내만 보인다`,
      !(await h.ev(
        `!!document.querySelector('[data-request-form],[data-request-list]')`,
      )),
    )
  }
  // 정적 경로가 동적 /foods/:foodId에 먹히지 않는다(F02는 비회원도 열람)
  await h.go('/foods/abc-없는-음식', 300)
  await mustUntil(h, `!!document.querySelector('main')`, 40)
  check(
    h,
    'A2. /foods/<id>는 여전히 F02(음식 상세)다',
    !(await h.ev(`!!document.querySelector('[data-request-form]')`)),
  )
})

await scenario('B-f01-to-f03', async (h) => {
  await h.login('free')
  await h.go('/foods?q=zzzz없는음식zzzz&view=results', 400)
  await mustUntil(h, `!!document.querySelector('[data-food-request-link]')`, 80)
  check(
    h,
    'B1. F01 결과 없음에 등록 요청 링크가 있고 "준비 중" 문구는 없다',
    !/등록 요청은 준비 중/.test(await h.text()),
  )
  await h.ev(`document.querySelector('[data-food-request-link]').click()`)
  await waitPath(h, '^/foods/request$')
  await mustUntil(h, FORM, 80)
  check(
    h,
    'B2. F03 제목·직접 입력 링크·h1 1개',
    /찾는 음식이 없었나요/.test(await h.text()) &&
      (await h.ev(`document.querySelectorAll('main h1').length`)) === 1,
  )
  check(
    h,
    'B3. 문서 제목',
    /음식 등록 요청 · 밀스루틴/.test(await h.ev(`document.title`)),
  )
  await mustUntil(h, HAS_BACK, 60)
  check(
    h,
    'B4. 이전은 음식 검색(F01)',
    (await backHref(h)) === '/foods',
    String(await backHref(h)),
  )
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim())).click()`,
  )
  await waitPath(h, '^/foods$')
  check(h, 'B5. F03 → F01 복귀', true)
  await h.go('/foods/request', 300)
  await mustUntil(h, HAS_BACK, 80)
  check(
    h,
    'B6. 직접 접근한 F03: 이전은 기본 상위(F01)',
    (await backHref(h)) === '/foods',
  )
  await h.ev(`document.querySelector('[data-request-manual]').click()`)
  await waitPath(h, '^/records/meal/record$')
  check(h, 'B7. 직접 입력으로 기록 → D02', true)
})

await scenario('C-validation', async (h) => {
  await h.login('free')
  await h.go('/foods/request', 300)
  await mustUntil(h, FORM, 80)
  await submit(h)
  await mustUntil(
    h,
    `document.querySelector('[role=alert]').innerText.trim()!==''`,
    40,
  )
  check(
    h,
    'C1. 빈 음식 이름: 오류 안내',
    /음식 이름을 입력해 주세요/.test(await alertText(h)),
  )
  check(
    h,
    'C2. 오류가 입력에 연결되고 포커스가 입력으로 간다',
    await h.ev(
      `(()=>{const i=${nameInput};const id=i.getAttribute('aria-describedby');return i.getAttribute('aria-invalid')==='true'&&!!document.getElementById(id)&&document.activeElement===i})()`,
    ),
  )
  check(
    h,
    'C3. 요청은 나가지 않았다(안내 없음)',
    !(await h.ev(`!!document.querySelector('[data-request-state]')`)),
  )
  await h.setVal('input[name=foodName]', '   ')
  await submit(h)
  await mustUntil(
    h,
    `document.querySelector('[role=alert]').innerText.trim()!==''`,
    40,
  )
  check(
    h,
    'C4. 공백만 입력해도 오류',
    /음식 이름을 입력해 주세요/.test(await alertText(h)),
  )
  // 첨부 검증
  await attach(h, 'doc.pdf', 'application/pdf', 10)
  await mustUntil(
    h,
    `!!document.querySelector('[data-request-attachment-error]')`,
    40,
  )
  check(
    h,
    'C5. 이미지가 아닌 파일: 오류와 텍스트만 제출 안내, 첨부되지 않음',
    /이미지 파일만/.test(await h.text()) &&
      /텍스트만 요청해도/.test(await h.text()) &&
      !(await h.ev(
        `!!document.querySelector('[data-request-attachment-name]')`,
      )) &&
      (await h.ev(
        `document.querySelector('input[type=file]').files.length`,
      )) === 0,
  )
  await attach(h, 'big.png', 'image/png', 10 * 1024 * 1024 + 1)
  await mustUntil(h, `/10MB 이하만/.test(document.body.innerText)`, 40)
  check(h, 'C6. 10MB 초과: 오류', true)
  await attach(h, 'ok.png', 'image/png', 1000)
  await mustUntil(
    h,
    `!!document.querySelector('[data-request-attachment-name]')`,
    40,
  )
  check(
    h,
    'C7. 정상 이미지: 첨부 표시, 이전 첨부 오류 사라짐',
    /첨부: ok\.png/.test(await h.text()) &&
      !(await h.ev(
        `!!document.querySelector('[data-request-attachment-error]')`,
      )),
  )
})

await scenario('D-unavailable', async (h) => {
  await h.login('free')
  await h.go('/foods/request', 300)
  await mustUntil(h, FORM, 80)
  await h.setVal('input[name=foodName]', '현미 즉석밥')
  await h.setVal('input[name=brand]', '테스트 브랜드')
  await attach(h, 'ok.png', 'image/png', 1000)
  // 키보드: 이름 입력에서 Enter로 제출
  await h.ev(`${nameInput}.focus()`)
  await h.press('Enter', 'Enter', 13)
  await mustUntil(
    h,
    `!!document.querySelector('[data-request-state=unavailable]')`,
    60,
  )
  const t = await h.text()
  check(
    h,
    'D1. 연결 전: 접수되지 않았다고 알린다',
    /접수되지 않았고 저장되지도 않았어요/.test(t),
  )
  check(
    h,
    'D2. 접수·완료처럼 보이는 문구와 접수 번호가 없다',
    !/접수되었어요|접수 번호|요청이 완료/.test(t) &&
      !(await h.ev(`!!document.querySelector('[data-request-state=done]')`)),
  )
  check(
    h,
    'D3. 입력(이름·브랜드·첨부)이 유지되고 안내로 포커스가 이동한다',
    (await h.ev(`${nameInput}.value`)) === '현미 즉석밥' &&
      (await h.ev(`document.querySelector('input[name=brand]').value`)) ===
        '테스트 브랜드' &&
      /첨부: ok\.png/.test(t) &&
      (await h.ev(
        `document.activeElement?.getAttribute('data-request-state')`,
      )) === 'unavailable',
  )
  check(
    h,
    'D4. 다시 제출할 수 있다(버튼이 막히지 않음)',
    (await h.ev(
      `document.querySelector('form button[type=submit]').getAttribute('aria-disabled')`,
    )) === null,
  )
  await h.setVal('input[name=foodName]', '현미 즉석밥 2')
  check(
    h,
    'D5. 입력을 고치면 이전 안내가 사라진다',
    !(await h.ev(`!!document.querySelector('[data-request-state]')`)),
  )
  const stored = await h.ev(
    `[Object.keys(localStorage).length, Object.keys(sessionStorage).filter(k=>/request/i.test(k)).length]`,
  )
  check(
    h,
    'D6. 입력을 저장소에 쓰지 않는다',
    stored[1] === 0,
    JSON.stringify(stored),
  )
  await h.ev(`location.reload()`)
  await h.sleep(1000)
  await mustUntil(h, FORM, 80)
  check(
    h,
    'D7. 새로고침하면 입력은 비워진다(저장하지 않음)',
    (await h.ev(`${nameInput}.value`)) === '',
  )
})

await scenario('E-p04', async (h) => {
  await h.login('free')
  await h.go('/mypage/requests', 300)
  await mustUntil(
    h,
    `!!document.querySelector('[data-request-list=unavailable]')`,
    80,
  )
  const t = await h.text()
  check(
    h,
    'E1. P04: 서버 연결 전 안내(요청 없음이라고 하지 않는다)',
    (await h.ev(
      `document.querySelector('[data-request-list]').getAttribute('data-request-list')`,
    )) === 'unavailable' &&
      /아직 볼 수 없어요/.test(t) &&
      /요청이 없다는 뜻이 아니에요/.test(t) &&
      !/아직 요청한 음식이 없어요/.test(t),
  )
  check(
    h,
    'E2. 요청 내역 예시 데이터가 없다',
    !(await h.ev(`!!document.querySelector('[data-request-item]')`)) &&
      !/FOOD-EX|시안/.test(t),
  )
  await h.ev(`document.querySelector('[data-request-new]').click()`)
  await waitPath(h, '^/foods/request$')
  await mustUntil(h, FORM, 80)
  await h.ev(`document.querySelector('[data-request-history-link]').click()`)
  await waitPath(h, '^/mypage/requests$')
  check(h, 'E3. P04 ↔ F03 이동', true)
  // P09 → P04 → 이전은 설정
  await h.go('/settings', 300)
  await mustUntil(
    h,
    `!!document.querySelector('main a[href="/mypage/requests"]')`,
    80,
  )
  await h.ev(
    `document.querySelector('main a[href="/mypage/requests"]').click()`,
  )
  await waitPath(h, '^/mypage/requests$')
  await mustUntil(h, HAS_BACK, 60)
  check(
    h,
    'E4. P09에서 진입한 P04: 이전은 설정',
    (await backHref(h)) === '/settings',
    String(await backHref(h)),
  )
  await h.go('/home', 300)
  await h.go('/mypage/requests', 300)
  await mustUntil(h, HAS_BACK, 80)
  check(
    h,
    'E5. 직접 접근한 P04: 이전은 기본 상위(설정)',
    (await backHref(h)) === '/settings',
  )
  check(
    h,
    'E6. 문서 제목',
    /내 요청 내역 · 밀스루틴/.test(await h.ev(`document.title`)),
  )
})

await scenario('F-responsive', async (h) => {
  await h.login('free')
  for (const w of [390, 320, 195, 160]) {
    await h.vp(w, 844)
    const measure = () =>
      h.ev(`(()=>{const small=[...document.querySelectorAll('main a, main button, main summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.5}).map(e=>e.innerText.trim().slice(0,12));
        const inputs=[...document.querySelectorAll('main input[type=text], main textarea')].filter(e=>e.getBoundingClientRect().height<43.5).length;
        return {ov:document.documentElement.scrollWidth-window.innerWidth, small, inputs}})()`)
    await h.go('/foods/request', 300)
    await mustUntil(h, FORM, 80)
    await h.setVal('input[name=foodName]', '현미 즉석밥')
    await submit(h)
    await mustUntil(
      h,
      `!!document.querySelector('[data-request-state=unavailable]')`,
      60,
    )
    let p = await measure()
    check(
      h,
      `F1. ${w}px F03: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0 && p.inputs === 0,
      JSON.stringify(p),
    )
    await h.go('/mypage/requests', 300)
    await mustUntil(
      h,
      `!!document.querySelector('[data-request-list=unavailable]')`,
      80,
    )
    p = await measure()
    check(
      h,
      `F2. ${w}px P04: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
})
