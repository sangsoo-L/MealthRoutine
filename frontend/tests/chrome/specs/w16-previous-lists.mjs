// [chrome 회귀] W16 이전 운동 리스트(지난 날짜에 구성한 운동 계획 목록) + 저장소 listBefore
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only w16-previous-lists`. 상세: tests/chrome/README.md
// S8-4B 신규, S8-4D 보강(링크 접근성 이름·읽기 전용·스키마 정밀 검사·시간 초과를 FAIL로 기록). 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다.
// 지난 날짜 데이터는 history.mjs의 시드(저장소 `now` 옵션)로 만든다. 앱 소스를 수정하지 않는다. 조회 도중 계정 전환 경쟁은 w10-my-exercise의 H 시나리오가 W10·W16 훅을 함께 검증한다.
import { start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  READONLY_RESULT,
  armReadFail,
  axLinkNames,
  dateExpr,
  dateLabelExpr,
  disarmReadFail,
  dumpStores,
  mustClick,
  mustUntil,
  readFailHits,
  schemaInfo,
  seedManyLists,
  seedRun,
  settleScreen,
  waitPath,
} from '../lib/history.mjs'

const MY = '/records/exercise/my'
const PREV = '/records/exercise/previous'
const check = (h, n, ok, d = '') => h.check(n, ok, d)

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

// 화면이 안정되지 않으면 조용히 넘어가지 않고 예외를 던진다(시나리오가 FAIL로 기록). W16·W10 각각의 경로·h1·로딩 문구가 끝났는지 확인한다.
const settle = (h) => settleScreen(h, { path: PREV, h1: '이전 운동 리스트' })
const settleMy = (h) => settleScreen(h, { path: MY, h1: '나의 운동' })
const openPrev = async (h) => {
  await h.go(PREV, 150)
  await settle(h)
}
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    const cards=[...m.querySelectorAll('article')].map(a=>({
      title:a.querySelector('h3')?.innerText.trim(),
      date:a.closest('section[aria-labelledby^=previous-date-]')?.querySelector('time')?.getAttribute('datetime'),
      links:[...a.querySelectorAll('a')].map(x=>x.getAttribute('href')),
      linkText:[...a.querySelectorAll('a')].map(x=>x.innerText.replace(/\\s+/g,' ').trim()),
      open:a.querySelector('details')?.open,
      meta:a.querySelector('h3 + p')?.innerText.trim(),
    }));
    return {
      h1:[...m.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      dates:[...m.querySelectorAll('section[aria-labelledby^=previous-date-] > div time')].map(t=>t.getAttribute('datetime')),
      cards,
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links:[...m.querySelectorAll('a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')})),
      bottom:[...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] [aria-current=page]')].map(x=>x.innerText.trim()),
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    }})()`)
// 어제B(횟수형, 세트 목표 10·10·8회): 세트 목표가 모두 같지 않아 세트별로 나뉜다(실제 화면 출력으로 확인한 문구).
const DETAIL_EXPECTED =
  '세트별 목표 자세히 보기 ⌄ 어제B 횟수형 1세트, 목표 10회 1세트 10회 2세트, 목표 10회 2세트 10회 3세트, 목표 8회 3세트 8회'
const logout = async (h) => {
  await h.go('/settings', 900)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(900)
}

