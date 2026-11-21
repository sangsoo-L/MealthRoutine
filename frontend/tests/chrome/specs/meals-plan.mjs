// [chrome 회귀] FAST-04B: 내일 식단 계획(D02-1) + IndexedDB v4·v5(mealPlans) + 실제 섭취 기록(mealRecords)과의 분리
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only meals-plan`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 저장소 시험은 앱과 같은 저장소 코드를 페이지 안에서 부르고(자정 경계는 저장소의 시계 주입으로),
// 화면 시험은 실제 클릭으로 진행한다. 기대값은 개발용 예시 음식(스토리보드 foodDB)의 100g 값에서 손으로 계산한다
// (현미밥 153kcal, 닭가슴살 165kcal, 카페라테 60kcal). v1·v2·v3 → v4 업그레이드는 meals-food 스크립트의 B 시나리오가 검증한다. 앱 소스를 수정하지 않는다.
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
// 새 프로필의 첫 화면은 개발 서버가 모듈을 받느라 오래 걸릴 수 있어 화면 안정 대기 한도를 늘린다(조건이 맞으면 바로 넘어간다).
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
  const mp = await import('/src/food/local/indexedDbMealPlanRepository.ts');
  const fd = await import('/src/food/dev/devFoodSamples.ts');
  const wm = await import('/src/exercise/workoutModel.ts');
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return wm.toLocalDate(x) };
  const tomorrow = day(-1);
  const err = async (fn) => { try { await fn(); return 'no-error' } catch (e) { return (e.reason ?? e.name) + (e.code ? ':' + e.code : '') + (e.currentRevision ? '@' + e.currentRevision : '') } };
`
const run = (h, body) => h.ev(`(async()=>{ ${PRE} ${body} })()`)

