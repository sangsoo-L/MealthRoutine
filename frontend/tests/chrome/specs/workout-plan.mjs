// [chrome 회귀] FAST-04C: 내일 운동 계획(W01 → W02 → W11 → W10, day=tomorrow) + IndexedDB v5(workoutPlans) + 오늘 초안·운동 목록·완료 기록과의 분리
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only workout-plan`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 저장소 시험은 앱과 같은 저장소 코드를 페이지 안에서 부르고(자정 경계는 저장소의 시계 주입으로),
// 화면 시험은 실제 클릭으로 진행한다. v1~v4 → v5 업그레이드는 meals-food 스크립트의 B 시나리오가 검증한다. 앱 소스를 수정하지 않는다.
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
  const wp = await import('/src/exercise/local/indexedDbWorkoutPlanRepository.ts');
  const wm = await import('/src/exercise/workoutModel.ts');
  const day = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return wm.toLocalDate(x) };
  const tomorrow = day(-1);
  const known = new Set(['e1', 'e2', 'e3']);
  const mk = (names, d = 'tomorrow', extra = {}) => ({ v: 1, day: d, items: names.map((n, i) => ({ itemId: 'i' + i, exerciseId: 'e' + (i + 1), name: n, recordType: 'reps', sets: [{ reps: 10 }] })), updatedAt: new Date().toISOString(), ...extra });
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
const KEY_TODAY = 'mealthroutine.account.workout-draft'
const KEY_TOMORROW = 'mealthroutine.account.workout-draft-tomorrow'

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
const waitText = (h, re) =>
  mustUntil(h, `${re}.test(document.querySelector('main').innerText)`, 80)
const logout = async (h) => {
  await h.ev(`sessionStorage.clear()`)
  await h.go('/home', 900)
}
const stores = async (h) => JSON.parse(await dumpStores(h))
/** 운동 계획이 아닌 모든 저장소의 행(원본 그대로). 계획 작업이 다른 저장소를 건드리지 않았는지 비교한다. */
const others = (all) =>
  j({
    workoutLists: all.workoutLists,
    workoutRecords: all.workoutRecords,
    workoutSessions: all.workoutSessions,
    workoutRoutines: all.workoutRoutines,
    mealRecords: all.mealRecords,
    mealPlans: all.mealPlans,
  })
const draftOf = (h, key) =>
  h.ev(
    `(()=>{const r=sessionStorage.getItem(${j(key)});return r?JSON.parse(r).draft:null})()`,
  )
const draftNames = async (h, key) =>
  ((await draftOf(h, key))?.items ?? []).map((i) => i.name)

// W13 선택 화면 조작(w13-register 스펙과 같은 선택자)
const rowSel = `main section[aria-label="운동 목록"] ul > li`
const pickTab = (h, name) =>
  h.ev(
    `[...document.querySelectorAll('main [role=group][aria-label="운동 찾는 방법"] button')].find(b=>b.innerText.trim()===${j(name)}).click()`,
  )
const clickRow = (h, name) =>
  h.ev(
    `(()=>{const li=[...document.querySelectorAll(${j(rowSel)})].find(l=>l.querySelector('button[aria-pressed] span span')?.textContent.trim()===${j(name)});li.querySelector('button[aria-pressed]').click()})()`,
  )
/** W02(day)에서 "운동 등록하기" → W13에서 이름대로 선택 → 등록. 끝나면 같은 day의 W02다. */
async function addExercises(h, names, tomorrow) {
  await clickSel(h, '#compose-add-link')
  await waitPath(h, '^/records/exercise/select$')
  check(
    h,
    `  W13 진입 주소가 day를 따른다(${tomorrow ? 'day=tomorrow' : 'day 없음'})`,
    tomorrow
      ? /day=tomorrow/.test(await h.path())
      : !/day=/.test(await h.path()),
    await h.path(),
  )
  await pickTab(h, '직접 검색')
  await h.sleep(150)
  await h.ev(`document.querySelector('form[role=search]').requestSubmit()`)
  await mustUntil(h, `document.querySelectorAll(${j(rowSel)}).length>=15`, 60)
  for (const name of names) await clickRow(h, name)
  await h.ev(
    `[...document.querySelectorAll('main button')].find(b=>/개 운동 등록/.test(b.innerText)).click()`,
  )
  await waitPath(h, '^/records/exercise/compose$')
  await mustUntil(
    h,
    `/운동 \\d+개를 추가했어요/.test(document.querySelector('main').innerText)`,
    60,
  )
}
/** 저장 버튼은 운동 정보를 읽는 동안 aria-disabled라 누름이 무시된다. 활성화될 때까지 기다린 뒤 누른다. */
async function clickEnabled(h, re) {
  await mustUntil(
    h,
    `[...document.querySelectorAll('main button')].some(b=>new RegExp(${j(re)}).test(b.innerText.trim())&&b.getAttribute('aria-disabled')!=='true')`,
    80,
  )
  await mustClick(h, re)
}
const planOpen = (h) =>
  h.ev(
    `(()=>{const d=[...document.querySelectorAll('details')].find(x=>/다음 운동 준비하기/.test(x.innerText));if(d)d.open=true;return !!d})()`,
  )

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
  await h.seedList('free', 'mixed', 'a-today')
  await run(
    h,
    `
    const m = await import('/src/food/local/indexedDbMealRepository.ts');
    const mpl = await import('/src/food/local/indexedDbMealPlanRepository.ts');
    const fd = await import('/src/food/dev/devFoodSamples.ts');
    await m.createIndexedDbMealRecordRepository('free').create({ requestId: 'wm-r', localDate: day(0), mealType: 'lunch', food: fd.DEV_FOODS[0], portion: 'normal' });
    await mpl.createIndexedDbMealPlanRepository('free').create({ requestId: 'wm-p', planDate: tomorrow, mealType: 'dinner', food: fd.DEV_FOODS[1], portion: 'normal' });
    return true;
  `,
  )
  const before = await stores(h)
  const othersBefore = others(before)

  const r = await run(
    h,
    `
    const free = wp.createIndexedDbWorkoutPlanRepository('free');
    const full = wp.createIndexedDbWorkoutPlanRepository('full');
    const out = {};
    const c1 = await free.create({ requestId: 'wp-1', planDate: tomorrow, draft: mk(['푸시업', '스쿼트']), knownExerciseIds: known });
    out.c1 = { created: c1.created, rev: c1.plan.revision, owner: c1.plan.ownerId, date: c1.plan.planDate === tomorrow, items: c1.plan.items.map((i) => i.exerciseNameSnapshot), schema: c1.plan.schemaVersion, hasListId: 'listId' in c1.plan || 'plannedDate' in c1.plan };
    const again = await free.create({ requestId: 'wp-1', planDate: tomorrow, draft: mk(['푸시업', '스쿼트']), knownExerciseIds: known });
    out.again = { created: again.created, sameId: again.plan.id === c1.plan.id };
    out.conflict = await err(() => free.create({ requestId: 'wp-1', planDate: tomorrow, draft: mk(['푸시업']), knownExerciseIds: known }));
    out.sameDate = await err(() => free.create({ requestId: 'wp-2', planDate: tomorrow, draft: mk(['푸시업']), knownExerciseIds: known }));
    out.countAfterDup = (await free.listByDate(tomorrow)).items.length;
    // 동시 저장: 새 날짜에 서로 다른 요청 두 개를 한꺼번에 보내도 날짜별 계획은 1개뿐이다.
    const d2 = day(-2);
    const settled = await Promise.allSettled([
      free.create({ requestId: 'race-a', planDate: d2, draft: mk(['푸시업']), knownExerciseIds: known }),
      free.create({ requestId: 'race-b', planDate: d2, draft: mk(['스쿼트']), knownExerciseIds: known }),
    ]);
    out.race = { ok: settled.filter((s) => s.status === 'fulfilled').length, failed: settled.filter((s) => s.status === 'rejected').map((s) => (s.reason.reason ?? '') + ':' + (s.reason.code ?? '')), count: (await free.listByDate(d2)).items.length };
    out.todayDraft = await err(() => free.create({ requestId: 'wp-3', planDate: day(-3), draft: mk(['푸시업'], 'today'), knownExerciseIds: known }));
    out.unknown = await err(() => free.create({ requestId: 'wp-4', planDate: day(-3), draft: mk(['푸시업', '스쿼트', '플랭크', '런지']), knownExerciseIds: known }));
    out.badRequest = await err(() => free.create({ requestId: '공백 있음', planDate: day(-3), draft: mk(['푸시업']), knownExerciseIds: known }));
    out.badDate = await err(() => free.create({ requestId: 'wp-5', planDate: '2026-02-31', draft: mk(['푸시업']), knownExerciseIds: known }));
    out.todayDate = await err(() => free.create({ requestId: 'wp-6', planDate: day(0), draft: mk(['푸시업']), knownExerciseIds: known }));
    out.pastDate = await err(() => free.create({ requestId: 'wp-7', planDate: day(3), draft: mk(['푸시업']), knownExerciseIds: known }));
    out.countAfterInvalid = (await free.listFrom(tomorrow)).items.length;
    const u1 = await free.replace(c1.plan.id, { expectedRevision: 1, draft: mk(['플랭크']), knownExerciseIds: known });
    out.u1 = { rev: u1.revision, items: u1.items.map((i) => i.exerciseNameSnapshot), created: u1.createdAt === c1.plan.createdAt, date: u1.planDate === tomorrow, id: u1.id === c1.plan.id, req: u1.requestId === 'wp-1' };
    out.stale = await err(() => free.replace(c1.plan.id, { expectedRevision: 1, draft: mk(['푸시업']), knownExerciseIds: known }));
    out.replaceInvalid = await err(() => free.replace(c1.plan.id, { expectedRevision: 2, draft: mk([]), knownExerciseIds: known }));
    out.afterBad = (await free.get(c1.plan.id)).items.map((i) => i.exerciseNameSnapshot);
    out.fullList = (await full.listByDate(tomorrow)).items.length;
    out.fullGet = (await full.get(c1.plan.id)) === null;
    out.fullReplace = await err(() => full.replace(c1.plan.id, { expectedRevision: 2, draft: mk(['푸시업']), knownExerciseIds: known }));
    out.fullDelete = await err(() => full.delete(c1.plan.id));
    out.stillThere = (await free.get(c1.plan.id))?.items.length;
    const f1 = await full.create({ requestId: 'wp-1', planDate: tomorrow, draft: mk(['런지']), knownExerciseIds: known });
    out.fullOwn = { created: f1.created, ownerId: f1.plan.ownerId, freeStill: (await free.listByDate(tomorrow)).items.length, fullCount: (await full.listByDate(tomorrow)).items.length };
    out.staleDelete = await err(() => free.delete(c1.plan.id, { expectedRevision: 1 }));
    await free.delete(c1.plan.id, { expectedRevision: 2 });
    out.afterDelete = (await free.get(c1.plan.id)) === null;
    out.deleteAgain = await err(() => free.delete(c1.plan.id));
    out.fullAfterFreeDelete = (await full.listByDate(tomorrow)).items.length;
    // 삭제한 날짜에는 다시 만들 수 있다.
    out.recreate = (await free.create({ requestId: 'wp-8', planDate: tomorrow, draft: mk(['푸시업']), knownExerciseIds: known })).created;
    return out;
  `,
  )
  check(
    h,
    'R1. 계획 만들기: revision 1, planDate(내일), 소유자, 운동 순서·이름 스냅샷 저장, 운동 목록·세션을 가리키는 필드는 없다',
    r.c1.created &&
      r.c1.rev === 1 &&
      r.c1.owner === 'free' &&
      r.c1.date &&
      j(r.c1.items) === j(['푸시업', '스쿼트']) &&
      r.c1.schema === 1 &&
      !r.c1.hasListId,
    j(r.c1),
  )
  check(
    h,
    'R2. 중복 저장 방지: 같은 요청 id·같은 구성은 처음 계획을 돌려주고(새로 만들지 않음), 다른 구성은 conflict(requestConflict)다',
    !r.again.created &&
      r.again.sameId &&
      r.conflict === 'conflict:requestConflict',
    j({ again: r.again, conflict: r.conflict }),
  )
  check(
    h,
    'R3. 날짜별 1개: 같은 날짜에 다른 요청으로 만들면 conflict(planExists)이고 1개만 남는다',
    r.sameDate === 'conflict:planExists' && r.countAfterDup === 1,
    j({ sameDate: r.sameDate, n: r.countAfterDup }),
  )
  check(
    h,
    'R4. 동시 저장: 같은 날짜에 서로 다른 두 요청을 동시에 보내도 하나만 저장되고 나머지는 거부되며 날짜별 계획은 1개다',
    r.race.ok === 1 &&
      r.race.failed.length === 1 &&
      /conflict:(planExists|uniqueConstraint)/.test(r.race.failed[0]) &&
      r.race.count === 1,
    j(r.race),
  )
  check(
    h,
    'R5. 잘못된 입력(오늘 초안·알 수 없는 운동·요청 id·날짜)은 validation이고 아무것도 저장하지 않는다',
    r.todayDraft.startsWith('validation') &&
      r.unknown.startsWith('validation') &&
      r.badRequest.startsWith('validation') &&
      r.badDate.startsWith('validation') &&
      r.countAfterInvalid === 2,
    j(r),
  )
  check(
    h,
    'R6. 계획 날짜가 오늘이거나 지났으면 validation:invalidPlanDate이고 저장하지 않는다',
    r.todayDate === 'validation:invalidPlanDate' &&
      r.pastDate === 'validation:invalidPlanDate',
    j({ today: r.todayDate, past: r.pastDate }),
  )
  check(
    h,
    'R7. 교체(수정): 운동 구성·revision만 바뀌고 id·planDate·createdAt·requestId는 그대로이며, 오래된 revision은 conflict(revisionMismatch@2), 잘못된 초안은 값을 바꾸지 않는다',
    r.u1.rev === 2 &&
      j(r.u1.items) === j(['플랭크']) &&
      r.u1.created &&
      r.u1.date &&
      r.u1.id &&
      r.u1.req &&
      r.stale === 'conflict:revisionMismatch@2' &&
      r.replaceInvalid.startsWith('validation') &&
      j(r.afterBad) === j(['플랭크']),
    j({ u1: r.u1, stale: r.stale, bad: r.replaceInvalid, after: r.afterBad }),
  )
  check(
    h,
    'R8. 계정 격리: full 계정은 free 계획을 읽거나 교체·삭제할 수 없고(notFound, 지워지지 않음), 같은 날짜·같은 요청 id로 자기 계획을 따로 만든다',
    r.fullList === 0 &&
      r.fullGet &&
      r.fullReplace === 'notFound' &&
      r.fullDelete === 'notFound' &&
      r.stillThere === 1 &&
      r.fullOwn.created &&
      r.fullOwn.ownerId === 'full' &&
      r.fullOwn.freeStill === 1 &&
      r.fullOwn.fullCount === 1,
    j({ list: r.fullList, get: r.fullGet, own: r.fullOwn }),
  )
  check(
    h,
    'R9. 삭제: 오래된 revision은 conflict이고, 맞으면 지워지며 다시 지우면 notFound다. 다른 계정 계획에는 영향이 없고 지운 날짜에는 다시 만들 수 있다',
    r.staleDelete.startsWith('conflict') &&
      r.afterDelete &&
      r.deleteAgain === 'notFound' &&
      r.fullAfterFreeDelete === 1 &&
      r.recreate,
    j({
      stale: r.staleDelete,
      gone: r.afterDelete,
      again: r.deleteAgain,
      full: r.fullAfterFreeDelete,
      recreate: r.recreate,
    }),
  )

  // 자정 경계: 저장소의 시계를 바꿔 "자정이 지난 뒤"를 재현한다.
  const mid = await run(
    h,
    `
    const noon = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x };
    const free0 = wp.createIndexedDbWorkoutPlanRepository('free');
    for (const p of (await free0.listFrom(day(0))).items) await free0.delete(p.id);
    const before = wp.createIndexedDbWorkoutPlanRepository('free', { now: () => noon(0) });
    const after = wp.createIndexedDbWorkoutPlanRepository('free', { now: () => noon(-1) });
    const out = {};
    const c = await before.create({ requestId: 'mid-1', planDate: tomorrow, draft: mk(['푸시업']), knownExerciseIds: known });
    out.created = c.created;
    // 자정이 지났다: 계획 날짜(내일)가 오늘이 되었다.
    out.replaceAfter = await err(() => after.replace(c.plan.id, { expectedRevision: 1, draft: mk(['스쿼트']), knownExerciseIds: known }));
    out.createAfter = await err(() => after.create({ requestId: 'mid-2', planDate: tomorrow, draft: mk(['스쿼트']), knownExerciseIds: known }));
    out.viewable = (await after.listFrom(tomorrow)).items.map((p) => [p.planDate === tomorrow, p.revision, p.items[0].exerciseNameSnapshot]);
    out.getStill = (await after.get(c.plan.id)) !== null;
    out.hiddenFromTomorrow = (await after.listFrom(day(-2))).items.length;
    out.stillStored = (await after.get(c.plan.id)) !== null;
    // 오늘이 된 계획도 삭제할 수 있다(정리용).
    await after.delete(c.plan.id);
    out.deleted = (await after.get(c.plan.id)) === null;
    return out;
  `,
  )
  check(
    h,
    'R10. 자정 경계: 계획 날짜가 오늘이 되면 새 계획·교체는 invalidPlanDate로 거부되고, 조회·삭제는 가능하며 계획은 자동으로 사라지거나 바뀌지 않는다(지난 날짜는 목록에서만 빠지고 저장은 남음)',
    mid.created &&
      mid.replaceAfter === 'validation:invalidPlanDate' &&
      mid.createAfter === 'validation:invalidPlanDate' &&
      j(mid.viewable) === j([[true, 1, '푸시업']]) &&
      mid.getStill &&
      mid.hiddenFromTomorrow === 0 &&
      mid.stillStored &&
      mid.deleted,
    j(mid),
  )

  // 손상 행은 건너뛰고 정상 계획만 보인다.
  const corrupt = await run(
    h,
    `
    const free = wp.createIndexedDbWorkoutPlanRepository('free');
    await free.create({ requestId: 'ok-1', planDate: tomorrow, draft: mk(['플랭크']), knownExerciseIds: known });
    const db = await new Promise((ok, no) => { const q = indexedDB.open('mealthroutine-exercise'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) });
    await new Promise((ok, no) => { const tx = db.transaction('workoutPlans', 'readwrite'); tx.objectStore('workoutPlans').put({ id: 'bad-wp', ownerId: 'free', planDate: day(-5), requestId: 'bad-wr', items: [] }); tx.oncomplete = ok; tx.onerror = () => no(tx.error) });
    db.close();
    const res = await free.listFrom(day(0));
    return { names: res.items.map((x) => x.items[0].exerciseNameSnapshot), skipped: res.skippedCount };
  `,
  )
  check(
    h,
    'R11. 손상된 행은 건너뛰고 정상 계획(플랭크)만 보이며 건너뛴 수를 알린다',
    j(corrupt.names) === j(['플랭크']) && corrupt.skipped === 1,
    j(corrupt),
  )

  // 계획 작업 전체가 다른 저장소를 건드리지 않았다.
  const after = await stores(h)
  check(
    h,
    'R12. 계획 생성·교체·삭제·자정 경계·동시 저장 뒤에도 운동 목록·세션·완료 기록·루틴·식단 기록·식단 계획의 모든 행이 그대로다',
    others(after) === othersBefore &&
      after.workoutLists.length >= 1 &&
      after.workoutRecords.length >= 1,
    `lists ${after.workoutLists.length} records ${after.workoutRecords.length}`,
  )
  check(
    h,
    'R13. 스키마가 승인된 v6다(workoutPlans 외 dailyQuizzes·rewardLedger 포함, workoutPlans: byOwnerDate(planDate, unique)·byOwnerRequest(unique), 기존 6개 저장소·인덱스 그대로)',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
    j(await schemaInfo(h)).slice(0, 200),
  )
})

// ── C. 화면 흐름 ─────────────────────────────────────────────────────────────────────
await scenario('C-plan-flow', async (h) => {
  await h.login('free')
  // 기존 운동 데이터: 오늘의 운동 목록 + 지난 완료 기록.
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'c-old',
    name: '기존기록',
  })
  await h.seedList('free', 'mixed', 'c-today')
  const seeded = await stores(h)
  const othersBefore = others(seeded)

  // W01: 다음 운동 준비하기의 내일 운동 계획이 활성이다.
  await h.go('/records/exercise', 300)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(h, `!!document.querySelector('[data-next-plan]')`)
  await planOpen(h)
  const rowText = () =>
    h.ev(
      `document.querySelector('[data-next-plan]').textContent.replace(/\\s+/g,' ').trim()`,
    )
  const rowLinks = () =>
    h.ev(
      `[...document.querySelectorAll('[data-next-plan] a')].map(a=>({t:a.textContent.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')}))`,
    )
  check(
    h,
    'T1. W01 다음 운동 준비하기: 내일 운동 계획이 "준비 중" 없이 "계획 만들기"(W02, day=tomorrow) 링크이고 오늘 기록과 별개라고 알린다',
    !/준비 중/.test(await rowText()) &&
      /오늘 운동 기록과 별개/.test(await rowText()) &&
      (await rowLinks()).some(
        (l) =>
          l.h === '/records/exercise/compose?day=tomorrow' &&
          /계획 만들기/.test(l.t),
      ),
    await rowText(),
  )

  // 오늘 초안을 먼저 만들어 두고(플랭크), 내일 초안과 섞이지 않는지 본다.
  await h.go('/records/exercise/compose', 300)
  await mustUntil(h, `!!document.getElementById('compose-add-link')`)
  await addExercises(h, ['플랭크'], false)
  check(
    h,
    'T2. 오늘 초안에 플랭크를 담으면 오늘 초안 키에만 저장되고 내일 초안은 없다',
    j(await draftNames(h, KEY_TODAY)) === j(['플랭크']) &&
      (await draftOf(h, KEY_TOMORROW)) === null,
  )

  // 내일 탭으로 전환: 내일 초안은 비어 있다.
  await clickSel(h, '[aria-label="운동 날짜"] button:nth-child(2)')
  await mustUntil(h, `/day=tomorrow/.test(location.search)`)
  await mustUntil(
    h,
    `/아직 등록한 운동이 없어요/.test(document.querySelector('main').innerText)`,
  )
  const tabs = await h.ev(
    `[...document.querySelectorAll('[aria-label="운동 날짜"] button')].map(b=>({p:b.getAttribute('aria-pressed'),t:b.innerText.replace(/\\s+/g,' ').trim()}))`,
  )
  check(
    h,
    'T3. 오늘/내일 날짜 버튼: 내일이 선택되고(내일 날짜 표시) 내일 초안은 비어 있어 오늘 초안(플랭크)이 보이지 않는다',
    tabs[1].p === 'true' &&
      tabs[0].p === 'false' &&
      tabs[1].t.includes(TOMORROW) &&
      !(await h.ev(`/플랭크/.test(document.querySelector('main').innerText)`)),
    j(tabs),
  )
  await addExercises(h, ['푸시업', '맨몸 스쿼트'], true)
  check(
    h,
    'T4. 내일 초안에 푸시업·맨몸 스쿼트를 담으면 내일 초안 키에만 저장되고 오늘 초안(플랭크)은 그대로다(서로 덮어쓰지 않음)',
    j(await draftNames(h, KEY_TOMORROW)) === j(['푸시업', '맨몸 스쿼트']) &&
      j(await draftNames(h, KEY_TODAY)) === j(['플랭크']) &&
      /day=tomorrow/.test(await h.path()),
    j({
      tomorrow: await draftNames(h, KEY_TOMORROW),
      today: await draftNames(h, KEY_TODAY),
    }),
  )
  // 새로고침해도 내일 초안이 남고 day도 유지된다.
  await h.ev(`location.reload()`)
  await mustUntil(h, `!!document.getElementById('compose-add-link')`)
  check(
    h,
    'T5. 새로고침 후에도 내일 구성 화면(day=tomorrow)과 내일 초안 2개가 유지된다',
    /day=tomorrow/.test(await h.path()) &&
      j(await draftNames(h, KEY_TOMORROW)) === j(['푸시업', '맨몸 스쿼트']),
  )
  // 오늘 탭으로 갔다 와도 각 초안이 그대로다.
  await clickSel(h, '[aria-label="운동 날짜"] button:nth-child(1)')
  await mustUntil(h, `!/day=tomorrow/.test(location.search)`)
  await mustUntil(h, `/플랭크/.test(document.querySelector('main').innerText)`)
  check(
    h,
    'T6. 오늘 탭에서는 오늘 초안(플랭크)만 보이고 내일 운동은 보이지 않는다',
    !(await h.ev(
      `/푸시업|맨몸 스쿼트/.test(document.querySelector('main').innerText)`,
    )),
  )
  await clickSel(h, '[aria-label="운동 날짜"] button:nth-child(2)')
  await mustUntil(h, `/day=tomorrow/.test(location.search)`)
  await mustUntil(h, `/푸시업/.test(document.querySelector('main').innerText)`)

  // W11(day=tomorrow)
  await mustClick(h, '내일 계획 등록 · 최종 검토')
  await waitPath(h, '^/records/exercise/review$')
  await mustUntil(h, `/내일 · /.test(document.querySelector('main').innerText)`)
  const review = await snap(h)
  check(
    h,
    'T7. W11(day=tomorrow): "내일 · 날짜"·운동 2개·"내일 계획으로 저장"이 보이고 "오늘의 운동으로 저장"·"오늘 운동 시작" 버튼은 없다',
    /day=tomorrow/.test(review.path) &&
      /내일 · /.test(review.text) &&
      /운동\s*2개/.test(review.text) &&
      /내일 계획으로 저장/.test(review.text) &&
      !/오늘의 운동으로 저장|오늘 운동 시작/.test(review.text),
    review.text.slice(0, 220),
  )
  await clickEnabled(h, '^내일 계획으로 저장$')
  if (!(await h.until(`location.pathname==='/records/exercise/my'`, 80))) {
    check(
      h,
      'T8-진단. 저장 뒤 W10으로 이동하지 못했다',
      false,
      j({
        button: await h.ev(
          `(()=>{const b=[...document.querySelectorAll('main button')].find(x=>/내일 계획으로 저장|저장 중|저장 다시 시도/.test(x.innerText));return b?{t:b.innerText.trim(),disabled:b.getAttribute('aria-disabled')}:null})()`,
        ),
        problems: h.problems.slice(0, 3),
        alerts: await h.ev(
          `[...document.querySelectorAll('main [role=alert],main [role=status]')].map(e=>e.innerText.trim())`,
        ),
        stores: (await stores(h)).workoutPlans.length,
      }),
    )
    throw new Error('저장 뒤 W10으로 이동하지 못했어요')
  }
  await mustUntil(h, `!!document.querySelector('[data-plan-card]')`)
  await waitText(h, '/내일 운동 계획을 저장했어요/')
  const saved = await stores(h)
  check(
    h,
    'T8. 저장하면 W10으로 이동해 "내일 운동 계획을 저장했어요" 안내와 내일 계획 카드(운동 2개)를 보이고, 내일 초안은 비워지며 오늘 초안(플랭크)은 남는다',
    saved.workoutPlans.length === 1 &&
      saved.workoutPlans[0].planDate === TOMORROW &&
      saved.workoutPlans[0].items.length === 2 &&
      (await draftOf(h, KEY_TOMORROW)) === null &&
      j(await draftNames(h, KEY_TODAY)) === j(['플랭크']) &&
      (await h.ev(
        `document.querySelectorAll('[data-plan-card] [data-plan-item]').length`,
      )) === 2,
    j({ plans: saved.workoutPlans.length }),
  )
  check(
    h,
    'T9. 내일 계획 저장은 운동 목록·세션·완료 기록·루틴·식단 저장소의 행을 하나도 바꾸지 않았다(오늘의 운동·통계 불변)',
    others(saved) === othersBefore,
  )
  const my = await snap(h)
  check(
    h,
    'T10. W10: 오늘의 운동 영역과 내일 계획 영역이 따로이고 계획의 운동명은 오늘의 운동 영역에 나타나지 않는다',
    /내일 계획/.test(my.text) &&
      (await h.ev(
        `(()=>{const a=document.getElementById('my-tomorrow-title')?.closest('section');const t=document.querySelector('main').innerText;const planText=document.querySelector('[data-plan-card]').innerText;return !!a && !t.replace(planText,'').includes('맨몸 스쿼트')})()`,
      )),
    my.text.slice(0, 160),
  )

  // W01 요약
  await h.go('/records/exercise', 300)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(h, `!!document.querySelector('[data-next-plan]')`)
  await mustUntil(
    h,
    `/계획 보기/.test(document.querySelector('[data-next-plan]').textContent)`,
  )
  await planOpen(h)
  check(
    h,
    'T11. W01 다음 운동 준비하기: 계획이 있으면 "운동 2개 · 총 N세트 (오늘 운동 기록과 별개)"와 "계획 보기"(W10) 링크다',
    /운동 2개 · 총 \d+세트 \(오늘 운동 기록과 별개\)/.test(await rowText()) &&
      (await rowLinks()).some(
        (l) => l.h === '/records/exercise/my' && /계획 보기/.test(l.t),
      ),
    await rowText(),
  )

  // 수정: W10 → W02(내일, 계획이 초안으로) → 한 운동 삭제 → W11 → 수정 저장
  await h.go('/records/exercise/my', 300)
  await mustUntil(h, `!!document.querySelector('[data-plan-card]')`)
  const planBefore = (await stores(h)).workoutPlans[0]
  await mustClick(h, '^계획 수정$')
  await waitPath(h, '^/records/exercise/compose$')
  await mustUntil(h, `/day=tomorrow/.test(location.search)`)
  await mustUntil(
    h,
    `/맨몸 스쿼트/.test(document.querySelector('main').innerText)`,
  )
  const editDraft = await draftOf(h, KEY_TOMORROW)
  check(
    h,
    'T12. 계획 수정: 계획의 운동 순서·구성이 내일 초안으로 옮겨지고 고치는 계획의 id·revision이 초안에 남는다(오늘 초안은 그대로)',
    j(editDraft.items.map((i) => i.name)) === j(['푸시업', '맨몸 스쿼트']) &&
      editDraft.editingPlanId === planBefore.id &&
      editDraft.editingPlanRevision === 1 &&
      j(await draftNames(h, KEY_TODAY)) === j(['플랭크']),
    j(editDraft),
  )
  await clickSel(h, 'button[aria-label="맨몸 스쿼트 삭제"]')
  await mustUntil(
    h,
    `!/맨몸 스쿼트/.test(document.querySelector('main').innerText)`,
  )
  await mustClick(h, '내일 계획 등록 · 최종 검토')
  await waitPath(h, '^/records/exercise/review$')
  await mustUntil(
    h,
    `/내일 계획 수정 저장/.test(document.querySelector('main').innerText)`,
  )
  await clickEnabled(h, '^내일 계획 수정 저장$')
  await waitPath(h, '^/records/exercise/my$')
  await waitText(h, '/내일 운동 계획을 바꿔서 저장했어요/')
  const editedPlan = (await stores(h)).workoutPlans[0]
  check(
    h,
    'T13. 수정 저장: 같은 계획(id·createdAt·planDate 그대로)이 revision 2·운동 1개로 바뀌고 교체 확인 없이 저장되며 계획은 여전히 1개다',
    (await stores(h)).workoutPlans.length === 1 &&
      editedPlan.id === planBefore.id &&
      editedPlan.createdAt === planBefore.createdAt &&
      editedPlan.planDate === TOMORROW &&
      editedPlan.revision === 2 &&
      editedPlan.items.length === 1 &&
      editedPlan.items[0].exerciseNameSnapshot === '푸시업' &&
      (await draftOf(h, KEY_TOMORROW)) === null,
    j({ rev: editedPlan.revision, n: editedPlan.items.length }),
  )

  // 교체 확인: 새 내일 초안(수정 아님)을 저장하면 기존 계획이 있어 확인을 받는다.
  await h.go('/records/exercise/compose?day=tomorrow', 300)
  await mustUntil(h, `!!document.getElementById('compose-add-link')`)
  await addExercises(h, ['플랭크'], true)
  await mustClick(h, '내일 계획 등록 · 최종 검토')
  await waitPath(h, '^/records/exercise/review$')
  await mustUntil(
    h,
    `/내일 계획으로 저장/.test(document.querySelector('main').innerText)`,
  )
  await clickEnabled(h, '^내일 계획으로 저장$')
  await mustUntil(
    h,
    `!!document.querySelector('[role=group][aria-labelledby="plan-review-panel-title"]')`,
  )
  check(
    h,
    'T14. 이미 내일 계획이 있으면 저장 전에 "저장된 내일 계획이 있어요" 교체 확인을 받고 그 사이에는 저장하지 않는다',
    /저장된 내일 계획이 있어요/.test(
      await h.ev(`document.querySelector('main').innerText`),
    ) &&
      (await stores(h)).workoutPlans[0].revision === 2 &&
      (await stores(h)).workoutPlans[0].items[0].exerciseNameSnapshot ===
        '푸시업',
  )
  await mustClick(
    h,
    '^취소$',
    '[role=group][aria-labelledby="plan-review-panel-title"]',
  )
  await h.sleep(300)
  check(
    h,
    'T15. 교체 확인에서 취소하면 기존 계획과 내일 초안이 그대로다',
    (await stores(h)).workoutPlans[0].revision === 2 &&
      j(await draftNames(h, KEY_TOMORROW)) === j(['플랭크']),
  )
  await clickEnabled(h, '^내일 계획으로 저장$')
  await mustUntil(
    h,
    `!!document.querySelector('[role=group][aria-labelledby="plan-review-panel-title"]')`,
  )
  await mustClick(h, '^바꿔서 저장$')
  await waitPath(h, '^/records/exercise/my$')
  await waitText(h, '/내일 운동 계획을 바꿔서 저장했어요/')
  const replaced = (await stores(h)).workoutPlans
  check(
    h,
    'T16. 바꿔서 저장: 계획은 여전히 1개(같은 날짜·같은 id)이고 운동이 플랭크로 바뀌며 revision 3이다',
    replaced.length === 1 &&
      replaced[0].id === planBefore.id &&
      replaced[0].revision === 3 &&
      replaced[0].items[0].exerciseNameSnapshot === '플랭크',
    j(replaced.map((p) => [p.revision, p.items.length])),
  )

  // 날짜 경계(화면): 화면을 연 채 자정이 지나면 날짜 확인을 거치고 그 전에는 저장하지 않는다.
  await h.go('/records/exercise/compose?day=tomorrow', 300)
  await mustUntil(h, `!!document.getElementById('compose-add-link')`)
  await addExercises(h, ['맨몸 스쿼트'], true)
  await mustClick(h, '내일 계획 등록 · 최종 검토')
  await waitPath(h, '^/records/exercise/review$')
  await mustUntil(
    h,
    `/내일 계획으로 저장/.test(document.querySelector('main').innerText)`,
  )
  await h.ev(
    `(()=>{const R=Date;window.__RealDate=R;window.Date=class extends R{constructor(...a){if(a.length===0){super(R.now()+86400000)}else{super(...a)}}static now(){return R.now()+86400000}}})()`,
  )
  const planCount = (await stores(h)).workoutPlans.length
  await clickEnabled(h, '^내일 계획으로 저장$')
  await mustUntil(
    h,
    `/날짜가 바뀌었어요/.test(document.querySelector('main').innerText)`,
  )
  await h.ev(`window.Date=window.__RealDate`)
  check(
    h,
    'T17. 자정이 지나 계획 날짜가 오늘이 되면 저장하지 않고 "날짜가 바뀌었어요" 확인을 받으며 아무것도 저장하지 않고 초안은 그대로다',
    (await stores(h)).workoutPlans.length === planCount &&
      (await stores(h)).workoutPlans[0].revision === 3 &&
      j(await draftNames(h, KEY_TOMORROW)) === j(['맨몸 스쿼트']),
  )
  await mustClick(
    h,
    '^취소$',
    '[role=group][aria-labelledby="plan-review-panel-title"]',
  )

  // 삭제: 취소 후 확인
  await h.go('/records/exercise/my', 300)
  await mustUntil(h, `!!document.querySelector('[data-plan-card]')`)
  await mustClick(h, '^계획 삭제$')
  await mustUntil(
    h,
    `!!document.querySelector('[role=group][aria-label="내일 운동 계획 삭제 확인"]')`,
  )
  await mustClick(
    h,
    '^취소$',
    '[role=group][aria-label="내일 운동 계획 삭제 확인"]',
  )
  await h.sleep(200)
  check(
    h,
    'T18. 삭제 확인에서 취소하면 계획이 그대로다',
    (await stores(h)).workoutPlans.length === 1 &&
      !(await h.ev(
        `!!document.querySelector('[role=group][aria-label="내일 운동 계획 삭제 확인"]')`,
      )),
  )
  await mustClick(h, '^계획 삭제$')
  await mustClick(
    h,
    '^삭제하기$',
    '[role=group][aria-label="내일 운동 계획 삭제 확인"]',
  )
  await waitText(h, '/아직 내일 계획이 없어요/')
  const afterDelete = await stores(h)
  check(
    h,
    'T19. 삭제하기: 계획이 지워지고 빈 상태("아직 내일 계획이 없어요")가 되며 다른 저장소(운동 목록·기록·루틴·식단)와 오늘 초안은 그대로다',
    afterDelete.workoutPlans.length === 0 &&
      others(afterDelete) === othersBefore &&
      j(await draftNames(h, KEY_TODAY)) === j(['플랭크']),
  )

  // 계획 날짜가 오늘이 된 계획(자정 이후): 조회·삭제만 되고 자동으로 오늘의 운동이 되거나 시작되지 않는다.
  await run(
    h,
    `
    const noonYesterday = new Date(); noonYesterday.setDate(noonYesterday.getDate() - 1); noonYesterday.setHours(12, 0, 0, 0);
    const old = wp.createIndexedDbWorkoutPlanRepository('free', { now: () => noonYesterday });
    await old.create({ requestId: 'arrived-1', planDate: day(0), draft: mk(['푸시업', '스쿼트']), knownExerciseIds: known });
    return true;
  `,
  )
  await h.go('/records/exercise/my', 300)
  await mustUntil(h, `!!document.querySelector('[data-plan-card]')`)
  const arrived = await snap(h)
  check(
    h,
    'T20. 계획 날짜가 오늘이 된 계획: W10에 "예정일이 된 계획"으로 보이고 수정 버튼 없이 삭제만 있으며 자동으로 오늘의 운동이 되거나 시작되지 않는다고 알린다',
    (await h.ev(
      `document.querySelector('[data-plan-card]').getAttribute('data-plan-card')`,
    )) === day(0) &&
      /예정일이 된 계획/.test(arrived.text) &&
      /자동으로 오늘의 운동이 되거나 시작되지 않아요/.test(arrived.text) &&
      !(await h.ev(
        `[...document.querySelectorAll('[data-plan-card] button')].some(b=>/^계획 수정$/.test(b.innerText.trim()))`,
      )) &&
      (await h.ev(
        `[...document.querySelectorAll('[data-plan-card] button')].some(b=>/^계획 삭제$/.test(b.innerText.trim()))`,
      )),
    arrived.text.slice(0, 200),
  )
  check(
    h,
    'T21. 그 계획이 있어도 오늘의 운동 목록·완료 기록·세션·통계 저장소는 처음 그대로이고 오늘의 운동 영역에 계획의 운동이 나타나지 않는다(자동 변환·시작·완료 없음)',
    others(await stores(h)) === othersBefore &&
      (await stores(h)).workoutSessions.length ===
        seeded.workoutSessions.length,
  )
  await h.go('/records/exercise', 300)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(h, `!!document.querySelector('[data-next-plan]')`)
  await planOpen(h)
  check(
    h,
    'T22. W01: 예정일이 된 계획이 있으면 자동으로 시작되지 않는다는 안내와 함께 내일 계획 만들기 링크가 보인다',
    /예정일이 된 계획이 있어요\. 자동으로 시작되지 않아요/.test(
      await rowText(),
    ) && (await rowLinks()).some((l) => /계획 만들기/.test(l.t)),
    await rowText(),
  )
  await h.go('/records/exercise/my', 300)
  await mustUntil(h, `!!document.querySelector('[data-plan-card]')`)
  await mustClick(h, '^계획 삭제$')
  await mustClick(
    h,
    '^삭제하기$',
    '[role=group][aria-label="내일 운동 계획 삭제 확인"]',
  )
  await waitText(h, '/아직 내일 계획이 없어요/')
  check(
    h,
    'T23. 오늘이 된 계획도 화면에서 삭제할 수 있다',
    (await stores(h)).workoutPlans.length === 0,
  )

  // 회귀: 오늘 운동 구성·검토 경로는 그대로(day 없음).
  const s390 = await snap(h)
  check(
    h,
    'T24. 390px 폭에서 가로 넘침이 없다(W10)',
    s390.over <= 0,
    String(s390.over),
  )
  await h.go('/records/exercise/review', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`)
  const todayReview = await snap(h)
  check(
    h,
    'T25. day 없는 W11은 기존 오늘 운동 목록 검토 그대로다(오늘 초안 플랭크, "오늘의 운동으로 저장")',
    /오늘의 운동으로 저장/.test(todayReview.text) &&
      /플랭크/.test(todayReview.text) &&
      !/내일 계획으로 저장/.test(todayReview.text),
    todayReview.text.slice(0, 200),
  )

  // 계정 격리
  await logout(h)
  await h.login('full')
  await h.go('/records/exercise/my', 300)
  await waitText(h, '/아직 내일 계획이 없어요/')
  await h.go('/records/exercise/compose?day=tomorrow', 300)
  await mustUntil(
    h,
    `/아직 등록한 운동이 없어요/.test(document.querySelector('main').innerText)`,
  )
  check(
    h,
    'T26. 다른 계정(full)의 W10·W02(내일)에는 free 계정의 계획·초안이 보이지 않는다',
    (await draftOf(h, KEY_TOMORROW)) === null &&
      (await draftOf(h, KEY_TODAY)) === null,
  )
  check(
    h,
    'T27. 스키마가 승인된 v6다',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA),
  )
})

// ── D. 신규 사용자 · 빈 상태 ─────────────────────────────────────────────────────────
await scenario('C-plan-fresh', async (h) => {
  await h.login('free')
  await h.go('/records/exercise/my', 300)
  await settleScreen(h, { path: '/records/exercise/my', h1: '나의 운동' })
  await waitText(h, '/아직 내일 계획이 없어요/')
  const s = await snap(h)
  check(
    h,
    'T28. 신규 사용자의 W10: DB가 v6로 새로 만들어지고 내일 계획 빈 상태와 "내일 운동 계획 만들기" 링크를 보인다(준비 중 문구 없음)',
    j(await schemaInfo(h)) === j(EXPECTED_SCHEMA) &&
      !/내일 계획은 아직 준비 중이에요/.test(s.text) &&
      s.links.some(
        (l) =>
          l.h === '/records/exercise/compose?day=tomorrow' &&
          /내일 운동 계획 만들기/.test(l.t),
      ),
    s.text.slice(0, 200),
  )
  await h.go('/records/exercise/review?day=tomorrow', 300)
  await mustUntil(
    h,
    `/구성한 내일 운동이 없어요/.test(document.querySelector('main').innerText)`,
  )
  check(
    h,
    'T29. 내일 구성 없이 W11(day=tomorrow)을 열면 빈 안내와 내일 구성 링크를 보이고 저장 버튼은 없다',
    !(await h.ev(
      `/내일 계획으로 저장/.test(document.querySelector('main').innerText)`,
    )) &&
      (await snap(h)).links.some(
        (l) => l.h === '/records/exercise/compose?day=tomorrow',
      ),
  )
})