// ── A. 화면: 목록·정렬·제외 규칙·연결 기록·W15 이동·복귀·계정 분리 ───────────────────────────
await scenario('A-screen', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -1,
    hour: 9,
    runs: 0,
    reqId: 'a-yd1',
    name: '어제A',
  })
  await seedRun(h, 'free', {
    dayOffset: -1,
    hour: 18,
    runs: 0,
    reqId: 'a-yd2',
    name: '어제B',
  })
  await seedRun(h, 'free', {
    dayOffset: -3,
    hour: 9,
    runs: 2,
    kind: 'mixed',
    reqId: 'a-l3',
    name: '사흘전',
  })
  await seedRun(h, 'free', {
    dayOffset: -5,
    hour: 9,
    runs: 1,
    reqId: 'a-l5',
    name: '닷새전',
  })
  await seedRun(h, 'free', {
    dayOffset: -8,
    hour: 9,
    runs: 0,
    reqId: 'a-l8',
    name: '여드레전',
  })
  await seedRun(h, 'free', {
    dayOffset: 0,
    hour: 9,
    runs: 0,
    reqId: 'a-today',
    name: '오늘목록',
  })
  await seedRun(h, 'free', {
    dayOffset: 1,
    hour: 9,
    runs: 0,
    reqId: 'a-tomorrow',
    name: '내일목록',
  })
  await seedRun(h, 'full', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'a-other',
    name: '다른계정목록',
  })
  const yd = await h.ev(dateExpr(-1))
  const d3 = await h.ev(dateExpr(-3))
  const d5 = await h.ev(dateExpr(-5))
  const d8 = await h.ev(dateExpr(-8))
  const storeBefore = await dumpStores(h)

  await h.go(MY, 150)
  await settleMy(h)
  await mustClick(h, '^이전 운동 리스트 보기')
  await waitPath(h, '^/records/exercise/previous$')
  await settle(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 60)
  let s = await snap(h)
  check(
    h,
    'A1. W10 → W16 이동(경로 /records/exercise/previous)',
    (await h.path()) === PREV,
  )
  check(
    h,
    'A2. h1 "이전 운동 리스트" 1개, 하단 탭 "기록" 유지',
    s.h1.length === 1 &&
      s.h1[0] === '이전 운동 리스트' &&
      JSON.stringify(s.bottom) === JSON.stringify(['기록']),
    JSON.stringify(s.h1),
  )
  check(
    h,
    'A3. 날짜 그룹이 최근 날짜순(어제 → 3일 전 → 5일 전 → 8일 전)',
    JSON.stringify(s.dates) === JSON.stringify([yd, d3, d5, d8]),
    JSON.stringify(s.dates),
  )
  // 보이는 날짜 제목도 같은 날짜를 가리킨다(앱의 문자열 해석과 무관하게 Date 연산으로 만든 한국어 표기와 정확히 비교).
  const headings = await h.ev(
    `[...document.querySelectorAll('main section[aria-labelledby^=previous-date-] h2')].map(x=>x.innerText.replace(/\s+/g,' ').trim())`,
  )
  const expectedHeadings = [
    await h.ev(dateLabelExpr(-1)),
    await h.ev(dateLabelExpr(-3)),
    await h.ev(dateLabelExpr(-5)),
    await h.ev(dateLabelExpr(-8)),
  ]
  check(
    h,
    'A3-2. 보이는 날짜 제목이 어제·3일 전·5일 전·8일 전의 정확한 표기와 같다',
    JSON.stringify(headings) === JSON.stringify(expectedHeadings),
    `${JSON.stringify(headings)} / ${JSON.stringify(expectedHeadings)}`,
  )
  const titles = s.cards.map((c) => c.title)
  check(
    h,
    'A4. 지난 목록 5개만(오늘·내일·다른 계정 목록 제외)',
    s.cards.length === 5 && !/오늘목록|내일목록|다른계정목록/.test(s.text),
    JSON.stringify(titles),
  )
  check(
    h,
    'A5. 같은 날짜의 목록 2개가 모두 어제 그룹에 나오고 나중에 저장한 목록이 먼저',
    JSON.stringify(s.cards.filter((c) => c.date === yd).map((c) => c.title)) ===
      JSON.stringify(['어제B', '어제A']),
    JSON.stringify(s.cards.map((c) => [c.title, c.date])),
  )
  check(
    h,
    'A6. 전체 목록 수 표시와 "당시 운동 계획" 안내',
    /전체 5개 목록/.test(s.text) && /당시 운동\s*계획/.test(s.text),
  )
  const card = (t) => s.cards.find((c) => c.title === t)
  check(
    h,
    'A7. 카드 요약: 사흘전은 정확히 "운동 3개 · 6세트", 닷새전은 "운동 1개 · 3세트"',
    card('사흘전 외 2개')?.meta === '운동 3개 · 6세트' &&
      card('닷새전')?.meta === '운동 1개 · 3세트',
    `${card('사흘전 외 2개')?.meta} / ${card('닷새전')?.meta}`,
  )
  // 연결 기록
  const l3 = s.cards.find((c) => c.title.startsWith('사흘전'))
  const l5 = s.cards.find((c) => c.title.startsWith('닷새전'))
  check(
    h,
    'A8. 연결 기록: 2건이면 링크 2개, 1건이면 1개, 없으면 0개',
    l3.links.length === 2 &&
      l5.links.length === 1 &&
      s.cards
        .filter((c) => /^(어제A|어제B|여드레전)/.test(c.title))
        .every((c) => c.links.length === 0),
    JSON.stringify(s.cards.map((c) => [c.title, c.links.length])),
  )
  check(
    h,
    'A9. 연결 기록 링크는 W15 읽기 전용 주소이고 여러 건은 완료 시각으로 구분',
    l3.links.every((x) => /^\/records\/exercise\/result\?session=/.test(x)) &&
      l3.linkText.every(
        (t) => /저장한 수행 기록 보기/.test(t) && /완료/.test(t),
      ) &&
      !/완료/.test(l5.linkText[0]),
    JSON.stringify([l3.linkText, l5.linkText]),
  )
  // 링크의 접근 가능한 이름(브라우저가 계산한 값): 계획 날짜와 목록 제목이 들어 있고, 여러 건은 순번으로 구분되며 서로 다르다.
  const names = await axLinkNames(h, /^저장한 수행 기록 보기/)
  const label3 = await h.ev(dateLabelExpr(-3))
  const label5 = await h.ev(dateLabelExpr(-5))
  check(
    h,
    'A9-2. 접근성 이름: 3개 링크 모두 서로 다르고 계획 날짜·제목을 한 번씩 포함(사흘전은 "기록 2건 중 n번째")',
    names.length === 3 &&
      new Set(names).size === 3 &&
      names.filter((n) => n.includes(`${label3} 계획 사흘전 외 2개`)).length ===
        2 &&
      names.filter((n) => /기록 2건 중 [12]번째$/.test(n)).length === 2 &&
      names.filter((n) => n.includes(`${label5} 계획 닷새전`)).length === 1 &&
      names.every(
        (n) =>
          n.startsWith('저장한 수행 기록 보기') && n.split('계획').length === 2,
      ),
    JSON.stringify(names),
  )
  check(
    h,
    'A10. 원본 목록 수정·복제 동작이 없다(시작·삭제·복사 버튼 없음)',
    !/운동 시작|복사|삭제|다시 구성|불러오기/.test(
      s.text.replace(/이전 운동 리스트 보기/g, ''),
    ),
  )

  // 세트별 목표 펼치기: 키보드
  await h.ev(`document.querySelector('main article details summary').focus()`)
  const before = await h.ev(
    `document.querySelector('main article details').open`,
  )
  await h.press('Enter', 'Enter', 13)
  const afterOpen = await h.ev(
    `document.querySelector('main article details').open`,
  )
  await h.press(' ', 'Space', 32)
  const afterClose = await h.ev(
    `document.querySelector('main article details').open`,
  )
  check(
    h,
    'A11. 세트별 목표 자세히 보기: Enter로 펼치고 Space로 접는다(키보드)',
    before === false && afterOpen === true && afterClose === false,
    `${before}/${afterOpen}/${afterClose}`,
  )
  await h.ev(`document.querySelector('main article details').open=true`)
  const detail = await h.ev(
    `document.querySelector('main article details').innerText.replace(/\\s+/g,' ')`,
  )
  check(
    h,
    'A12. 펼치면 첫 카드(어제B, 횟수 10·10·8)의 세트별 목표가 정확히 보인다',
    detail === DETAIL_EXPECTED,
    detail,
  )

  // W16 → W15 읽기 전용 → 이전 → W16
  await h.ev(`document.querySelector('main article details').open=false`)
  await h.ev(
    `[...document.querySelectorAll('main article')].find(a=>a.querySelector('h3').innerText.startsWith('닷새전')).querySelector('a').click()`,
  )
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  check(
    h,
    'A13. W16 → W15 읽기 전용(이미 저장된 기록 안내)',
    await h.has('이미 저장된 운동 기록이에요'),
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/previous$')
  check(h, 'A14. W15 "이전" → W16(state.from)', (await h.path()) === PREV)
  await settle(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 80)
  // 여러 연결 기록 중 두 번째도 열린다
  await h.ev(
    `[...document.querySelectorAll('main article')].find(a=>a.querySelector('h3').innerText.startsWith('사흘전')).querySelectorAll('a')[1].click()`,
  )
  await waitPath(h, '^/records/exercise/result$')
  await mustUntil(h, READONLY_RESULT, 60)
  const second = await h.path()
  await h.ev(`history.back()`)
  await waitPath(h, '^/records/exercise/previous$')
  check(
    h,
    'A15. 연결 기록 두 번째도 W15로 열리고 브라우저 뒤로가기 → W16',
    /session=/.test(second) && (await h.path()) === PREV,
  )
  // W16 "이전" → W10 / "나의 운동으로 돌아가기"
  await settle(h)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  check(h, 'A16. W16 "이전" → W10', (await h.path()) === MY)
  await openPrev(h)
  await mustClick(h, '^나의 운동으로 돌아가기$')
  await waitPath(h, '^/records/exercise/my$')
  check(h, 'A17. "나의 운동으로 돌아가기" → W10', (await h.path()) === MY)
  // 직접 URL 접근 시 기본 복귀(W10)
  await openPrev(h)
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  check(
    h,
    'A18. 직접 URL로 연 W16의 "이전"은 기본 상위 화면(W10)',
    (await h.path()) === MY,
  )

  // W10·W16·W15(읽기 전용)를 둘러보는 동안 저장소의 어떤 행도 바뀌지 않았다(세 저장소의 모든 행을 처음 시드 직후와 바이트 단위로 비교).
  const storeAfter = await dumpStores(h)
  check(
    h,
    'A18-2. 둘러본 뒤에도 세 저장소의 모든 행이 시드 직후와 완전히 같다(읽기 전용)',
    storeAfter === storeBefore,
    `전 ${storeBefore.length}자 / 후 ${storeAfter.length}자`,
  )

  // 계정 분리: full 계정은 자기 목록만
  await logout(h)
  await h.login('full')
  await openPrev(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 60)
  s = await snap(h)
  check(
    h,
    'A19. full 계정: 자기 목록 1개만, free 계정의 목록·기록이 없다',
    s.cards.length === 1 &&
      /다른계정목록/.test(s.text) &&
      !/사흘전|닷새전|어제A/.test(s.text),
    JSON.stringify(s.cards.map((c) => c.title)),
  )
  // 새로고침 후에도 같다
  await openPrev(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 60)
  s = await snap(h)
  check(
    h,
    'A20. 새로고침 후에도 같은 결과',
    s.cards.length === 1 && s.over <= 0,
  )
})

