// [chrome 회귀] 추천 검색어
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// 추천 검색어 변경 검증 (개발 서버 5199). 프로젝트 소스는 수정하지 않는다.
import { launch } from '../lib/cdp.mjs'
const t = await launch(
  'out-suggest-' + Date.now(),
  9416,
  'http://localhost:5199',
)
const { ev, vp, go, sleep, check } = t
await vp(390, 844)
const q = encodeURIComponent
const names = () =>
  ev(
    `[...document.querySelectorAll('main section[aria-label="운동 결과"] li a')].map(a=>a.innerText.split('\\n')[0])`,
  )
const status = () =>
  ev(
    `[...document.querySelectorAll('main [role=status],main [role=alert]')].map(n=>n.innerText.replace(/\\s+/g,' '))`,
  )
const exNames = async () => {
  await go('/search', 800)
  return ev(
    `(async()=>(await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}))).MOCK_EXERCISES.map(e=>e.name))()`,
  )
}
const all = await exNames()

// 추천 검색어 섹션의 운동 칩만 읽는다(최근 검색어와 구분)
const suggested = () =>
  ev(
    `(()=>{const s=document.getElementById('suggest-title').closest('section');return [...s.querySelectorAll('ul')[0].querySelectorAll('button')].map(b=>b.innerText)})()`,
  )
for (const [label, path, readFn] of [
  ['검색 초기 화면', '/search', suggested],
  [
    '탐색 화면',
    '/explore',
    () =>
      ev(
        `[...document.querySelectorAll('main a[href^="/search?q="][href*="c=exercise"]')].map(a=>a.innerText.trim())`,
      ),
  ],
]) {
  await go(path, 1000)
  const list = await readFn()
  check(
    `${label}: 운동 추천 검색어 = [스쿼트, 푸시업], '맨몸 운동' 없음`,
    list.join() === '스쿼트,푸시업',
    JSON.stringify(list),
  )
  check(
    `${label}: 추천어가 모두 시드 운동명에 포함되어 결과가 1건 이상(키워드 부분 일치)`,
    list.every((k) => all.some((n) => n.includes(k))),
  )
}

// 검색 초기 화면에서 추천 검색어 클릭 → 결과
for (const kw of ['스쿼트', '푸시업']) {
  await go('/search', 900)
  await ev(
    `(()=>{const s=document.getElementById('suggest-title').closest('section');[...s.querySelectorAll('ul')[0].querySelectorAll('button')].find(b=>b.innerText.trim()==='${kw}').click()})()`,
  )
  await sleep(1300)
  const n = await names()
  const url = await ev(`location.pathname+location.search`)
  check(
    `검색 초기 화면 "${kw}" 클릭 → 운동 범위(c=exercise) 결과 [${kw} 포함 운동]`,
    n.length >= 1 &&
      n.every((x) => x.includes(kw)) &&
      url === `/search?q=${q(kw)}&c=exercise`,
    JSON.stringify({ n, url }),
  )
  const st = await status()
  check(
    `  "${kw}": 미연결·오류·결과 없음 안내 없음, 음식 안내 없음(운동 범위)`,
    st.length === 0,
    JSON.stringify(st),
  )
}
// 탐색 화면 추천 링크 클릭
for (const kw of ['스쿼트', '푸시업']) {
  await go('/explore', 1000)
  await ev(
    `[...document.querySelectorAll('main a[href^="/search?q="]')].find(a=>a.innerText.trim()==='${kw}').click()`,
  )
  await sleep(1400)
  const n = await names()
  check(
    `탐색 화면 "${kw}" 링크 → 통합검색 결과 [${kw} 포함 운동]`,
    n.length >= 1 &&
      n.every((x) => x.includes(kw)) &&
      (await ev(`location.pathname`)) === '/search',
    JSON.stringify(n),
  )
}
// 전체 범위에서도 같은 검색어가 운동 결과를 낸다
for (const kw of ['스쿼트', '푸시업']) {
  await go(`/search?q=${q(kw)}`, 1300)
  const n = await names()
  const st = await status()
  check(
    `전체 범위 "${kw}": 운동 [${kw} 포함] + 음식 준비 중 안내만`,
    n.length >= 1 &&
      n.every((x) => x.includes(kw)) &&
      st.length === 1 &&
      st[0].includes('음식 검색은 아직 준비 중'),
    JSON.stringify({ n, st }),
  )
}
// 결과 → 상세 → 이전
await go(`/search?q=${q('푸시업')}&c=exercise`, 1300)
await ev(`document.querySelector('main a[href="/exercises/5"]').click()`)
await sleep(900)
check(
  '추천어 결과 → 상세 /exercises/5(푸시업)',
  (await ev(`location.pathname`)) === '/exercises/5',
)
await ev(`history.back()`)
await sleep(1200)
check(
  '뒤로가기 → 같은 검색 결과 복원',
  (await names()).length >= 1 &&
    (await names()).every((x) => x.includes('푸시업')),
)
console.log('console problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length} PASS ${t.res.length - f.length} FAIL ${f.length}`,
)
t.close()
process.exit(0)
