// W10·W16 회귀용 시드·조회 도우미. 앱과 같은 IndexedDB 저장소 코드를 쓰되, 저장소가 받는 `now` 옵션으로 "지난 날짜에 구성·수행한 것처럼" 데이터를 만든다.
// 앱 소스를 수정하지 않고, UI(W02·W11·W14·W15)를 거치지 않는 시드다. 개발 서버(npm run dev)의 로컬 저장소에서만 동작한다.
export const q = (s) => JSON.stringify(s)

/**
 * 한 계정에 운동 목록을 저장하고(선택) 그 목록으로 완료 기록을 만든다.
 * - dayOffset: 오늘 기준 날짜(-3 = 3일 전, 1 = 내일). hour: 그날 몇 시에 저장·수행했는지(같은 날 여러 건의 순서 구분).
 * - runs: 같은 목록으로 완료 기록을 몇 건 만들지(0이면 목록만). 기록의 수행 날짜는 그날 시작 시각의 로컬 날짜다.
 * - kind: 'reps'(횟수형 1개) | 'mixed'(횟수형·중량형·시간형 3개, 시간형은 측정 시간이 남는다)
 * 반환: { listId, plannedDate, sessionIds[] }
 */
export function seedRun(h, userId, o) {
  const opts = { dayOffset: -1, hour: 10, runs: 0, kind: 'reps', ...o }
  return h.ev(`(async()=>{
    const m = await import('/src/exercise/local/indexedDbWorkoutRepositories.ts');
    const o = ${q(opts)};
    const base = new Date(); base.setHours(o.hour, 0, 0, 0); base.setDate(base.getDate() + o.dayOffset);
    let tick = 0;
    const now = () => new Date(base.getTime() + (tick++) * 60000);
    const items = [
      {itemId:'i1',exerciseId:'e-push',name:o.name ?? '푸시업',recordType:'reps',sets:[{reps:10},{reps:10},{reps:8}]},
      ...(o.kind === 'mixed' ? [
        {itemId:'i2',exerciseId:'305',name:'덤벨 컬',recordType:'weight',sets:[{reps:10,weightKg:8},{reps:12,weightKg:8}]},
        {itemId:'i3',exerciseId:'e-plank',name:'플랭크',recordType:'time',sets:[{targetSeconds:60}]},
      ] : []),
    ];
    const lists = m.createIndexedDbWorkoutListRepository(${q(userId)}, { now });
    const saved = await lists.saveFromDraft({
      requestId: o.reqId,
      draft: { v: 1, day: 'today', items, updatedAt: base.toISOString() },
      knownExerciseIds: new Set(items.map((i) => i.exerciseId)),
    });
    const out = { listId: saved.list.id, plannedDate: saved.list.plannedDate, sessionIds: [] };
    for (let r = 0; r < o.runs; r++) {
      const sessions = m.createIndexedDbWorkoutSessionRepository(${q(userId)}, { now });
      const started = await sessions.startOrResume(saved.list.id);
      const s = started.session;
      const performed = s.listSnapshot.items.map((it) => it.sets.map((set) => ({
        completed: true,
        ...(it.recordType === 'time'
          ? { measuredMs: 61000 }
          : { actualReps: set.reps ?? 1, ...(it.recordType === 'weight' ? { actualWeightKg: set.weightKg ?? 0 } : {}) }),
      })));
      const progressed = await sessions.saveProgress(s.id, {
        expectedRevision: s.revision, cursor: { itemIndex: 0, setIndex: 0 }, performed,
        timer: { accumulatedMs: 0, runningSince: null },
      });
      await sessions.complete(s.id, { expectedRevision: progressed.revision });
      out.sessionIds.push(s.id);
    }
    return out;
  })()`)
}

/** 같은 일을 여러 번 해서 목록 N개를 지난 날짜에 만든다(조회 건수 제한이 없는지 확인할 때 쓴다). 한 번의 평가로 처리한다. */
export function seedManyLists(h, userId, count, startOffset = -2) {
  return h.ev(`(async()=>{
    const m = await import('/src/exercise/local/indexedDbWorkoutRepositories.ts');
    let n = 0;
    for (let i = 0; i < ${count}; i++) {
      const base = new Date(); base.setHours(9, 0, 0, 0); base.setDate(base.getDate() + ${startOffset} - i);
      const lists = m.createIndexedDbWorkoutListRepository(${q(userId)}, { now: () => new Date(base.getTime() + n++ * 1000) });
      const items = [{itemId:'i1',exerciseId:'e-push',name:'푸시업',recordType:'reps',sets:[{reps:10}]}];
      await lists.saveFromDraft({ requestId: 'many-' + i, draft: { v: 1, day: 'today', items, updatedAt: base.toISOString() }, knownExerciseIds: new Set(['e-push']) });
    }
    return ${count};
  })()`)
}