// ── B. 저장소 listBefore(실제 IndexedDB): 범위·정렬·무제한·계정·날짜 경계·손상·스키마 ───────────
await scenario('B-store', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -1,
    hour: 23,
    reqId: 'b-yd-late',
    name: '어제밤',
  })
  await seedRun(h, 'free', {
    dayOffset: -1,
    hour: 6,
    reqId: 'b-yd-early',
    name: '어제아침',
  })
  await seedRun(h, 'free', {
    dayOffset: 0,
    hour: 0,
    reqId: 'b-today-0000',
    name: '오늘0시',
  })
  await seedRun(h, 'free', {
    dayOffset: 1,
    hour: 0,
    reqId: 'b-tom',
    name: '내일',
  })
  await seedRun(h, 'full', {
    dayOffset: -2,
    hour: 9,
    reqId: 'b-other',
    name: '남',
  })
  await seedManyLists(h, 'free', 120, -2)
  const today = dateExpr(0)
  const res = await h.store(
    'free',
    `const t=${today};
     const r=await lists.listBefore(t);
     const recent=await lists.listRecent(100);
     const names=r.items.map(x=>x.items[0].exerciseNameSnapshot);
     const dates=r.items.map(x=>x.plannedDate);
     let sorted=true; for(let i=1;i<dates.length;i++) if(dates[i]>dates[i-1]) sorted=false;
     const sameDay=r.items.filter(x=>x.plannedDate===dates[0]).map(x=>x.items[0].exerciseNameSnapshot);
     const full=await (window.__fullRepo ??= (await import('/src/exercise/local/indexedDbWorkoutRepositories.ts')).createIndexedDbWorkoutListRepository('full')).listBefore(t);
     let bad; try { await lists.listBefore('2026-13-45'); bad='no-error' } catch(e){ bad=e.reason }
     const dbs=await new Promise((ok,no)=>{const q=indexedDB.open('mealthroutine-exercise');q.onsuccess=()=>{const d=q.result;const v={version:d.version,stores:[...d.objectStoreNames]};d.close();ok(v)};q.onerror=()=>no(q.error)});
     return {count:r.items.length, skipped:r.skippedCount, sorted, sameDay, hasToday:names.includes('오늘0시'), hasTomorrow:names.includes('내일'), hasLate:names.includes('어제밤'), hasEarly:names.includes('어제아침'), owners:[...new Set(r.items.map(x=>x.ownerId))], recentCount:recent.items.length, fullCount:full.items.length, fullName:full.items[0]?.items[0].exerciseNameSnapshot, bad, db:dbs}`,
  )
  check(
    h,
    'B1. 지난 목록 전체를 개수 제한 없이 조회(122개 > listRecent 최대 100)',
    res.count === 122 && res.recentCount === 100,
    JSON.stringify({ count: res.count, recent: res.recentCount }),
  )
  check(
    h,
    'B2. 날짜 내림차순, 같은 날짜는 나중에 저장한 목록이 먼저(어제밤 → 어제아침)',
    res.sorted &&
      JSON.stringify(res.sameDay) === JSON.stringify(['어제밤', '어제아침']),
    JSON.stringify(res.sameDay),
  )
  check(
    h,
    'B3. 날짜 경계: 어제 23시 목록은 포함, 오늘 0시·내일 목록은 제외',
    res.hasLate && res.hasEarly && !res.hasToday && !res.hasTomorrow,
  )
  check(
    h,
    'B4. 계정 격리: free 조회에 다른 계정 목록이 없고 full은 자기 목록만',
    JSON.stringify(res.owners) === JSON.stringify(['free']) &&
      res.fullCount === 1 &&
      res.fullName === '남',
    JSON.stringify({ owners: res.owners, full: res.fullCount }),
  )
  check(
    h,
    'B5. 올바르지 않은 날짜는 validation 오류',
    res.bad === 'validation',
    String(res.bad),
  )
  const schema = await schemaInfo(h)
  check(
    h,
    'B6. DB 스키마 불변(승인된 v6): version 6, 저장소 9개와 인덱스 19개의 이름·keyPath·unique·multiEntry가 모두 기대와 같다(byOwnerDate 포함)',
    res.db.version === 6 &&
      JSON.stringify(schema) === JSON.stringify(EXPECTED_SCHEMA),
    JSON.stringify(schema).slice(0, 300),
  )
  // 조회는 읽기 전용이다: 반복 조회 전후로 세 저장소의 모든 행(원본)이 같다. 건수만 비교하지 않는다.
  const dumpBeforeReads = await dumpStores(h)
  const counts = await h.store(
    'free',
    `const a=await lists.listBefore(${today}); const b=await lists.listBefore(${today}); const all=await lists.listRecent(100); return [a.items.length,b.items.length,all.items.length]`,
  )
  const dumpAfterReads = await dumpStores(h)
  check(
    h,
    'B7. 반복 조회해도 저장된 모든 행이 바이트 단위로 같다(읽기 전용)',
    counts[0] === counts[1] &&
      counts[0] === 122 &&
      dumpBeforeReads === dumpAfterReads,
    `${counts} / 전 ${dumpBeforeReads.length}자 후 ${dumpAfterReads.length}자`,
  )
  // 손상 행: 건너뛰고 건수만 알리며 정상 목록은 숨기지 않는다
  await h.ev(`(async()=>{
    const db=await new Promise((ok,no)=>{const q=indexedDB.open('mealthroutine-exercise');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    await new Promise((ok,no)=>{const tx=db.transaction('workoutLists','readwrite');tx.objectStore('workoutLists').put({id:'corrupt-1',ownerId:'free',schemaVersion:1,plannedDate:'2026-01-01',items:'깨진 값',catalogVersion:'x',revision:1,requestId:'corrupt-req',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});
    db.close();
  })()`)
  const corrupt = await h.store(
    'free',
    `const r=await lists.listBefore(${today}); return {count:r.items.length, skipped:r.skippedCount}`,
  )
  check(
    h,
    'B8. 손상 행은 건너뛰고 건수(1)만 알리며 정상 122개는 그대로',
    corrupt.count === 122 && corrupt.skipped === 1,
    JSON.stringify(corrupt),
  )
  // 화면: 많은 목록도 모두 나오고 손상 안내가 보인다
  const dumpAfterCorrupt = await dumpStores(h)
  await openPrev(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 100)
  const s = await snap(h)
  check(
    h,
    'B9. W16이 122개를 모두 표시하고 읽을 수 없는 목록 1개 안내를 한다',
    s.cards.length === 122 &&
      /전체 122개 목록/.test(s.text) &&
      /읽을 수 없는 목록 1개를 제외했어요/.test(s.text),
    `${s.cards.length}`,
  )
  // 화면이 손상 행을 지우거나 고치지 않는다(조회만 한다).
  const dumpAfterScreen = await dumpStores(h)
  check(
    h,
    'B10. 화면이 손상 행을 보여 준 뒤에도 저장된 모든 행(손상 행 포함)이 그대로다',
    dumpAfterScreen === dumpAfterCorrupt,
    `전 ${dumpAfterCorrupt.length}자 / 후 ${dumpAfterScreen.length}자`,
  )
})

