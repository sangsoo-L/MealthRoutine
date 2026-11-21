// [chrome 회귀] E01 조건 수정 바텀시트
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E01 조건 수정 바텀시트 회귀 (개발 서버 5199)
import { launch } from '../lib/cdp.mjs'
const t = await launch('out-sheet-' + Date.now(), 9423, 'http://localhost:5199')
const { ev, vp, go, sleep, check, cdp } = t
const q = encodeURIComponent
const EXP = (qq, diff) =>
  ev(
    `(async()=>{const m=await import('/src/exercise/seed/seedData.ts');const n=(s)=>s.replace(/\s+/g,'').toLowerCase();return m.getSeedCatalog().getAllExercises().filter(e=>n(e.name).includes(n(${JSON.stringify(qq)}))&&(!${JSON.stringify(diff)}||e.difficulty===${JSON.stringify(diff)})).map(e=>e.id).sort().join()})()`,
  )
await vp(390, 844)
const names = () =>
  ev(
    `[...document.querySelectorAll('main a[href^="/exercises/"]')].map(a=>a.getAttribute('href').split('/').pop()).sort().join()`,
  )
await go(`/exercises?q=${q('덤벨')}&view=results`, 1500)
for (
  let i = 0;
  i < 25 && (await names()).split(',').filter(Boolean).length < 3;
  i++
)
  await sleep(200)
check(
  'E01 결과(덤벨: 시드에서 계산한 전체)',
  (await names()) === (await EXP('덤벨', null)),
  await names(),
)
await ev(
  `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('조건 수정')).click()`,
)
await sleep(700)
const open = await ev(
  `(()=>{const d=document.querySelector('[role=dialog]');return d?{label:d.getAttribute('aria-label')||d.querySelector('h2')?.innerText,modal:d.getAttribute('aria-modal'),btn:[...d.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean)}:null})()`,
)
check(
  '조건 수정 → 바텀시트(dialog) 열림, "이 조건으로 재검색" 버튼 존재',
  open && open.btn.some((b) => b.includes('재검색')),
  JSON.stringify(open),
)
// Esc로 닫으면 주소·결과 불변
await cdp('Input.dispatchKeyEvent', {
  type: 'rawKeyDown',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
})
await cdp('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Escape',
  code: 'Escape',
  windowsVirtualKeyCode: 27,
})
await sleep(700)
check(
  'Esc로 닫으면 시트가 닫히고 결과·주소 유지',
  !(await ev(`!!document.querySelector('[role=dialog]')`)) &&
    (await ev(`location.search`)).includes('view=results') &&
    (await names()) === (await EXP('덤벨', null)),
)
// 시트 안에서 난이도 바꿔 재검색
await ev(
  `[...document.querySelectorAll('main button')].find(b=>b.innerText.includes('조건 수정')).click()`,
)
await sleep(700)
const dlgButtons = await ev(
  `[...document.querySelectorAll('[role=dialog] button')].map(b=>b.innerText.replace(/\\s+/g,' ').trim())`,
)
console.log('  시트 버튼:', JSON.stringify(dlgButtons))
await ev(
  `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.trim()==='중급').click()`,
)
await sleep(500)
await ev(
  `[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.includes('재검색')).click()`,
)
await sleep(1800)
const url = await ev(`location.pathname+location.search`)
check(
  '난이도 중급 선택 후 재검색 → 주소 갱신, 덤벨 중급(시드에서 계산)',
  url.includes(q('중급')) && (await names()) === (await EXP('덤벨', '중급')),
  url + ' ' + (await names()),
)
check('시트가 닫힘', !(await ev(`!!document.querySelector('[role=dialog]')`)))
console.log('console problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length} PASS ${t.res.length - f.length} FAIL ${f.length}`,
)
t.close()
process.exit(0)