/** 오늘 이전 날짜 문자열(YYYY-MM-DD)을 만든다. offset은 오늘 기준 일수(음수 = 과거). */
export const dateExpr = (offset) =>
  `(()=>{const d=new Date();d.setDate(d.getDate()+(${offset}));const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()`

/**
 * 읽기 전용 트랜잭션 실패를 주입한다. storeName이 포함된 읽기 트랜잭션이 count번 실패한 뒤 해제된다(오류 화면과 다시 시도 확인용).
 * 쓰기는 건드리지 않는다.
 */
export function armReadFail(h, storeName, count = 1) {
  return h.ev(`(()=>{
    window.__readFail = { store: ${q(storeName)}, left: ${count}, hits: 0 };
    if (!window.__readPatched) {
      window.__readPatched = true;
      const orig = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, mode, opts) {
        const f = window.__readFail;
        const list = Array.isArray(stores) ? stores : [stores];
        if (f && f.left > 0 && (mode === undefined || mode === 'readonly') && list.includes(f.store)) {
          f.left--; f.hits++;
          throw new DOMException('주입한 읽기 실패', 'UnknownError');
        }
        return orig.call(this, stores, mode, opts);
      };
    }
  })()`)
}

export const readFailHits = (h) => h.ev(`window.__readFail?.hits ?? 0`)
export const disarmReadFail = (h) => h.ev(`window.__readFail = null`)

// ── 대기·조작 (조건을 못 채우면 조용히 넘어가지 않고 예외를 던진다. 시나리오가 FAIL로 기록한다) ─────────────────────────────

const excerpt = (expr) => expr.replace(/\s+/g, ' ').slice(0, 110)

/** h.until과 같지만 조건을 끝내 채우지 못하면 예외를 던진다(h.until은 false만 돌려줘 시간 초과가 조용히 묻힌다). */
export async function mustUntil(h, expr, n = 80, gap = 100) {
  if (await h.until(expr, n, gap)) return
  throw new Error(`대기 시간 초과(${n * gap}ms): ${excerpt(expr)}`)
}

/** h.click과 같지만 누를 대상을 끝내 찾지 못하면 예외를 던진다(h.click은 false만 돌려준다). */
export async function mustClick(h, re, scope = 'main') {
  if (await h.click(re, scope)) return
  throw new Error(`누를 대상을 찾지 못했어요: ${re} (영역 ${scope})`)
}

/**
 * 저장된 기록을 읽기 전용으로 연 W15의 화면 조건. 읽기 전용 화면에는 편집 화면의 표식(`data-result-screen`)이 없고 안내 문구가 있다.
 * (예전에는 편집 화면의 표식을 기다려 읽기 전용 화면에서는 매번 6초를 조용히 낭비했다.)
 */
export const READONLY_RESULT = `/이미 저장된 운동 기록이에요/.test(document.querySelector('main')?.innerText ?? '')`

/**
 * 새로고침하고 새 문서가 실제로 그려질 때까지 기다린다(고정 대기 대신 완료 조건 확인).
 * 새로고침 전에 창에 표식을 심어, 표식이 사라지면 새 문서로 바뀐 것으로 본다. 그다음 문서가 완료 상태이고
 * 본문(main)에 글이 생기며 "불러오는·확인하는 중이에요" 같은 로딩 문구가 없을 때까지("준비 중이에요"는 로딩이 아니라 정상 안내다) 기다린다. 끝내 안정되지 않으면 예외를 던진다.
 */
export async function reloadSettled(h, n = 150) {
  await h.ev(`window.__reloadMark = 1`)
  await h.ev(`location.reload()`)
  await mustUntil(
    h,
    `window.__reloadMark === undefined && document.readyState === 'complete' && ((document.querySelector('main')?.innerText ?? '').trim().length > 0) && !/(불러오는|확인하는|읽는|계산하는) 중이에요/.test(document.querySelector('main')?.innerText ?? '')`,
    n,
  )
}

/** 경로가 정규식에 맞을 때까지 기다린다. 끝내 맞지 않으면 예외를 던진다. */
export const waitPath = (h, re, n = 80) =>
  mustUntil(h, `new RegExp(${q(re)}).test(location.pathname)`, n)

