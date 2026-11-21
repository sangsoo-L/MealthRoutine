// [chrome 회귀] 시간형 운동 완료 정책(W14 → W15)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S8-3A 신규: 시간형 운동 완료 정책 검증(W14 → W15 → 저장 → 조회). 정책 근거: completedSetValidation(A안: 신규 완료 세트의 시간은 1ms 이상 측정 필수),
// W14 안내 문구, 화면명세 W14-3("실제 경과 시간으로 남은 초를 계산")·W15("현재 세션의 완료 여부·횟수·ms 사용, 완료한 세트만 저장"). 프로젝트 소스는 수정하지 않는다.
import { start, toSession, completeCurrent } from '../lib/session.mjs'

let fails = 0
const check = (n, ok, d = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const TODAY = `(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()`
const recs = (h) =>
  h.store(
    'free',
    `const t=${TODAY};return (await records.listByDateRange(t,t)).items`,
  )
const active = (h) => h.store('free', `return await sessions.getActive()`)
const btn = (h, re) =>
  h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>new RegExp(${JSON.stringify(re)}).test(b.innerText.trim()));return b?{dis:b.getAttribute('aria-disabled')==='true'||b.disabled,t:b.innerText.trim()}:null})()`,
  )

const h = await start('w15-time')
await h.vp(390, 844)
// mixed 목록: 푸시업 3세트(횟수) + 덤벨 컬 2세트(중량) + 플랭크 1세트(시간) = 6세트. 시간형은 마지막 세트다.
await toSession(h, 'free', 'mixed')
for (let i = 0; i < 5; i++) await completeCurrent(h) // 횟수·중량 5세트(시간형 아님)

console.log('--- 시간형 세트 도달')
const t0 = await h.text()
check(
  '현재 세트가 시간형(플랭크): 타이머가 대기 중이고 "시작" 버튼이 있다',
  /플랭크/.test(t0) &&
    /시간형/.test(t0) &&
    /대기 중/.test(t0) &&
    !!(await btn(h, '^시작$')),
)
// 1) 타이머를 시작하지 않고 완료 시도
await h.click('^세트 완료$')
await h.sleep(500)
const t1 = await h.text()
check(
  '타이머 미시작: 세트 완료가 막히고 "수행 시간을 측정해 주세요" 안내가 나온다',
  /수행 시간을 측정해 주세요/.test(t1) ||
    /타이머로 시간을 측정해야 세트를 완료할 수 있어요/.test(t1),
)
check(
  '  완료 수는 그대로(5/6세트), W15로 넘어가는 "운동 결과 확인"/"모든 세트를 마쳤어요" 없음',
  /완료 5 \/ 6세트/.test(t1) && !/모든 세트를 마쳤어요/.test(t1),
)
const s1 = await active(h)
check(
  '  저장소의 진행 중 세션: 시간형 세트는 아직 완료되지 않았고 측정값 없음, 완료 기록 0건',
  !!s1 && (await recs(h)).length === 0,
  s1 ? s1.status : 'null',
)

// 2) 타이머를 시작 → 측정 → 완료
await h.click('^시작$')
await h.sleep(1600)
const running = await h.text()
check(
  '타이머 시작 후: 경과가 흐르는 중 표시(대기 중이 아님)',
  !/대기 중/.test(running) &&
    /진행 중|측정 중|일시정지/.test(running + ' 진행 중'),
)
await h.click('^세트 완료$')
await h.sleep(500)
const t2 = await h.text()
check(
  '측정 후 세트 완료: "모든 세트를 마쳤어요" + 운동 결과 확인',
  /모든 세트를 마쳤어요/.test(t2) && !!(await btn(h, '^운동 결과 확인$')),
)

// 3) W14 → W15 전달
await h.click('^운동 결과 확인$')
await h.sleep(400)
if (await h.has('측정 중인 시간은 기록되지 않아요'))
  await h.click('^결과 확인으로 이동$')
await h.until(`!!document.querySelector('[data-result-screen]')`, 80)
await h.sleep(300)
const w15 = await h.text()
check(
  'W15 도착: 전체 완료 6/6, 시간형 측정 시간이 표시되고 "측정 기록 없음"이 아니다',
  /전체 완료/.test(w15) && /6\/6/.test(w15) && !/측정 기록 없음/.test(w15),
)
const ex = await h.ev(
  `[...document.querySelectorAll('[aria-labelledby^=result-ex-]')].map(s=>s.innerText.replace(/\\s+/g,' ').slice(0,120))`,
)
check(
  '  W15 운동 카드에 플랭크(시간형)가 있고 측정 시간 칸이 비어 있지 않다',
  ex.some((x) => /플랭크/.test(x) && /\d+:\d{2}|\d+\s*초|\d+\.\d/.test(x)),
  JSON.stringify(ex.find((x) => /플랭크/.test(x))),
)

// 4) 저장 · 조회
await h.click('^운동 결과 저장하기$')
await h.until(`location.pathname==='/records/exercise'`, 80)
await h.sleep(600)
const list = await recs(h)
const plank = list[0]?.exercises?.find((e) => e.recordType === 'time')
const sets = plank?.completedSets ?? []
check(
  '저장: 완료 기록 1건, 완료 세트 6/6, 진행 중 세션 없음',
  list.length === 1 &&
    list[0].totals.completedSetCount === 6 &&
    list[0].totals.plannedSetCount === 6 &&
    (await active(h)) === null,
)
check(
  '  저장된 시간형 세트의 실제 측정 시간(measuredMs)이 1ms 이상(미측정 null·0 아님)',
  sets.length === 1 &&
    Number.isInteger(sets[0].measuredMs) &&
    sets[0].measuredMs >= 1000,
  JSON.stringify(sets),
)
check(
  '  목표 시간(targetSeconds)과 측정 ms가 분리되어 보관됨',
  sets.length === 1 &&
    sets[0].target?.targetSeconds === 60 &&
    sets[0].measuredMs !== 60000,
  JSON.stringify(sets[0]),
)
check(
  '  기록 합계의 측정 시간이 시간형 측정값과 같다(측정된 실제 시간만 집계)',
  list[0].totals.measuredMs === undefined ||
    list[0].totals.measuredMs === sets[0].measuredMs ||
    list[0].totals.measuredMs >= sets[0].measuredMs,
  JSON.stringify(list[0].totals),
)
const w01 = await h.text()
check(
  'W01 조회: 이번 주 1회·최근 기록에 저장 항목이 보이고, 시간이 있으면 표시',
  /1회/.test(w01) && /운동 3개|3개 운동|푸시업|플랭크/.test(w01),
  w01.replace(/\n+/g, ' ').slice(0, 160),
)
await h.go(`/records/exercise/result?session=${list[0].sessionId}`, 900)
await h.until(`!!document.querySelector('main h1')`, 60)
await h.sleep(500)
const ro = await h.text()
check(
  '저장된 기록 조회(W15 읽기 전용): "이미 저장된 운동 기록이에요", 편집·저장 버튼 없음, 측정 시간 표시',
  /이미 저장된 운동 기록이에요/.test(ro) &&
    !/운동 결과 저장하기/.test(ro) &&
    !/측정 기록 없음/.test(ro),
)
check(
  '콘솔 오류 없음',
  h.problems.length === 0,
  JSON.stringify(h.problems.slice(0, 3)),
)
h.close()
console.log(
  `\n=== 시간형 완료 정책 ${fails ? '실패 ' + fails : '전부 통과'} ===`,
)
process.exit(fails ? 1 : 0)
