// [chrome 회귀] E01 운동 탐색: 조건 조합 결과가 데이터와 일치
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// E01 회귀 보강: 결과가 실제로 있는 필터 조합을 데이터와 대조한다.
import { launch } from '../lib/cdp.mjs'
const t = await launch('out-e01', 9414, 'http://localhost:5199')
const { ev, vp, go, check } = t
await vp(390, 844)
const q = (s) => encodeURIComponent(s)
await go('/exercises', 800)
const ex = await ev(
  `(async()=>{const m=await import('/src/exercise/seed/seedData.ts').then((s)=>({MOCK_EXERCISES:s.getSeedCatalog().getAllExercises()}));return m.MOCK_EXERCISES.map(e=>({id:e.id,name:e.name,d:e.difficulty,eq:e.equipment,t:e.targetMuscles,c:e.category}))})()`,
)
const list = () =>
  ev(
    `[...document.querySelectorAll('main a[href^="/exercises/"]')].map(a=>a.getAttribute('href').split('/').pop())`,
  )
const cases = [
  [
    '초급 + 맨몸',
    `difficulty=${q('초급')}&tool=${q('맨몸')}`,
    (e) => e.d === '초급' && e.eq.includes('맨몸'),
  ],
  [
    '덤벨(검색어) + 중급',
    `q=${q('덤벨')}&difficulty=${q('중급')}`,
    (e) => e.name.replace(/\s+/g, '').includes('덤벨') && e.d === '중급',
  ],
  ['검색어 "업"', `q=${q('업')}`, (e) => e.name.includes('업')],
  ['난이도 고급', `difficulty=${q('고급')}`, (e) => e.d === '고급'],
]
for (const [label, params, pred] of cases) {
  await go(`/exercises?${params}&view=results`, 1500)
  const ui = (await list()).sort().join()
  const exp = ex
    .filter(pred)
    .map((e) => e.id)
    .sort()
    .join()
  check(
    `E01 ${label}: 데이터 기준 기대 ${exp ? exp.split(',').length : 0}건과 일치`,
    ui === exp,
    `ui=${ui} exp=${exp}`,
  )
}
console.log('console problems:', JSON.stringify(t.problems))
const f = t.res.filter((x) => !x.ok)
console.log(
  `TOTAL ${t.res.length} PASS ${t.res.length - f.length} FAIL ${f.length}`,
)
t.close()
process.exit(0)