/**
 * 화면이 그려지고 "…중이에요" 로딩 문구가 모두 사라질 때까지(경로·h1·로딩 순서로 확인) 기다린다.
 * 정해진 시간 안에 끝내 안정되지 않으면 마지막 상태를 담아 예외를 던진다(기존처럼 조용히 반환하지 않는다). 고정 대기 없이 100ms 간격으로 조건만 확인한다.
 */
export async function settleScreen(h, { path, h1, timeoutMs = 12000 }) {
  const expr = `(()=>{const m=document.querySelector('main');if(!m)return 'main 없음';if(location.pathname!==${q(path)})return '경로 '+location.pathname;const t=m.querySelector('h1')?.textContent.trim();if(t!==${q(h1)})return 'h1 '+t;if([...m.querySelectorAll('[role=status]')].some(n=>/중이에요/.test(n.innerText)))return '불러오는 중';return 'ok'})()`
  const started = Date.now()
  let last = ''
  while (Date.now() - started < timeoutMs) {
    // 이동 중에는 평가가 실패할 수 있다(문서가 바뀌는 순간). 실패도 "아직 안정되지 않음"으로 보고 계속 기다린다.
    last = await h.ev(expr).catch(() => '이동 중')
    if (last === 'ok') return
    await h.sleep(100)
  }
  throw new Error(
    `화면이 ${timeoutMs}ms 안에 안정되지 않았어요(${path}, 마지막 상태: ${last})`,
  )
}

// ── 저장소 확인 ────────────────────────────────────────────────────────────────────────

const OPEN_DB = `new Promise((ok,no)=>{const r=indexedDB.open('mealthroutine-exercise');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})`

/** 세 저장소의 모든 행(원본 그대로)을 한 문자열로 돌려준다. 같은 화면 이동 전후로 비교해 읽기 전용인지 확인한다. */
export const dumpStores = (h) =>
  h.ev(`(async()=>{
    const db = await ${OPEN_DB};
    const out = {};
    for (const name of [...db.objectStoreNames].sort()) {
      const rows = await new Promise((ok,no)=>{const r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
      out[name] = rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    }
    db.close();
    return JSON.stringify(out);
  })()`)

/** DB 버전과 저장소별 keyPath·인덱스(이름·keyPath·unique·multiEntry)를 이름순으로 돌려준다. */
export const schemaInfo = (h) =>
  h.ev(`(async()=>{
    const db = await ${OPEN_DB};
    const stores = {};
    const names = [...db.objectStoreNames].sort();
    const tx = db.transaction(names,'readonly');
    for (const name of names) {
      const s = tx.objectStore(name);
      const indexes = {};
      for (const iname of [...s.indexNames].sort()) {
        const i = s.index(iname);
        indexes[iname] = { keyPath: i.keyPath, unique: i.unique, multiEntry: i.multiEntry };
      }
      stores[name] = { keyPath: s.keyPath, autoIncrement: s.autoIncrement, indexes };
    }
    const version = db.version;
    db.close();
    return { version, stores };
  })()`)

const idx = (keyPath, unique = false) => ({
  keyPath,
  unique,
  multiEntry: false,
})

/** 앱이 만드는 스키마(version 6, 저장소 9개, 인덱스 19개)의 기대값. src/exercise/local/exerciseDb.ts와 같아야 한다. v2는 workoutRoutines, v3는 mealRecords, v4는 mealPlans, v5는 workoutPlans, v6는 dailyQuizzes·rewardLedger만 더했고 기존 저장소는 v1과 같다. 저장소 키 순서는 schemaInfo의 이름순과 같아야 한다(JSON 문자열 비교). */
export const EXPECTED_SCHEMA = {
  version: 6,
  stores: {
    dailyQuizzes: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerDate: idx(['ownerId', 'localDate'], true),
      },
    },
    mealPlans: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerDate: idx(['ownerId', 'planDate']),
        byOwnerRequest: idx(['ownerId', 'requestId'], true),
      },
    },
    mealRecords: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerDate: idx(['ownerId', 'localDate']),
        byOwnerRequest: idx(['ownerId', 'requestId'], true),
      },
    },
    rewardLedger: {
      keyPath: 'transactionId',
      autoIncrement: false,
      indexes: {
        byOwnerKey: idx(['ownerId', 'rewardKey'], true),
      },
    },
    workoutLists: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerDate: idx(['ownerId', 'plannedDate']),
        byOwnerRequest: idx(['ownerId', 'requestId'], true),
        byOwnerUpdated: idx(['ownerId', 'updatedAt']),
      },
    },
    workoutPlans: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerDate: idx(['ownerId', 'planDate'], true),
        byOwnerRequest: idx(['ownerId', 'requestId'], true),
      },
    },
    workoutRecords: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerCompleted: idx(['ownerId', 'completedAt']),
        byOwnerDate: idx(['ownerId', 'performedDate']),
        bySession: idx('sessionId', true),
      },
    },
    workoutRoutines: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerRequest: idx(['ownerId', 'requestId'], true),
        byOwnerUpdated: idx(['ownerId', 'updatedAt']),
      },
    },
    workoutSessions: {
      keyPath: 'id',
      autoIncrement: false,
      indexes: {
        byOwnerList: idx(['ownerId', 'listId']),
        byOwnerStarted: idx(['ownerId', 'startedAt']),
        byOwnerStatus: idx(['ownerId', 'status']),
      },
    },
  },
}

