// [chrome 회귀] FAST-03: 식단 관리 1차(F01 연결·F02·D02·D01-1~3·D01) + IndexedDB v3~v5 업그레이드(mealRecords·mealPlans·workoutPlans) + 음식 즐겨찾기
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only meals-food`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 저장소 시험은 앱과 같은 저장소 코드를 페이지 안에서 부르고, 화면 시험은 실제 클릭으로 진행한다.
// 영양 기대값은 개발용 예시 음식(스토리보드 foodDB)의 100g 값에서 손으로 계산한 값이다(현미밥 153kcal, 닭가슴살 165kcal 등). 앱 소스를 수정하지 않는다.
import { start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  dumpStores,
  mustClick,
  mustUntil as baseUntil,
  schemaInfo,
  seedRun,
  settleScreen as baseSettle,
  waitPath as basePath,
} from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const mustUntil = (h, expr, n = 80) => baseUntil(h, expr, n * 2)
const waitPath = (h, re, n = 80) => basePath(h, re, n * 2)
const j = JSON.stringify
const settleScreen = (h, o) => baseSettle(h, { timeoutMs: 40000, ...o })

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

const PRE = `
  const m = await import('/src/food/local/indexedDbMealRepository.ts');
  const fd = await import('/src/food/dev/devFoodSamples.ts');
  const wm = await import('/src/exercise/workoutModel.ts');
  const today = wm.toLocalDate(new Date());
  const err = async (fn) => { try { await fn(); return 'no-error' } catch (e) { return (e.reason ?? e.name) + (e.code ? ':' + e.code : '') + (e.currentRevision ? '@' + e.currentRevision : '') } };
`
const run = (h, body) => h.ev(`(async()=>{ ${PRE} ${body} })()`)

const clickSel = (h, sel) =>
  h.ev(
    `(()=>{const e=document.querySelector(${j(sel)});if(!e)return false;e.click();return true})()`,
  )
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    return {
      path:location.pathname+location.search,
      h1:[...m.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links:[...m.querySelectorAll('a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')})),
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    }})()`)
const records = (h) =>
  h.ev(
    `[...document.querySelectorAll('[data-meal-record]')].map(e=>e.innerText.replace(/\\s+/g,' ').trim())`,
  )
const waitRecords = (h, n) =>
  mustUntil(
    h,
    `document.querySelectorAll('[data-meal-record]').length===${n}`,
    80,
  )
const dialogGone = (h) =>
  mustUntil(h, `!document.querySelector('[role=dialog]')`, 60)
