// [chrome 회귀] E02 오류 상태 포커스
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 리뷰 반영 검증: 다시 시도 후 포커스 유지, ol role=list
import { launch } from '../lib/cdp.mjs'
const t = await launch('out-focus-' + Date.now(), 9425, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
await vp(390, 844)
const press = async (key, code, vk) => {
  await cdp('Input.dispatchKeyEvent', {
    type: 'rawKeyDown',
    key,
    code,
    windowsVirtualKeyCode: vk,
  })
  if (key === 'Enter')
    await cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: '\r',
      key,
      code,
      windowsVirtualKeyCode: vk,
    })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: vk,
  })
  await sleep(150)
}
const active = () =>
  ev(
    `(()=>{const e=document.activeElement;return{tag:e.tagName,txt:(e.innerText||'').slice(0,20),isFrame:e.tabIndex===-1&&e.tagName==='DIV',outline:getComputedStyle(e).outlineStyle}})()`,
  )

await go('/exercises/5', 1000)
for (
  let i = 0;
  i < 20 && !(await ev(`!!document.querySelector('main ol')`));
  i++
)
  await sleep(200)
check(
  '정상 상세: 단계 목록 ol이 있으면 role="list"(시드 운동은 설명 문단이라 ol이 없을 수 있음)',
  await ev(
    `(()=>{const o=document.querySelector('main ol');return o===null||o.getAttribute('role')==='list'})()`,
  ),
)
check(
  '정상 상세 처음 진입 시 포커스를 가져가지 않음(body 유지)',
  (await active()).tag === 'BODY',
  JSON.stringify(await active()),
)

await ev(`localStorage.setItem('mealth,'+'x','')`).catch(() => {})
await ev(
  `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exercise')`,
)
await go('/exercises/5', 1200)
// 새 프로필의 첫 로드는 개발 서버가 모듈을 받느라 고정 대기보다 오래 걸릴 수 있다. 실패 화면(다시 시도 버튼)이 그려질 때까지 기다린 뒤 Tab을 누른다.
for (
  let i = 0;
  i < 50 &&
  !(await ev(
    `[...document.querySelectorAll('main button')].some(b=>b.innerText.trim()==='다시 시도')`,
  ));
  i++
)
  await sleep(200)
for (let i = 0; i < 6; i++) {
  await press('Tab', 'Tab', 9)
  if ((await active()).txt.startsWith('다시 시도')) break
}
check(
  '실패 화면에서 Tab으로 "다시 시도"에 포커스',
  (await active()).txt.startsWith('다시 시도'),
  JSON.stringify(await active()),
)
// 재시도가 계속 실패: 포커스는 body로 빠지지 않고 틀에 남는다
await press('Enter', 'Enter', 13)
await sleep(1200)
let a = await active()
check(
  '다시 시도(여전히 실패) 후 포커스가 body로 빠지지 않고 화면 틀에 유지',
  a.tag === 'DIV' && a.isFrame,
  JSON.stringify(a),
)
check(
  '  포커스 틀에 눈에 띄는 윤곽선 없음(상태 안내가 대신 읽힘), 오류 안내(role=alert)는 그대로',
  a.outline === 'none' &&
    (await ev(`!!document.querySelector('main [role=alert]')`)),
)
// 재시도가 성공하는 경우
await ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
await press('Tab', 'Tab', 9)
const b = await active()
check(
  'Tab으로 다시 "다시 시도"에 도달',
  b.txt.startsWith('다시 시도'),
  JSON.stringify(b),
)
await press('Enter', 'Enter', 13)
await sleep(1300)
a = await active()
check(
  '재시도 성공 후 상세가 표시되고 포커스는 body가 아닌 화면 틀에 유지',
  (await ev(`document.querySelector('main h1')?.textContent`)) === '푸시업' &&
    a.isFrame,
  JSON.stringify(a),
)
await press('Tab', 'Tab', 9)
check(
  '이어서 Tab 하면 화면 안(이전/버튼)으로 이동',
  ['A', 'BUTTON'].includes((await active()).tag),
  JSON.stringify(await active()),
)
console.log('console problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length} PASS ${t.res.length - f.length} FAIL ${f.length}`,
)
t.close()
process.exit(0)
