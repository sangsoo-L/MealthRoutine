// [chrome 회귀] FAST-02: 운동 루틴(W06·W07·W08) + IndexedDB v2~v5 업그레이드(workoutRoutines·mealRecords·mealPlans·workoutPlans) + 운동 기록 통계(/records/exercise/stats) + W01·P09 연결
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only routines-stats`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 저장소 시험은 앱과 같은 저장소 코드를 페이지 안에서 부르고, 통계는 시드한 기록과 독립적으로 계산한 기대값(Date 연산)과 비교한다. 앱 소스를 수정하지 않는다.
import { start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  dumpStores,
  mustClick as baseClick,
  mustUntil as baseUntil,
  schemaInfo,
  seedRun,
  settleScreen,
  waitPath as basePath,
} from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
// 새 Chrome 프로필은 시나리오 첫 화면을 개발 서버에서 새로 받아 와 느릴 수 있다. 대기 한도를 두 배로 둔다(조건이 충족되면 바로 넘어간다).
const mustUntil = (h, expr, n = 80) => baseUntil(h, expr, n * 2)
const waitPath = (h, re, n = 80) => basePath(h, re, n * 2)
const mustClick = baseClick

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

const ROUTINES = '/records/exercise/routines'
const j = JSON.stringify

/** 페이지 안 평가 공통 머리말: 앱의 저장소 코드와 W02 초안 모델. */
const PRE = `
  const m = await import('/src/exercise/local/indexedDbWorkoutRepositories.ts');
  const dm = await import('/src/exercise/workoutDraftModel.ts');
  const mkDraft = (names) => ({ v: 1, day: 'today', updatedAt: new Date().toISOString(),
    items: names.map((n, i) => ({ itemId: 'i' + i, exerciseId: 'e-' + i, name: n, recordType: 'reps', sets: [{ reps: 10 }, { reps: 10 }] })) });
  const err = async (fn) => { try { await fn(); return 'no-error' } catch (e) { return (e.reason ?? e.name) + (e.code ? ':' + e.code : '') + (e.currentRevision ? '@' + e.currentRevision : '') } };
`
const run = (h, body) => h.ev(`(async()=>{ ${PRE} ${body} })()`)

/** 기존 세 저장소(목록·세션·기록)의 모든 행. v2에서 바뀌지 않아야 하는 값이다. */
async function oldStores(h) {
  const all = JSON.parse(await dumpStores(h))
  return j({
    workoutLists: all.workoutLists,
    workoutRecords: all.workoutRecords,
    workoutSessions: all.workoutSessions,
  })
}

/** textarea 값을 React가 알아채도록 네이티브 setter로 바꾸고 input 이벤트를 보낸다. */
const setTextarea = (h, sel, value) =>
  h.ev(
    `(()=>{const t=document.querySelector(${JSON.stringify(sel)});const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;t.focus();set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}))})()`,
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

const waitH1 = (h, text, n = 80) =>
  mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()===${j(text)}`,
    n,
  )