// ── C. 빈 상태 · 비로그인 ────────────────────────────────────────────────────────────
await scenario('C-empty-guest', async (h) => {
  await h.goSettled(PREV, 1000)
  let s = await snap(h)
  check(
    h,
    'C1. 비로그인: 로그인 안내만 보이고 목록이 없다',
    /로그인 후 이용할 수 있어요/.test(s.text) && s.cards.length === 0,
  )
  await h.login('free')
  await openPrev(h)
  s = await snap(h)
  check(
    h,
    'C2. 지난 목록이 없으면 빈 상태와 W10 이동 안내',
    /이전 운동 리스트가 없어요/.test(s.text) &&
      s.links.some((l) => /나의 운동으로 돌아가기/.test(l.t) && l.h === MY),
  )
  await seedRun(h, 'free', {
    dayOffset: 0,
    hour: 9,
    reqId: 'c-today',
    name: '오늘만',
  })
  await seedRun(h, 'free', {
    dayOffset: 1,
    hour: 9,
    reqId: 'c-tom',
    name: '내일만',
  })
  await openPrev(h)
  s = await snap(h)
  check(
    h,
    'C3. 오늘·내일 목록만 있어도 빈 상태(지난 목록 아님)',
    /이전 운동 리스트가 없어요/.test(s.text) && s.cards.length === 0,
  )
})

