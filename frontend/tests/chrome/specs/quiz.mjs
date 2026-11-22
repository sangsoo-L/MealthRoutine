// [chrome 회귀] FAST-06: 운동·식단 알아가기 퀴즈(H02, /quiz) + IndexedDB v6(dailyQuizzes·rewardLedger) + 보상 내역 기준 PT·XP
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only quiz`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 IndexedDB)을 쓴다. 날짜 변경은 저장소의 `now` 옵션으로 지난 날짜 데이터를 만들어 확인한다. 앱 소스를 수정하지 않는다.
import { start } from '../lib/session.mjs'
import {
  EXPECTED_SCHEMA,
  dateExpr,
  dumpStores,
  mustClick,
  mustUntil,
  q,
  schemaInfo,
  settleScreen,
  waitPath,
} from '../lib/history.mjs'

const QUIZ = '/quiz'
const j = JSON.stringify
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

const settle = (h) => settleScreen(h, { path: QUIZ, h1: '오늘의 퀴즈' })
const openQuiz = async (h) => {
  await h.go(QUIZ, 200)
  await settle(h)
}
const today = (h) => h.ev(dateExpr(0))

/** 문항 은행에서 한 문항(정답 id·오답 id·해설)을 찾는다. 앱과 같은 데이터 모듈을 쓴다. */
const bankInfo = (h, id) =>
  h.ev(`(async()=>{
    const e = await import('/src/quiz/data/exerciseQuestions.ts');
    const m = await import('/src/quiz/data/mealQuestions.ts');
    const x = [...e.EXERCISE_QUESTIONS, ...m.MEAL_QUESTIONS].find((i) => i.id === ${q(id)});
    return x ? { correct: x.correctAnswerId, wrong: x.options.map((o) => o.id).filter((i) => i !== x.correctAnswerId), explanation: x.explanation, question: x.question, domain: x.domain, difficulty: x.difficulty } : null;
  })()`)

/** 한 저장소의 모든 행(키 순). */
const rows = (h, store) =>
  h.ev(`(async()=>{
    const db = await new Promise((ok,no)=>{const r=indexedDB.open('mealthroutine-exercise');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
    if (![...db.objectStoreNames].includes(${q(store)})) { db.close(); return null; }
    const out = await new Promise((ok,no)=>{const r=db.transaction(${q(store)},'readonly').objectStore(${q(store)}).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
    db.close();
    return out;
  })()`)

/** 앱과 같은 저장소 코드를 페이지 안에서 부른다. `body`는 repo를 쓰는 async 함수 본문이다. */
const withRepo = (h, userId, body, optionsExpr = '{}') =>
  h.ev(`(async()=>{
    const m = await import('/src/quiz/local/indexedDbQuizRepository.ts');
    const repo = m.createIndexedDbQuizRepository(${q(userId)}, ${optionsExpr});
    return await (async()=>{ ${body} })();
  })()`)

const logout = async (h) => {
  await h.go('/settings', 900)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(900)
}

const main = (h) =>
  h.ev(`document.querySelector('main').innerText.replace(/\\s+/g,' ').trim()`)
const radioCount = (h) =>
  h.ev(`document.querySelectorAll('main input[type=radio]').length`)
const selectOption = (h, id) =>
  h.ev(`document.querySelector('main input[type=radio][value=${id}]').click()`)
const submitDisabled = (h) =>
  h.ev(
    `[...document.querySelectorAll('main button[type=submit]')].every((b)=>b.disabled)`,
  )

// ── A. 흐름: 홈 카드 → 진입 → 문제 → 정답 제출 → 결과 → 다시 보기 → 홈 카드 숨김 ─────────────────────────
await scenario('A-flow', async (h) => {
  await h.login('free')
  const date = await today(h)
  // 홈의 퀴즈 카드는 /quiz 링크다.
  await mustUntil(
    h,
    `!![...document.querySelectorAll('a')].find(a=>/운동·식단 알아가기 퀴즈/.test(a.innerText))`,
  )
  const href = await h.ev(
    `[...document.querySelectorAll('a')].find(a=>/운동·식단 알아가기 퀴즈/.test(a.innerText))?.getAttribute('href')`,
  )
  check(
    h,
    'A1. 홈의 퀴즈 카드가 /quiz로 가는 링크이고 카드 안에 "준비 중" 표시가 없다',
    href === QUIZ &&
      (await h.ev(
        `![...document.querySelectorAll('a')].find(a=>/운동·식단 알아가기 퀴즈/.test(a.innerText))?.innerText.includes('준비 중')`,
      )),
    String(href),
  )
  await mustClick(h, '운동·식단 알아가기 퀴즈', 'main')
  await waitPath(h, '^/quiz$')
  await settle(h)
  const entry = await main(h)
  check(
    h,
    'A2. 진입 화면: 문제 풀기 버튼과 보상 안내(10PT·10XP)가 보이고 문제·보기는 아직 보이지 않는다',
    /문제 풀기/.test(entry) &&
      /10PT와 10XP/.test(entry) &&
      (await radioCount(h)) === 0 &&
      /하루에 한 문제/.test(entry),
    entry.slice(0, 160),
  )
  const assigned = await rows(h, 'dailyQuizzes')
  const row = assigned?.[0]
  check(
    h,
    'A3. 처음 들어오면 오늘의 문제가 확정되어 저장된다(1행, 계정·날짜·문항 id, 응시 전 상태)',
    assigned?.length === 1 &&
      row.ownerId === 'free' &&
      row.localDate === date &&
      /^(EX|ME)-\d{4}$/.test(row.questionId) &&
      row.selectedAnswerId === null &&
      row.isCorrect === null &&
      row.completedAt === null,
    j(assigned),
  )
  check(
    h,
    'A4. 보상 내역은 아직 비어 있다',
    (await rows(h, 'rewardLedger'))?.length === 0,
  )
  const info = await bankInfo(h, row.questionId)
  check(
    h,
    'A5. 저장된 문항 id가 문항 은행에 있다',
    info !== null,
    row.questionId,
  )

  // 새로고침해도 같은 문제.
  await openQuiz(h)
  const again = await rows(h, 'dailyQuizzes')
  check(
    h,
    'A6. 새로고침해도 같은 문제이고 출제 행이 늘지 않는다',
    again.length === 1 &&
      again[0].questionId === row.questionId &&
      again[0].id === row.id,
    j(again),
  )

  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  const formState = await h.ev(`(()=>{
    const legend=document.querySelector('main legend');
    const labels=[...document.querySelectorAll('main label')].map(l=>l.getBoundingClientRect().height);
    return { focused: document.activeElement===legend, legend: legend?.textContent.trim(), minH: Math.min(...labels), name: new Set([...document.querySelectorAll('main input[type=radio]')].map(r=>r.name)).size, text: document.querySelector('main').innerText }
  })()`)
  check(
    h,
    'A7. 문제 화면: 질문(legend)에 포커스가 가고 보기 4개가 한 라디오 그룹이며 보기 높이가 44px 이상이다',
    formState.focused &&
      formState.legend === info.question &&
      formState.name === 1 &&
      formState.minH >= 44,
    j(formState).slice(0, 200),
  )
  check(
    h,
    'A8. 선택 전: 제출 버튼이 비활성이고 정답·해설·결과 문구가 보이지 않는다',
    (await submitDisabled(h)) &&
      !formState.text.includes(info.explanation) &&
      !/정답이에요|아쉬워요/.test(formState.text),
  )
  await selectOption(h, info.wrong[0])
  await h.sleep(250)
  const afterSelect = await rows(h, 'dailyQuizzes')
  check(
    h,
    'A9. 보기만 골라서는 아무것도 기록되지 않는다(응시 전 그대로, 보상 0건)',
    afterSelect[0].completedAt === null &&
      afterSelect[0].selectedAnswerId === null &&
      (await rows(h, 'rewardLedger')).length === 0 &&
      !(await submitDisabled(h)),
  )
  // 선택을 바꿔 정답을 고른다.
  await selectOption(h, info.correct)
  await h.sleep(150)
  check(
    h,
    'A10. 선택을 바꾸면 선택한 보기만 체크된다',
    (await h.ev(
      `[...document.querySelectorAll('main input[type=radio]')].filter(r=>r.checked).map(r=>r.value).join()`,
    )) === info.correct,
  )
  await mustClick(h, '^제출하기$', 'main')
  await mustUntil(
    h,
    `/정답이에요!/.test(document.querySelector('main').innerText)`,
  )
  await h.sleep(250)
  const result = await h.ev(`(()=>({
    focusId: document.activeElement?.id,
    text: document.querySelector('main').innerText.replace(/\\s+/g,' '),
    status: document.querySelector('#quiz-result-title')?.getAttribute('role'),
    radios: document.querySelectorAll('main input[type=radio]').length,
    submit: document.querySelectorAll('main button[type=submit]').length,
    tags: [...document.querySelectorAll('main li span span:not([aria-hidden])')].map(s=>s.parentElement.innerText.replace(/\\s+/g,' ').trim()),
  }))()`)
  check(
    h,
    'A11. 정답 결과: "정답이에요!" + 해설 + 이번 보상 10PT · 10XP + 누적 10PT · 10XP + 다음 퀴즈 안내가 보이고 결과 제목으로 포커스가 간다(role=status)',
    result.focusId === 'quiz-result-title' &&
      result.status === 'status' &&
      result.text.includes(info.explanation) &&
      /이번 보상 10PT · 10XP/.test(result.text) &&
      /누적 10PT · 10XP/.test(result.text) &&
      /오늘의 퀴즈 완료/.test(result.text) &&
      /다음 퀴즈는 내일/.test(result.text) &&
      result.radios === 0 &&
      result.submit === 0,
    result.text.slice(0, 260),
  )
  check(
    h,
    'A12. 정답 결과: 고른 보기에 "내가 고른 정답" 글자 표시가 있다(색에만 의존하지 않음)',
    /내가 고른 정답/.test(result.text),
  )
  const done = (await rows(h, 'dailyQuizzes'))[0]
  const ledger = await rows(h, 'rewardLedger')
  check(
    h,
    'A13. 저장: 응시 완료(정답 id·정답 여부·완료 시각)와 보상 내역 1건(10PT·10XP, 키 quiz:오늘)이 함께 기록된다',
    done.selectedAnswerId === info.correct &&
      done.isCorrect === true &&
      typeof done.completedAt === 'string' &&
      ledger.length === 1 &&
      ledger[0].ownerId === 'free' &&
      ledger[0].points === 10 &&
      ledger[0].experience === 10 &&
      ledger[0].rewardKey === `quiz:${date}` &&
      ledger[0].localDate === date,
    j({ done, ledger }),
  )

  // 다시 들어오면 결과·해설을 다시 볼 수 있고 다시 풀 수 없다.
  await openQuiz(h)
  const revisit = await h.ev(`(()=>({
    text: document.querySelector('main').innerText.replace(/\\s+/g,' '),
    radios: document.querySelectorAll('main input[type=radio]').length,
    submit: document.querySelectorAll('main button[type=submit]').length,
    start: [...document.querySelectorAll('main button')].some(b=>/문제 풀기/.test(b.innerText)),
    focusId: document.activeElement?.id || '',
  }))()`)
  check(
    h,
    'A14. 다시 들어오면 완료한 결과·해설·보상을 다시 보고 재응시(문제 풀기·보기·제출)는 불가능하며 결과로 포커스를 강제로 옮기지 않는다',
    /정답이에요!/.test(revisit.text) &&
      revisit.text.includes(info.explanation) &&
      /이번 보상 10PT · 10XP/.test(revisit.text) &&
      revisit.radios === 0 &&
      revisit.submit === 0 &&
      !revisit.start &&
      revisit.focusId !== 'quiz-result-title',
    revisit.text.slice(0, 200),
  )
  check(
    h,
    'A15. 다시 봐도 보상이 늘지 않는다(보상 내역 1건·완료 행 그대로)',
    (await rows(h, 'rewardLedger')).length === 1 &&
      j((await rows(h, 'dailyQuizzes'))[0]) === j(done),
  )
  // 홈: 오늘 완료했으니 퀴즈 카드가 숨겨진다.
  await mustClick(h, '^홈으로$', 'main')
  await waitPath(h, '^/home$')
  await h.sleep(900)
  const homeCard = await h.ev(
    `!![...document.querySelectorAll('main a, main section')].find(e=>/운동·식단 알아가기 퀴즈/.test(e.innerText))`,
  )
  check(
    h,
    'A16. 완료 후 홈에서는 퀴즈 카드가 보이지 않는다',
    homeCard === false,
  )
  // 완료한 퀴즈는 /quiz 주소로 계속 다시 볼 수 있다(하단 탭 홈 활성, 뒤로가기는 홈).
  await openQuiz(h)
  const shell = await h.ev(`(()=>({
    h1: [...document.querySelectorAll('main h1')].map(x=>x.textContent.trim()),
    tab: [...document.querySelectorAll('nav[aria-label="밀스루틴 주요 메뉴"] [aria-current=page]')].map(x=>x.innerText.trim()),
    back: [...document.querySelectorAll('main a')].some(a=>/이전/.test(a.innerText)),
  }))()`)
  check(
    h,
    'A17. /quiz는 h1이 하나("오늘의 퀴즈")이고 하단 탭은 홈이 활성이며 "이전" 링크가 있다',
    j(shell.h1) === j(['오늘의 퀴즈']) &&
      j(shell.tab) === j(['홈']) &&
      shell.back,
    j(shell),
  )
})

// ── B. 오답: 완료로 기록하되 보상은 없다 ───────────────────────────────────────────────────────────────────
await scenario('B-wrong', async (h) => {
  await h.login('full')
  await openQuiz(h)
  const date = await today(h)
  const id = (await rows(h, 'dailyQuizzes'))[0].questionId
  const info = await bankInfo(h, id)
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  await selectOption(h, info.wrong[1])
  await mustClick(h, '^제출하기$', 'main')
  await mustUntil(
    h,
    `/아쉬워요! 함께 알아봐요\\./.test(document.querySelector('main').innerText)`,
  )
  await h.sleep(250)
  const text = await main(h)
  check(
    h,
    'B1. 오답 결과: 비난하지 않는 문구, 해설, "이번에는 보상이 없어요", 누적 0PT · 0XP, 다음 퀴즈 안내가 보인다',
    /아쉬워요! 함께 알아봐요\./.test(text) &&
      text.includes(info.explanation) &&
      /이번에는 보상이 없어요/.test(text) &&
      /누적 0PT · 0XP/.test(text) &&
      /다음 퀴즈는 내일/.test(text),
    text.slice(0, 240),
  )
  check(
    h,
    'B2. 고른 오답과 정답을 글자("내가 고른 답", "정답")로 구분해 보여 준다',
    /내가 고른 답/.test(text) &&
      /✓ 정답/.test(text) &&
      /✕ 내가 고른 답/.test(text),
  )
  const done = (await rows(h, 'dailyQuizzes'))[0]
  check(
    h,
    'B3. 오답도 완료로 기록되고(정답 여부 false) 보상 내역은 0건이다',
    done.selectedAnswerId === info.wrong[1] &&
      done.isCorrect === false &&
      typeof done.completedAt === 'string' &&
      (await rows(h, 'rewardLedger')).length === 0 &&
      done.localDate === date,
    j(done),
  )
  await openQuiz(h)
  check(
    h,
    'B4. 오답으로 완료한 뒤에도 다시 풀 수 없고 결과를 다시 본다',
    /아쉬워요/.test(await main(h)) && (await radioCount(h)) === 0,
  )
  await h.go('/home', 900)
  await h.sleep(600)
  check(
    h,
    'B5. 오답으로 완료해도 홈의 퀴즈 카드는 숨겨진다',
    (await h.ev(
      `!![...document.querySelectorAll('main a, main section')].find(e=>/운동·식단 알아가기 퀴즈/.test(e.innerText))`,
    )) === false,
  )
})

// ── C. 중복 방지: 동시 출제·동시 제출·연타 ────────────────────────────────────────────────────────────────
await scenario('C-concurrency', async (h) => {
  await h.login('free')
  const date = await today(h)
  const assigned = await withRepo(
    h,
    'free',
    `
    const r = await Promise.all([repo.assign(${q(date)}, 'EX-0001'), repo.assign(${q(date)}, 'ME-0002'), repo.assign(${q(date)}, 'EX-0003')]);
    return r.map((x) => ({ id: x.quiz.id, qid: x.quiz.questionId, created: x.created }));
  `,
  )
  const created = assigned.filter((x) => x.created).length
  check(
    h,
    'C1. 같은 날 동시에 출제해도 하나만 만들어지고 모두 같은 문제를 돌려받는다(유일 인덱스)',
    created === 1 &&
      new Set(assigned.map((x) => x.id)).size === 1 &&
      new Set(assigned.map((x) => x.qid)).size === 1 &&
      (await rows(h, 'dailyQuizzes')).length === 1,
    j(assigned),
  )
  const fixedQuestion = assigned[0].qid
  const completes = await withRepo(
    h,
    'free',
    `
    const input = { localDate: ${q(date)}, selectedAnswerId: 'A', correctAnswerId: 'A' };
    const r = await Promise.all([repo.complete(input), repo.complete(input), repo.complete(input), repo.complete(input)]);
    const late = await repo.complete({ ...input, selectedAnswerId: 'B' });
    return [...r, late].map((x) => ({ already: x.alreadyCompleted, pts: x.reward?.points ?? null, sel: x.quiz.selectedAnswerId }));
  `,
  )
  const ledger = await rows(h, 'rewardLedger')
  check(
    h,
    'C2. 같은 날 동시에 여러 번 제출해도 완료는 한 번만 확정되고 보상 내역은 1건이다(나머지는 이미 완료)',
    completes.length === 5 &&
      completes.filter((x) => !x.already).length === 1 &&
      ledger.length === 1 &&
      ledger[0].points === 10 &&
      (await rows(h, 'dailyQuizzes')).length === 1,
    j({ completes, ledger: ledger.length }),
  )
  const final = (await rows(h, 'dailyQuizzes'))[0]
  check(
    h,
    'C3. 먼저 확정된 선택이 유지되고 나중 제출이 덮어쓰지 못한다(출제된 문제도 그대로)',
    completes.every((x) => x.sel === final.selectedAnswerId) &&
      final.questionId === fixedQuestion &&
      final.isCorrect === true,
  )
  const totals = await withRepo(h, 'free', `return await repo.totals();`)
  check(
    h,
    'C4. 누적 PT·XP는 보상 내역 합계(10·10, 1건)다',
    totals.points === 10 &&
      totals.experience === 10 &&
      totals.count === 1 &&
      totals.skippedCount === 0,
    j(totals),
  )
  const bad = await withRepo(
    h,
    'free',
    `
    try { await repo.complete({ localDate: ${q(date)}, selectedAnswerId: 'Z', correctAnswerId: 'A' }); return 'ok' } catch (e) { return e?.kind ?? e?.name ?? 'error' }
  `,
  )
  check(h, 'C5. 올바르지 않은 선택지 id는 거부된다', bad !== 'ok', String(bad))
  const none = await withRepo(
    h,
    'free',
    `
    try { await repo.complete({ localDate: '2999-01-01', selectedAnswerId: 'A', correctAnswerId: 'A' }); return 'ok' } catch (e) { return e?.kind ?? e?.name ?? 'error' }
  `,
  )
  check(
    h,
    'C6. 출제가 없는 날짜에는 제출할 수 없다(notFound)이고 보상도 생기지 않는다',
    none !== 'ok' && (await rows(h, 'rewardLedger')).length === 1,
    String(none),
  )

  // 화면에서 제출 버튼을 연속으로 눌러도(연타) 보상은 한 번이다. 새 계정으로 확인한다.
  await logout(h)
  await h.login('full')
  await openQuiz(h)
  const id = (await rows(h, 'dailyQuizzes')).find(
    (r) => r.ownerId === 'full',
  ).questionId
  const info = await bankInfo(h, id)
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  await selectOption(h, info.correct)
  await h.ev(
    `(()=>{const b=document.querySelector('main button[type=submit]');b.click();b.click();b.click();})()`,
  )
  await mustUntil(
    h,
    `/정답이에요!/.test(document.querySelector('main').innerText)`,
  )
  await h.sleep(300)
  const fullLedger = (await rows(h, 'rewardLedger')).filter(
    (r) => r.ownerId === 'full',
  )
  check(
    h,
    'C7. 제출 버튼을 연달아 눌러도 보상 내역은 1건이다',
    fullLedger.length === 1 && fullLedger[0].points === 10,
  )
})

// ── D. 계정 분리 ─────────────────────────────────────────────────────────────────────────────────────────
await scenario('D-isolation', async (h) => {
  await h.login('free')
  const date = await today(h)
  await openQuiz(h)
  const freeRow = (await rows(h, 'dailyQuizzes'))[0]
  const info = await bankInfo(h, freeRow.questionId)
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  await selectOption(h, info.correct)
  await mustClick(h, '^제출하기$', 'main')
  await mustUntil(
    h,
    `/정답이에요!/.test(document.querySelector('main').innerText)`,
  )
  const other = await withRepo(
    h,
    'full',
    `
    return { quiz: await repo.get(${q(date)}), answered: await repo.listAnsweredQuestionIds(), reward: await repo.getReward(${q(date)}), totals: await repo.totals() };
  `,
  )
  check(
    h,
    'D1. 다른 계정의 저장소는 이 계정의 출제·완료·보상·누적을 "없음"으로 본다',
    other.quiz === null &&
      other.answered.length === 0 &&
      other.reward === null &&
      other.totals.points === 0 &&
      other.totals.count === 0,
    j(other),
  )
  await logout(h)
  await h.login('full')
  await h.go(QUIZ, 200)
  await settle(h)
  const text = await main(h)
  check(
    h,
    'D2. 다른 계정으로 들어가면 완료 화면이 아니라 새 진입 화면(문제 풀기)이 보인다',
    /문제 풀기/.test(text) && !/오늘의 퀴즈 완료/.test(text),
    text.slice(0, 120),
  )
  const all = await rows(h, 'dailyQuizzes')
  check(
    h,
    'D3. 두 계정의 출제 행이 각각 하나씩 따로 저장된다(이전 계정 행은 그대로)',
    all.length === 2 &&
      new Set(all.map((r) => r.ownerId)).size === 2 &&
      j(all.find((r) => r.ownerId === 'free')) ===
        j(await withRepo(h, 'free', `return await repo.get(${q(date)})`)),
  )
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  const fullInfo = await bankInfo(
    h,
    all.find((r) => r.ownerId === 'full').questionId,
  )
  await selectOption(h, fullInfo.wrong[0])
  await mustClick(h, '^제출하기$', 'main')
  await mustUntil(
    h,
    `/아쉬워요/.test(document.querySelector('main').innerText)`,
  )
  const ledger = await rows(h, 'rewardLedger')
  check(
    h,
    'D4. 계정별 보상이 섞이지 않는다(free 1건, full 0건)',
    ledger.length === 1 && ledger[0].ownerId === 'free',
  )
  await logout(h)
  await h.login('free')
  await h.go('/home', 900)
  await h.sleep(700)
  check(
    h,
    'D5. 계정을 바꾼 뒤 홈의 퀴즈 카드 표시가 그 계정의 완료 상태를 따른다(free는 완료라 숨김)',
    (await h.ev(
      `!![...document.querySelectorAll('main a, main section')].find(e=>/운동·식단 알아가기 퀴즈/.test(e.innerText))`,
    )) === false,
  )
})

// ── E. 날짜 변경·재출제·누적 ──────────────────────────────────────────────────────────────────────────────
await scenario('E-dates', async (h) => {
  await h.login('free')
  const date = await today(h)
  const yesterday = await h.ev(dateExpr(-1))
  const day2 = await h.ev(dateExpr(-2))
  // 어제·그저께 퀴즈를 지난 시각으로 만든다(정답 → 보상 2건).
  const seeded = await h.ev(`(async()=>{
    const m = await import('/src/quiz/local/indexedDbQuizRepository.ts');
    const out = [];
    for (const [d, qid, off] of [[${q(day2)}, 'EX-0001', 2], [${q(yesterday)}, 'ME-0001', 1]]) {
      const base = new Date(); base.setHours(10, 0, 0, 0); base.setDate(base.getDate() - off);
      let t = 0;
      const r = m.createIndexedDbQuizRepository('free', { now: () => new Date(base.getTime() + (t++) * 1000) });
      await r.assign(d, qid);
      out.push(await r.complete({ localDate: d, selectedAnswerId: 'A', correctAnswerId: 'A' }));
    }
    return out.map((x) => ({ date: x.quiz.localDate, pts: x.reward?.points ?? null }));
  })()`)
  check(
    h,
    'E1. 지난 두 날짜의 완료 퀴즈와 보상을 만들었다(보상 2건)',
    seeded.length === 2 && seeded.every((x) => x.pts === 10),
    j(seeded),
  )
  await openQuiz(h)
  const text = await main(h)
  const todayRow = (await rows(h, 'dailyQuizzes')).find(
    (r) => r.localDate === date,
  )
  check(
    h,
    'E2. 날짜가 바뀌면(오늘은 아직 안 푼 날) 지난 결과가 아니라 새 진입 화면이 보이고 오늘의 문제가 새로 확정된다',
    /문제 풀기/.test(text) &&
      !/오늘의 퀴즈 완료/.test(text) &&
      todayRow &&
      todayRow.completedAt === null,
    text.slice(0, 120),
  )
  check(
    h,
    'E3. 새 문제는 이미 푼 문제(EX-0001, ME-0001)가 아니다',
    todayRow && !['EX-0001', 'ME-0001'].includes(todayRow.questionId),
    todayRow?.questionId,
  )
  const quizRows = await rows(h, 'dailyQuizzes')
  check(
    h,
    'E4. 지난 날짜 기록은 그대로 남아 있다(출제 행 3개, 보상 내역 2건)',
    quizRows.length === 3 && (await rows(h, 'rewardLedger')).length === 2,
  )
  const answered = await withRepo(
    h,
    'free',
    `return await repo.listAnsweredQuestionIds()`,
  )
  check(
    h,
    'E5. 푼 문항 목록은 완료한 문항만이다(오늘의 미응시 문항은 포함하지 않음)',
    j(answered.sort()) === j(['EX-0001', 'ME-0001']),
    j(answered),
  )
  const info = await bankInfo(h, todayRow.questionId)
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  await selectOption(h, info.correct)
  await mustClick(h, '^제출하기$', 'main')
  await mustUntil(
    h,
    `/정답이에요!/.test(document.querySelector('main').innerText)`,
  )
  check(
    h,
    'E6. 오늘 정답을 맞히면 누적이 지난 보상과 합쳐진다(누적 30PT · 30XP, 이번 보상 10PT · 10XP)',
    /이번 보상 10PT · 10XP/.test(await main(h)) &&
      /누적 30PT · 30XP/.test(await main(h)),
    (await main(h)).slice(0, 300),
  )
  check(
    h,
    'E7. 보상 내역은 날짜별 1건씩 3건이고 키가 모두 다르다',
    (await rows(h, 'rewardLedger')).length === 3 &&
      new Set((await rows(h, 'rewardLedger')).map((r) => r.rewardKey)).size ===
        3,
  )
  // 어제 날짜의 출제는 다시 바뀌지 않는다(이미 완료).
  const replay = await withRepo(
    h,
    'free',
    `return await repo.assign(${q(yesterday)}, 'EX-0050')`,
  )
  check(
    h,
    'E8. 지난 날짜에 다시 출제를 요청해도 기존 출제가 그대로다(created=false, 문제 불변)',
    replay.created === false && replay.quiz.questionId === 'ME-0001',
  )
})

// ── F. v5 → v6 업그레이드: 기존 7개 저장소·행 보존, 새 저장소는 비어 있음 ───────────────────────────────
await scenario('F-migration', async (h) => {
  await h.login('free')
  const built = await h.ev(`(async()=>{
    await new Promise((ok, no) => { const q = indexedDB.deleteDatabase('mealthroutine-exercise'); q.onsuccess = ok; q.onerror = () => no(q.error); q.onblocked = () => no(new Error('삭제가 막혔어요')) });
    const keep = {
      workoutLists: [{ id: 'wl-keep', ownerId: 'free', plannedDate: '2026-01-01', updatedAt: '2026-01-01T00:00:00.000Z', requestId: 'wl-1', name: '보존 목록' }],
      workoutSessions: [{ id: 'ws-keep', ownerId: 'free', status: 'completed', startedAt: '2026-01-01T00:00:00.000Z', listId: 'wl-keep' }],
      workoutRecords: [{ id: 'wr-keep', sessionId: 'ws-keep', ownerId: 'free', performedDate: '2026-01-01', completedAt: '2026-01-01T00:10:00.000Z' }],
      workoutRoutines: [{ id: 'rt-keep', ownerId: 'free', requestId: 'rt-1', updatedAt: '2026-01-01T00:00:00.000Z', name: '보존 루틴' }],
      mealRecords: [{ id: 'ml-keep', ownerId: 'free', localDate: '2026-01-01', requestId: 'ml-1', name: '보존 식단' }],
      mealPlans: [{ id: 'mp-keep', ownerId: 'free', planDate: '2999-01-01', requestId: 'mp-1', name: '보존 식단 계획' }],
      workoutPlans: [{ id: 'wp-keep', ownerId: 'free', planDate: '2999-01-01', requestId: 'wp-1', name: '보존 운동 계획' }],
    };
    const db = await new Promise((ok, no) => {
      const q = indexedDB.open('mealthroutine-exercise', 5);
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
        const routines = d.createObjectStore('workoutRoutines', { keyPath: 'id' });
        routines.createIndex('byOwnerUpdated', ['ownerId', 'updatedAt']);
        routines.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
        const meals = d.createObjectStore('mealRecords', { keyPath: 'id' });
        meals.createIndex('byOwnerDate', ['ownerId', 'localDate']);
        meals.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
        const plans = d.createObjectStore('mealPlans', { keyPath: 'id' });
        plans.createIndex('byOwnerDate', ['ownerId', 'planDate']);
        plans.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
        const wplans = d.createObjectStore('workoutPlans', { keyPath: 'id' });
        wplans.createIndex('byOwnerDate', ['ownerId', 'planDate'], { unique: true });
        wplans.createIndex('byOwnerRequest', ['ownerId', 'requestId'], { unique: true });
      };
      q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error);
    });
    await new Promise((ok, no) => {
      const names = Object.keys(keep);
      const tx = db.transaction(names, 'readwrite');
      for (const n of names) for (const row of keep[n]) tx.objectStore(n).put(row);
      tx.oncomplete = ok; tx.onerror = () => no(tx.error);
    });
    const info = { version: db.version, stores: [...db.objectStoreNames].sort() };
    db.close();
    return { info, keep };
  })()`)
  check(
    h,
    'F1. v5 상태의 DB를 만들었다(저장소 7개, 퀴즈 저장소 없음)',
    built.info.version === 5 &&
      built.info.stores.length === 7 &&
      !built.info.stores.includes('dailyQuizzes') &&
      !built.info.stores.includes('rewardLedger'),
    j(built.info),
  )
  await h.go('/home', 900)
  await mustUntil(h, `!!document.querySelector('main')`)
  await h.sleep(1200)
  const upgraded = await schemaInfo(h)
  check(
    h,
    'F2. 앱이 열면 v5가 v6으로 올라가고 스키마가 승인된 구조와 같다(dailyQuizzes·rewardLedger 추가, 기존 저장소·인덱스 그대로)',
    j(upgraded) === j(EXPECTED_SCHEMA),
    j(upgraded).slice(0, 220),
  )
  const after = JSON.parse(await dumpStores(h))
  const sortById = (list) =>
    [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const preserved = Object.keys(built.keep).every(
    (n) => j(sortById(after[n])) === j(sortById(built.keep[n])),
  )
  check(
    h,
    'F3. 기존 7개 저장소의 모든 행이 한 글자도 바뀌지 않고 그대로다',
    preserved,
    j(Object.keys(after)),
  )
  check(
    h,
    'F4. 새 저장소(dailyQuizzes·rewardLedger)는 비어 있다(홈만 열었으므로 출제도 없음)',
    j(after.dailyQuizzes) === '[]' && j(after.rewardLedger) === '[]',
  )
  await openQuiz(h)
  check(
    h,
    'F5. 업그레이드한 DB에서 퀴즈가 정상 동작한다(출제 1행 생성, 기존 행은 그대로)',
    (await rows(h, 'dailyQuizzes')).length === 1 &&
      j(sortById(await rows(h, 'workoutPlans'))) === j(built.keep.workoutPlans),
  )
})

// ── G. 반응형·접근성: 320 / 390 / 768 / 1280 ────────────────────────────────────────────────────────────
await scenario('G-responsive', async (h) => {
  await h.login('free')
  const widths = [320, 390, 768, 1280]
  const measure = () =>
    h.ev(`(()=>{
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const small = [...document.querySelectorAll('main button, main a, main label')].filter((e)=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<43.5)}).map(e=>e.innerText.trim().slice(0,12));
      const clipped = [...document.querySelectorAll('main *')].filter((e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>document.documentElement.clientWidth+1}).length;
      return { over, small, clipped };
    })()`)
  await openQuiz(h)
  const date = await today(h)
  for (const w of widths) {
    await h.vp(w, 844)
    await h.sleep(250)
    const m = await measure()
    check(
      h,
      `G1-${w}. 진입 화면: 가로 넘침·잘림이 없고 버튼 높이가 44px 이상이다`,
      m.over <= 0 && m.clipped === 0 && m.small.length === 0,
      j(m),
    )
  }
  await h.vp(390, 844)
  await mustClick(h, '^문제 풀기$', 'main')
  await mustUntil(
    h,
    `document.querySelectorAll('main input[type=radio]').length===4`,
  )
  for (const w of widths) {
    await h.vp(w, 844)
    await h.sleep(250)
    const m = await measure()
    check(
      h,
      `G2-${w}. 문제 화면: 가로 넘침·잘림이 없고 보기·제출 버튼 높이가 44px 이상이다`,
      m.over <= 0 && m.clipped === 0 && m.small.length === 0,
      j(m),
    )
  }
  // 키보드: 첫 보기에 포커스 후 아래 화살표로 다음 보기가 선택되고, Tab으로 제출 버튼에 닿으며 Space로 제출된다.
  await h.vp(390, 844)
  await h.ev(`document.querySelector('main input[type=radio]').focus()`)
  await h.press('ArrowDown', 'ArrowDown', 40)
  const keyChecked = await h.ev(
    `[...document.querySelectorAll('main input[type=radio]')].filter(r=>r.checked).map(r=>r.value).join()`,
  )
  check(
    h,
    'G3. 키보드(아래 화살표)로 보기를 고를 수 있다',
    keyChecked === 'B',
    keyChecked,
  )
  await h.press('Tab', 'Tab', 9)
  const onSubmit = await h.ev(
    `document.activeElement?.getAttribute('type')==='submit' && !document.activeElement.disabled`,
  )
  check(h, 'G4. Tab으로 활성화된 제출 버튼에 닿는다', onSubmit === true)
  await h.press(' ', 'Space', 32)
  await mustUntil(h, `document.querySelector('#quiz-result-title')!==null`)
  const row = (await rows(h, 'dailyQuizzes')).find((r) => r.localDate === date)
  check(
    h,
    'G5. 키보드만으로 제출이 끝나고 선택한 보기(B)가 저장된다',
    row?.selectedAnswerId === 'B' && typeof row.completedAt === 'string',
    j(row),
  )
  for (const w of widths) {
    await h.vp(w, 844)
    await h.sleep(250)
    const m = await measure()
    check(
      h,
      `G6-${w}. 결과 화면: 가로 넘침·잘림이 없고 홈 링크 높이가 44px 이상이다`,
      m.over <= 0 && m.clipped === 0 && m.small.length === 0,
      j(m),
    )
  }
  const labelled = await h.ev(`(()=>({
    sections: [...document.querySelectorAll('main section')].every(s=>s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby'))),
    h1: document.querySelectorAll('main h1').length,
    lang: document.documentElement.lang,
  }))()`)
  check(
    h,
    'G7. 결과 화면의 모든 영역이 제목과 연결(aria-labelledby)되어 있고 h1은 하나다',
    labelled.sections && labelled.h1 === 1,
    j(labelled),
  )
})