// ── A. 저장소(실제 IndexedDB): 생성·조회·수정·삭제·중복 방지·계정 격리·소유자 확인·기존 데이터 보존 ──────────
await scenario('A-repo', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 1,
    reqId: 'a-old',
    name: '기존기록',
  })
  await seedRun(h, 'full', {
    dayOffset: -3,
    hour: 9,
    runs: 1,
    reqId: 'a-other',
    name: '다른계정기록',
  })
  const oldBefore = await oldStores(h)
  const r = await run(
    h,
    `
    const free = m.createIndexedDbWorkoutRoutineRepository('free');
    const full = m.createIndexedDbWorkoutRoutineRepository('full');
    const wait = () => new Promise((ok) => setTimeout(ok, 8));
    const out = {};
    const c1 = await free.create({ requestId: 'req-1', name: ' 상체 ', description: '소개', draft: mkDraft(['푸시업', '스쿼트']) });
    out.c1 = { created: c1.created, rev: c1.routine.revision, name: c1.routine.name, items: c1.routine.items.length, sameTime: c1.routine.createdAt === c1.routine.updatedAt, owner: c1.routine.ownerId };
    const again = await free.create({ requestId: 'req-1', name: '상체', description: '소개', draft: mkDraft(['푸시업', '스쿼트']) });
    out.again = { created: again.created, sameId: again.routine.id === c1.routine.id };
    out.conflict = await err(() => free.create({ requestId: 'req-1', name: '다른 내용', description: '', draft: mkDraft(['푸시업']) }));
    out.countAfterDup = (await free.list()).items.length;
    out.got = (await free.get(c1.routine.id))?.name;
    out.badRequest = await err(() => free.create({ requestId: '공백 있음', name: 'a', description: '', draft: mkDraft(['푸시업']) }));
    out.noName = await err(() => free.create({ requestId: 'req-x1', name: '  ', description: '', draft: mkDraft(['푸시업']) }));
    out.noItems = await err(() => free.create({ requestId: 'req-x2', name: 'a', description: '', draft: mkDraft([]) }));
    out.longDesc = await err(() => free.create({ requestId: 'req-x3', name: 'a', description: '가'.repeat(201), draft: mkDraft(['푸시업']) }));
    out.countAfterInvalid = (await free.list()).items.length;
    await wait();
    const c2 = await free.create({ requestId: 'req-2', name: '하체', description: '', draft: mkDraft(['런지']) });
    await wait();
    const u1 = await free.update(c1.routine.id, { expectedRevision: 1, name: '상체 수정', description: '바뀐 소개', draft: mkDraft(['스쿼트', '푸시업', '플랭크']) });
    out.u1 = { rev: u1.revision, created: u1.createdAt === c1.routine.createdAt, updatedLater: u1.updatedAt >= c1.routine.updatedAt && u1.updatedAt !== c1.routine.updatedAt, id: u1.id === c1.routine.id, items: u1.items.map((i) => i.exerciseNameSnapshot), req: u1.requestId === 'req-1' };
    out.stale = await err(() => free.update(c1.routine.id, { expectedRevision: 1, name: 'x', description: '', draft: mkDraft(['푸시업']) }));
    out.updateInvalid = await err(() => free.update(c1.routine.id, { expectedRevision: 2, name: '', description: '', draft: mkDraft(['푸시업']) }));
    out.afterBad = (await free.get(c1.routine.id)).name;
    out.order = (await free.list()).items.map((x) => x.name);
    out.fullList = (await full.list()).items.length;
    out.fullGet = (await full.get(c1.routine.id)) === null;
    out.fullUpdate = await err(() => full.update(c1.routine.id, { expectedRevision: 2, name: '탈취', description: '', draft: mkDraft(['푸시업']) }));
    out.fullDelete = await err(() => full.delete(c1.routine.id));
    out.stillThere = (await free.get(c1.routine.id))?.name;
    const f1 = await full.create({ requestId: 'req-1', name: '다른 계정 루틴', description: '', draft: mkDraft(['풀업']) });
    out.fullCreate = { created: f1.created, owner: f1.routine.ownerId };
    out.freeAfterFull = (await free.list()).items.map((x) => x.name);
    out.fullAfter = (await full.list()).items.map((x) => x.name);
    out.staleDelete = await err(() => free.delete(c2.routine.id, { expectedRevision: 9 }));
    out.stillAfterStale = (await free.get(c2.routine.id))?.name;
    await free.delete(c2.routine.id, { expectedRevision: 1 });
    out.deleted = (await free.get(c2.routine.id)) === null;
    out.deleteAgain = await err(() => free.delete(c2.routine.id));
    out.finalList = (await free.list()).items.map((x) => x.name);
    out.freeId = c1.routine.id;
    out.fullId = f1.routine.id;
    return out;
  `,
  )
  check(
    h,
    'A1. 생성: 이름 앞뒤 공백 정리, revision 1, 생성·수정 시각 같음, 소유자 free',
    r.c1.created === true &&
      r.c1.rev === 1 &&
      r.c1.name === '상체' &&
      r.c1.items === 2 &&
      r.c1.sameTime &&
      r.c1.owner === 'free',
    j(r.c1),
  )
  check(
    h,
    'A2. 중복 저장 방지: 같은 요청 id·같은 내용은 새로 만들지 않고 처음 루틴을 돌려주며, 다른 내용은 conflict(requestConflict)다',
    r.again.created === false &&
      r.again.sameId &&
      r.conflict === 'conflict:requestConflict' &&
      r.countAfterDup === 1,
    j({ again: r.again, conflict: r.conflict, count: r.countAfterDup }),
  )
  check(
    h,
    'A3. 올바르지 않은 입력은 저장하지 않는다(요청 id 형식·이름 없음·운동 없음·소개 200자 초과)',
    r.badRequest === 'validation:invalidRequestId' &&
      r.noName.startsWith('validation') &&
      r.noItems.startsWith('validation') &&
      r.longDesc.startsWith('validation') &&
      r.countAfterInvalid === 1,
    j(r),
  )
  check(h, 'A4. 조회: id로 읽으면 같은 루틴이다', r.got === '상체')
  check(
    h,
    'A5. 수정: revision 2, createdAt 유지, updatedAt 갱신, id·요청 id 유지, 운동 구성 교체',
    r.u1.rev === 2 &&
      r.u1.created &&
      r.u1.updatedLater &&
      r.u1.id &&
      r.u1.req &&
      j(r.u1.items) === j(['스쿼트', '푸시업', '플랭크']),
    j(r.u1),
  )
  check(
    h,
    'A6. 동시 수정 감지: 오래된 revision은 conflict(revisionMismatch)이고 현재 revision(2)을 알린다. 올바르지 않은 수정은 값을 바꾸지 않는다',
    r.stale === 'conflict:revisionMismatch@2' &&
      r.updateInvalid.startsWith('validation') &&
      r.afterBad === '상체 수정',
    j({ stale: r.stale, bad: r.updateInvalid, name: r.afterBad }),
  )
  check(
    h,
    'A7. 목록은 최근 수정 순이다(수정한 상체가 하체보다 앞)',
    j(r.order) === j(['상체 수정', '하체']),
    j(r.order),
  )
  check(
    h,
    'A8. 계정 격리: full 계정은 free 루틴을 읽거나 수정·삭제할 수 없고(notFound, 지워지지 않음) 자기 루틴만 가진다',
    r.fullList === 0 &&
      r.fullGet &&
      r.fullUpdate === 'notFound' &&
      r.fullDelete === 'notFound' &&
      r.stillThere === '상체 수정',
    j({
      list: r.fullList,
      get: r.fullGet,
      update: r.fullUpdate,
      del: r.fullDelete,
      still: r.stillThere,
    }),
  )
  check(
    h,
    'A9. 같은 요청 id(req-1)도 계정이 다르면 따로 만들어지고 서로의 목록에 섞이지 않는다',
    r.fullCreate.created === true &&
      r.fullCreate.owner === 'full' &&
      j(r.freeAfterFull) === j(['상체 수정', '하체']) &&
      j(r.fullAfter) === j(['다른 계정 루틴']),
    j({ free: r.freeAfterFull, full: r.fullAfter }),
  )
  check(
    h,
    'A10. 삭제: revision이 다르면 conflict로 지우지 않고, 맞으면 소유자 확인 뒤 지우며, 다시 지우면 notFound다',
    r.staleDelete === 'conflict:revisionMismatch@1' &&
      r.stillAfterStale === '하체' &&
      r.deleted &&
      r.deleteAgain === 'notFound' &&
      j(r.finalList) === j(['상체 수정']),
    j({
      stale: r.staleDelete,
      still: r.stillAfterStale,
      again: r.deleteAgain,
      final: r.finalList,
    }),
  )
  const oldAfter = await oldStores(h)
  check(
    h,
    'A11. 기존 목록·세션·완료 기록의 모든 행이 루틴 생성·수정·삭제 뒤에도 바이트 단위로 그대로다',
    oldAfter === oldBefore,
    `전 ${oldBefore.length}자 / 후 ${oldAfter.length}자`,
  )
  const schema = await schemaInfo(h)
  check(
    h,
    'A12. 스키마가 승인된 v6다(version 6, 저장소 9개, 인덱스 19개: workoutRoutines·mealRecords·mealPlans·workoutPlans·dailyQuizzes·rewardLedger 포함)',
    j(schema) === j(EXPECTED_SCHEMA),
    j(schema).slice(0, 240),
  )
  // 손상 행: 건너뛰고 건수만 알리며 정상 루틴은 숨기지 않는다. 다른 계정의 손상 행은 세지 않는다.
  const corrupt = await run(
    h,
    `
    const db = await new Promise((ok, no) => { const q = indexedDB.open('mealthroutine-exercise'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error) });
    await new Promise((ok, no) => { const tx = db.transaction('workoutRoutines', 'readwrite'); const s = tx.objectStore('workoutRoutines');
      s.put({ id: 'corrupt-r', ownerId: 'free', schemaVersion: 1, name: '', description: '', items: '깨짐', revision: 1, requestId: 'corrupt-req', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
      s.put({ id: 'corrupt-o', ownerId: 'full', schemaVersion: 1, name: '', description: '', items: '깨짐', revision: 1, requestId: 'corrupt-req2', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
      tx.oncomplete = ok; tx.onerror = () => no(tx.error) });
    db.close();
    const free = m.createIndexedDbWorkoutRoutineRepository('free');
    const list = await free.list();
    return { names: list.items.map((x) => x.name), skipped: list.skippedCount, get: await err(() => free.get('corrupt-r')), other: await free.get('corrupt-o') };
  `,
  )
  check(
    h,
    'A13. 손상 행은 건너뛰고 건수(1)만 알리며 정상 루틴은 그대로고, 다른 계정의 손상 행은 세지도 보이지도 않는다',
    j(corrupt.names) === j(['상체 수정']) &&
      corrupt.skipped === 1 &&
      corrupt.get === 'error:corruptRecord' &&
      corrupt.other === null,
    j(corrupt),
  )
})