const pad = (n) => String(n).padStart(2, '0')
/** 오늘에서 n일 전의 로컬 날짜(음수는 미래). 앱의 toLocalDate와 같은 규칙이다. */
const day = (n) => {
  const x = new Date()
  x.setDate(x.getDate() - n)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
const TOMORROW = day(-1)

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
const items = (h) =>
  h.ev(
    `[...document.querySelectorAll('[data-meal-record]')].map(e=>e.innerText.replace(/\\s+/g,' ').trim())`,
  )
const waitItems = (h, n) =>
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
const waitText = (h, re) =>
  mustUntil(h, `${re}.test(document.querySelector('main').innerText)`, 80)
const logout = async (h) => {
  await h.ev(`sessionStorage.clear()`)
  await h.go('/home', 900)
}
const stores = async (h) => JSON.parse(await dumpStores(h))
const exerciseRows = (all) =>
  j({
    workoutLists: all.workoutLists,
    workoutRecords: all.workoutRecords,
    workoutSessions: all.workoutSessions,
    workoutRoutines: all.workoutRoutines,
  })

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
  // 실제 섭취 기록(mealRecords)을 먼저 만들어 두고, 계획 작업 뒤에도 그대로인지 비교한다.
  await run(
    h,
    `
    const rec = m.createIndexedDbMealRecordRepository('free');
    await rec.create({ requestId: 'r-today', localDate: day(0), mealType: 'breakfast', food: fd.DEV_FOODS[3], portion: 'normal' });
    await rec.create({ requestId: 'r-tom', localDate: tomorrow, mealType: 'lunch', food: fd.DEV_FOODS[0], portion: 'normal' });
    return true;
  `,
  )
  const before = await stores(h)
  const mealBefore = j(before.mealRecords)
  const exBefore = exerciseRows(before)

  const r = await run(
    h,
    `
    const free = mp.createIndexedDbMealPlanRepository('free');
    const full = mp.createIndexedDbMealPlanRepository('full');
    const rice = fd.DEV_FOODS[0];
    const out = {};
    const c1 = await free.create({ requestId: 'p-1', planDate: tomorrow, mealType: 'lunch', food: rice, portion: 'normal' });
    out.c1 = { created: c1.created, rev: c1.plan.revision, grams: c1.plan.weightGrams, owner: c1.plan.ownerId, date: c1.plan.planDate === tomorrow, snap: JSON.stringify(c1.plan.nutritionSnapshot) === JSON.stringify(rice.per100g), src: c1.plan.nutritionSource.kind, hasLocalDate: 'localDate' in c1.plan };
    const again = await free.create({ requestId: 'p-1', planDate: tomorrow, mealType: 'lunch', food: rice, portion: 'normal' });
    out.again = { created: again.created, sameId: again.plan.id === c1.plan.id };
    out.conflict = await err(() => free.create({ requestId: 'p-1', planDate: tomorrow, mealType: 'lunch', food: rice, portion: 'more' }));
    out.countAfterDup = (await free.listByDate(tomorrow)).items.length;
    out.badPortion = await err(() => free.create({ requestId: 'p-2', planDate: tomorrow, mealType: 'lunch', food: rice, portion: 'huge' }));
    out.badMeal = await err(() => free.create({ requestId: 'p-3', planDate: tomorrow, mealType: 'snack', food: rice, portion: 'normal' }));
    out.badDate = await err(() => free.create({ requestId: 'p-4', planDate: '2026-02-31', mealType: 'lunch', food: rice, portion: 'normal' }));
    out.badRequest = await err(() => free.create({ requestId: '공백 있음', planDate: tomorrow, mealType: 'lunch', food: rice, portion: 'normal' }));
    out.todayDate = await err(() => free.create({ requestId: 'p-5', planDate: day(0), mealType: 'lunch', food: rice, portion: 'normal' }));
    out.pastDate = await err(() => free.create({ requestId: 'p-6', planDate: day(3), mealType: 'lunch', food: rice, portion: 'normal' }));
    out.countAfterInvalid = (await free.listByDate(tomorrow)).items.length;
    const u1 = await free.update(c1.plan.id, { expectedRevision: 1, portion: 'more' });
    out.u1 = { rev: u1.revision, grams: u1.weightGrams, portion: u1.portion, snap: JSON.stringify(u1.nutritionSnapshot) === JSON.stringify(rice.per100g), created: u1.createdAt === c1.plan.createdAt, date: u1.planDate === tomorrow };
    out.stale = await err(() => free.update(c1.plan.id, { expectedRevision: 1, portion: 'less' }));
    out.updateInvalid = await err(() => free.update(c1.plan.id, { expectedRevision: 2, portion: 'huge' }));
    out.afterBad = (await free.get(c1.plan.id)).portion;
    out.fullList = (await full.listByDate(tomorrow)).items.length;
    out.fullGet = (await full.get(c1.plan.id)) === null;
    out.fullUpdate = await err(() => full.update(c1.plan.id, { expectedRevision: 2, portion: 'less' }));
    out.fullDelete = await err(() => full.delete(c1.plan.id));
    out.stillThere = (await free.get(c1.plan.id))?.portion;
    const f1 = await full.create({ requestId: 'p-1', planDate: tomorrow, mealType: 'dinner', food: fd.DEV_FOODS[1], portion: 'less' });
    out.fullOwn = { created: f1.created, ownerId: f1.plan.ownerId, freeStill: (await free.listByDate(tomorrow)).items.length, fullCount: (await full.listByDate(tomorrow)).items.length };
    out.staleDelete = await err(() => free.delete(c1.plan.id, { expectedRevision: 1 }));
    await free.delete(c1.plan.id, { expectedRevision: 2 });
    out.afterDelete = (await free.get(c1.plan.id)) === null;
    out.deleteAgain = await err(() => free.delete(c1.plan.id));
    out.fullAfterFreeDelete = (await full.listByDate(tomorrow)).items.length;
    return out;
  `,
  )
  check(
    h,
    'P1. 계획 만들기: revision 1, planDate(내일), 양 구분에서 중량(보통 100g), 소유자, 영양 스냅샷·출처(dev-sample) 저장, 날짜 필드는 planDate뿐이다',
    r.c1.created &&
      r.c1.rev === 1 &&
      r.c1.grams === 100 &&
      r.c1.owner === 'free' &&
      r.c1.date &&
      r.c1.snap &&
      r.c1.src === 'dev-sample' &&
      !r.c1.hasLocalDate,
    j(r.c1),
  )
  check(
    h,
    'P2. 중복 저장 방지: 같은 요청 id·같은 내용은 처음 계획을 돌려주고(새로 만들지 않음), 다른 내용은 conflict(requestConflict)다',
    !r.again.created &&
      r.again.sameId &&
      r.conflict === 'conflict:requestConflict' &&
      r.countAfterDup === 1,
    j({ again: r.again, conflict: r.conflict, n: r.countAfterDup }),
  )
  check(
    h,
    'P3. 잘못된 입력(양 구분·끼니·날짜·요청 id)은 validation이고 아무것도 저장하지 않는다',
    r.badPortion.startsWith('validation') &&
      r.badMeal.startsWith('validation') &&
      r.badDate.startsWith('validation') &&
      r.badRequest.startsWith('validation') &&
      r.countAfterInvalid === 1,
    j(r),
  )
  check(
    h,
    'P4. 계획 날짜가 오늘이거나 지났으면 validation:invalidPlanDate이고 저장하지 않는다',
    r.todayDate === 'validation:invalidPlanDate' &&
      r.pastDate === 'validation:invalidPlanDate',
    j({ today: r.todayDate, past: r.pastDate }),
  )
  check(
    h,
    'P5. 수정: 양·중량·revision만 바뀌고 영양 스냅샷·createdAt·planDate는 그대로이며, 오래된 revision은 conflict(revisionMismatch@2), 잘못된 값은 값을 바꾸지 않는다',
    r.u1.rev === 2 &&
      r.u1.grams === 150 &&
      r.u1.portion === 'more' &&
      r.u1.snap &&
      r.u1.created &&
      r.u1.date &&
      r.stale === 'conflict:revisionMismatch@2' &&
      r.updateInvalid.startsWith('validation') &&
      r.afterBad === 'more',
    j({ u1: r.u1, stale: r.stale, bad: r.updateInvalid, after: r.afterBad }),
  )
  check(
    h,
    'P6. 계정 격리: full 계정은 free 계획을 읽거나 수정·삭제할 수 없고(notFound, 지워지지 않음), 같은 요청 id로 자기 계획을 따로 만든다',
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
    'P7. 삭제: 오래된 revision은 conflict이고, 맞으면 지워지며 다시 지우면 notFound다. 다른 계정 계획에는 영향이 없다',
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

  // 자정 경계: 저장소의 시계를 바꿔 "자정이 지난 뒤"를 재현한다.
  const mid = await run(
    h,
    `
    const noon = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x };
    const before = mp.createIndexedDbMealPlanRepository('free', { now: () => noon(0) });
    const after = mp.createIndexedDbMealPlanRepository('free', { now: () => noon(-1) });
    const out = {};
    const c = await before.create({ requestId: 'mid-1', planDate: tomorrow, mealType: 'breakfast', food: fd.DEV_FOODS[3], portion: 'normal' });
    out.created = c.created;
    // 자정이 지났다: 계획 날짜(내일)가 오늘이 되었다.
    out.updateAfter = await err(() => after.update(c.plan.id, { expectedRevision: 1, portion: 'more' }));
    out.createAfter = await err(() => after.create({ requestId: 'mid-2', planDate: tomorrow, mealType: 'dinner', food: fd.DEV_FOODS[1], portion: 'normal' }));
    out.stillThere = (await after.listByDate(tomorrow)).items.map((p) => [p.foodName, p.revision, p.portion]);
    // 자정이 지나도 실제 섭취 기록으로 바뀌지 않는다.
    const rec = m.createIndexedDbMealRecordRepository('free');
    out.recordsOnThatDay = (await rec.listByDate(tomorrow)).items.map((r) => r.foodName);
    // 삭제는 정리용으로 허용한다.
    await after.delete(c.plan.id);
    out.deleted = (await after.listByDate(tomorrow)).items.length === 0;
    return out;
  `,
  )
  check(
    h,
    'P8. 자정 경계: 자정이 지나 계획 날짜가 오늘이 되면 새 계획·수정은 invalidPlanDate로 거부되고, 계획은 그대로 남으며 실제 섭취 기록으로 바뀌지 않는다(삭제는 가능)',
    mid.created &&
      mid.updateAfter === 'validation:invalidPlanDate' &&
      mid.createAfter === 'validation:invalidPlanDate' &&
      j(mid.stillThere) === j([['카페라테', 1, 'normal']]) &&
      j(mid.recordsOnThatDay) === j(['현미밥']) &&
      mid.deleted,
    j(mid),
  )

  // 손상 행은 건너뛰고 정상 계획만 보인다.
  const corrupt = await run(
    h,
    `
    const free = mp.createIndexedDbMealPlanRepository('free');
    await free.create({ requestId: 'ok-1', planDate: tomorrow, mealType: 'lunch', food: fd.DEV_FOODS[2], portion: 'normal' });
    const db = await new Promise((ok, no) => { const q = indexedDB.open('mealthroutine-exercise'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) });
    await new Promise((ok, no) => { const tx = db.transaction('mealPlans', 'readwrite'); tx.objectStore('mealPlans').put({ id: 'bad-p', ownerId: 'free', planDate: tomorrow, requestId: 'bad-pr', mealType: 'brunch' }); tx.oncomplete = ok; tx.onerror = () => no(tx.error) });
    db.close();
    const res = await free.listByDate(tomorrow);
    return { names: res.items.map((x) => x.foodName), skipped: res.skippedCount };
  `,
  )
  check(
    h,
    'P9. 손상된 행은 건너뛰고 정상 계획(그린 샐러드)만 보이며 건너뛴 수를 알린다',
    j(corrupt.names) === j(['그린 샐러드']) && corrupt.skipped === 1,
    j(corrupt),
  )

  // 계획 작업 전체가 실제 섭취 기록·운동 데이터를 건드리지 않았다.
  const after = await stores(h)
  check(
    h,
    'P10. 계획 생성·수정·삭제·자정 경계 작업 뒤에도 실제 섭취 기록(mealRecords)의 모든 행과 운동 저장소의 모든 행이 그대로다',
    j(after.mealRecords) === mealBefore &&
      exerciseRows(after) === exBefore &&
      after.mealRecords.length === 2,
    `meal ${after.mealRecords.length}`,
  )
  check(
    h,
    'P11. 스키마가 승인된 v6다(mealPlans·workoutPlans 포함, mealPlans: byOwnerDate(planDate)·byOwnerRequest(unique), 기존 저장소·인덱스 그대로)',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
    j(await schemaInfo(h)).slice(0, 200),
  )
})