const waitH1 = (h, text) =>
  mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()===${j(text)}`,
    80,
  )
const logout = async (h) => {
  await h.ev(`sessionStorage.clear()`)
  await h.go('/home', 900)
}
const mealStores = async (h) => JSON.parse(await dumpStores(h)).mealRecords
const oldStores = async (h) => {
  const all = JSON.parse(await dumpStores(h))
  return j({
    workoutLists: all.workoutLists,
    workoutRecords: all.workoutRecords,
    workoutSessions: all.workoutSessions,
    workoutRoutines: all.workoutRoutines,
  })
}

// ── A. 저장소(실제 IndexedDB) ─────────────────────────────────────────────────────────
await scenario('A-repo', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'a-old',
    name: '기존기록',
  })
  const oldBefore = await oldStores(h)
  const r = await run(
    h,
    `
    const free = m.createIndexedDbMealRecordRepository('free');
    const full = m.createIndexedDbMealRecordRepository('full');
    const rice = fd.DEV_FOODS[0];
    const out = {};
    const c1 = await free.create({ requestId: 'm-1', localDate: today, mealType: 'breakfast', food: rice, portion: 'normal' });
    out.c1 = { created: c1.created, rev: c1.record.revision, grams: c1.record.weightGrams, owner: c1.record.ownerId, snap: JSON.stringify(c1.record.nutritionSnapshot) === JSON.stringify(rice.per100g), src: c1.record.nutritionSource.kind };
    const again = await free.create({ requestId: 'm-1', localDate: today, mealType: 'breakfast', food: rice, portion: 'normal' });
    out.again = { created: again.created, sameId: again.record.id === c1.record.id };
    out.conflict = await err(() => free.create({ requestId: 'm-1', localDate: today, mealType: 'breakfast', food: rice, portion: 'more' }));
    out.countAfterDup = (await free.listByDate(today)).items.length;
    out.badPortion = await err(() => free.create({ requestId: 'm-2', localDate: today, mealType: 'breakfast', food: rice, portion: 'huge' }));
    out.badMeal = await err(() => free.create({ requestId: 'm-3', localDate: today, mealType: 'snack', food: rice, portion: 'normal' }));
    out.badDate = await err(() => free.create({ requestId: 'm-4', localDate: '2026-02-31', mealType: 'lunch', food: rice, portion: 'normal' }));
    out.badRequest = await err(() => free.create({ requestId: '공백 있음', localDate: today, mealType: 'lunch', food: rice, portion: 'normal' }));
    out.countAfterInvalid = (await free.listByDate(today)).items.length;
    const u1 = await free.update(c1.record.id, { expectedRevision: 1, portion: 'more' });
    out.u1 = { rev: u1.revision, grams: u1.weightGrams, portion: u1.portion, snap: JSON.stringify(u1.nutritionSnapshot) === JSON.stringify(rice.per100g), created: u1.createdAt === c1.record.createdAt };
    out.stale = await err(() => free.update(c1.record.id, { expectedRevision: 1, portion: 'less' }));
    out.updateInvalid = await err(() => free.update(c1.record.id, { expectedRevision: 2, portion: 'huge' }));
    out.afterBad = (await free.get(c1.record.id)).portion;
    out.fullList = (await full.listByDate(today)).items.length;
    out.fullGet = (await full.get(c1.record.id)) === null;
    out.fullUpdate = await err(() => full.update(c1.record.id, { expectedRevision: 2, portion: 'less' }));
    out.fullDelete = await err(() => full.delete(c1.record.id));
    out.stillThere = (await free.get(c1.record.id))?.portion;
    const f1 = await full.create({ requestId: 'm-1', localDate: today, mealType: 'dinner', food: fd.DEV_FOODS[1], portion: 'less' });
    out.fullOwn = { created: f1.created, ownerId: f1.record.ownerId, freeStill: (await free.listByDate(today)).items.length, fullCount: (await full.listByDate(today)).items.length };
    out.staleDelete = await err(() => free.delete(c1.record.id, { expectedRevision: 1 }));
    await free.delete(c1.record.id, { expectedRevision: 2 });
    out.afterDelete = (await free.get(c1.record.id)) === null;
    out.deleteAgain = await err(() => free.delete(c1.record.id));
    out.fullAfterFreeDelete = (await full.listByDate(today)).items.length;
    return out;
  `,
  )
  check(
    h,
    'A1. 기록 만들기: revision 1, 양 구분에서 중량(보통 100g), 소유자, 영양 스냅샷·출처(dev-sample) 저장',
    r.c1.created &&
      r.c1.rev === 1 &&
      r.c1.grams === 100 &&
      r.c1.owner === 'free' &&
      r.c1.snap &&
      r.c1.src === 'dev-sample',
    j(r.c1),
  )
  check(
    h,
    'A2. 중복 저장 방지: 같은 요청 id·같은 내용은 처음 기록을 돌려주고(새로 만들지 않음), 다른 내용은 conflict(requestConflict)다',
    !r.again.created &&
      r.again.sameId &&
      r.conflict === 'conflict:requestConflict' &&
      r.countAfterDup === 1,
    j({ again: r.again, conflict: r.conflict, n: r.countAfterDup }),
  )
  check(
    h,
    'A3. 잘못된 입력(양 구분·끼니·날짜·요청 id)은 validation이고 아무것도 저장하지 않는다',
    r.badPortion.startsWith('validation') &&
      r.badMeal.startsWith('validation') &&
      r.badDate.startsWith('validation') &&
      r.badRequest.startsWith('validation') &&
      r.countAfterInvalid === 1,
    j(r),
  )
  check(
    h,
    'A4. 수정: 양·중량·revision만 바뀌고 영양 스냅샷·createdAt은 그대로이며, 오래된 revision은 conflict(revisionMismatch@2), 잘못된 값은 값을 바꾸지 않는다',
    r.u1.rev === 2 &&
      r.u1.grams === 150 &&
      r.u1.portion === 'more' &&
      r.u1.snap &&
      r.u1.created &&
      r.stale === 'conflict:revisionMismatch@2' &&
      r.updateInvalid.startsWith('validation') &&
      r.afterBad === 'more',
    j({ u1: r.u1, stale: r.stale, bad: r.updateInvalid, after: r.afterBad }),
  )
  check(
    h,
    'A5. 계정 격리: full 계정은 free 기록을 읽거나 수정·삭제할 수 없고(notFound, 지워지지 않음), 같은 요청 id로 자기 기록을 따로 만든다',
    r.fullList === 0 &&
      r.fullGet &&
      r.fullUpdate === 'notFound' &&
      r.fullDelete === 'notFound' &&
      r.stillThere === 'more' &&
      r.fullOwn.created &&
      r.fullOwn.ownerId === 'full' &&
      r.fullOwn.freeStill === 1 &&
      r.fullOwn.fullCount === 1,
    j({ list: r.fullList, get: r.fullGet, own: r.fullOwn }),
  )
  check(
    h,
    'A6. 삭제: 오래된 revision은 conflict이고, 맞으면 지워지며 다시 지우면 notFound다. 다른 계정 기록에는 영향이 없다',
    r.staleDelete.startsWith('conflict') &&
      r.afterDelete &&
      r.deleteAgain === 'notFound' &&
      r.fullAfterFreeDelete === 1,
    j({
      stale: r.staleDelete,
      gone: r.afterDelete,
      again: r.deleteAgain,
      full: r.fullAfterFreeDelete,
    }),
  )
  // 손상 행: 목록은 정상 기록을 보이고 손상 행은 개수로만 알린다.
  const corrupt = await run(
    h,
    `
    const free = m.createIndexedDbMealRecordRepository('free');
    await free.create({ requestId: 'ok-1', localDate: today, mealType: 'lunch', food: fd.DEV_FOODS[2], portion: 'normal' });
    const db = await new Promise((ok, no) => { const q = indexedDB.open('mealthroutine-exercise'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) });
    await new Promise((ok, no) => { const tx = db.transaction('mealRecords', 'readwrite'); tx.objectStore('mealRecords').put({ id: 'bad-1', ownerId: 'free', localDate: today, requestId: 'bad-r', mealType: 'brunch' }); tx.oncomplete = ok; tx.onerror = () => no(tx.error) });
    db.close();
    const res = await free.listByDate(today);
    return { names: res.items.map((x) => x.foodName), skipped: res.skippedCount };
  `,
  )
  check(
    h,
    'A7. 손상된 행은 건너뛰고 정상 기록(그린 샐러드)만 보이며 건너뛴 수를 알린다',
    j(corrupt.names) === j(['그린 샐러드']) && corrupt.skipped === 1,
    j(corrupt),
  )
  check(
    h,
    'A8. 식단 저장이 기존 운동 데이터(목록·세션·기록·루틴)를 바꾸지 않았다',
    (await oldStores(h)) === oldBefore,
    '',
  )
  check(
    h,
    'A9. 스키마가 승인된 v6다(mealRecords·mealPlans·workoutPlans 포함)',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
    j(await schemaInfo(h)).slice(0, 200),
  )
})

// ── B. v1·v2·v3·v4 → v6 업그레이드 ───────────────────────────────────────────────────────
for (const from of [1, 2, 3, 4]) {
  await scenario(`B-migration-v${from}`, async (h) => {
    await h.login('free')
    await seedRun(h, 'free', {
      dayOffset: -2,
      hour: 9,
      runs: 2,
      kind: 'mixed',
      reqId: 'm-free',
      name: '업그레이드기록',
    })
    await h.seedList('free', 'mixed', 'm-today')
    const before = await dumpStores(h)
    const parsedBefore = JSON.parse(before)
    const made = await h.ev(`(async()=>{
      const rows = ${before};
      await new Promise((ok, no) => { const q = indexedDB.deleteDatabase('mealthroutine-exercise'); q.onsuccess = ok; q.onerror = () => no(q.error); q.onblocked = () => no(new Error('삭제가 막혔어요')) });
      const db = await new Promise((ok, no) => {
        const q = indexedDB.open('mealthroutine-exercise', ${from});
        q.onupgradeneeded = () => {
          const d = q.result;
          const lists = d.createObjectStore('workoutLists', { keyPath: 'id' });
          lists.createIndex('byOwnerDate', ['ownerId', 'plannedDate']);
          lists.createIndex('byOwnerUpdated', ['ownerId', 'updatedAt']);
          lists.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
          const sessions = d.createObjectStore('workoutSessions', { keyPath: 'id' });
          sessions.createIndex('byOwnerStatus', ['ownerId', 'status']);
          sessions.createIndex('byOwnerStarted', ['ownerId', 'startedAt']);
          sessions.createIndex('byOwnerList', ['ownerId', 'listId']);
          const records = d.createObjectStore('workoutRecords', { keyPath: 'id' });
          records.createIndex('bySession', 'sessionId', { unique: true });
          records.createIndex('byOwnerDate', ['ownerId', 'performedDate']);
          records.createIndex('byOwnerCompleted', ['ownerId', 'completedAt']);
          if (${from} >= 2) {
            const routines = d.createObjectStore('workoutRoutines', { keyPath: 'id' });
            routines.createIndex('byOwnerUpdated', ['ownerId', 'updatedAt']);
            routines.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
          }
          if (${from} >= 3) {
            const meals = d.createObjectStore('mealRecords', { keyPath: 'id' });
            meals.createIndex('byOwnerDate', ['ownerId', 'localDate']);
            meals.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
          }
          if (${from} >= 4) {
            const plans = d.createObjectStore('mealPlans', { keyPath: 'id' });
            plans.createIndex('byOwnerDate', ['ownerId', 'planDate']);
            plans.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
          }
        };
        q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
      });
      const names = ['workoutLists', 'workoutSessions', 'workoutRecords'];
      if (${from} >= 2) names.push('workoutRoutines');
      if (${from} >= 3) names.push('mealRecords');
      if (${from} >= 4) names.push('mealPlans');
      await new Promise((ok, no) => {
        const tx = db.transaction(names, 'readwrite');
        for (const name of ['workoutLists', 'workoutSessions', 'workoutRecords']) for (const row of rows[name]) tx.objectStore(name).put(row);
        if (${from} >= 2) tx.objectStore('workoutRoutines').put({ id: 'rt-keep', ownerId: 'free', requestId: 'rt-1', updatedAt: '2026-01-01T00:00:00.000Z', name: '보존 루틴' });
        if (${from} >= 3) tx.objectStore('mealRecords').put({ id: 'ml-keep', ownerId: 'free', schemaVersion: 1, localDate: '2026-01-01', mealType: 'lunch', foodId: 'dev-food-1', foodName: '보존 식단', portion: 'normal', weightGrams: 100, nutritionSnapshot: { kcal: 153, protein: 3.1, fat: 1, carb: 33 }, nutritionSource: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' }, revision: 1, requestId: 'ml-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
        if (${from} >= 4) tx.objectStore('mealPlans').put({ id: 'mp-keep', ownerId: 'free', schemaVersion: 1, planDate: '2999-01-01', mealType: 'dinner', foodId: 'dev-food-2', foodName: '보존 계획', portion: 'normal', weightGrams: 100, nutritionSnapshot: { kcal: 165, protein: 31, fat: 3.6, carb: 0 }, nutritionSource: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' }, revision: 1, requestId: 'mp-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
        tx.oncomplete = ok; tx.onerror = () => no(tx.error);
      });
      const info = { version: db.version, stores: [...db.objectStoreNames].sort() };
      db.close();
      return info;
    })()`)
    check(
      h,
      `B${from}-1. v${from} 상태의 DB를 만들었다(workoutPlans 없음)`,
      made.version === from &&
        !made.stores.includes('workoutPlans') &&
        made.stores.includes('mealRecords') === from >= 3 &&
        made.stores.includes('mealPlans') === from >= 4,
      j(made),
    )
    const keepOld = (all) =>
      j({
        workoutLists: all.workoutLists,
        workoutRecords: all.workoutRecords,
        workoutSessions: all.workoutSessions,
      })
    await h.go('/records/meal', 200)
    await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
    const upgraded = await schemaInfo(h)
    check(
      h,
      `B${from}-2. 앱이 열면 v${from}이 v6로 올라가고 스키마가 승인된 구조와 같다`,
      j(upgraded) === j(EXPECTED_SCHEMA),
      j(upgraded).slice(0, 200),
    )
    const after = JSON.parse(await dumpStores(h))
    check(
      h,
      `B${from}-3. 기존 목록·세션·완료 기록의 모든 행이 그대로이고 새 저장소(workoutPlans)는 비어 있다` +
        (from >= 2 ? '(루틴 행도 그대로)' : '') +
        (from >= 3 ? '(식단 기록 행도 그대로)' : '') +
        (from >= 4 ? '(식단 계획 행도 그대로)' : ''),
      keepOld(after) === keepOld(parsedBefore) &&
        j(after.workoutPlans) === '[]' &&
        (from < 4
          ? j(after.mealPlans) === '[]'
          : after.mealPlans.length === 1 &&
            after.mealPlans[0].id === 'mp-keep') &&
        (from < 3
          ? j(after.mealRecords) === '[]'
          : after.mealRecords.length === 1 &&
            after.mealRecords[0].id === 'ml-keep') &&
        (from === 1 ||
          (after.workoutRoutines.length === 1 &&
            after.workoutRoutines[0].id === 'rt-keep')),
      `lists ${after.workoutLists.length} records ${after.workoutRecords.length}`,
    )
    const works = await run(
      h,
      `
      const m2 = await import('/src/food/local/indexedDbMealPlanRepository.ts');
      const m3 = await import('/src/exercise/local/indexedDbWorkoutPlanRepository.ts');
      const free = m.createIndexedDbMealRecordRepository('free');
      const c = await free.create({ requestId: 'after-up', localDate: today, mealType: 'dinner', food: fd.DEV_FOODS[3], portion: 'less' });
      const pl = m2.createIndexedDbMealPlanRepository('free');
      const tomorrow = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return wm.toLocalDate(x) })();
      const p = await pl.create({ requestId: 'plan-after-up', planDate: tomorrow, mealType: 'lunch', food: fd.DEV_FOODS[0], portion: 'normal' });
      const wpl = m3.createIndexedDbWorkoutPlanRepository('free');
      const wp = await wpl.create({ requestId: 'wplan-after-up', planDate: tomorrow, draft: { v: 1, day: 'tomorrow', items: [{ itemId: 'i1', exerciseId: 'e1', name: '푸시업', recordType: 'reps', sets: [{ reps: 10 }] }], updatedAt: new Date().toISOString() }, knownExerciseIds: new Set(['e1']) });
      return { created: c.created, planCreated: p.created, workoutPlanCreated: wp.created, workoutPlans: (await wpl.listByDate(tomorrow)).items.length, plans: (await pl.listByDate(tomorrow)).items.length, list: (await free.listByDate(today)).items.map((x) => x.foodName) };
    `,
    )
    check(
      h,
      `B${from}-4. 업그레이드한 DB에서 식단 기록·식단 계획·운동 계획 저장·조회가 동작한다`,
      works.created &&
        works.planCreated &&
        works.workoutPlanCreated &&
        works.workoutPlans === 1 &&
        works.plans === 1 &&
        j(works.list) === j(['카페라테']),
      j(works),
    )
  })
}

// ── C. 화면 흐름(비회원 · 회원 · 계정 전환) ────────────────────────────────────────────
await scenario('C-guest', async (h) => {
  // 비회원: F01 검색·F02 열람은 되고 즐겨찾기·기록 도구는 없다. D01은 로그인 안내다.
  await h.go('/foods', 300)
  await waitH1(h, '음식 검색')
  await mustClick(h, '^검색하기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-item]').length===4`)
  const s = await snap(h)
  check(
    h,
    'C1. 비회원 F01: 개발용 예시 음식 4개가 나오고 "개발용 예시 데이터"를 밝히며 즐겨찾기 별은 없다',
    /개발용 예시 데이터/.test(s.text) &&
      (await h.ev(
        `document.querySelectorAll('[data-food-favorite]').length`,
      )) === 0,
    s.text.slice(0, 160),
  )
  check(
    h,
    'C2. 결과 카드가 F02로 가는 링크다',
    s.links.some((l) => l.h === '/foods/dev-food-1' && /현미밥/.test(l.t)),
    j(s.links),
  )
  await h.go('/foods/dev-food-1', 300)
  await waitH1(h, '현미밥')
  const d = await snap(h)
  check(
    h,
    'C3. 비회원 F02: 100g 기준 153kcal·알레르기 "확인 불가"·출처를 보이고 즐겨찾기·식단 기록 도구는 없다',
    /153kcal/.test(d.text) &&
      /확인 불가/.test(d.text) &&
      /개발용 예시 데이터/.test(d.text) &&
      !d.links.some((l) => /records\/meal/.test(l.h)) &&
      (await h.ev(
        `document.querySelectorAll('[data-food-favorite]').length`,
      )) === 0 &&
      /로그인하면/.test(d.text),
    d.text.slice(0, 200),
  )
  await h.go('/foods/없는음식', 300)
  await mustUntil(
    h,
    `/음식을 찾을 수 없어요/.test(document.querySelector('main').innerText)`,
  )
  check(h, 'C4. 없는 음식 주소는 "찾을 수 없어요"로 안내한다', true)
  await h.go('/records/meal', 300)
  await mustUntil(h, `/로그인/.test(document.querySelector('main').innerText)`)
  const g = await snap(h)
  check(
    h,
    'C5. 비회원 D01은 로그인 안내이고 식단 기록 화면이 보이지 않는다',
    /로그인/.test(g.text) && !/식단 기록하기/.test(g.text),
    g.text.slice(0, 120),
  )
})