/** 접근성 트리에서 이름이 re에 맞는 링크의 접근 가능한 이름(브라우저가 계산한 값)을 문서 순서로 돌려준다. */
export async function axLinkNames(h, re) {
  await h.cdp('Accessibility.enable')
  const { nodes } = await h.cdp('Accessibility.getFullAXTree')
  return nodes
    .filter(
      (n) =>
        !n.ignored && n.role?.value === 'link' && re.test(n.name?.value ?? ''),
    )
    .map((n) => n.name.value)
}

/** 오늘 기준 일수 오프셋의 한국어 날짜 표기(앱의 문자열 해석과 무관하게 Date 연산으로 만든다). 예: "11월 16일 (월)". */
export const dateLabelExpr = (offset) =>
  `(()=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+(${offset}));return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(d)})()`

/** 짧은 날짜("11. 16.") 표기. */
export const shortDateExpr = (offset) =>
  `(()=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+(${offset}));return new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric'}).format(d)})()`

// ── 조회 지연(계정 전환 경쟁 재현용) ────────────────────────────────────────────────────

/**
 * 이후 시작하는 모든 읽기 트랜잭션을 멈춘다: 세 저장소를 잡은 쓰기 트랜잭션을 열고(값은 바꾸지 않는다) 계속 요청을 이어 열어 둔다.
 * IndexedDB는 먼저 만든 겹치는 쓰기 트랜잭션이 끝날 때까지 뒤에 만든 읽기 트랜잭션을 시작하지 않으므로, 앱의 조회는 이 사이에 대기한다.
 * 이름이 다른 멈춤을 겹쳐 쓸 수 있다: 멈춤 B를 A의 조회 뒤·B의 계정 조회 앞에 걸면, A를 풀어도 B 계정의 조회는 멈춤 B가 풀릴 때까지 기다린다
 * (이전 계정의 조회만 먼저 끝나고 새 계정의 조회는 아직 진행 중인 순간을 원하는 만큼 유지할 수 있다).
 * 데이터베이스가 이미 앱에 의해 만들어진 뒤에만 호출한다(시드 뒤). 풀기는 releaseReads.
 */
export const holdReads = (h, name = 'first') =>
  h.ev(`(async()=>{
    const db = await ${OPEN_DB};
    const tx = db.transaction(['workoutLists','workoutRecords','workoutSessions'],'readwrite');
    const store = tx.objectStore('workoutLists');
    const hold = { db, released: false, ticks: 0 };
    hold.done = new Promise((ok)=>{ tx.oncomplete=ok; tx.onabort=ok; tx.onerror=ok });
    const pump = () => { if (hold.released) return; hold.ticks++; const r = store.count(); r.onsuccess = pump; r.onerror = pump };
    pump();
    (window.__holds ??= {})[${q(name)}] = hold;
    return true;
  })()`)

export const releaseReads = (h, name = 'first') =>
  h.ev(`(async()=>{
    const hold = window.__holds?.[${q(name)}]; if (!hold) return false;
    hold.released = true; await hold.done; hold.db.close(); delete window.__holds[${q(name)}]; return true;
  })()`)

/** 인덱스 조회(getAll)가 언제 시작·끝났는지 기록한다(계정별: 키 범위의 첫 값이 계정 id). 읽기 전용 관찰이며 동작은 바꾸지 않는다. */
export const trackReads = (h) =>
  h.ev(`(()=>{
    window.__reads = [];
    if (window.__getAllPatched) return;
    window.__getAllPatched = true;
    const orig = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (range, count) {
      const req = orig.call(this, range, count);
      const e = { store: this.objectStore.name, owner: range?.lower?.[0] ?? null, calledAt: performance.now(), doneAt: null };
      window.__reads.push(e);
      req.addEventListener('success', () => { e.doneAt = performance.now() });
      req.addEventListener('error', () => { e.doneAt = performance.now(); e.failed = true });
      return req;
    };
  })()`)

export const readsLog = (h) => h.ev(`window.__reads ?? []`)
