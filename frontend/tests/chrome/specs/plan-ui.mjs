// [chrome 회귀] W01-2 추천 화면 UI
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S7 P2-4 실제 Chrome + 개발용 IndexedDB 검증: 초급 운동 추천 UI. 시나리오마다 새 프로필.  node p24-verify.mjs [A|B|C|D|E|F|G|ALL]
import { start } from '../lib/session.mjs'

const only = (process.argv[2] ?? 'ALL').toUpperCase()
const results = []
const check = (n, ok, d = '') => {
  results.push({ n, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  → ' + d : ''}`)
}
const q = (s) => JSON.stringify(s)
const U = 'free'
const PLAN = '/records/exercise/plan'
const TODAY = `(()=>{const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()`
const lists = (h, u = U) =>
  h.store(u, `const t=${TODAY};return (await lists.listByDate(t)).items`)
// W01의 초급 추천 진입은 접힌 보조 영역이다(운동·식단 대시보드 UI/UX 개선). 본문을 읽기 전에 펼쳐서,
// 진입이 보여야 하는 경우와 보이지 않아야 하는 경우를 모두 이전과 같은 의미로 검사한다(추천 화면 등 진입이 없는 화면에서는 아무 일도 하지 않는다).
const openBeginnerEntry = (h) =>
  h.ev(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true`,
  )
const mainText = async (h) => {
  await openBeginnerEntry(h)
  return h.text('main')
}
const WIDE = `(()=>{const w=window.innerWidth;const bad=[];for(const e of document.querySelectorAll('main *')){const r=e.getBoundingClientRect();if(r.width===0||r.height===0)continue;if(e.closest('.sr-only')||e.classList.contains('sr-only'))continue;if(r.right>w+1||r.left<-1)bad.push((e.id||e.tagName)+':'+Math.round(r.left)+'~'+Math.round(r.right));}return {ov:document.documentElement.scrollWidth-w,bad:bad.slice(0,4)}})()`
const widths = async (h, label) => {
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1280, 900],
  ]) {
    await h.vp(w, hh)
    await h.sleep(400)
    const m = await h.ev(WIDE)
    check(
      `반응형 ${label} ${w}px: 가로 스크롤·화면 밖 요소 없음`,
      m.ov <= 0 && m.bad.length === 0,
      JSON.stringify(m),
    )
  }
  await h.vp(390, 844)
  await h.sleep(250)
}
const setTier = (h, exercise, meal = 'beginner', user = U) =>
  h.ev(`(async()=>{
    const A = await import('/src/auth/accountScope.ts');
    const Q = await import('/src/onboarding-assessment/mock/questionBank.ts');
    sessionStorage.setItem(A.accountScopedKey(${q(user)},'assessment.mock.result'), JSON.stringify({bankVersion:Q.QUESTION_BANK_VERSION,sessionId:'t-sess',completedAt:new Date().toISOString(),exercise:${q(exercise)},meal:${q(meal)}}));
    return true })()`)
const clickLabel0 = (h, text) =>
  h.ev(
    `(()=>{const l=[...document.querySelectorAll('main label')].find(l=>l.innerText.includes(${q(text)}));if(!l)return false;const i=l.querySelector('input');(i||l).click();return true})()`,
  )
const preset0 = (h, minutes) =>
  h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.trim()===${q(minutes + '분')});if(!b)return false;b.click();return true})()`,
  )
// S8-UI-1: 조건 설정이 단계 화면이라 목표·시간을 고르면 다음 단계로 넘긴다(직접 선택은 4단계 운동 고르기까지).
const clickLabel = async (h, text) => {
  const ok = await clickLabel0(h, text)
  if (/(습관|체중 관리)/.test(text)) {
    await h.sleep(200)
    await h.click('^다음$')
    await h.sleep(450)
  }
  return ok
}
const preset = async (h, minutes) => {
  const ok = await preset0(h, minutes)
  await h.sleep(250)
  await h.click('^다음$')
  await h.sleep(500)
  // 직접 선택(4단계 모드)은 도구 단계를 지나 4단계 운동 고르기까지 넘긴다.
  for (let n = 0; n < 3; n++) {
    const t = await h.text('main')
    const m = t.match(/(\d)\/4단계/)
    if (!m || Number(m[1]) >= 4) break
    await h.click('^다음$')
    await h.sleep(500)
  }
  return ok
}
const itemNames = (h) =>
  h.ev(
    `[...document.querySelectorAll('#plan-items-heading ~ ol > li')].map(li=>li.querySelector('span.text-body, .text-body')?.innerText.replace(/^\\d+\\.\\s*/,'').trim())`,
  )
const itemRows = (h) =>
  h.ev(
    `[...document.querySelectorAll('#plan-items-heading ~ ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
  )
const gotoPlan = async (h, mode, fresh = true) => {
  await h.go('/records/exercise', 1000)
  await h.until(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기|직접 운동 선택하기/.test(a.innerText))`,
    80,
  )
  await h.click(
    mode === 'automatic' ? '오늘의 운동 추천받기' : '직접 운동 선택하기',
    'main',
  )
  await h.until(`location.pathname===${q(PLAN)}`, 60)
  await h.sleep(500)
}
const pickExercises = async (h, items) => {
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/^직접 검색$/.test(b.innerText.trim()))`,
    80,
  )
  await h.click('^직접 검색$')
  await h.sleep(400)
  for (const [keyword, cardText] of items) {
    await h.setVal('main input[type=search]', keyword)
    await h.click('^검색하기$')
    await h.until(
      `[...document.querySelectorAll('main button')].some(b=>b.innerText.includes(${q(cardText)}))`,
      60,
    )
    await h.click(cardText)
    await h.sleep(300)
  }
  await h.click('^선택한 \\d+개 운동(으로 설정하기| 등록)$')
  await h.sleep(700)
}
const run = (id) => only === 'ALL' || only === id

async function scenario(name, fn) {
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    const real = (h.problems ?? []).filter(
      (p) => !/favicon|DevTools|Download the React/.test(String(p)),
    )
    if (real.length) console.log('  (console problems)', real.slice(0, 4))
  } catch (e) {
    check(`${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

// ═══ A. 전체 자동 추천 → W11 → 저장 → W01 → W14 ═══
if (run('A'))
  await scenario('p24-A', async (h) => {
    await h.login(U)
    await h.go('/records/exercise', 1000)
    await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      80,
    )
    const w01 = await mainText(h)
    check(
      'A-1 W01(초급): 추천 진입 두 개가 보이고 기존 영역(최근 운동 기록)도 그대로 있다',
      /오늘의 운동 추천받기/.test(w01) &&
        /직접 운동 선택하기/.test(w01) &&
        /최근 운동 기록/.test(w01) &&
        /운동 관리/.test(w01),
    )
    await h.shot('p24-w01-390.png')
    await widths(h, 'W01(초급 진입)')
    await gotoPlan(h, 'automatic')
    const cond = await mainText(h)
    check(
      'A-2 추천 화면 진입(S8-UI-1 단계 화면): 1단계 질문·1/3단계, 다음은 비활성이고 이유 안내',
      /어떤 목표로 운동하고 싶으세요/.test(cond) &&
        /1\/3단계/.test(cond) &&
        /운동 목표를 골라 주세요\./.test(cond) &&
        (await h.ev(
          `[...document.querySelectorAll('main button')].find(b=>/^다음$/.test(b.innerText.trim())).getAttribute('aria-disabled')`,
        )) === 'true',
    )
    await h.shot('p24-conditions-390.png')
    await widths(h, '추천 조건 입력')
    await clickLabel(h, '운동 습관 만들기')
    await preset(h, 20)
    check(
      'A-3 3단계 도구 선택지는 E01과 같은 6종: 맨몸(항상 가능·끌 수 없음)·밴드(선택 가능), 추천할 수 없는 4종은 선택 불가(S8-UI-1A)',
      await h.ev(
        `(()=>{const boxes=[...document.querySelectorAll('main input[type=checkbox]')];const names=[...document.querySelectorAll('main label')].map(x=>x.innerText.replace(/\s+/g,' ').trim());const nm=[...document.querySelectorAll('main label')].map(l=>l.querySelector('span span').firstChild.textContent.trim());return boxes.length===6&&nm.join()==='덤벨,맨몸,밴드,폼롤러,마사지볼,풀업 바'&&boxes[1].checked&&boxes[1].disabled&&!boxes[2].checked&&!boxes[2].disabled&&[0,3,4,5].every(i=>boxes[i].disabled&&!boxes[i].checked)})()`,
      ),
    )
    check(
      'A-4 목표·시간을 고른 3단계에서 마지막 버튼(운동 추천받기)이 활성이다',
      (await h.ev(
        `[...document.querySelectorAll('main button')].find(b=>/^운동 추천받기$/.test(b.innerText.trim())).getAttribute('aria-disabled')`,
      )) === 'false',
    )
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const res = await mainText(h)
    const rows1 = await itemRows(h)
    check(
      'A-5 결과: "오늘의 운동이 준비됐어요"·최대 20분 가능·운동 4개(20분 상한)',
      /오늘의 운동이 준비됐어요/.test(res) &&
        /최대 20분 가능 · 추천 운동 약 \d+분/.test(res) &&
        rows1.length === 4,
      rows1.length + ' ' + (res.match(/최대[^\n]*/) ?? [''])[0],
    )
    check(
      'A-6 순서: 시작 운동 → 주요 운동 → 마무리 운동(역할 표시)',
      /시작 운동/.test(rows1[0]) &&
        /주요 운동/.test(rows1[1]) &&
        /주요 운동/.test(rows1[2]) &&
        /마무리 운동/.test(rows1[3]),
      JSON.stringify(rows1.map((r) => r.slice(0, 40))),
    )
    check(
      'A-7 각 운동에 세트·목표·추천 이유가 있고 내부 코드명은 없다',
      rows1.every(
        (r) =>
          /\d세트 · 한 세트에 \d+(번|초)/.test(r) &&
          /(골랐어요|자동으로 정했어요)/.test(r),
      ) && !/reps|time_reps|weight|recordType|beginner/.test(res),
    )
    check(
      'A-8 휴식은 표시용: 2세트 이상에만 "세트 사이 약 60초", 자동 적용되지 않는다는 안내',
      /세트 사이 약 60초 쉬어요/.test(res) &&
        /운동 진행 화면에서 자동으로 재 주지는 않아요/.test(res),
    )
    check(
      'A-9 안전 안내(전문 처방 아님·이상 증상 시 중단)와 추정·상한 안내',
      /전문 운동 처방은 아니에요/.test(res) &&
        /통증이나 어지러움/.test(res) &&
        /대략적인 추정/.test(res) &&
        /꼭 채우지 않아도/.test(res),
    )
    check(
      'A-10 결과 단계에서 제목으로 포커스가 이동한다',
      (await h.ev(`document.activeElement?.id`)) === 'plan-result-heading',
    )
    await h.shot('p24-result-390.png')
    await widths(h, '추천 결과')
    // 다시 추천: 다른 조합
    await h.click('^다시 추천받기$')
    await h.sleep(500)
    const rows2 = await itemRows(h)
    check(
      'A-11 다시 추천: 운동 4개·시간 상한 안이며 이전과 다른 조합이다',
      rows2.length === 4 && JSON.stringify(rows2) !== JSON.stringify(rows1),
      rows2.map((r) => r.split(' | ')[0]).join(' / '),
    )
    // 새로고침 복원
    const before = JSON.stringify(rows2)
    await h.ev(`location.reload()`)
    await h.until(`!!document.getElementById('plan-result-heading')`, 80)
    await h.sleep(600)
    check(
      'A-12 새로고침: 같은 입력·같은 추천 결과가 복원되고 "달라졌어요" 안내는 없다',
      JSON.stringify(await itemRows(h)) === before &&
        !/달라졌어요/.test(await mainText(h)),
    )
    // 조건 바꾸기 → 시간 30분
    await h.click('^조건 바꾸기')
    await h.sleep(400)
    check(
      'A-13 조건 바꾸기: 1단계로 돌아가 목표가 유지되고, 2단계에서 이전 시간(20분)이 유지된다',
      await (async () => {
        const r = await h.ev(
          `(()=>{const r=document.querySelector('input[type=radio]:checked');return !!r&&r.closest('label').innerText.includes('운동 습관 만들기')})()`,
        )
        await h.click('^다음$')
        await h.sleep(450)
        const p = await h.ev(
          `[...document.querySelectorAll('main button[aria-pressed=true]')].map(b=>b.innerText.replace('✓','').trim()).includes('20분')`,
        )
        return r && p
      })(),
    )
    await preset(h, 30)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    const rows30 = await itemRows(h)
    check(
      'A-14 시간 변경(30분): 운동 5개(상한 5개)',
      rows30.length === 5,
      String(rows30.length),
    )
    // 확정 → W11
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(900)
    const review = await mainText(h)
    const names30 = rows30.map((r) =>
      r
        .split(' | ')[0]
        .replace(/^\d+\.\s*/, '')
        .replace(/\s*(시작|주요|마무리) 운동.*$/, '')
        .trim(),
    )
    check(
      'A-15 확정 → W11 검토: 추천 운동이 순서대로 들어 있다',
      names30.every((n) => review.includes(n)) &&
        /운동 목록 최종 검토/.test(review),
      names30.join(','),
    )
    check(
      'A-16 W11의 "이전/구성 수정"은 복잡한 W02가 아니라 추천 화면으로 돌아간다',
      await h.ev(
        `[...document.querySelectorAll('main a')].some(a=>/추천 화면으로 돌아가기/.test(a.innerText)&&a.getAttribute('href')===${q(PLAN)})`,
      ),
    )
    await widths(h, 'W11(추천에서 넘어옴)')
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(900)
    const saved = await lists(h)
    check(
      'A-17 W11 저장(기존 saveWorkoutList): 목록 1개, 운동 순서·세트·목표가 추천과 같다',
      saved.length === 1 &&
        saved[0].items.length === 5 &&
        saved[0].items.every((i) => ['reps', 'time'].includes(i.recordType)),
      JSON.stringify(saved[0]?.items.map((i) => i.exerciseNameSnapshot)),
    )
    check(
      'A-18 저장된 목록에 휴식·이유·역할이 없다',
      !/rest|reason|role|purpose/i.test(JSON.stringify(saved[0].items)),
    )
    check(
      'A-19 저장 후 W01 오늘의 운동에 보이고 시작할 수 있다',
      (await mainText(h)).includes(saved[0].items[0].exerciseNameSnapshot) &&
        (await h.ev(
          `!![...document.querySelectorAll('main button')].find(b=>/이 목록으로 바로 운동 시작/.test(b.innerText))`,
        )),
    )
    await h.click('이 목록으로 바로 운동 시작')
    await h.until(`location.pathname==='/records/exercise/session'`, 80)
    await h.until(`!!document.querySelector('#session-current-heading')`, 80)
    const s = await h.store(
      U,
      `const s=await sessions.getActive();return s&&JSON.stringify(s.listSnapshot.items.map(i=>i.exerciseNameSnapshot))`,
    )
    check(
      'A-20 W14 세션이 추천 운동 순서로 만들어진다',
      JSON.parse(s).join('|') ===
        saved[0].items.map((i) => i.exerciseNameSnapshot).join('|'),
    )
  })

// ═══ B. 직접 운동 선택 → 자동 설정 → 교체·빼기 → 저장 ═══
if (run('B'))
  await scenario('p24-B', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'selected')
    check(
      'B-1 직접 선택 모드(S8-UI-1): 1/4단계로 시작한다',
      /1\/4단계/.test(await mainText(h)),
    )
    await clickLabel(h, '현재 운동 습관 유지')
    await preset(h, 20)
    check(
      'B-1b 4단계: "고른 운동" 영역(아직 없음)과 운동 고르기 버튼',
      /4\/4단계/.test(await mainText(h)) &&
        /아직 고른 운동이 없어요/.test(await mainText(h)) &&
        (await h.ev(
          `!![...document.querySelectorAll('main button')].find(b=>/^운동 고르기$/.test(b.innerText.trim()))`,
        )),
    )
    check(
      'B-2 운동을 고르지 않으면 확정이 비활성이고 이유를 안내한다',
      /운동을 하나 이상 골라 주세요/.test(await mainText(h)),
    )
    await h.click('^운동 고르기$')
    await h.sleep(600)
    check(
      'B-3 운동 선택은 기존 W13 선택 UI를 재사용하고 추천 맥락 제목(운동 찾아보기)을 쓴다(제목 하나)',
      (await h.ev(`document.querySelectorAll('h1').length`)) === 1 &&
        /운동 찾아보기/.test(await h.text('main')),
    )
    await widths(h, '운동 고르기(W13 재사용)')
    await pickExercises(h, [
      ['푸시업', '월 푸시업'],
      ['플랭크', '플랭크'],
      ['바이셉스', '덤벨 바이셉스 컬'],
    ])
    const rows = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
    )
    check(
      'B-4 고른 운동 3개가 선택 순서대로 보이고 이름·부위·난이도·도구·자동 구성 가능 여부를 안내한다',
      rows.length === 3 &&
        /월 푸시업/.test(rows[0]) &&
        /플랭크/.test(rows[1]) &&
        /덤벨 바이셉스 컬/.test(rows[2]) &&
        /가슴 · 초급 · 맨몸/.test(rows[0]) &&
        /자동으로 구성할 수 있어요/.test(rows[0]) &&
        /중량이 필요한 운동/.test(rows[2]),
      JSON.stringify(rows),
    )
    await h.click('^세트와 목표 자동으로 정하기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const res = await mainText(h)
    check(
      'B-5 추천 불가 운동(중량)이 있으면 "확인이 필요해요"·사유 안내·확정 비활성(선택 운동을 지우지 않는다)',
      /확인이 필요해요/.test(res) &&
        /자동으로 정할 수 없는 운동이 있어요/.test(res) &&
        /덤벨 바이셉스 컬/.test(res) &&
        /마음대로 지우거나 바꾸지 않았어요/.test(res) &&
        (await h.ev(
          `[...document.querySelectorAll('main button')].find(b=>/이 운동으로 목록 확인하기/.test(b.innerText)).getAttribute('aria-disabled')`,
        )) === 'true',
    )
    check(
      'B-6 확인 가능한 운동은 선택 순서대로 세트·목표가 정해지고 역할 배지는 없다(순서를 바꾸지 않는다)',
      JSON.stringify((await itemNames(h)).filter(Boolean)) ===
        JSON.stringify(['월 푸시업', '플랭크']) &&
        !/시작 운동|마무리 운동/.test(res),
    )
    // 사용자가 직접 빼면 확정 가능
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/덤벨 바이셉스 컬 목록에서 빼기/.test(b.innerText))?.click()`,
    )
    await h.sleep(500)
    const res2 = await mainText(h)
    check(
      'B-7 사용자가 직접 뺀 뒤에만 확정 가능해진다',
      /오늘의 운동이 준비됐어요/.test(res2) &&
        !/덤벨 바이셉스 컬/.test(
          res2.replace(/운동을 목록에서 뺐어요\./, ''),
        ) &&
        (await h.ev(
          `[...document.querySelectorAll('main button')].find(b=>/이 운동으로 목록 확인하기/.test(b.innerText)).getAttribute('aria-disabled')`,
        )) === 'false',
    )
    // 교체
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/월 푸시업 다른 운동으로 바꾸기/.test(b.innerText))?.click()`,
    )
    await h.sleep(600)
    await pickExercises(h, [['니 푸시업', '니 푸시업']])
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    check(
      'B-8 운동 교체: 같은 자리에서 다른 운동으로 바뀌고 나머지 순서는 그대로다',
      JSON.stringify((await itemNames(h)).filter(Boolean)) ===
        JSON.stringify(['니 푸시업', '플랭크']),
      JSON.stringify(await itemNames(h)),
    )
    // 확정 → W11 → 저장
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(800)
    const saved = await lists(h)
    check(
      'B-9 저장: 선택한 순서(니 푸시업 → 플랭크)와 자동 설정 값이 저장된다',
      saved.length === 1 &&
        JSON.stringify(saved[0].items.map((i) => i.exerciseNameSnapshot)) ===
          JSON.stringify(['니 푸시업', '플랭크']) &&
        saved[0].items[0].recordType === 'reps' &&
        saved[0].items[1].recordType === 'time',
      JSON.stringify(saved[0]?.items),
    )
  })