// ── B. v1 → v2 업그레이드와 신규 사용자 초기화 ───────────────────────────────────────────
await scenario('B-migration', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 9,
    runs: 2,
    kind: 'mixed',
    reqId: 'm-free',
    name: '업그레이드기록',
  })
  await seedRun(h, 'full', {
    dayOffset: -3,
    hour: 9,
    runs: 1,
    reqId: 'm-full',
    name: '다른계정기록',
  })
  await h.seedList('free', 'mixed', 'm-today')
  const before = await dumpStores(h)
  const parsedBefore = JSON.parse(before)
  // 앱이 만든 DB를 지우고, v1 구조(저장소 3개·인덱스 9개)에 같은 행을 넣어 "v1 상태의 기존 사용자"를 만든다.
  const made = await h.ev(`(async()=>{
    const rows = ${before};
    await new Promise((ok, no) => { const q = indexedDB.deleteDatabase('mealthroutine-exercise'); q.onsuccess = ok; q.onerror = () => no(q.error); q.onblocked = () => no(new Error('삭제가 막혔어요')) });
    const db = await new Promise((ok, no) => {
      const q = indexedDB.open('mealthroutine-exercise', 1);
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
      };
      q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
    });
    await new Promise((ok, no) => {
      const tx = db.transaction(['workoutLists', 'workoutSessions', 'workoutRecords'], 'readwrite');
      for (const name of ['workoutLists', 'workoutSessions', 'workoutRecords']) for (const row of rows[name]) tx.objectStore(name).put(row);
      tx.oncomplete = ok; tx.onerror = () => no(tx.error);
    });
    const info = { version: db.version, stores: [...db.objectStoreNames].sort() };
    db.close();
    return info;
  })()`)
  check(
    h,
    'B1. v1 상태의 DB를 만들었다(version 1, 저장소 3개, workoutRoutines 없음)',
    made.version === 1 &&
      j(made.stores) ===
        j(['workoutLists', 'workoutRecords', 'workoutSessions']),
    j(made),
  )
  check(
    h,
    'B2. v1에 넣은 행이 있다(기록 3건·목록 3건 이상)',
    parsedBefore.workoutRecords.length === 3 &&
      parsedBefore.workoutLists.length >= 3,
    `${parsedBefore.workoutRecords.length}/${parsedBefore.workoutLists.length}`,
  )
  // 앱을 다시 열면 v2로 올라간다.
  await h.go('/records/exercise/my', 200)
  await settleScreen(h, { path: '/records/exercise/my', h1: '나의 운동' })
  await mustUntil(
    h,
    `document.querySelectorAll('[data-record-item]').length===2`,
    80,
  )
  const upgraded = await schemaInfo(h)
  check(
    h,
    'B3. 앱이 열면 v1이 v6로 올라가고 스키마가 승인된 구조와 같다(workoutRoutines·mealRecords·mealPlans·workoutPlans 추가, 기존 저장소·인덱스 그대로)',
    j(upgraded) === j(EXPECTED_SCHEMA),
    j(upgraded).slice(0, 240),
  )
  const after = JSON.parse(await dumpStores(h))
  check(
    h,
    'B4. 업그레이드 뒤 기존 목록·세션·완료 기록의 모든 행이 v1 때와 바이트 단위로 같고 새 저장소는 비어 있다',
    j(after.workoutLists) === j(parsedBefore.workoutLists) &&
      j(after.workoutRecords) === j(parsedBefore.workoutRecords) &&
      j(after.workoutSessions) === j(parsedBefore.workoutSessions) &&
      j(after.workoutRoutines) === '[]',
    `lists ${after.workoutLists.length} records ${after.workoutRecords.length} routines ${after.workoutRoutines.length}`,
  )
  const s = await snap(h)
  check(
    h,
    'B5. 기존 완료 기록이 화면에 그대로 보인다(W10 기록 2건, 다른 계정 기록 없음)',
    /전체 2건 중 2건/.test(s.text) && !/다른계정기록/.test(s.text),
    s.text.slice(0, 160),
  )
  const works = await run(
    h,
    `
    const free = m.createIndexedDbWorkoutRoutineRepository('free');
    const c = await free.create({ requestId: 'after-up', name: '업그레이드 뒤 루틴', description: '', draft: mkDraft(['푸시업']) });
    return { created: c.created, list: (await free.list()).items.map((x) => x.name) };
  `,
  )
  check(
    h,
    'B6. 업그레이드한 DB에서 루틴 저장·조회가 동작한다',
    works.created && j(works.list) === j(['업그레이드 뒤 루틴']),
    j(works),
  )
})