// ── C. 화면 흐름 ─────────────────────────────────────────────────────────────────────
await scenario('C-plan-flow', async (h) => {
  await h.login('free')
  // 실제 섭취 기록: 오늘 카페라테(60kcal), 어제 현미밥.
  await run(
    h,
    `
    const rec = m.createIndexedDbMealRecordRepository('free');
    await rec.create({ requestId: 'c-today', localDate: day(0), mealType: 'breakfast', food: fd.DEV_FOODS[3], portion: 'normal' });
    await rec.create({ requestId: 'c-y', localDate: day(1), mealType: 'lunch', food: fd.DEV_FOODS[0], portion: 'normal' });
    return true;
  `,
  )
  const mealBefore = j((await stores(h)).mealRecords)

  // D01 → D02-1
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/아직 계획한 음식이 없어요/')
  const d01 = await snap(h)
  check(
    h,
    'Q1. D01: 내일 식단 계획 행에 "준비 중"이 없고 계획 없음 안내("실제 섭취 아님" 표시)와 D02-1 링크가 있다',
    d01.links.some((l) => l.h === '/records/meal/plan') &&
      (await h.ev(
        `(()=>{const t=document.querySelector('[role=group][aria-label="내일 식단 계획"]').innerText;return !/준비 중/.test(t)&&/실제 섭취 아님/.test(t)&&/아직 계획한 음식이 없어요/.test(t)})()`,
      )),
    d01.text.slice(0, 200),
  )
  await mustClick(h, '내일 계획하기')
  await waitPath(h, '^/records/meal/plan$')
  await waitH1(h, '내일 식단 계획')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===4`)
  await waitText(h, '/아직 계획하지 않았어요/')
  const empty = await snap(h)
  check(
    h,
    'Q2. D02-1: 내일 계획 배지·제목·계획 날짜(내일)·개발용 예시 데이터 표시가 있고 하단 탭이 없다(집중 화면)',
    /내일 계획 · 실제 섭취 아님/.test(empty.text) &&
      new RegExp(`계획 날짜 ${TOMORROW}`).test(empty.text) &&
      /개발용 예시 데이터/.test(empty.text) &&
      /아직 계획하지 않았어요/.test(empty.text) &&
      !(await h.ev(
        `!!document.querySelector('nav[aria-label="하단 메뉴"], nav[aria-label*="하단"]')`,
      )),
    empty.text.slice(0, 220),
  )

  // 계획 추가: 점심 · 현미밥 · 많이(150g)
  await mustClick(h, '^점심$')
  await h.setVal('#meal-food-query', '현미')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===1`)
  await mustClick(h, '^선택$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  const dlg = await h.ev(`document.querySelector('[role=dialog]').innerText`)
  check(
    h,
    'Q3. 양 선택 팝업은 계획 문구("얼마나 먹을지")를 쓰고 이미 고른 끼니(점심)는 다시 묻지 않는다',
    /얼마나 먹을지/.test(dlg) && !/끼니를 먼저 골라 주세요/.test(dlg),
    dlg.replace(/\s+/g, ' ').slice(0, 160),
  )
  await mustClick(h, '^많이', '[role=dialog]')
  // 연타: 한 번의 평가 안에서 두 번 눌러도 계획은 하나만 생긴다.
  await h.ev(
    `(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(x=>/^등록$/.test(x.innerText.trim()));b.click();b.click()})()`,
  )
  await dialogGone(h)
  await waitItems(h, 1)
  const afterAdd = await stores(h)
  const it1 = await items(h)
  check(
    h,
    'Q4. 점심·많이로 계획 등록: 계획 1건만 저장되고(연타해도 중복 없음) 150g·230kcal로 보이며 알림은 "내일 점심 계획"이다',
    afterAdd.mealPlans.length === 1 &&
      afterAdd.mealPlans[0].planDate === TOMORROW &&
      afterAdd.mealPlans[0].mealType === 'lunch' &&
      afterAdd.mealPlans[0].portion === 'more' &&
      afterAdd.mealPlans[0].weightGrams === 150 &&
      /현미밥/.test(it1[0]) &&
      /많이 · 150g/.test(it1[0]) &&
      /230kcal/.test(it1[0]) &&
      /내일 점심 계획에 “현미밥”을\(를\) 추가했어요/.test(
        await h.ev(`document.querySelector('main').innerText`),
      ),
    j({ plans: afterAdd.mealPlans.length, item: it1 }),
  )
  check(
    h,
    'Q5. 헤더에 "내일 계획 1개 · 예상 230kcal"(실제 기록이 아니라 예상)로 표시된다',
    /내일 계획 1개 · 예상 230kcal/.test(
      await h.ev(`document.querySelector('main').innerText`),
    ),
  )

  // 주소로 음식·끼니를 미리 고른 채 열기: 저녁 · 닭가슴살 · 보통
  await h.go('/records/meal/plan?meal=dinner&food=dev-food-2', 300)
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  await mustClick(h, '^등록$', '[role=dialog]')
  await dialogGone(h)
  await waitItems(h, 2)
  check(
    h,
    'Q6. ?food=·?meal=로 열면 음식·끼니가 골라진 팝업이 열리고 등록하면 계획이 2건이 되며 음식 파라미터(food)가 주소에서 정리된다',
    (await stores(h)).mealPlans.length === 2 && !/food=/.test(await h.path()),
    await h.path(),
  )

  // 수정: 현미밥 → 적게(50g)
  await clickSel(h, 'button[aria-label="수정: 현미밥"]')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  const editDlg = await h.ev(
    `document.querySelector('[role=dialog]').innerText`,
  )
  check(
    h,
    'Q7. 수정 팝업: 제목이 양 수정이고 끼니 선택은 없으며 영양값은 처음 기록 그대로라는 안내가 있다',
    /양 수정/.test(editDlg) &&
      !(await h.ev(
        `!!document.querySelector('[role=dialog] [aria-label="끼니"]')`,
      )) &&
      /처음 기록했을 때의 값/.test(editDlg),
    editDlg.replace(/\s+/g, ' ').slice(0, 200),
  )
  await mustClick(h, '^적게', '[role=dialog]')
  await mustClick(h, '^수정 저장$', '[role=dialog]')
  await dialogGone(h)
  await mustUntil(
    h,
    `[...document.querySelectorAll('[data-meal-record]')].some(e=>/현미밥/.test(e.innerText)&&/적게 · 50g/.test(e.innerText)&&/77kcal/.test(e.innerText))`,
  )
  const edited = (await stores(h)).mealPlans.find(
    (p) => p.foodName === '현미밥',
  )
  check(
    h,
    'Q8. 수정 저장: 현미밥이 적게·50g·77kcal로 바뀌고 revision 2, 스냅샷·계획 날짜는 그대로다',
    edited.revision === 2 &&
      edited.weightGrams === 50 &&
      edited.nutritionSnapshot.kcal === 153 &&
      edited.planDate === TOMORROW,
    j(edited),
  )

  // 삭제: 취소 후 확인
  await clickSel(h, 'button[aria-label="삭제: 닭가슴살"]')
  await mustUntil(
    h,
    `!!document.querySelector('[role=group][aria-label="닭가슴살 삭제 확인"]')`,
  )
  await mustClick(h, '^취소$', '[role=group][aria-label="닭가슴살 삭제 확인"]')
  await h.sleep(200)
  check(
    h,
    'Q9. 삭제 확인에서 취소하면 계획이 그대로다',
    (await stores(h)).mealPlans.length === 2,
  )
  await clickSel(h, 'button[aria-label="삭제: 닭가슴살"]')
  await mustClick(
    h,
    '^삭제하기$',
    '[role=group][aria-label="닭가슴살 삭제 확인"]',
  )
  await waitItems(h, 1)
  const afterDelete = await stores(h)
  check(
    h,
    'Q10. 삭제하기를 누르면 닭가슴살 계획만 지워지고(현미밥 계획은 남음) 실제 섭취 기록은 그대로다',
    j(afterDelete.mealPlans.map((p) => p.foodName)) === j(['현미밥']) &&
      j(afterDelete.mealRecords) === mealBefore,
  )
  // 닭가슴살을 다시 계획해 D01 확인용으로 두 건을 유지한다(저녁 · 보통 165kcal).
  await mustClick(h, '^저녁$')
  await h.setVal('#meal-food-query', '닭가슴')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===1`)
  await mustClick(h, '^선택$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  await mustClick(h, '^등록$', '[role=dialog]')
  await dialogGone(h)
  await waitItems(h, 2)

  // 새로고침해도 계획이 남는다
  await h.go('/records/meal/plan', 300)
  await waitH1(h, '내일 식단 계획')
  await waitItems(h, 2)
  check(
    h,
    'Q11. 새로고침 후에도 계획 2건이 유지된다(예상 242kcal)',
    /예상 242kcal/.test(await h.ev(`document.querySelector('main').innerText`)),
  )
  const s390 = await snap(h)
  check(
    h,
    'Q12. 390px 폭에서 가로 넘침이 없다(D02-1)',
    s390.over <= 0,
    String(s390.over),
  )

  // 계획 저장 → D01 (계획은 건수·예상만, 실제 섭취에 합산되지 않는다)
  await mustClick(h, '^계획 마치기$')
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustUntil(h, `!!document.querySelector('[data-today-kcal]')`)
  const dash = await snap(h)
  check(
    h,
    'Q13. D01: 오늘 섭취는 실제 기록(카페라테 60kcal)뿐이다(계획 합산 없음), 내일 계획 행은 "계획 2개 · 예상 242kcal"·"실제 섭취 아님"·"계획 보기"다',
    (await h.ev(`document.querySelector('[data-today-kcal]').innerText`)) ===
      '60kcal' &&
      (await h.ev(
        `(()=>{const t=document.querySelector('[role=group][aria-label="내일 식단 계획"]').innerText.replace(/\\s+/g,' ');return /계획 2개 · 예상 242kcal/.test(t)&&/실제 섭취 아님/.test(t)&&/계획 보기/.test(t)})()`,
      )),
    dash.text.slice(0, 240),
  )
  check(
    h,
    'Q14. D01 끼니 카드(실제 기록)에는 계획이 나타나지 않는다(점심·저녁은 아직 기록하지 않았어요)',
    await h.ev(
      `(()=>{const c=m=>document.querySelector('[data-meal-card='+m+']').innerText;return /카페라테/.test(c('breakfast'))&&/아직 기록하지 않았어요/.test(c('lunch'))&&/아직 기록하지 않았어요/.test(c('dinner'))&&!/현미밥|닭가슴살/.test(document.querySelector('[data-meal-card=lunch]').innerText+document.querySelector('[data-meal-card=dinner]').innerText)})()`,
    ),
  )

  // D01-1~3, D03, D03-1: 계획이 섞이지 않는다.
  await h.go('/records/meal/lunch', 300)
  await waitH1(h, '점심 식단')
  await waitText(h, '/아직 점심 기록이 없어요/')
  check(
    h,
    'Q15. D01-2 점심 상세: 내일 점심 계획(현미밥)이 실제 기록으로 보이지 않는다(점심 기록 없음)',
    (await h.ev(`document.querySelectorAll('[data-meal-record]').length`)) ===
      0,
  )
  await h.go('/records/meal/list', 300)
  await settleScreen(h, { path: '/records/meal/list', h1: '식단 리스트' })
  await mustUntil(h, `!!document.querySelector('[data-week-summary]')`)
  const summary = await h.ev(
    `document.querySelector('[data-week-summary]').innerText`,
  )
  const tomorrowButton = await h.ev(
    `document.querySelector('button[data-day="${TOMORROW}"]')?.getAttribute('aria-disabled')`,
  )
  check(
    h,
    'Q16. D03: 기록한 날 수에 내일 계획이 들어가지 않고(오늘·어제 = 2일 이하), 내일 날짜 버튼은 비활성이며 오늘 카드에는 카페라테만 있다',
    !/ 3일/.test(summary) &&
      (tomorrowButton === 'true' || tomorrowButton === null) &&
      /카페라테/.test(
        await h.ev(`document.querySelector('[data-day-card]').innerText`),
      ) &&
      !/현미밥|닭가슴살/.test(
        await h.ev(`document.querySelector('[data-day-card]').innerText`),
      ),
    summary,
  )
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/기록한 날 2일/')
  check(
    h,
    'Q17. D01 "기록한 날"은 실제 기록이 있는 오늘·어제 2일이다(계획 날짜는 세지 않음)',
    true,
  )
  await h.go('/records/meal/previous', 300)
  await mustUntil(h, `!!document.querySelector('[data-day-kcal]')`)
  check(
    h,
    'Q18. D03-1: 가장 최근 지난 기록(어제)에는 실제 기록(현미밥 153kcal)만 있고 계획은 없다',
    (await h.ev(`document.querySelector('[data-day-kcal]').innerText`)) ===
      '153kcal',
  )

  // 오늘 날짜가 된 계획(자정이 지난 뒤)을 재현: 어제 시계로 오늘 날짜 계획을 만든다 → 어디에도 실제 섭취로 나타나지 않는다.
  await run(
    h,
    `
    const noonYesterday = new Date(); noonYesterday.setDate(noonYesterday.getDate() - 1); noonYesterday.setHours(12, 0, 0, 0);
    const old = mp.createIndexedDbMealPlanRepository('free', { now: () => noonYesterday });
    await old.create({ requestId: 'arrived-1', planDate: day(0), mealType: 'dinner', food: fd.DEV_FOODS[1], portion: 'more' });
    return true;
  `,
  )
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustUntil(h, `!!document.querySelector('[data-today-kcal]')`)
  check(
    h,
    'Q19. 계획 날짜가 오늘이 된 계획이 있어도 D01 오늘 섭취는 그대로 60kcal이고 저녁 카드는 비어 있다(자동으로 실제 섭취가 되지 않음)',
    (await h.ev(`document.querySelector('[data-today-kcal]').innerText`)) ===
      '60kcal' &&
      (await h.ev(
        `/아직 기록하지 않았어요/.test(document.querySelector('[data-meal-card=dinner]').innerText)`,
      )),
  )
  await h.go('/records/meal/dinner', 300)
  await waitH1(h, '저녁 식단')
  await waitText(h, '/아직 저녁 기록이 없어요/')
  check(
    h,
    'Q20. D01-3 저녁 상세에도 오늘 날짜가 된 계획이 실제 기록으로 보이지 않는다',
    true,
  )
  check(
    h,
    'Q21. 그 계획은 계획 저장소에만 있고 mealRecords는 처음 그대로다',
    j((await stores(h)).mealRecords) === mealBefore &&
      (await stores(h)).mealPlans.some((p) => p.planDate === day(0)),
  )

  // 화면을 연 채 자정이 지난 경우: 저장소 시계를 하루 앞당겨 새 계획이 거부되는지 본다.
  await h.go('/records/meal/plan', 300)
  await waitH1(h, '내일 식단 계획')
  await waitItems(h, 2)
  await mustClick(h, '^아침$')
  await h.setVal('#meal-food-query', '카페')
  await mustUntil(h, `document.querySelectorAll('[data-food-pick]').length===1`)
  await mustClick(h, '^선택$')
  await mustUntil(h, `!!document.querySelector('[role=dialog]')`)
  await h.ev(
    `(()=>{const R=Date;window.__RealDate=R;window.Date=class extends R{constructor(...a){if(a.length===0){super(R.now()+86400000)}else{super(...a)}}static now(){return R.now()+86400000}}})()`,
  )
  const plansBefore = (await stores(h)).mealPlans.length
  await mustClick(h, '^등록$', '[role=dialog]')
  await mustUntil(
    h,
    `/계획 날짜가 지났어요/.test(document.querySelector('[role=dialog]')?.innerText ?? '')`,
  )
  await h.ev(`window.Date=window.__RealDate`)
  check(
    h,
    'Q22. 화면을 연 채 자정이 지나 계획 날짜가 오늘이 되면 등록이 거부되고 안내하며 아무것도 저장하지 않는다',
    (await stores(h)).mealPlans.length === plansBefore,
    String(plansBefore),
  )
  await mustClick(h, '^취소$', '[role=dialog]')
  await dialogGone(h)

  // 이전 링크(D01로)
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await mustClick(h, '계획 보기')
  await waitPath(h, '^/records/meal/plan$')
  await waitH1(h, '내일 식단 계획')
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/meal$')
  check(
    h,
    'Q23. D01에서 들어간 D02-1의 "이전"은 식단 대시보드로 돌아온다',
    true,
  )

  // 계정 격리
  await logout(h)
  await h.login('full')
  await h.go('/records/meal', 300)
  await settleScreen(h, { path: '/records/meal', h1: '식단 기록' })
  await waitText(h, '/아직 계획한 음식이 없어요/')
  await h.go('/records/meal/plan', 300)
  await waitH1(h, '내일 식단 계획')
  await waitText(h, '/아직 계획하지 않았어요/')
  check(
    h,
    'Q24. 다른 계정(full)의 D01·D02-1에는 free 계정의 계획이 보이지 않는다',
    (await h.ev(`document.querySelectorAll('[data-meal-record]').length`)) ===
      0,
  )
  const fin = await stores(h)
  check(
    h,
    'Q25. 계정을 바꿔 보기만 했으므로 저장된 계획(free 2건 + 오늘 날짜 계획 1건)과 운동 데이터는 그대로이고 스키마는 v4다',
    fin.mealPlans.length === 3 && j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
    String(fin.mealPlans.length),
  )
})

// ── D. 빈 상태 · 신규 사용자 ─────────────────────────────────────────────────────────
await scenario('C-plan-fresh', async (h) => {
  await h.login('free')
  await h.go('/records/meal/plan', 300)
  await settleScreen(h, { path: '/records/meal/plan', h1: '내일 식단 계획' })
  await waitText(h, '/아직 계획하지 않았어요/')
  const none = await snap(h)
  check(
    h,
    'Q26. 신규 사용자의 D02-1은 DB가 v6로 새로 만들어지고 끼니마다 "아직 계획하지 않았어요"와 계획 0개를 보인다',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA) &&
      (none.text.match(/아직 계획하지 않았어요/g) ?? []).length === 3 &&
      /내일 계획 0개/.test(none.text),
    none.text.slice(0, 200),
  )
  await mustClick(h, '^저녁$')
  await mustClick(h, '^즐겨찾기$')
  await mustUntil(
    h,
    `/즐겨찾기한 음식이 없어요/.test(document.querySelector('main').innerText)`,
  )
  check(
    h,
    'Q27. 즐겨찾기 탭은 즐겨찾기가 없으면 안내한다(같은 음식 즐겨찾기 상태를 쓴다)',
    true,
  )
})