await scenario('C-member', async (h) => {
  await h.login('free')
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  const empty = await snap(h)
  check(
    h,
    'C6. D01 빈 상태: 아직 기록 없음·끼니 카드 3개·D02 링크·목표 없음 안내(D01-4), 목표 열량 숫자는 만들지 않는다',
    /아직 기록 없음/.test(empty.text) &&
      (await h.ev(`document.querySelectorAll('[data-meal-card]').length`)) ===
        3 &&
      empty.links.some((l) => l.h === '/records/meal/record') &&
      /아직 정하지 않았어요/.test(empty.text) &&
      empty.links.some((l) => l.h === '/records/meal/goal') &&
      !(await h.ev(`!!document.querySelector('[data-today-kcal]')`)),
    empty.text.slice(0, 200),
  )

  // F01 검색 + 즐겨찾기
  await h.go('/foods', 300)
  await waitH1(h, '음식 검색')
  await h.setVal('#food-query', '샐러드')
  await mustClick(h, '^검색하기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-item]').length===1`)
  check(
    h,
    'C7. F01 검색어 "샐러드"는 그린 샐러드 1건만 찾는다',
    await h.ev(
      `/그린 샐러드/.test(document.querySelector('[data-food-item]').innerText)`,
    ),
  )
  await h.go('/foods', 300)
  await waitH1(h, '음식 검색')
  await mustClick(h, '^검색하기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-item]').length===4`)
  const chickenStar = `[data-food-item]:nth-child(2) button[data-food-favorite]`
  await mustUntil(
    h,
    `document.querySelector(${j(chickenStar)})?.getAttribute('aria-disabled')!=='true'`,
  )
  await clickSel(h, chickenStar)
  await mustUntil(
    h,
    `document.querySelector(${j(chickenStar)})?.getAttribute('aria-pressed')==='true'`,
  )
  const favKey = await h.ev(
    `Object.keys(localStorage).filter(k=>/foodFavorite/.test(k))`,
  )
  check(
    h,
    'C8. F01에서 닭가슴살을 즐겨찾기하면 음식 즐겨찾기 저장소(계정별 localStorage)에 저장된다',
    favKey.length === 1 &&
      /dev-food-2/.test(await h.ev(`localStorage.getItem(${j(favKey[0])})`)),
    j(favKey),
  )

  // F02: 즐겨찾기 상태 공유, 중량 환산, D02 이동
  await h.go('/foods/dev-food-2', 300)
  await waitH1(h, '닭가슴살')
  await mustUntil(
    h,
    `document.querySelector('main header button[data-food-favorite]')?.getAttribute('aria-pressed')==='true'`,
  )
  check(h, 'C9. F02에서도 닭가슴살이 즐겨찾기 상태다(F01과 같은 상태)', true)
  await mustClick(h, '^200g$')
  await mustUntil(
    h,
    `/^330/.test(document.querySelector('[data-food-kcal]')?.innerText ?? '')`,
  )
  const f2 = await snap(h)
  check(
    h,
    'C10. F02 중량 200g 선택 시 열량 330kcal(165×200÷100), 탄수화물 0g은 "정보 없음"이 아니라 0g이다',
    /330/.test(f2.text) &&
      (await h.ev(
        `[...document.querySelectorAll('main tbody tr')].some(r=>/^탄수화물/.test(r.innerText.trim())&&/0g\\s*$/.test(r.innerText.trim()))`,
      )),
    f2.text.slice(0, 200),
  )

  // F02 → D02 (음식이 선택된 채 양 선택 팝업이 열린다)
  await clickSel(h, 'a[aria-label="식단에 기록: 닭가슴살"]')
  await waitPath(h, '^/records/meal/record$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  const dlg = await h.ev(`document.querySelector('[role=dialog]').innerText`)
  check(
    h,
    'C11. F02→D02: 양 선택 팝업이 열리고 적게·보통·많이와 예상 열량, 시안 예시 기준, "끼니를 먼저 골라 주세요"를 보인다',
    /적게/.test(dlg) &&
      /보통/.test(dlg) &&
      /많이/.test(dlg) &&
      /예상 83kcal/.test(dlg) &&
      /예상 248kcal/.test(dlg) &&
      /시안 예시 기준/.test(dlg) &&
      /끼니를 먼저 골라 주세요/.test(dlg),
    dlg.replace(/\s+/g, ' ').slice(0, 260),
  )
  // 끼니 없이 등록해도 저장되지 않는다.
  await mustClick(h, '^등록$', '[role=dialog]')
  await h.sleep(300)
  check(
    h,
    'C12. 끼니를 고르지 않으면 등록해도 저장하지 않는다',
    (await mealStores(h)).length === 0 &&
      !!(await h.ev(`!!document.querySelector('[role=dialog]')`)),
  )
  await mustClick(h, '^점심', '[role=dialog]')
  await mustClick(h, '^많이', '[role=dialog]')
  // 연타: 한 번의 평가 안에서 두 번 눌러도 기록은 하나만 생긴다.
  await h.ev(
    `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>/^등록$/.test(x.innerText.trim()));b.click();b.click()})()`,
  )
  await dialogGone(h)
  await waitRecords(h, 1)
  const afterReg = await mealStores(h)
  const recs1 = await records(h)
  check(
    h,
    'C13. 점심·많이로 등록: 기록 1건만 저장되고(연타해도 중복 없음) 양 150g·248kcal·점심으로 보인다',
    afterReg.length === 1 &&
      afterReg[0].mealType === 'lunch' &&
      afterReg[0].portion === 'more' &&
      afterReg[0].weightGrams === 150 &&
      afterReg[0].ownerId.length > 0 &&
      /닭가슴살/.test(recs1[0]) &&
      /많이 · 150g/.test(recs1[0]) &&
      /248kcal/.test(recs1[0]),
    j({ n: afterReg.length, rec: recs1 }),
  )
  check(
    h,
    'C14. 등록 직후 알림과 주소 정리: ?food= 파라미터가 사라지고 팝업이 다시 열리지 않는다',
    (await h.path()) === '/records/meal/record' &&
      /점심에 “닭가슴살”을\(를\) 등록했어요/.test(
        await h.ev(`document.querySelector('main').innerText`),
      ),
    await h.path(),
  )

  // D02에서 직접 검색·선택 (아침·보통)
  await mustClick(h, '^아침$')
  await h.setVal('#meal-food-query', '현미')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===1`)
  await mustClick(h, '^선택$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  check(
    h,
    'C15. D02에서 이미 고른 끼니(아침)는 팝업에서도 선택 상태다(다시 고르라고 하지 않는다)',
    !/끼니를 먼저 골라 주세요/.test(
      await h.ev(`document.querySelector('[role=dialog]').innerText`),
    ),
  )
  await mustClick(h, '^등록$', '[role=dialog]')
  await dialogGone(h)
  await waitRecords(h, 2)
  const recs2 = await records(h)
  check(
    h,
    'C16. 아침·보통 현미밥 등록: 100g·153kcal이며 오늘 기록이 2건이다',
    recs2.some(
      (t) =>
        /현미밥/.test(t) && /보통\(1인분\) · 100g/.test(t) && /153kcal/.test(t),
    ) && recs2.length === 2,
    j(recs2),
  )
  // 즐겨찾기 탭: 닭가슴살만
  await h.setVal('#meal-food-query', '')
  await mustClick(h, '^즐겨찾기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===1`)
  check(
    h,
    'C17. D02 즐겨찾기 탭은 즐겨찾기한 음식(닭가슴살)만 보인다',
    await h.ev(
      `document.querySelector('[data-food-pick]').getAttribute('data-food-pick')==='dev-food-2'`,
    ),
  )

  // 수정
  await clickSel(h, 'button[aria-label="수정: 현미밥"]')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  const editDlg = await h.ev(
    `document.querySelector('[role=dialog]').innerText`,
  )
  check(
    h,
    'C18. 수정 팝업: 제목이 양 수정이고 끼니 선택은 없으며 영양값은 처음 기록 그대로라는 안내가 있다',
    /양 수정/.test(editDlg) &&
      !(await h.ev(
        `!!document.querySelector('[role=dialog] [aria-label="끼니"]')`,
      )) &&
      /처음 기록했을 때의 값/.test(editDlg),
    editDlg.replace(/\s+/g, ' ').slice(0, 200),
  )
  await mustClick(h, '^많이', '[role=dialog]')
  await mustClick(h, '^수정 저장$', '[role=dialog]')
  await dialogGone(h)
  await mustUntil(
    h,
    `[...document.querySelectorAll('[data-meal-record]')].some(e=>/현미밥/.test(e.innerText)&&/많이 · 150g/.test(e.innerText)&&/230kcal/.test(e.innerText))`,
  )
  const edited = (await mealStores(h)).find((r) => r.foodName === '현미밥')
  check(
    h,
    'C19. 수정 저장: 현미밥이 많이·150g·230kcal로 바뀌고 revision 2, 스냅샷은 그대로다',
    edited.revision === 2 &&
      edited.weightGrams === 150 &&
      edited.nutritionSnapshot.kcal === 153,
    j(edited),
  )

  // 삭제: 취소 후 확인
  await clickSel(h, 'button[aria-label="삭제: 현미밥"]')
  await mustUntil(
    h,
    `!!document.querySelector('[role=group][aria-label="현미밥 삭제 확인"]')`,
  )
  await mustClick(h, '^취소$', '[role=group][aria-label="현미밥 삭제 확인"]')
  await h.sleep(200)
  check(
    h,
    'C20. 삭제 확인에서 취소하면 기록이 그대로다',
    (await mealStores(h)).length === 2 &&
      !(await h.ev(
        `!!document.querySelector('[role=group][aria-label="현미밥 삭제 확인"]')`,
      )),
  )
  await clickSel(h, 'button[aria-label="삭제: 현미밥"]')
  await mustClick(
    h,
    '^삭제하기$',
    '[role=group][aria-label="현미밥 삭제 확인"]',
  )
  await waitRecords(h, 1)
  check(
    h,
    'C21. 삭제하기를 누르면 현미밥 기록만 지워진다(닭가슴살은 남음)',
    j((await mealStores(h)).map((r) => r.foodName)) === j(['닭가슴살']),
    j((await mealStores(h)).map((r) => r.foodName)),
  )

  // D02 → D01
  await mustClick(h, '^오늘 기록 저장$')
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustUntil(h, `!!document.querySelector('[data-today-kcal]')`)
  const dash = await snap(h)
  check(
    h,
    'C22. D01: 오늘 섭취 248kcal(닭가슴살 많이), 오늘 기록함, 점심 카드에 닭가슴살, 아침 카드는 비어 있음',
    (await h.ev(`document.querySelector('[data-today-kcal]').innerText`)) ===
      '248kcal' &&
      /오늘 기록함/.test(dash.text) &&
      (await h.ev(
        `/닭가슴살/.test(document.querySelector('[data-meal-card=lunch]').innerText)&&/아직 기록하지 않았어요/.test(document.querySelector('[data-meal-card=breakfast]').innerText)`,
      )),
    dash.text.slice(0, 240),
  )

  // D01 → D01-2 → D02(수정) → 이전
  await mustClick(h, '^점심')
  await settleScreen(h, { path: '/records/meal/lunch', h1: '점심 식단' })
  await waitRecords(h, 1)
  const detail = await snap(h)
  check(
    h,
    'C23. D01-2 점심 상세: 합계 248kcal·닭가슴살 기록·끼니 전환 링크·점심 음식 추가 링크',
    (await h.ev(`document.querySelector('[data-meal-kcal]').innerText`)) ===
      '248kcal' &&
      detail.links.some((l) => l.h === '/records/meal/breakfast') &&
      detail.links.some((l) => l.h === '/records/meal/record?meal=lunch'),
    detail.text.slice(0, 200),
  )
  await mustClick(h, '^수정$')
  await waitPath(h, '^/records/meal/record$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  check(
    h,
    'C24. D01-2에서 수정을 누르면 D02가 열리고 해당 기록의 양 수정 팝업이 바로 열린다',
    /양 수정/.test(
      await h.ev(`document.querySelector('[role=dialog]').innerText`),
    ) && /edit=/.test(await h.path()),
    await h.path(),
  )
  await mustClick(h, '^취소$', '[role=dialog]')
  await dialogGone(h)
  check(
    h,
    'C25. 팝업을 닫으면 ?edit= 파라미터가 사라지고 다시 열리지 않는다',
    (await h.path()) === '/records/meal/record',
    await h.path(),
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/meal/lunch$')
  check(h, 'C26. D02의 "이전"은 호출한 D01-2(점심 상세)로 돌아간다', true)

  // 잘못된 끼니
  await h.go('/records/meal/snack', 300)
  await mustUntil(
    h,
    `/없는 끼니예요/.test(document.querySelector('main').innerText)`,
  )
  check(h, 'C27. 잘못된 끼니 주소는 "없는 끼니예요"로 안내한다', true)

  // 새로고침해도 기록이 남는다
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustUntil(
    h,
    `document.querySelector('[data-today-kcal]')?.innerText==='248kcal'`,
  )
  check(h, 'C28. 새로고침 후에도 오늘 기록(248kcal)이 유지된다', true)
  const s390 = await snap(h)
  check(
    h,
    'C29. 390px 폭에서 가로 넘침이 없다(D01)',
    s390.over <= 0,
    String(s390.over),
  )
  await h.go('/records/meal/record', 300)
  await waitH1(h, '오늘 식단 기록')
  const s390b = await snap(h)
  check(
    h,
    'C30. 390px 폭에서 가로 넘침이 없다(D02)',
    s390b.over <= 0,
    String(s390b.over),
  )
  check(
    h,
    'C31. D02는 하단 탭을 그리지 않는다(집중 화면)',
    !(await h.ev(
      `!!document.querySelector('nav[aria-label="하단 메뉴"], nav[aria-label*="하단"]')`,
    )),
  )

  // 계정 전환: 다른 계정에는 이 기록·즐겨찾기가 보이지 않는다.
  await logout(h)
  await h.login('full')
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  const other = await snap(h)
  check(
    h,
    'C32. 다른 계정(full)의 D01에는 free 계정의 기록이 보이지 않는다(아직 기록 없음)',
    /아직 기록 없음/.test(other.text) &&
      !(await h.ev(`!!document.querySelector('[data-today-kcal]')`)),
    other.text.slice(0, 160),
  )
  await h.go('/foods', 300)
  await waitH1(h, '음식 검색')
  await mustClick(h, '^검색하기$')
  await mustUntil(h, `document.querySelectorAll('[data-food-item]').length===4`)
  await mustUntil(
    h,
    `document.querySelector('[data-food-item]:nth-child(2) button[data-food-favorite]')?.getAttribute('aria-pressed')==='false'`,
  )
  check(
    h,
    'C33. 다른 계정에서는 닭가슴살이 즐겨찾기가 아니다(계정별 분리)',
    true,
  )
  // 운동 데이터 영향 없음
  const exCheck = JSON.parse(await dumpStores(h))
  check(
    h,
    'C34. 식단 흐름 전체에서 운동 저장소(목록·세션·기록·루틴)에 행이 생기지 않았다',
    exCheck.workoutLists.length === 0 &&
      exCheck.workoutRecords.length === 0 &&
      exCheck.workoutSessions.length === 0 &&
      exCheck.workoutRoutines.length === 0,
  )
  check(
    h,
    'C35. 스키마가 승인된 v6다',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
  )
})