await scenario('C-fresh-user', async (h) => {
  // 이 프로필에는 DB가 아직 없다(신규 사용자). 로그인 화면은 저장소를 열지 않는다.
  await h.login('free')
  const none = await h.ev(
    `(async()=>{ const dbs = indexedDB.databases ? await indexedDB.databases() : []; return dbs.map(d=>d.name) })()`,
  )
  await h.go(ROUTINES, 200)
  await settleScreen(h, { path: ROUTINES, h1: '내 운동 루틴' })
  await mustUntil(
    h,
    `/아직 저장한 루틴이 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  const schema = await schemaInfo(h)
  const s = await snap(h)
  check(
    h,
    'C1. 신규 사용자: 저장된 데이터가 없는 상태에서 W06이 열리면 DB가 v6 스키마이고 빈 상태를 보인다(회원 홈이 퀴즈 완료 여부를 조회하며 빈 DB를 먼저 만들 수 있다)',
    j(schema) === j(EXPECTED_SCHEMA) &&
      (await h.ev(
        `(async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('mealthroutine-exercise');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const t=db.transaction('workoutRoutines','readonly').objectStore('workoutRoutines');const n=await new Promise((ok)=>{const c=t.count();c.onsuccess=()=>ok(c.result)});db.close();return n})()`,
      )) === 0 &&
      /아직 저장한 루틴이 없어요/.test(s.text),
    j({ before: none, version: schema.version }),
  )
  check(
    h,
    'C2. 빈 상태에서도 "새 루틴 만들기"가 W08로 가는 링크다',
    s.links.some(
      (l) => l.h === `${ROUTINES}/new` && /새 루틴 만들기/.test(l.t),
    ),
    j(s.links),
  )
})

// ── D. 화면: W06 → W08 만들기 → W07 → 수정 → 운동 준비(W02) → 삭제 ─────────────────────────
await scenario('D-routine-ui', async (h) => {
  await h.login('free')
  // 운동 목록에서 기본 기록 방식이 횟수형인 운동 3개를 골라 free 계정의 즐겨찾기에 넣는다(운동 선택 화면에서 고르기 위해).
  const picked = await h.ev(`(async()=>{
    const ex = await import('/src/exercise/exerciseSource.ts');
    const dm = await import('/src/exercise/workoutDraftModel.ts');
    const fav = await import('/src/exercise/favoriteSource.ts');
    const all = await ex.createExerciseRepository().list({ query: '', difficulty: null, part: null, tool: null });
    const reps = all.filter((e) => dm.resolveStoredRecordType(e) === 'reps').slice(0, 3);
    const repo = fav.createFavoriteRepository('free');
    for (const e of reps) await repo.add(e.id);
    return reps.map((e) => ({ id: e.id, name: e.name }));
  })()`)
  check(h, 'D0. 시험용 운동 3개를 준비했다', picked.length === 3, j(picked))
  const [e1, e2, e3] = picked

  await h.go(ROUTINES, 200)
  await settleScreen(h, { path: ROUTINES, h1: '내 운동 루틴' })
  await mustClick(h, '^새 루틴 만들기$')
  await waitPath(h, `^${ROUTINES}/new$`)
  await waitH1(h, '새 루틴 만들기')
  let s = await snap(h)
  check(
    h,
    'D1. W06 → W08: 새 루틴 화면(이름·소개·운동 추가·저장·편집 취소)',
    (await h.ev(
      `!!document.querySelector('#routine-name') && !!document.querySelector('#routine-description') && !!document.querySelector('#routine-add')`,
    )) &&
      /루틴 저장/.test(s.text) &&
      /편집 취소/.test(s.text) &&
      /아직 추가한 운동이 없어요/.test(s.text),
  )
  // 빈 상태로 저장 → 오류 안내, 저장되지 않음, 이름 입력으로 포커스
  await mustClick(h, '^루틴 저장$')
  await mustUntil(h, `!!document.querySelector('[role=alert]')`, 40)
  s = await snap(h)
  const focusId = await h.ev(`document.activeElement?.id`)
  const countBefore = await run(
    h,
    `return (await m.createIndexedDbWorkoutRoutineRepository('free').list()).items.length`,
  )
  check(
    h,
    'D2. 빈 상태로 저장하면 이름·운동 오류를 한꺼번에 알리고 이름 입력으로 포커스가 가며 저장하지 않는다',
    /고칠 곳이 2개 있어요/.test(s.text) &&
      /루틴 이름을 입력해 주세요/.test(s.text) &&
      focusId === 'routine-name' &&
      countBefore === 0,
    `${focusId} / ${countBefore} / ${s.text.slice(0, 120)}`,
  )
  // 운동 추가: 운동 선택 화면이 같은 화면 안에서 열린다
  await mustClick(h, '^＋ 운동 추가$')
  await mustUntil(
    h,
    `/선택한 운동|즐겨찾기/.test(document.querySelector('main').innerText) && !document.querySelector('#routine-name')`,
    80,
  )
  for (const e of [e1, e2, e3]) {
    await mustUntil(
      h,
      `[...document.querySelectorAll('main button[aria-pressed]')].some(b=>b.innerText.includes(${j(e.name)}))`,
      80,
    )
    await h.ev(
      `[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.includes(${j(e.name)})).click()`,
    )
  }
  await mustClick(h, '^선택한 3개 운동 루틴에 추가')
  await mustUntil(h, `!!document.querySelector('#routine-name')`, 80)
  s = await snap(h)
  const cards = await h.ev(
    `[...document.querySelectorAll('main ol > li[id^="compose-item-"]')].map(li=>li.querySelector('h3,h2')?.textContent.trim() ?? li.innerText.split('\\n')[0])`,
  )
  check(
    h,
    'D3. 운동 선택에서 3개를 고르면 W08에 운동 카드 3개가 추가되고 추가 개수를 알린다',
    cards.length === 3 && /운동 3개를 추가했어요/.test(s.text),
    j(cards),
  )
  // 이름·소개 입력, 두 번째 운동을 위로, 첫 운동의 첫 세트 횟수를 12로
  await h.setVal('#routine-name', '  월요일 상체  ')
  await setTextarea(h, '#routine-description', '가슴과 팔 위주의 루틴')
  const ids = await h.ev(
    `[...document.querySelectorAll('main li[id^="compose-item-"]')].map(li=>li.id.replace('compose-item-',''))`,
  )
  await h.ev(`document.getElementById('compose-move-${ids[1]}-up').click()`)
  await mustUntil(
    h,
    `document.querySelector('main li[id^="compose-item-"]')?.id==='compose-item-${ids[1]}'`,
    40,
  )
  await h.setVal(`#compose-${ids[1]}-0-reps`, '12')
  await mustUntil(
    h,
    `document.querySelector('#compose-${ids[1]}-0-reps').value==='12'`,
    40,
  )
  // 세 번째 운동은 제거한다
  await h.ev(
    `document.querySelector('button[aria-label=${j(`${e3.name} 삭제`)}]').click()`,
  )
  await mustUntil(
    h,
    `document.querySelectorAll('main li[id^="compose-item-"]').length===2`,
    40,
  )
  const afterRemove = 2
  await mustClick(h, '^루틴 저장$')
  await mustUntil(
    h,
    `/^\\/records\\/exercise\\/routines\\/[^/]+$/.test(location.pathname) && location.pathname!=='${ROUTINES}/new'`,
    80,
  )
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체'`,
    80,
  )
  const detailPath = await h.path()
  const routineId = decodeURIComponent(detailPath.split('/').pop())
  s = await snap(h)
  const order = await h.ev(
    `[...document.querySelectorAll('[data-routine-exercise] h3')].map(x=>x.textContent.trim())`,
  )
  const expectedNames = [e2.name, e1.name]
  check(
    h,
    'D4. 저장하면 W07 상세로 이동한다(이름 정리·소개·운동 순서 변경·세트 목표 12회 반영)',
    order.join('|') === expectedNames.join('|') &&
      /가슴과 팔 위주의 루틴/.test(s.text) &&
      /1세트, 목표 12회|1세트 12회|모든 세트 동일 10회/.test(s.text) &&
      /12회/.test(s.text),
    j({ order, expectedNames, afterRemove }) + ' / ' + s.text.slice(0, 200),
  )
  check(
    h,
    'D5. W07: 운동 수·세트 요약, 등록 날짜, 수정하기·운동 준비·루틴 삭제가 있고 공유는 비활성이다',
    new RegExp(`운동 ${expectedNames.length}개 · \\d+세트`).test(s.text) &&
      /\d{4}\. \d+\. \d+\. 등록/.test(s.text) &&
      s.links.some((l) => /수정하기/.test(l.t)) &&
      /이 루틴으로 운동 준비/.test(s.text) &&
      /루틴 삭제/.test(s.text) &&
      (await h.ev(
        `[...document.querySelectorAll('main button')].some(b=>/^커뮤니티 공유$/.test(b.innerText.trim()) && b.getAttribute('aria-disabled')==='true')`,
      )),
    s.text.slice(0, 220),
  )
  const stored = await run(
    h,
    `const r = await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)}); return { name: r.name, desc: r.description, rev: r.revision, created: r.createdAt, sets: r.items[0].sets }`,
  )
  check(
    h,
    'D6. 저장소에 반영됐다(이름 정리, revision 1, 첫 운동의 첫 세트 12회)',
    stored.name === '월요일 상체' &&
      stored.rev === 1 &&
      stored.sets[0].reps === 12,
    j(stored),
  )
  // W07 → "이전" → W06(저장 화면은 기록에서 교체됐으므로 W08로 돌아가지 않는다) → 행 클릭 → W07
  await mustClick(h, '^이전$')
  await waitPath(h, `^${ROUTINES}$`)
  await waitH1(h, '내 운동 루틴')
  await mustUntil(
    h,
    `document.querySelectorAll('main ul[role=list] a').length===1`,
    80,
  )
  s = await snap(h)
  check(
    h,
    'D7. W07의 "이전"은 W06이고(편집 화면으로 돌아가지 않는다) 목록에 루틴이 1개 보인다',
    /월요일 상체/.test(s.text) && /1개/.test(s.text),
    s.text.slice(0, 160),
  )
  await h.ev(`document.querySelector('main ul[role=list] a').click()`)
  await waitPath(h, `^${ROUTINES}/${routineId}$`)
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체'`,
    80,
  )
  // 수정
  await mustClick(h, '^수정하기$')
  await waitPath(h, `^${ROUTINES}/${routineId}/edit$`)
  await waitH1(h, '루틴 수정')
  await mustUntil(
    h,
    `document.querySelector('#routine-name')?.value==='월요일 상체'`,
    80,
  )
  const prefilled = await h.ev(
    `({ desc: document.querySelector('#routine-description').value, cards: document.querySelectorAll('main li[id^="compose-item-"]').length })`,
  )
  check(
    h,
    'D8. W07 → W08 수정: 이름·소개·운동 구성이 채워져 열린다',
    prefilled.desc === '가슴과 팔 위주의 루틴' &&
      prefilled.cards === expectedNames.length,
    j(prefilled),
  )
  await h.setVal('#routine-name', '월요일 상체 (수정)')
  await mustClick(h, '^루틴 저장$')
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체 (수정)'`,
    80,
  )
  const updated = await run(
    h,
    `const r = await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)}); return { rev: r.revision, created: r.createdAt === ${j(stored.created)}, name: r.name }`,
  )
  check(
    h,
    'D9. 수정 저장: revision 2, 최초 저장 시각(createdAt) 유지, 새 이름이 W07에 보인다',
    updated.rev === 2 &&
      updated.created &&
      updated.name === '월요일 상체 (수정)',
    j(updated),
  )
  // 편집 취소: 저장하지 않고 상세로
  await mustClick(h, '^수정하기$')
  await waitH1(h, '루틴 수정')
  await mustUntil(
    h,
    `document.querySelector('#routine-name')?.value==='월요일 상체 (수정)'`,
    80,
  )
  await h.setVal('#routine-name', '저장하지 않을 이름')
  await mustClick(h, '^편집 취소$')
  await waitPath(h, `^${ROUTINES}/${routineId}$`)
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체 (수정)'`,
    80,
  )
  check(
    h,
    'D10. 편집 취소: 저장하지 않고 상세로 돌아오며 이름이 그대로다',
    (await run(
      h,
      `return (await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)})).revision`,
    )) === 2,
  )
  // 운동 준비 → W02(오늘의 운동 초안으로 복사) → 이전 → W07
  const before = await run(
    h,
    `return JSON.stringify(await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)}))`,
  )
  await mustClick(h, '^이 루틴으로 운동 준비$')
  await waitPath(h, '^/records/exercise/compose$')
  await mustUntil(
    h,
    `document.querySelectorAll('main li[id^="compose-item-"]').length===${expectedNames.length}`,
    80,
  )
  const composeText = await h.ev(`document.querySelector('main').innerText`)
  check(
    h,
    'D11. 운동 준비: 루틴의 운동이 W02(오늘의 운동 구성)에 담겨 열린다(루틴은 그대로)',
    expectedNames.every((n) => composeText.includes(n)) &&
      (await run(
        h,
        `return JSON.stringify(await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)}))`,
      )) === before,
    composeText.slice(0, 120),
  )
  await mustClick(h, '^이전$')
  await waitPath(h, `^${ROUTINES}/${routineId}$`)
  check(h, 'D12. W02의 "이전"은 루틴 상세(W07)로 돌아온다', true)
  // 구성 중인 초안이 있으면 확인 없이는 덮어쓰지 않는다
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체 (수정)'`,
    80,
  )
  await mustClick(h, '^이 루틴으로 운동 준비$')
  await mustUntil(
    h,
    `/구성 중인 운동을 바꿀까요/.test(document.querySelector('main').innerText)`,
    40,
  )
  check(
    h,
    'D13. 구성 중인 초안이 있으면 교체 확인 패널이 나오고 아직 이동하지 않는다',
    (await h.path()) === `${ROUTINES}/${routineId}`,
  )
  await mustClick(h, '^취소하고 유지하기$')
  await mustUntil(
    h,
    `!/구성 중인 운동을 바꿀까요/.test(document.querySelector('main').innerText)`,
    40,
  )
  check(
    h,
    'D14. 취소하면 패널이 닫히고 그대로 있다',
    (await h.path()) === `${ROUTINES}/${routineId}`,
  )
  await mustClick(h, '^이 루틴으로 운동 준비$')
  await mustUntil(
    h,
    `/구성 중인 운동을 바꿀까요/.test(document.querySelector('main').innerText)`,
    40,
  )
  await mustClick(h, '^이 루틴으로 바꾸기$')
  await waitPath(h, '^/records/exercise/compose$')
  check(h, 'D15. "이 루틴으로 바꾸기"를 확인하면 W02로 이동한다', true)
  // 삭제: 확인 패널 → 취소 → 삭제
  await h.go(`${ROUTINES}/${routineId}`, 200)
  await mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()==='월요일 상체 (수정)'`,
    80,
  )
  await mustClick(h, '^루틴 삭제$')
  await mustUntil(
    h,
    `/이 루틴을 삭제할까요/.test(document.querySelector('main').innerText)`,
    40,
  )
  await mustClick(h, '^취소$')
  await mustUntil(
    h,
    `!/이 루틴을 삭제할까요/.test(document.querySelector('main').innerText)`,
    40,
  )
  check(
    h,
    'D16. 삭제 확인에서 취소하면 루틴이 그대로다',
    (await run(
      h,
      `return (await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)})) !== null`,
    )) === true,
  )
  const oldBeforeDelete = await oldStores(h)
  await mustClick(h, '^루틴 삭제$')
  await mustClick(h, '^삭제하기$')
  await waitPath(h, `^${ROUTINES}$`)
  await mustUntil(
    h,
    `/아직 저장한 루틴이 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  const oldAfterDelete = await oldStores(h)
  check(
    h,
    'D17. 삭제하면 W06으로 가고 목록이 비며, 저장소에서 지워지고 기존 목록·기록은 영향이 없다',
    (await run(
      h,
      `return (await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(routineId)})) === null`,
    )) === true && oldAfterDelete === oldBeforeDelete,
  )
  await h.go(`${ROUTINES}/${routineId}`, 200)
  await mustUntil(
    h,
    `/루틴을 찾을 수 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  s = await snap(h)
  check(
    h,
    'D18. 삭제된(없는) 루틴의 주소는 "찾을 수 없어요"와 목록 링크만 보인다',
    s.links.some((l) => l.h === ROUTINES) && !/수정하기|루틴 삭제/.test(s.text),
    s.text.slice(0, 120),
  )
  await h.go(`${ROUTINES}/${routineId}/edit`, 200)
  await mustUntil(
    h,
    `/루틴을 찾을 수 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  check(h, 'D19. 없는 루틴의 수정 주소도 같은 안내다', true)
})