// ── D. 조회 오류 · 다시 시도 · 연결 기록 조회만 실패 ───────────────────────────────────
await scenario('D-error-retry', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'd-1',
    name: '복구목록',
  })
  await h.go(MY, 150)
  await settleMy(h)
  await armReadFail(h, 'workoutLists', 99)
  await mustClick(h, '^이전 운동 리스트 보기')
  await waitPath(h, '^/records/exercise/previous$')
  await mustUntil(h, `!!document.querySelector('[role=alert]')`, 60)
  // 개발 모드(StrictMode)는 마운트 때 효과를 두 번 실행하므로 목록 조회가 정확히 2번 실패한다. 둘 다 일어날 때까지 조건으로 기다린다.
  await h.until(`(window.__readFail?.hits ?? 0) >= 2`, 30)
  let s = await snap(h)
  const listHits = await readFailHits(h)
  check(
    h,
    'D1. 목록 조회 실패: 오류 안내와 "다시 시도"(가짜 목록 없음)',
    /이전 운동 리스트를 불러오지 못했어요/.test(s.text) &&
      /다시 시도/.test(s.text) &&
      s.cards.length === 0,
  )
  check(
    h,
    'D1-2. 주입한 읽기 실패가 workoutLists 조회에서 정확히 2번(StrictMode의 효과 2회) 일어났다',
    listHits === 2,
    `hits=${listHits}`,
  )
  await disarmReadFail(h)
  await mustClick(h, '^다시 시도$')
  await mustUntil(h, `document.querySelectorAll('main article').length===1`, 60)
  s = await snap(h)
  check(
    h,
    'D2. 다시 시도하면 목록이 나타난다',
    s.cards.length === 1 && /복구목록/.test(s.text),
  )
  // 연결 기록만 실패: 목록은 보이고 기록 링크만 없다
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise/my$')
  await settleMy(h)
  await armReadFail(h, 'workoutRecords', 99)
  await mustClick(h, '^이전 운동 리스트 보기')
  await waitPath(h, '^/records/exercise/previous$')
  await mustUntil(h, `document.querySelectorAll('main article').length===1`, 60)
  await h.until(`(window.__readFail?.hits ?? 0) >= 2`, 30)
  s = await snap(h)
  const recordHits = await readFailHits(h)
  check(
    h,
    'D3. 연결 기록 조회만 실패해도 목록은 보이고 기록 링크는 없으며 안내가 있다',
    s.cards.length === 1 &&
      s.cards[0].links.length === 0 &&
      /저장한 수행 기록을 확인하지 못해/.test(s.text),
  )
  check(
    h,
    'D3-2. 주입한 읽기 실패가 workoutRecords 조회에서 정확히 2번(StrictMode의 효과 2회) 일어났다',
    recordHits === 2,
    `hits=${recordHits}`,
  )
  await disarmReadFail(h)
})