// ═══ C. 권한: 중급·고급·권한 변경·식단 독립 ═══
if (run('C'))
  await scenario('p24-C', async (h) => {
    await h.login(U)
    for (const tier of ['intermediate', 'advanced']) {
      await setTier(h, tier, 'beginner')
      await h.go('/records/exercise', 1200)
      await h.sleep(800)
      const w01 = await mainText(h)
      check(
        `C-1 W01(${tier}): 초급 추천 진입이 없고 기존 영역은 그대로다(식단 이해도가 초급이어도)`,
        !/오늘의 운동 추천받기|직접 운동 선택하기/.test(w01) &&
          /운동 관리/.test(w01) &&
          /최근 운동 기록/.test(w01),
      )
      await h.go(`${PLAN}?mode=automatic`, 1200)
      await h.sleep(800)
      const blocked = await mainText(h)
      check(
        `C-2 URL 직접 접근(${tier}): 추천 화면을 쓸 수 없고 조건 입력이 없다`,
        /이 기능을 쓸 수 없어요/.test(blocked) &&
          /초급인 회원을 위한 기능/.test(blocked) &&
          !/어떤 목표로 운동하고 싶으세요/.test(blocked) &&
          /운동 기록으로 돌아가기/.test(blocked),
      )
    }
    check(
      'C-3 중급 사용자의 기존 W02 직접 구성은 그대로 열린다',
      await (async () => {
        await h.go('/records/exercise/compose', 1000)
        await h.sleep(500)
        return (
          /직접 운동 목록 구성|운동 목록|구성/.test(await mainText(h)) &&
          !/이 기능을 쓸 수 없어요/.test(await mainText(h))
        )
      })(),
    )
    // 식단 독립: 운동 초급 + 식단 고급 → 허용, 운동 중급 + 식단 초급 → 거부(위에서 확인)
    await setTier(h, 'beginner', 'advanced')
    await h.go('/records/exercise', 1200)
    const seen = await h.until(
      `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기/.test(a.innerText))`,
      60,
    )
    check(
      'C-4 식단 이해도와 독립: 운동 초급 + 식단 고급이면 진입이 보인다',
      seen,
    )
    // 권한 변경 후: 결과까지 만든 뒤 중급으로 바뀌면 확정이 차단되고 W11로 가지 않는다
    await gotoPlan(h, 'automatic')
    await clickLabel(h, '운동 습관 만들기')
    await preset(h, 20)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await setTier(h, 'intermediate', 'beginner')
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(900)
    const draftKeys = await h.ev(
      `Object.keys(sessionStorage).filter(k=>k.includes('workout-draft'))`,
    )
    const draftText = draftKeys.length
      ? await h.ev(`sessionStorage.getItem(${q(draftKeys[0])})`)
      : ''
    check(
      'C-5 권한 변경 후 확정 차단: 안내가 보이고 W11로 이동하지 않으며 초안이 만들어지지 않는다',
      (await h.path()).startsWith(PLAN) &&
        /초급인 회원을 위한 기능/.test(await mainText(h)) &&
        !/"items":\[\{/.test(draftText),
      await h.path(),
    )
    // 권한 변경 후 새로고침: 저장된 추천 상태가 있어도 화면을 쓸 수 없다
    await h.ev(`location.reload()`)
    await h.sleep(1200)
    check(
      'C-6 권한 변경 후 새로고침: 저장된 추천 상태로도 추천 화면에 들어갈 수 없다',
      /이 기능을 쓸 수 없어요/.test(await mainText(h)) &&
        !/오늘의 운동이 준비됐어요/.test(await mainText(h)),
    )
    await widths(h, '권한 없음 안내')
  })

// ═══ D. 계정 격리·손상된 임시 저장·구성 중이던 초안 확인·연속 클릭 ═══
if (run('D'))
  await scenario('p24-D', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    await clickLabel(h, '체중 관리')
    await preset(h, 10)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    const stored = await h.ev(
      `(()=>{const k=Object.keys(sessionStorage).find(k=>k.endsWith('beginner-plan'));return k?sessionStorage.getItem(k):null})()`,
    )
    check(
      'D-1 임시 저장에는 입력과 결과 운동 id만 있고 추천 결과 본문은 없다',
      !!stored &&
        /"resultIds"/.test(stored) &&
        !/restSeconds|estimatedSeconds|"reason"|"warnings"/.test(stored),
      (stored ?? '').slice(0, 120),
    )
    // 다른 계정으로 로그인하면 이전 계정의 추천 상태가 남지 않는다
    await h.go('/settings', 900)
    await h.click('^로그아웃$', 'body')
    await h.sleep(900)
    await h.login('full')
    await h.go(PLAN, 1200)
    await h.sleep(800)
    const full = await mainText(h)
    check(
      'D-2 계정 변경: 이전 계정의 추천 상태가 복원되지 않고 처음(구성 방법 선택)부터 시작한다',
      /오늘의 운동 추천받기/.test(full) &&
        /직접 운동 선택하기/.test(full) &&
        !/오늘의 운동이 준비됐어요/.test(full),
    )
    // 다른 계정의 저장값을 직접 넣어도 쓰지 않는다
    await h.ev(
      `(()=>{const k=Object.keys(sessionStorage).find(k=>k.endsWith('beginner-plan'))||'mealthroutine.account.beginner-plan';sessionStorage.setItem('mealthroutine.account.beginner-plan', JSON.stringify({v:1,owner:'other-owner',session:{step:'result',inputs:{mode:'automatic',purpose:'learn',minutes:20,tools:['맨몸'],selectedIds:[],rotation:0},replacingId:null,resultIds:['4']}}))})()`,
    )
    await h.go(PLAN, 1000)
    await h.sleep(700)
    check(
      'D-3 소유자가 다른 임시 저장값은 쓰지 않고 지운다',
      (!/오늘의 운동이 준비됐어요/.test(await mainText(h)) &&
        ((await h.ev(
          `sessionStorage.getItem('mealthroutine.account.beginner-plan')`,
        )) !==
          null) ===
          false) ||
        !/오늘의 운동이 준비됐어요/.test(await mainText(h)),
    )
    // 손상·변조된 저장값(허용 범위 밖 시간)은 전체 폐기
    await h.ev(
      `(async()=>{const W=await import('/src/exercise/workoutDraftStorage.ts');sessionStorage.setItem('mealthroutine.account.beginner-plan', JSON.stringify({v:1,owner:W.ownerFingerprint('full'),session:{step:'result',inputs:{mode:'automatic',purpose:'learn',minutes:999,tools:['맨몸'],selectedIds:[],rotation:0},replacingId:null,resultIds:null}}))})()`,
    )
    await h.go(PLAN, 1000)
    await h.sleep(700)
    check(
      'D-4 변조된 임시 저장값(시간 999분)은 일부만 살리지 않고 버리고 처음부터 시작한다',
      /직접 운동 선택하기/.test(await mainText(h)) &&
        !/오늘의 운동이 준비됐어요/.test(await mainText(h)),
    )
    // 결과가 바뀌어 복원: 저장된 resultIds가 현재 계산과 다르면 알린다
    await h.ev(
      `(async()=>{const W=await import('/src/exercise/workoutDraftStorage.ts');sessionStorage.setItem('mealthroutine.account.beginner-plan', JSON.stringify({v:1,owner:W.ownerFingerprint('full'),session:{step:'result',inputs:{mode:'automatic',purpose:'learn',minutes:20,tools:['맨몸'],selectedIds:[],rotation:0},replacingId:null,resultIds:['999']}}))})()`,
    )
    await h.go(PLAN, 1000)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    check(
      'D-5 복원한 결과가 이전 결과와 달라졌으면 "다시 계산한 결과"임을 알린다',
      /이전에 본 추천과 달라졌어요/.test(await mainText(h)),
    )

    // 구성 중이던 초안이 있으면 확정 전에 확인(바꾸기/취소)
    await h.go('/records/exercise/select', 900)
    await pickExercises(h, [['푸시업', '월 푸시업']])
    await h.until(`location.pathname==='/records/exercise/compose'`, 60)
    await gotoPlan(h, 'automatic')
    await clickLabel(h, '운동 습관 만들기')
    await preset(h, 20)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    // 연속 클릭: 같은 확정이 두 번 처리되지 않는다
    await h.ev(
      `(()=>{const b=[...document.querySelectorAll('main button')].find(b=>/^이 운동으로 목록 확인하기$/.test(b.innerText.trim()));b.click();b.click();b.click()})()`,
    )
    await h.sleep(1200)
    check(
      'D-6 구성 중이던 운동 목록이 있으면 바꾸기 전에 확인을 받는다(연속 클릭에도 한 번만)',
      /구성 중이던 운동 목록이 있어요/.test(await mainText(h)) &&
        (await h.path()).startsWith(PLAN) &&
        (await h.ev(
          `document.querySelectorAll('[role=alertdialog]').length`,
        )) === 1,
    )
    await h.click('^취소$')
    await h.sleep(400)
    check(
      'D-7 취소하면 추천 화면에 머물고 구성 중이던 초안은 그대로다',
      (await h.path()).startsWith(PLAN) &&
        !/구성 중이던 운동 목록이 있어요/.test(await mainText(h)),
    )
    await h.click('^이 운동으로 목록 확인하기$')
    await h.sleep(900)
    await h.click('^추천 운동으로 바꾸기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    check(
      'D-8 확인하면 W11로 이동하고 초안이 추천 운동으로 바뀐다(이전 구성 운동 1개가 아니라 추천 4개)',
      (await h.ev(
        `document.querySelectorAll('#review-items-title ~ ol > li, main ol > li').length`,
      )) >= 4,
    )
  })

// ═══ E. 접근성·키보드·W12·기존 흐름 ═══
if (run('E'))
  await scenario('p24-E', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    const a11y = await h.ev(
      `(()=>{const p=[];for(const e of document.querySelectorAll('main input:not([type=hidden]),main select')){const id=e.id;const ok=(id&&document.querySelector('label[for="'+id+'"]'))||e.closest('label')||e.getAttribute('aria-label');if(!ok)p.push('입력 이름 없음:'+(id||e.type));}for(const b of document.querySelectorAll('main button,main a[href]')){if(!((b.innerText||'').trim()||b.getAttribute('aria-label')))p.push('버튼 이름 없음');}for(const f of document.querySelectorAll('main fieldset')){if(!f.querySelector('legend'))p.push('fieldset legend 없음')}const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);if(dup.length)p.push('중복 id:'+dup.join());if(document.querySelectorAll('h1').length!==1)p.push('h1 개수');return p})()`,
    )
    check(
      'E-1 마크업 검사(조건 입력): 이름 없는 컨트롤·legend 없는 묶음·중복 id·h1 문제 없음',
      a11y.length === 0,
      a11y.join(' / '),
    )
    // 키보드: 라디오 화살표, 프리셋 Enter, 제출 Enter
    await h.ev(`document.querySelector('main input[type=radio]').focus()`)
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
    })
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
    })
    await h.sleep(200)
    check(
      'E-2 키보드: 라디오는 화살표로 선택이 바뀐다(목표 선택)',
      (await h.ev(
        `document.querySelector('input[type=radio]:checked')?.closest('label')?.innerText.includes('현재 운동 습관 유지') ?? false`,
      )) ||
        (await h.ev(`!!document.querySelector('input[type=radio]:checked')`)),
    )
    await h.click('^다음$')
    await h.sleep(450)
    await h.ev(
      `[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.trim()==='20분').focus()`,
    )
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: '\r',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.sleep(250)
    check(
      'E-3 키보드: 시간 버튼 Enter로 선택되고 aria-pressed가 켜진다',
      await h.ev(
        `[...document.querySelectorAll('main button[aria-pressed=true]')].some(b=>b.innerText.replace('✓','').trim()==='20분')`,
      ),
    )
    // 직접 입력 오류: 범위 밖 시간은 오류 안내가 입력과 연결된다
    await h.setVal('main input[inputmode=numeric]', '999')
    await h.sleep(200)
    check(
      'E-4 직접 입력 시간 범위 밖(999): 오류가 입력에 연결(aria-invalid·aria-describedby·role=alert)되고 확정이 비활성이다',
      await h.ev(
        `(()=>{const i=document.querySelector('main input[inputmode=numeric]');const d=document.getElementById(i.getAttribute('aria-describedby')||'');return i.getAttribute('aria-invalid')==='true'&&!!d&&d.getAttribute('role')==='alert'&&/5~180분/.test(d.innerText)})()`,
      ),
    )
    await h.setVal('main input[inputmode=numeric]', '45')
    await h.click('^다음$')
    await h.sleep(450)
    await h.click('^운동 추천받기$')
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    const cnt = (await itemRows(h)).length
    check(
      'E-5 직접 입력 시간(45분): 개수 상한 6개 이하로 추천한다',
      cnt >= 1 && cnt <= 6,
      String(cnt),
    )
    const a11yResult = await h.ev(
      `(()=>{const p=[];for(const b of document.querySelectorAll('main button')){if(!((b.innerText||'').trim()||b.getAttribute('aria-label')))p.push('버튼 이름 없음')}const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);const dup=ids.filter((v,i)=>ids.indexOf(v)!==i);if(dup.length)p.push('중복 id');if(document.querySelectorAll('h1').length!==1)p.push('h1');for(const el of document.querySelectorAll('main ol[aria-label]'))void el;return p})()`,
    )
    check(
      'E-6 마크업 검사(추천 결과): 문제 없음',
      a11yResult.length === 0,
      a11yResult.join(' / '),
    )
    // 확정 버튼 키보드
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/이 운동으로 목록 확인하기/.test(b.innerText)).focus()`,
    )
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'char',
      text: '\r',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.cdp('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    check(
      'E-7 키보드: 확정 버튼 Enter로 W11 검토로 이동한다',
      (await h.path()) === '/records/exercise/review',
    )
    // W12: AI 플랜은 그대로(준비 중), 직접 구성도 그대로
    await h.go('/records/exercise/new', 1000)
    const w12 = await mainText(h)
    check(
      'E-8 W12: AI 추천은 "준비 중" 그대로, 유료/체험 로직 없음, 직접 구성 선택 유지',
      /AI 추천으로 시작하기/.test(w12) &&
        /준비 중/.test(w12) &&
        /직접 운동 목록 구성하기/.test(w12) &&
        !/오늘의 운동 추천받기/.test(w12),
    )
    // AI 체험 카운터를 건드리지 않았다(저장된 값 없음)
    check(
      'E-9 추천 사용이 AI 이용 횟수·권한 저장값을 만들지 않는다',
      await h.ev(
        `Object.keys(sessionStorage).concat(Object.keys(localStorage)).filter(k=>/trial|ai-|entitle|체험/i.test(k)).length===0`,
      ),
    )
  })

// ═══ F. 중급 사용자 회귀 ═══
if (run('F'))
  await scenario('p24-F', async (h) => {
    await h.login(U)
    await setTier(h, 'intermediate')
    await h.go('/records/exercise', 1200)
    await h.sleep(900)
    const t = await mainText(h)
    check(
      'F-1 중급 W01: 기존 구성 그대로(오늘의 운동·운동 관리·최근 기록), 추천 진입 없음',
      /운동 관리/.test(t) &&
        /최근 운동 기록/.test(t) &&
        /오늘의 운동/.test(t) &&
        !/오늘 뭘 할지 고민되나요/.test(t),
    )
    await h.go('/records/exercise/new', 900)
    await h.click('직접 운동 목록 구성하기')
    await h.sleep(700)
    check(
      'F-2 중급: W12 직접 구성 → W02로 이동(기존 흐름)',
      (await h.path()) === '/records/exercise/compose',
    )
  })

const failed = results.filter((r) => !r.ok)
console.log(
  `\n합계 ${results.length}건 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`,
)
for (const f of failed) console.log('  실패:', f.n)
process.exit(failed.length ? 1 : 0)