// ── E. 계정 격리(화면)와 연결: W01 · P09 · 통계 진입 ───────────────────────────────────────
await scenario('E-links-isolation', async (h) => {
  await h.login('free')
  await seedRun(h, 'free', {
    dayOffset: 0,
    hour: 9,
    runs: 1,
    reqId: 'e-rec',
    name: '연결기록',
  })
  await h.seedList('free', 'mixed', 'e-today')
  // W01: 루틴이 없으면 "루틴 만들기" 링크
  await h.go('/records/exercise', 200)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(
    h,
    `/내 운동 루틴/.test(document.querySelector('main').innerText)`,
    80,
  )
  await mustUntil(
    h,
    `!/루틴을 불러오는 중이에요/.test(document.querySelector('main').innerText)`,
    80,
  )
  let s = await snap(h)
  check(
    h,
    'E1. W01: 루틴이 없으면 "아직 저장한 루틴이 없어요"와 "루틴 만들기" 링크(W06), 통계는 "통계 보기" 링크이고 "준비 중" 배지가 없다',
    /아직 저장한 루틴이 없어요/.test(s.text) &&
      s.links.some((l) => l.h === ROUTINES && /루틴 만들기/.test(l.t)) &&
      s.links.some(
        (l) => l.h === '/records/exercise/stats' && /통계 보기/.test(l.t),
      ) &&
      !/운동 기록 통계\s*준비 중/.test(s.text),
    s.text.slice(
      s.text.indexOf('운동 관리'),
      s.text.indexOf('운동 관리') + 260,
    ),
  )
  // 루틴 2개를 저장하고 W01을 다시 열면 개수와 "루틴 보기"
  await run(
    h,
    `
    const r = m.createIndexedDbWorkoutRoutineRepository('free');
    await r.create({ requestId: 'e-1', name: '루틴 하나', description: '', draft: mkDraft(['푸시업']) });
    await r.create({ requestId: 'e-2', name: '루틴 둘', description: '', draft: mkDraft(['스쿼트']) });
    await m.createIndexedDbWorkoutRoutineRepository('full').create({ requestId: 'e-1', name: '다른 계정 루틴', description: '', draft: mkDraft(['풀업']) });
  `,
  )
  await h.go('/records/exercise', 200)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(
    h,
    `[...document.querySelectorAll('main a')].some(a=>/루틴 보기/.test(a.innerText))`,
    80,
  )
  s = await snap(h)
  check(
    h,
    'E2. W01: 저장한 루틴이 2개이면 "2개"와 "루틴 보기" 링크(다른 계정의 루틴은 세지 않는다)',
    /2개/.test(s.text.slice(s.text.indexOf('내 운동 루틴'))) &&
      s.links.some((l) => l.h === ROUTINES && /루틴 보기/.test(l.t)),
  )
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/루틴 보기/.test(a.innerText)).click()`,
  )
  await waitPath(h, `^${ROUTINES}$`)
  await mustUntil(
    h,
    `document.querySelectorAll('main ul[role=list] a').length===2`,
    80,
  )
  s = await snap(h)
  check(
    h,
    'E3. W01 → W06: 이 계정의 루틴 2개만 보이고 다른 계정의 루틴은 없다',
    /루틴 하나/.test(s.text) &&
      /루틴 둘/.test(s.text) &&
      !/다른 계정 루틴/.test(s.text),
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(h, 'E4. W06의 "이전" → W01', (await h.path()) === '/records/exercise')
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  await mustUntil(
    h,
    `[...document.querySelectorAll('main a')].some(a=>/통계 보기/.test(a.innerText))`,
    80,
  )
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/통계 보기/.test(a.innerText)).click()`,
  )
  await waitPath(h, '^/records/exercise/stats$')
  await waitH1(h, '운동 기록 통계')
  await mustClick(h, '^이전$')
  await waitPath(h, '^/records/exercise$')
  check(h, 'E5. W01 → 운동 기록 통계 → "이전" → W01', true)
  // P09 → W06 → 이전 → P09
  await h.go('/settings', 200)
  await waitH1(h, '상세 설정')
  await mustClick(h, '^내 운동 루틴$')
  await waitPath(h, `^${ROUTINES}$`)
  await waitH1(h, '내 운동 루틴')
  await mustClick(h, '^이전$')
  await waitPath(h, '^/settings$')
  check(
    h,
    'E6. 상세 설정(P09)의 "내 운동 루틴" → W06 → "이전" → 상세 설정',
    true,
  )
  // 다른 계정: 목록·상세 격리
  const freeRoutineId = await run(
    h,
    `return (await m.createIndexedDbWorkoutRoutineRepository('free').list()).items[0].id`,
  )
  await h.go('/settings', 200)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(500)
  await h.login('full')
  await h.go(ROUTINES, 200)
  await settleScreen(h, { path: ROUTINES, h1: '내 운동 루틴' })
  await mustUntil(
    h,
    `document.querySelectorAll('main ul[role=list] a').length===1`,
    80,
  )
  s = await snap(h)
  check(
    h,
    'E7. 다른 계정(full)의 W06에는 자기 루틴 1개만 보인다',
    /다른 계정 루틴/.test(s.text) && !/루틴 하나|루틴 둘/.test(s.text),
  )
  await h.go(`${ROUTINES}/${freeRoutineId}`, 200)
  await mustUntil(
    h,
    `/루틴을 찾을 수 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  await h.go(`${ROUTINES}/${freeRoutineId}/edit`, 200)
  await mustUntil(
    h,
    `/루틴을 찾을 수 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  check(
    h,
    'E8. 다른 계정의 루틴 주소(상세·수정)는 "찾을 수 없어요"다(존재 여부를 알리지 않는다)',
    (await run(
      h,
      `return (await m.createIndexedDbWorkoutRoutineRepository('free').get(${j(freeRoutineId)})) !== null`,
    )) === true,
  )
  // 개발용 예시(?sample=)에서는 루틴·통계 링크를 그리지 않는다(예시와 실제 값을 섞지 않는다)
  await h.go('/records/exercise?sample=filled', 200)
  await settleScreen(h, { path: '/records/exercise', h1: '운동 기록' })
  s = await snap(h)
  check(
    h,
    'E9. 개발용 예시 화면에는 루틴(W06)·통계 링크가 없다',
    !s.links.some((l) => l.h === ROUTINES || l.h === '/records/exercise/stats'),
    j(s.links.map((l) => l.h)),
  )
  // 비회원: 로그인 안내
  await h.go('/settings', 200)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(500)
  for (const path of [ROUTINES, `${ROUTINES}/new`, '/records/exercise/stats']) {
    await h.go(path, 300)
    await mustUntil(
      h,
      `/로그인 후 이용할 수 있어요/.test(document.body.innerText)`,
      80,
    )
  }
  check(h, 'E10. 비회원이 루틴·통계 주소를 열면 로그인 안내만 보인다', true)
})