// ── E. 반응형 · 키보드 · 접근성 ──────────────────────────────────────────────────────
await scenario('E-responsive', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -1,
    hour: 9,
    runs: 1,
    kind: 'mixed',
    reqId: 'e-1',
    name: '아주아주아주긴운동이름'.repeat(4),
  })
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 2,
    reqId: 'e-2',
    name: '반응형B',
  })
  await seedRun(h, 'free', {
    dayOffset: -3,
    hour: 9,
    runs: 0,
    reqId: 'e-3',
    name: '반응형C',
  })
  const PROBE = `(()=>{
    const w=window.innerWidth;const bad=[];
    for(const e of document.querySelectorAll('main *')){
      const r=e.getBoundingClientRect();
      if(r.width===0||r.height===0||e.closest('.sr-only')||e.classList.contains('sr-only')) continue;
      if(r.right>w+1||r.left<-1) bad.push(e.tagName+':'+Math.round(r.left)+'~'+Math.round(r.right));
    }
    const small=[...document.querySelectorAll('main a, main button, main summary')].filter(e=>{
      const r=e.getBoundingClientRect();
      return r.width>0&&r.height>0&&!e.closest('.sr-only')&&r.height<43.5;
    }).map(e=>(e.innerText||'').trim().slice(0,16)+':'+Math.round(e.getBoundingClientRect().height));
    return {ov:document.documentElement.scrollWidth-w, bad:bad.slice(0,4), small:small.slice(0,6)}
  })()`
  for (const [w, hh] of [
    [320, 700],
    [375, 812],
    [390, 844],
    [768, 1024],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    await openPrev(h)
    await mustUntil(h, `document.querySelectorAll('main article').length>0`, 60)
    await h.ev(
      `document.querySelectorAll('main article details').forEach(d=>d.open=true)`,
    )
    const p = await h.ev(PROBE)
    check(
      h,
      `E-${w}. 가로 넘침 없음·터치 영역 ≥44px(펼친 상태, 긴 운동 이름 포함)`,
      p.ov <= 0 && p.bad.length === 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
  await h.vp(320, 700)
  await openPrev(h)
  const overlap = await h.ev(`(()=>{
    window.scrollTo(0, document.documentElement.scrollHeight);
    const nav=document.querySelector('nav[aria-label="밀스루틴 주요 메뉴"]');
    const links=[...document.querySelectorAll('main a')];
    const last=links[links.length-1]; if(!nav||!last) return 'no-nav-or-link';
    const n=nav.getBoundingClientRect(), l=last.getBoundingClientRect();
    return l.bottom<=n.top+1 ? 'ok' : 'overlap '+Math.round(l.bottom)+'>'+Math.round(n.top);
  })()`)
  check(
    h,
    'E-320 하단. 마지막 링크가 하단 탭에 가려지지 않는다',
    overlap === 'ok',
    String(overlap),
  )
  await h.vp(390, 844)
  await openPrev(h)
  await mustUntil(h, `document.querySelectorAll('main article').length>0`, 60)
  await h.ev(
    `document.querySelectorAll('main article details').forEach(d=>d.open=true)`,
  )
  const levels = await h.ev(
    `[...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(x=>+x.tagName[1])`,
  )
  check(
    h,
    'E-제목. 제목 계층 h1 → h2(날짜) → h3(목록) → h4(운동), 건너뜀 없음',
    levels[0] === 1 &&
      levels.every((v, i) => i === 0 || v - levels[i - 1] <= 1) &&
      levels.includes(4),
    JSON.stringify(levels),
  )
  await h.ev(
    `document.querySelectorAll('main article details').forEach(d=>d.open=false); document.activeElement?.blur(); document.body.focus(); window.scrollTo(0,0)`,
  )
  // 컨트롤 종류로 분류한다: P 이전 · S 세트별 목표(요약) · L 저장한 수행 기록 보기 · B 나의 운동으로 돌아가기 · ? 그 밖.
  const seen = []
  let outlined = true
  // Tab을 누른 뒤 포커스가 body나 없음으로 빠진 횟수. 마지막 컨트롤에 닿기 전에 한 번이라도 빠지면 실패다(예전에는 조용히 건너뛰었다).
  let lost = 0
  for (let i = 0; i < 40; i++) {
    await h.press('Tab', 'Tab', 9)
    const f = await h.ev(
      `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e);const t=(e.innerText||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim();const k=/^이전$/.test(t)?'P':/^세트별 목표/.test(t)?'S':/^저장한 수행 기록 보기/.test(t)?'L':/^나의 운동으로 돌아가기$/.test(t)?'B':'?';return {k,t:t.slice(0,40),o:c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0}})()`,
    )
    if (!f) {
      lost++
      continue
    }
    seen.push(f)
    if (!f.o) outlined = false
    if (f.k === 'B') break
  }
  // 카드 3개(연결 기록 1건 · 2건 · 0건)이므로 정확히: 이전 → [목표, 기록] → [목표, 기록, 기록] → [목표] → 돌아가기.
  const order = seen.map((x) => x.k).join(',')
  check(
    h,
    'E-키보드. Tab 순서가 정확히 이전 → (세트별 목표 · 기록 보기 1건) → (목표 · 기록 2건) → (목표) → 나의 운동으로 돌아가기, 중간에 포커스를 잃지 않는다',
    lost === 0 && order === 'P,S,L,S,L,L,S,B',
    `lost=${lost} ${order} ${JSON.stringify(seen.map((x) => x.t))}`,
  )
  check(
    h,
    'E-포커스. 키보드로 지나는 모든 컨트롤에 포커스 표시(outline)가 있다',
    outlined,
  )
})

// ── F. 링크 접근성 이름(브라우저가 계산한 값): 같은 제목이 다른 날짜에 있어도 구분된다 ─────────────────
await scenario('F-a11y-names', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'f-same-1',
    name: '같은제목',
  })
  await seedRun(h, 'free', {
    dayOffset: -4,
    hour: 9,
    runs: 1,
    reqId: 'f-same-2',
    name: '같은제목',
  })
  await seedRun(h, 'free', {
    dayOffset: -3,
    hour: 9,
    runs: 3,
    reqId: 'f-multi',
    name: '여러번수행',
  })
  await openPrev(h)
  await mustUntil(h, `document.querySelectorAll('main article').length===3`, 60)
  const names = await axLinkNames(h, /^저장한 수행 기록 보기/)
  const l2 = await h.ev(dateLabelExpr(-2))
  const l3 = await h.ev(dateLabelExpr(-3))
  const l4 = await h.ev(dateLabelExpr(-4))
  const sameNames = names.filter((n) => n.includes('같은제목'))
  const multiNames = names.filter((n) => n.includes('여러번수행'))
  check(
    h,
    'F1. 링크 5개의 접근 가능한 이름이 모두 서로 다르다',
    names.length === 5 && new Set(names).size === 5,
    JSON.stringify(names),
  )
  check(
    h,
    'F2. 같은 제목("같은제목")의 두 링크는 각자의 계획 날짜(2일 전·4일 전)로 구분된다',
    sameNames.length === 2 &&
      sameNames.some((n) => n.includes(`${l2} 계획 같은제목`)) &&
      sameNames.some((n) => n.includes(`${l4} 계획 같은제목`)),
    JSON.stringify(sameNames),
  )
  check(
    h,
    'F3. 기록이 여러 건인 목록은 "기록 3건 중 1·2·3번째"로 구분되고 날짜·제목은 한 번씩만 읽는다',
    multiNames.length === 3 &&
      [1, 2, 3].every((k) =>
        multiNames.some((n) => n.endsWith(`기록 3건 중 ${k}번째`)),
      ) &&
      multiNames.every(
        (n) =>
          n.includes(`${l3} 계획 여러번수행`) &&
          n.split('여러번수행').length === 2 &&
          n.split('완료').length === 2,
      ),
    JSON.stringify(multiNames),
  )
  check(
    h,
    'F4. 눈에 보이는 문구 "저장한 수행 기록 보기"가 모든 이름의 맨 앞에 그대로 있다(레이블 인 네임)',
    names.every((n) => n.startsWith('저장한 수행 기록 보기')),
  )
  // 링크 안에 별도 id·aria-label이 없고, 문서 전체에서 id가 중복되지 않는다(중복 낭독·중복 id 방지).
  const dom = await h.ev(`(()=>{
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
    const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
    const links=[...document.querySelectorAll('main article a')];
    return {dup, linkAttrs:links.filter(a=>a.id||a.hasAttribute('aria-label')||a.hasAttribute('aria-labelledby')||a.hasAttribute('aria-describedby')).length, links:links.length}
  })()`)
  check(
    h,
    'F5. 문서에 중복 id가 없고 링크에 id·aria 이름 속성이 없다',
    dom.dup.length === 0 && dom.linkAttrs === 0 && dom.links === 5,
    JSON.stringify(dom),
  )
})