// ── F. 운동 기록 통계: 시드한 기록과 독립적으로 계산한 기대값 비교 ───────────────────────────
const fmtDuration = (ms) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes === 0
    ? `${rest}초`
    : rest === 0
      ? `${minutes}분`
      : `${minutes}분 ${rest}초`
}

await scenario('F-stats', async (h) => {
  await h.login('free')
  // (오늘 기준 일수, 기록 수, 종류, 이름) — 같은 날 2건·지난주·지난달 등 다양한 위치. mixed는 시간형 세트라 61초가 측정된다.
  const seeds = [
    [0, 2, 'mixed', '푸시업'],
    [-1, 1, 'reps', '푸시업'],
    [-7, 1, 'reps', '푸시업'],
    [-20, 1, 'mixed', '푸시업'],
    [-45, 1, 'reps', '푸시업'],
  ]
  for (const [i, [offset, runs, kind, name]] of seeds.entries()) {
    await seedRun(h, 'free', {
      dayOffset: offset,
      hour: 9 + i,
      runs,
      kind,
      reqId: `f-${i}`,
      name,
    })
  }
  // 계획만 저장된 목록(기록 없음)·진행 중인 세션·다른 계정의 기록은 통계에 들어가지 않는다.
  await seedRun(h, 'free', {
    dayOffset: -2,
    hour: 8,
    runs: 0,
    reqId: 'f-plan',
    name: '계획만',
  })
  await run(
    h,
    `
    const lists = m.createIndexedDbWorkoutListRepository('free');
    const items = [{ itemId: 'p1', exerciseId: 'e-push', name: '진행중운동', recordType: 'reps', sets: [{ reps: 10 }] }];
    const saved = await lists.saveFromDraft({ requestId: 'f-prog', draft: { v: 1, day: 'today', items, updatedAt: new Date().toISOString() }, knownExerciseIds: new Set(['e-push']) });
    await m.createIndexedDbWorkoutSessionRepository('free').startOrResume(saved.list.id);
  `,
  )
  await seedRun(h, 'full', {
    dayOffset: 0,
    hour: 9,
    runs: 3,
    reqId: 'f-other',
    name: '다른계정통계',
  })

  // 독립 기대값: 페이지의 Date 연산으로 주간(월~일)·월간 구간과 기록의 소속을 계산한다(앱의 날짜 해석 코드를 쓰지 않는다).
  const oracle = (period, offset) =>
    h.ev(`(()=>{
      const seeds = ${j(seeds)};
      const day = (n) => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+n); return d };
      const key = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const t = day(0);
      let from, to;
      if (${j(period)} === 'week') {
        const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay()+6)%7) + ${offset}*7);
        from = key(mon); const sun = new Date(mon); sun.setDate(mon.getDate()+6); to = key(sun);
      } else {
        const a = new Date(t.getFullYear(), t.getMonth()+${offset}, 1, 12); const b = new Date(a.getFullYear(), a.getMonth()+1, 0, 12);
        from = key(a); to = key(b);
      }
      const recs = [];
      for (const [off, runs, kind, name] of seeds) for (let r=0;r<runs;r++) recs.push({ date: key(day(off)), kind, name });
      const inR = recs.filter((r) => r.date >= from && r.date <= to);
      const days = new Set(inR.map((r) => r.date));
      const measuredRecs = inR.filter((r) => r.kind === 'mixed');
      const byName = {};
      for (const r of inR) { const names = r.kind === 'mixed' ? [r.name, '덤벨 컬', '플랭크'] : [r.name]; for (const n of names) byName[n] = (byName[n]||0)+1 }
      // 버킷: 주간은 요일 7칸, 월간은 달 안으로 자른 월요일 시작 주
      const buckets = [];
      if (${j(period)} === 'week') { for (let i=0;i<7;i++){ const d = new Date(from+'T12:00:00'); d.setDate(d.getDate()+i); const k = key(d); buckets.push(inR.filter((r)=>r.date===k).length) } }
      else { let cur = new Date(from+'T12:00:00'); const end = new Date(to+'T12:00:00'); while (cur <= end) { const wd = (cur.getDay()+6)%7; const we = new Date(cur); we.setDate(cur.getDate()+(6-wd)); const e = we < end ? we : end; const a = key(cur), b = key(e); buckets.push(inR.filter((r)=>r.date>=a && r.date<=b).length); cur = new Date(e); cur.setDate(cur.getDate()+1) } }
      return { from, to, sessions: inR.length, days: days.size, measuredCount: measuredRecs.length, byName, buckets };
    })()`)
  const view = (h) =>
    h.ev(`(()=>{
      const m = document.querySelector('main');
      const tiles = [...m.querySelectorAll('section[aria-label=요약] > div')].map(d=>d.innerText.replace(/\\s+/g,' ').trim());
      return {
        label: m.querySelector('[aria-live=polite] p')?.textContent.trim(),
        sub: m.querySelectorAll('[aria-live=polite] p')[1]?.textContent.trim(),
        tiles,
        bars: [...m.querySelectorAll('[data-stats-bar]')].map(li=>Number(li.getAttribute('data-stats-bar'))),
        rows: Object.fromEntries([...m.querySelectorAll('[data-stats-exercise]')].map(li=>{ const t=li.innerText.replace(/\\s+/g,' ').trim(); const mm=t.match(/^(.*) (\\d+)회 · (\\d+)세트$/); return [mm?.[1], Number(mm?.[2])] })),
        pressed: [...m.querySelectorAll('[aria-pressed=true]')].map(b=>b.innerText.trim()),
        text: m.innerText.replace(/\\s+/g,' ').trim(),
      }})()`)
  const num = (tile) => Number(tile.match(/(\d+)/)?.[1])

  await h.go('/records/exercise/stats', 200)
  await waitH1(h, '운동 기록 통계')
  await mustUntil(
    h,
    `!!document.querySelector('[data-stats-bar]') || /이 기간에 완료한 운동 기록이 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )

  for (const [period, offset, label] of [
    ['week', 0, '이번 주'],
    ['week', -1, '지난주'],
    ['month', 0, '이번 달'],
    ['month', -1, '지난달'],
  ]) {
    // 주소로 기간을 열어 본다(새로고침해도 같은 값, 기간 단위·오프셋이 주소에 보관된다).
    await h.go(
      `/records/exercise/stats?${period === 'month' ? 'period=month&' : ''}${offset !== 0 ? `offset=${offset}` : ''}`,
      200,
    )
    await waitH1(h, '운동 기록 통계')
    await mustUntil(
      h,
      `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()===${j(label)})`,
      80,
    )
    await mustUntil(
      h,
      `!/불러오는 중/.test(document.querySelector('main').innerText)`,
      80,
    )
    const exp = await oracle(period, offset)
    const v = await view(h)
    if (exp.sessions === 0) {
      check(
        h,
        `F1(${label}). 기록이 없는 기간은 빈 상태 안내만 보이고 통계·그래프가 없다`,
        /이 기간에 완료한 운동 기록이 없어요/.test(v.text) &&
          v.bars.length === 0,
        j(v.text.slice(0, 160)),
      )
      continue
    }
    check(
      h,
      `F2(${label}). 운동 횟수(완료 세션 수)·운동한 날 수가 독립 계산과 같다(계획만 저장·진행 중·다른 계정 기록 제외)`,
      num(v.tiles[0]) === exp.sessions && num(v.tiles[1]) === exp.days,
      j({
        ui: v.tiles.slice(0, 2),
        exp: { sessions: exp.sessions, days: exp.days },
      }),
    )
    check(
      h,
      `F3(${label}). 측정 시간: 측정한 기록(${exp.measuredCount}건)이 있으면 합계(${exp.measuredCount}×61초), 없으면 "측정한 시간 없음"`,
      exp.measuredCount > 0
        ? v.tiles[2].includes(fmtDuration(exp.measuredCount * 61000)) &&
            v.tiles[2].includes(`측정한 기록 ${exp.measuredCount}건 합계`)
        : v.tiles[2].includes('측정한 시간 없음') &&
            !/건 합계/.test(v.tiles[2]),
      v.tiles[2],
    )
    check(
      h,
      `F4(${label}). 기간별 추이 막대(${exp.buckets.length}칸)의 값이 독립 계산과 같다`,
      j(v.bars) === j(exp.buckets),
      j({ ui: v.bars, exp: exp.buckets }),
    )
    check(
      h,
      `F5(${label}). 운동별 수행 횟수가 독립 계산과 같다(세션당 1번)`,
      j(Object.entries(v.rows).sort()) === j(Object.entries(exp.byName).sort()),
      j({ ui: v.rows, exp: exp.byName }),
    )
    check(
      h,
      `F6(${label}). 제목·기간: ${label} / ${exp.from} ~ ${exp.to}`,
      v.label === label &&
        v.pressed.includes(period === 'week' ? '주간' : '월간'),
      j({ label: v.label, sub: v.sub, pressed: v.pressed }),
    )
  }

  // 화면 조작: 전환·이동·주소 보관
  await h.go('/records/exercise/stats', 200)
  await waitH1(h, '운동 기록 통계')
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='이번 주')`,
    80,
  )
  const nextDisabled = await h.ev(
    `document.querySelector('button[aria-label="다음 주"]').getAttribute('aria-disabled')`,
  )
  await mustClick(h, '^월간$')
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='이번 달')`,
    40,
  )
  // 월간 기록을 불러와 주차별 제목이 나올 때까지 기다린 뒤 읽는다(전환 직후에는 불러오는 중일 수 있다).
  await mustUntil(
    h,
    `/주차별 운동 횟수/.test(document.querySelector('main').innerText)`,
    80,
  )
  let v = await view(h)
  check(
    h,
    'F7. 주간 → 월간 전환: 월간이 선택되고(aria-pressed) 이번 달·주차별 막대로 바뀌며 미래로 가는 "다음" 버튼은 비활성이다',
    nextDisabled === 'true' &&
      v.pressed.includes('월간') &&
      /주차별 운동 횟수/.test(v.text) &&
      (await h.path()) === '/records/exercise/stats?period=month',
    `${nextDisabled} ${await h.path()}`,
  )
  await h.ev(`document.querySelector('button[aria-label="이전 달"]').click()`)
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='지난달')`,
    40,
  )
  check(
    h,
    'F8. 이전 달 이동: 지난달 제목과 주소(offset=-1), 새로고침해도 유지',
    /offset=-1/.test(await h.path()),
  )
  await h.go(await h.path(), 200)
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='지난달')`,
    80,
  )
  await h.ev(`document.querySelector('button[aria-label="다음 달"]').click()`)
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='이번 달')`,
    40,
  )
  await mustClick(h, '^주간$')
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='이번 주')`,
    40,
  )
  check(
    h,
    'F9. 다음 달·주간 전환으로 이번 기간으로 돌아오고 주소에서 오프셋이 사라진다',
    (await h.path()) === '/records/exercise/stats',
    await h.path(),
  )
  // 한계: 주간 이전 버튼을 눌러 한참 거슬러 가도 빈 상태이고 가짜 값이 없다
  await h.go('/records/exercise/stats?offset=-30', 200)
  await waitH1(h, '운동 기록 통계')
  await mustUntil(
    h,
    `/이 기간에 완료한 운동 기록이 없어요/.test(document.querySelector('main').innerText)`,
    80,
  )
  v = await view(h)
  check(
    h,
    'F10. 기록이 없는 먼 기간(30주 전)은 빈 상태이고 막대·운동별 목록이 없다',
    v.bars.length === 0 &&
      Object.keys(v.rows).length === 0 &&
      v.tiles.length === 0,
  )
  // 올바르지 않은 주소 값은 이번 기간으로 본다
  await h.go('/records/exercise/stats?period=year&offset=abc', 200)
  await waitH1(h, '운동 기록 통계')
  await mustUntil(
    h,
    `[...document.querySelectorAll('main p')].some(p=>p.textContent.trim()==='이번 주')`,
    80,
  )
  check(
    h,
    'F11. 올바르지 않은 주소 값(period=year, offset=abc)은 이번 주로 본다',
    true,
  )

  // 계정 분리: full 계정은 자기 기록(오늘 3건)만
  await h.go('/settings', 200)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(500)
  await h.login('full')
  await h.go('/records/exercise/stats', 200)
  await waitH1(h, '운동 기록 통계')
  await mustUntil(h, `!!document.querySelector('[data-stats-bar]')`, 80)
  v = await view(h)
  check(
    h,
    'F12. 다른 계정(full)의 통계는 자기 기록 3건·1일만이고 free 계정의 기록·운동 이름이 없다',
    num(v.tiles[0]) === 3 &&
      num(v.tiles[1]) === 1 &&
      Object.keys(v.rows).join() === '다른계정통계' &&
      !/푸시업|덤벨 컬|플랭크/.test(v.text),
    j({ tiles: v.tiles, rows: v.rows }),
  )
  // 반응형·터치 영역
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    await h.go('/records/exercise/stats', 200)
    await waitH1(h, '운동 기록 통계')
    await mustUntil(h, `!!document.querySelector('[data-stats-bar]')`, 80)
    const p = await h.ev(`(()=>{
      const small=[...document.querySelectorAll('main a, main button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('.sr-only')&&r.height<43.5}).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,14)+':'+Math.round(e.getBoundingClientRect().height));
      return {ov:document.documentElement.scrollWidth-window.innerWidth, small:small.slice(0,5)}})()`)
    check(
      h,
      `F13-${w}. 통계: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0,
      j(p),
    )
  }
})

// ── G. 루틴 화면 반응형·접근성 ────────────────────────────────────────────────────────────
await scenario('G-routine-responsive', async (h) => {
  await h.login('free')
  await run(
    h,
    `
    const r = m.createIndexedDbWorkoutRoutineRepository('free');
    await r.create({ requestId: 'g-1', name: '아주아주아주아주긴루틴이름'.repeat(3), description: '긴 소개 문장입니다. '.repeat(8), draft: mkDraft(['아주아주아주아주긴운동이름'.repeat(3), '스쿼트', '런지']) });
  `,
  )
  const id = await run(
    h,
    `return (await m.createIndexedDbWorkoutRoutineRepository('free').list()).items[0].id`,
  )
  const PROBE = `(()=>{
    const w=window.innerWidth; const bad=[];
    for(const e of document.querySelectorAll('main *')){ const r=e.getBoundingClientRect(); if(r.width===0||r.height===0||e.closest('.sr-only')||e.classList.contains('sr-only')) continue; if(r.right>w+1||r.left<-1) bad.push(e.tagName+':'+Math.round(r.left)+'~'+Math.round(r.right)) }
    const small=[...document.querySelectorAll('main a, main button')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&!e.closest('.sr-only')&&r.height<43.5}).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,14)+':'+Math.round(e.getBoundingClientRect().height));
    const levels=[...document.querySelectorAll('main h1, main h2, main h3, main h4')].map(x=>+x.tagName[1]);
    return { ov: document.documentElement.scrollWidth-w, bad: bad.slice(0,4), small: small.slice(0,6), levels };
  })()`
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    for (const [path, ready] of [
      [
        ROUTINES,
        `document.querySelectorAll('main ul[role=list] a').length===1`,
      ],
      [
        `${ROUTINES}/${id}`,
        `document.querySelectorAll('[data-routine-exercise]').length===3`,
      ],
      [
        `${ROUTINES}/${id}/edit`,
        `document.querySelectorAll('main li[id^="compose-item-"]').length===3`,
      ],
    ]) {
      await h.go(path, 200)
      await mustUntil(h, ready, 80)
      const p = await h.ev(PROBE)
      const headingsOk =
        p.levels[0] === 1 &&
        p.levels.every((x, i) => i === 0 || x - p.levels[i - 1] <= 1)
      check(
        h,
        `G-${w} ${path.replace(id, ':id')}. 가로 넘침 없음·터치 영역 ≥44px·제목 계층 건너뜀 없음`,
        p.ov <= 0 && p.bad.length === 0 && p.small.length === 0 && headingsOk,
        j(p),
      )
    }
  }
  // 키보드: W06 → 새 루틴 만들기·루틴 행을 Tab으로 지나며 포커스 표시가 있고 포커스를 잃지 않는다
  await h.vp(390, 844)
  await h.go(ROUTINES, 200)
  await mustUntil(
    h,
    `document.querySelectorAll('main ul[role=list] a').length===1`,
    80,
  )
  await h.ev(
    `document.activeElement?.blur(); document.body.focus(); window.scrollTo(0,0)`,
  )
  const seen = []
  let outlined = true
  let lost = 0
  for (let i = 0; i < 12; i++) {
    await h.press('Tab', 'Tab', 9)
    const f = await h.ev(
      `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const c=getComputedStyle(e);return {t:(e.innerText||e.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim().slice(0,12),o:c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0}})()`,
    )
    if (!f) {
      lost++
      continue
    }
    seen.push(f.t)
    if (!f.o) outlined = false
    if (seen.length >= 3) break
  }
  check(
    h,
    'G-키보드. W06의 Tab 순서: 이전 → 새 루틴 만들기 → 루틴 행, 모두 포커스 표시가 있고 포커스를 잃지 않는다',
    lost === 0 &&
      outlined &&
      seen[0] === '이전' &&
      /^새 루틴 만들기/.test(seen[1]) &&
      /루틴이름|아주아주/.test(seen[2]),
    j({ seen, lost, outlined }),
  )
})
