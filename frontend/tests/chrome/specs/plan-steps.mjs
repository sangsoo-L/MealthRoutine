// [chrome 회귀] W01-2 조건 설정 단계 화면(S8-UI-1)
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only <이름>`. 상세: tests/chrome/README.md
// S8-UI-1 실제 Chrome + 개발용 IndexedDB 검증: W01-2 조건 설정 단계 화면. 시나리오마다 새 프로필.  node p91-verify.mjs [A|B|C|D|E|ALL]
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
const DASH = '/records/exercise'
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
const run = (id) => only === 'ALL' || only === id

const setTier = (h, exercise, meal = 'beginner', user = U) =>
  h.ev(`(async()=>{
    const A = await import('/src/auth/accountScope.ts');
    const Q = await import('/src/onboarding-assessment/mock/questionBank.ts');
    sessionStorage.setItem(A.accountScopedKey(${q(user)},'assessment.mock.result'), JSON.stringify({bankVersion:Q.QUESTION_BANK_VERSION,sessionId:'t-sess',completedAt:new Date().toISOString(),exercise:${q(exercise)},meal:${q(meal)}}));
    return true })()`)
const clickLabel = (h, text) =>
  h.ev(
    `(()=>{const l=[...document.querySelectorAll('main label')].find(l=>l.innerText.includes(${q(text)}));if(!l)return false;const i=l.querySelector('input');(i||l).click();return true})()`,
  )
const preset = (h, minutes) =>
  h.ev(
    `(()=>{const b=[...document.querySelectorAll('main button[aria-pressed]')].find(b=>b.innerText.replace('✓','').trim()===${q(minutes + '분')});if(!b)return false;b.click();return true})()`,
  )
const itemNames = (h) =>
  h.ev(
    `[...document.querySelectorAll('#plan-items-heading ~ ol > li')].map(li=>li.querySelector('span.text-body, .text-body')?.innerText.replace(/^\\d+\\.\\s*/,'').trim())`,
  )
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

/** 지금 보이는 단계의 상태 */
const info = (h) =>
  h.ev(`(()=>{
    const h1=document.querySelector('main h1');
    const pb=document.querySelector('main [role=progressbar]');
    const cta=document.querySelector('main .sticky button');
    const msg=document.querySelector('main .sticky [role=status]');
    return {
      h1:h1?.innerText.trim()??null, h1count:document.querySelectorAll('main h1').length,
      focus:document.activeElement===h1,
      prog:[...document.querySelectorAll('main p')].map(p=>p.innerText.trim()).find(t=>/^\\d\\/\\d단계$/.test(t))??null,
      now:pb?.getAttribute('aria-valuenow')??null, max:pb?.getAttribute('aria-valuemax')??null, speech:pb?.getAttribute('aria-valuetext')??null,
      cta:cta?.innerText.trim()??null, disabled:cta?.getAttribute('aria-disabled')??null, msg:msg?.innerText.trim()??null,
      radios:document.querySelectorAll('main input[type=radio]').length,
      checkedRadio:document.querySelector('main input[type=radio]:checked')?.closest('label').innerText.replace(/\\s+/g,' ').trim()??null,
      pressed:[...document.querySelectorAll('main button[aria-pressed=true]')].map(b=>b.innerText.replace('✓','').trim()),
      minutesInput:document.querySelector('main input[type=text]')?.value??null,
      checkedTools:[...document.querySelectorAll('main input[type=checkbox]:checked')].map(i=>i.closest('label').innerText.replace(/\\s+/g,' ').trim()),
    }})()`)
const cta = (h) => h.click('^(다음|운동 추천받기|세트와 목표 자동으로 정하기)$')
const next = async (h) => {
  await cta(h)
  await h.sleep(450)
}
const back = async (h) => {
  await h.ev(
    `document.querySelector('main button[aria-label^="이전"]')?.click()`,
  )
  await h.sleep(450)
}

const CLEAR_PLAN = `Object.keys(sessionStorage).filter(k=>k.endsWith('beginner-plan')).forEach(k=>sessionStorage.removeItem(k))`
const WIDE = `(()=>{const w=window.innerWidth;const bad=[];for(const e of document.querySelectorAll('main *')){const r=e.getBoundingClientRect();if(r.width===0||r.height===0)continue;if(e.closest('.sr-only')||e.classList.contains('sr-only'))continue;if(r.right>w+1||r.left<-1)bad.push((e.id||e.tagName)+':'+Math.round(r.left)+'~'+Math.round(r.right));}return {ov:document.documentElement.scrollWidth-w,bad:bad.slice(0,4)}})()`
/** 고정 버튼 영역·터치 영역·마지막 내용 가림 검사 */
const LAYOUT = `(()=>{
  const out={};
  window.scrollTo(0,document.documentElement.scrollHeight);
  const bar=document.querySelector('main .sticky');const btn=bar?.querySelector('button');
  const br=bar?.getBoundingClientRect();const bt=btn?.getBoundingClientRect();
  out.barBottomInView=!!br&&br.bottom<=window.innerHeight+1;
  out.btnHeight=bt?Math.round(bt.height):0;
  const body=bar?.previousElementSibling;
  const kids=body?[...body.children]:[];const last=kids[kids.length-1];const lr=last?.getBoundingClientRect();
  out.noOverlap=!lr||!br||lr.bottom<=br.top+1;
  const small=[];
  for(const e of document.querySelectorAll('main button, main label, main a, main input[type=text]')){
    if(e.closest('.sr-only'))continue;
    if(e.tagName==='LABEL'&&e.hasAttribute('for'))continue;
    const r=e.getBoundingClientRect();
    if(r.width===0||r.height===0)continue;if(r.height<43.5)small.push((e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,12)+':'+Math.round(r.height));
  }
  out.small=small.slice(0,5);
  window.scrollTo(0,0);
  return out})()`

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
const gotoPlan = async (h, mode) => {
  await h.go(DASH, 1000)
  await h.until(
    `(document.querySelector('main [data-beginner-plan] details')||{}).open=true,!![...document.querySelectorAll('main a')].find(a=>/오늘의 운동 추천받기|직접 운동 선택하기/.test(a.innerText))`,
    80,
  )
  await h.click(
    mode === 'automatic' ? '오늘의 운동 추천받기' : '직접 운동 선택하기',
    'main',
  )
  await h.until(`location.pathname===${q(PLAN)}`, 60)
  await h.sleep(600)
}

// ═══ A. 전체 자동 추천: 목표 → 시간 → 도구 → 결과 → 조건 수정 → W11 → 저장 → W01 ═══
if (run('A'))
  await scenario('p91-A', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    let s = await info(h)
    check(
      'A-1 1단계: 질문이 h1이고(1개) 1/3단계·진행률(보조기기 값)·라디오 3개',
      s.h1 === '어떤 목표로 운동하고 싶으세요?' &&
        s.h1count === 1 &&
        s.prog === '1/3단계' &&
        s.now === '1' &&
        s.max === '3' &&
        s.speech === '3단계 중 1단계' &&
        s.radios === 3,
      JSON.stringify(s),
    )
    check(
      'A-2 1단계: 다른 단계의 질문(시간·도구)은 같은 화면에 없다',
      !/얼마나 운동할 수 있나요|운동 도구가 있나요/.test(await mainText(h)),
    )
    check('A-3 단계 진입 시 제목(h1)으로 포커스가 이동한다', s.focus)
    check(
      'A-4 목표 미선택: 다음은 비활성(aria-disabled)이고 이유가 보인다',
      s.cta === '다음' &&
        s.disabled === 'true' &&
        s.msg === '운동 목표를 골라 주세요.',
      JSON.stringify([s.cta, s.disabled, s.msg]),
    )
    await cta(h)
    await h.sleep(350)
    check(
      'A-5 비활성 상태의 다음을 눌러도 이동하지 않는다',
      (await info(h)).prog === '1/3단계',
    )
    await clickLabel(h, '운동 습관 만들기')
    await h.sleep(250)
    s = await info(h)
    check(
      'A-6 목표를 고르면 선택이 체크되고(✓ 표시 포함) 다음이 활성이다',
      s.checkedRadio?.includes('운동 습관 만들기') &&
        /✓/.test(s.checkedRadio) &&
        s.disabled === 'false' &&
        s.msg === null,
      JSON.stringify(s.checkedRadio),
    )
    await h.shot('p91-step1-390.png')
    await next(h)
    s = await info(h)
    check(
      'A-7 2단계: 질문·2/3단계·진행률 2, 이전 질문은 사라지고 제목으로 포커스',
      s.h1 === '오늘은 얼마나 운동할 수 있나요?' &&
        s.prog === '2/3단계' &&
        s.now === '2' &&
        s.focus &&
        s.radios === 0,
      JSON.stringify(s),
    )
    check(
      'A-8 2단계: 시간 미선택이면 다음 비활성과 이유',
      s.cta === '다음' &&
        s.disabled === 'true' &&
        s.msg === '운동 가능 시간을 골라 주세요.',
    )
    check(
      'A-9 2단계: 빠른 선택 10·20·30분과 직접 입력(5~180분)',
      await h.ev(
        `(()=>{const t=[...document.querySelectorAll('main button[aria-pressed]')].map(b=>b.innerText.trim());return t.join()==='10분,20분,30분'&&/직접 입력\\(분, 5~180분\\)/.test(document.querySelector('main').innerText)})()`,
      ),
    )
    await preset(h, 20)
    await h.sleep(200)
    s = await info(h)
    check(
      'A-10 빠른 선택 20분: 눌림 상태(aria-pressed)와 다음 활성',
      s.pressed.join() === '20분' && s.disabled === 'false',
      JSON.stringify(s.pressed),
    )
    // 직접 입력: 범위 검사(보정하지 않는다)
    const typeMinutes = async (v) => {
      await h.setVal('main input[type=text]', v)
      await h.sleep(200)
      return h.ev(
        `(()=>({alert:document.querySelector('main [role=alert]')?.innerText.trim()??null,disabled:document.querySelector('main .sticky button').getAttribute('aria-disabled'),invalid:document.querySelector('main input[type=text]').getAttribute('aria-invalid'),describedby:!!document.querySelector('main input[type=text]').getAttribute('aria-describedby'),pressed:[...document.querySelectorAll('main button[aria-pressed=true]')].length}))()`,
      )
    }
    const bad = []
    for (const v of ['4', '181', '999', '12.5', 'abc', '0'])
      bad.push([v, await typeMinutes(v)])
    check(
      'A-11 직접 입력 오류(4·181·999·12.5·abc·0): 안내(role=alert, 입력과 연결)와 다음 비활성, 빠른 선택 해제',
      bad.every(
        ([, r]) =>
          /5~180분 사이의 숫자/.test(r.alert ?? '') &&
          r.disabled === 'true' &&
          r.invalid === 'true' &&
          r.describedby &&
          r.pressed === 0,
      ),
      JSON.stringify(
        bad.map(([v, r]) => [v, r.alert?.slice(0, 6), r.disabled]),
      ),
    )
    const good = []
    for (const v of ['5', '180', '45']) good.push([v, await typeMinutes(v)])
    check(
      'A-12 직접 입력 정상(5·180·45): 오류 없이 다음 활성(빠른 선택에 없는 값도 가능)',
      good.every(([, r]) => r.alert === null && r.disabled === 'false'),
      JSON.stringify(good.map(([v, r]) => [v, r.disabled])),
    )
    await h.shot('p91-step2-390.png')
    // 이전/다음에서 값 유지
    await back(h)
    s = await info(h)
    check(
      'A-13 2→1 이전: 1단계로 돌아가 고른 목표가 유지되고 제목으로 포커스',
      s.prog === '1/3단계' &&
        s.checkedRadio?.includes('운동 습관 만들기') &&
        s.focus,
      JSON.stringify([s.prog, s.checkedRadio, s.focus]),
    )
    await next(h)
    s = await info(h)
    check(
      'A-14 1→2 다시: 직접 입력한 45분이 그대로 있다',
      s.prog === '2/3단계' && s.minutesInput === '45' && s.disabled === 'false',
      JSON.stringify([s.minutesInput, s.disabled]),
    )
    await next(h)
    s = await info(h)
    check(
      'A-15 3단계: 질문·3/3단계·마지막 버튼 "운동 추천받기"(도구 미선택이어도 활성)',
      s.h1 === '사용할 수 있는 운동 도구가 있나요?' &&
        s.prog === '3/3단계' &&
        s.now === '3' &&
        s.cta === '운동 추천받기' &&
        s.disabled === 'false' &&
        s.msg === null &&
        s.focus,
      JSON.stringify([s.h1, s.prog, s.cta, s.disabled]),
    )
    check(
      'A-16 3단계: 도구 6종(E01과 같음) — 맨몸은 선택·비활성, 밴드는 선택 가능·미선택, 추천할 수 없는 4종은 비활성(S8-UI-1A)',
      s.checkedTools.length === 1 &&
        /맨몸/.test(s.checkedTools[0]) &&
        (await h.ev(
          `(()=>{const m={};for(const i of document.querySelectorAll('main input[type=checkbox]')){m[i.closest('label').querySelector('span span').firstChild.textContent.trim()]=i}return Object.keys(m).length===6&&m['맨몸'].disabled&&m['맨몸'].checked&&!m['밴드'].disabled&&!m['밴드'].checked&&['덤벨','폼롤러','마사지볼','풀업 바'].every(n=>m[n].disabled&&!m[n].checked)})()`,
        )),
    )
    await clickLabel(h, '밴드')
    await h.sleep(200)
    s = await info(h)
    check(
      'A-17 밴드를 고르면 체크(✓ 표시)된다',
      s.checkedTools.length === 2 &&
        s.checkedTools.some((t) => /밴드/.test(t) && /✓/.test(t)),
      JSON.stringify(s.checkedTools),
    )
    await h.shot('p91-step3-390.png')
    // 브라우저 새로고침: 입력 유지(위치는 값에서 이어 감)
    await h.ev(`location.reload()`)
    await h.until(`!!document.querySelector('main h1')`, 80)
    await h.sleep(700)
    s = await info(h)
    check(
      'A-18 새로고침: 고른 값(목표·45분·밴드)이 유지되고 3단계에서 이어진다',
      s.prog === '3/3단계' && s.checkedTools.some((t) => /밴드/.test(t)),
      JSON.stringify([s.prog, s.checkedTools]),
    )
    await back(h)
    s = await info(h)
    await back(h)
    const s1 = await info(h)
    check(
      'A-19 새로고침 뒤에도 이전으로 가면 값이 그대로다(45분·목표)',
      s.minutesInput === '45' && s1.checkedRadio?.includes('운동 습관 만들기'),
      JSON.stringify([s.minutesInput, s1.checkedRadio]),
    )
    await next(h)
    await next(h)
    await next(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const res = await mainText(h)
    check(
      'A-20 마지막 단계에서 기존 추천 결과가 만들어진다: 최대 45분 가능·결과 제목으로 포커스',
      /오늘의 운동이 준비됐어요/.test(res) &&
        /최대 45분 가능 · 추천 운동 약 \d+분/.test(res) &&
        (await h.ev(`document.activeElement?.id`)) === 'plan-result-heading',
      (res.match(/최대[^\n]*/) ?? [''])[0],
    )
    check(
      'A-21 결과 화면에는 단계 진행률이 없고 기존 구성(조건 바꾸기·다시 추천받기)이 그대로다',
      (await h.ev(`!document.querySelector('main [role=progressbar]')`)) &&
        /조건 바꾸기/.test(res) &&
        /다시 추천받기/.test(res),
    )
    await h.shot('p91-result-390.png')
    // 조건 수정: 1단계부터, 모든 값 복원
    await h.click('^조건 바꾸기')
    await h.sleep(450)
    s = await info(h)
    check(
      'A-22 결과에서 조건 바꾸기: 1단계로 돌아가고 목표가 복원된다',
      s.prog === '1/3단계' &&
        s.checkedRadio?.includes('운동 습관 만들기') &&
        s.disabled === 'false' &&
        s.focus,
      JSON.stringify([s.prog, s.checkedRadio]),
    )
    await next(h)
    s = await info(h)
    const m45 = s.minutesInput
    await preset(h, 20)
    await next(h)
    s = await info(h)
    check(
      'A-23 조건 수정 중: 2단계의 이전 값(45)을 보았고 3단계에서 밴드가 유지된다',
      m45 === '45' && s.checkedTools.some((t) => /밴드/.test(t)),
      JSON.stringify([m45, s.checkedTools]),
    )
    await next(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    check(
      'A-24 조건 수정 후 재추천: 20분 기준으로 다시 계산된다',
      /최대 20분 가능/.test(await mainText(h)),
    )
    // W11 → 저장 → W01
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(900)
    check(
      'A-25 확정 → W11 검토 화면으로 간다(기존 흐름)',
      /운동 목록 최종 검토/.test(await mainText(h)),
    )
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(900)
    const saved = await lists(h)
    check(
      'A-26 W11 저장 → W01: 오늘의 운동으로 저장되어 보인다(운동 4개 이상)',
      saved.length === 1 &&
        saved[0].items.length >= 3 &&
        (await mainText(h)).includes(saved[0].items[0].exerciseNameSnapshot),
      String(saved[0]?.items.length),
    )
  })

// ═══ B. 직접 선택 자동 설정 ═══
if (run('B'))
  await scenario('p91-B', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'selected')
    let s = await info(h)
    check(
      'B-1 직접 선택은 4단계: 1/4단계, 진행률 최대 4',
      s.prog === '1/4단계' && s.max === '4' && s.speech === '4단계 중 1단계',
      JSON.stringify([s.prog, s.max]),
    )
    await clickLabel(h, '현재 운동 습관 유지')
    await next(h)
    await preset(h, 20)
    await next(h)
    s = await info(h)
    check(
      'B-2 3단계(도구): 직접 선택에서는 마지막 버튼이 "다음"이다(추천받기 아님)',
      s.prog === '3/4단계' && s.cta === '다음' && s.disabled === 'false',
      JSON.stringify([s.prog, s.cta]),
    )
    await next(h)
    s = await info(h)
    check(
      'B-3 4단계(운동 고르기): 질문·4/4단계, 마지막 버튼은 비활성이고 이유 안내',
      s.h1 === '어떤 운동으로 구성할까요?' &&
        s.prog === '4/4단계' &&
        s.cta === '세트와 목표 자동으로 정하기' &&
        s.disabled === 'true' &&
        s.msg === '운동을 하나 이상 골라 주세요.' &&
        /아직 고른 운동이 없어요/.test(await mainText(h)),
      JSON.stringify(s),
    )
    await h.shot('p91-step4-390.png')
    await h.click('^운동 고르기$')
    await h.sleep(700)
    check(
      'B-4 운동 선택은 기존 W13 선택 UI를 재사용한다(운동 찾아보기, 제목 하나, 이전 링크 있음)',
      (await h.ev(`document.querySelectorAll('h1').length`)) === 1 &&
        /운동 찾아보기/.test(await mainText(h)) &&
        (await h.ev(
          `!![...document.querySelectorAll('main a')].find(a=>a.getAttribute('aria-label')==='이전 화면으로 돌아가기')`,
        )),
    )
    await pickExercises(h, [
      ['푸시업', '월 푸시업'],
      ['플랭크', '플랭크'],
      ['바이셉스', '덤벨 바이셉스 컬'],
    ])
    s = await info(h)
    const rows = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
    )
    check(
      'B-5 운동을 고른 뒤 4단계로 돌아오고(1단계가 아님) 고른 3개가 선택 순서대로 보인다',
      s.prog === '4/4단계' &&
        rows.length === 3 &&
        /월 푸시업/.test(rows[0]) &&
        /플랭크/.test(rows[1]) &&
        /덤벨 바이셉스 컬/.test(rows[2]),
      JSON.stringify([s.prog, rows.map((r) => r.slice(0, 12))]),
    )
    check(
      'B-6 각 운동에 부위·난이도·도구와 자동 구성 가능 여부를 안내한다(중량 운동은 경고)',
      /가슴 · 초급 · 맨몸/.test(rows[0]) &&
        /자동으로 구성할 수 있어요/.test(rows[0]) &&
        /중량이 필요한 운동/.test(rows[2]),
    )
    // 이전/다음에서 목록 보존
    await back(h)
    await back(h)
    s = await info(h)
    check(
      'B-7 4→2 이전: 2단계 값(20분)이 유지된다',
      s.prog === '2/4단계' && s.pressed.join() === '20분',
      JSON.stringify([s.prog, s.pressed]),
    )
    await next(h)
    await next(h)
    const rows2 = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
    )
    check(
      'B-8 다시 4단계: 고른 운동 목록과 순서가 그대로다',
      JSON.stringify(rows2) === JSON.stringify(rows),
      JSON.stringify(rows2.map((r) => r.slice(0, 10))),
    )
    // 새로고침
    await h.ev(`location.reload()`)
    await h.until(`!!document.querySelector('main h1')`, 80)
    await h.sleep(900)
    s = await info(h)
    const rows3 = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | '))`,
    )
    check(
      'B-9 새로고침: 4단계에서 고른 운동 목록이 유지된다',
      s.prog === '4/4단계' && JSON.stringify(rows3) === JSON.stringify(rows),
      JSON.stringify([s.prog, rows3.length]),
    )
    await next(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(400)
    const res = await mainText(h)
    check(
      'B-10 기존 결과: 추천 불가(중량) 운동이 있으면 확인이 필요하고 선택 운동을 지우지 않는다',
      /확인이 필요해요/.test(res) &&
        /덤벨 바이셉스 컬/.test(res) &&
        /마음대로 지우거나 바꾸지 않았어요/.test(res),
    )
    await h.ev(
      `[...document.querySelectorAll('main button')].find(b=>/덤벨 바이셉스 컬 목록에서 빼기/.test(b.innerText))?.click()`,
    )
    await h.sleep(500)
    check(
      'B-11 직접 뺀 뒤에만 확정되고 순서가 유지된다(월 푸시업 → 플랭크, 역할 배지 없음)',
      JSON.stringify((await itemNames(h)).filter(Boolean)) ===
        JSON.stringify(['월 푸시업', '플랭크']) &&
        !/시작 운동|마무리 운동/.test(await mainText(h)),
    )
    // 결과에서 조건 수정 → 목록 유지
    await h.click('^조건 바꾸기')
    await h.sleep(450)
    s = await info(h)
    check(
      'B-12 결과에서 조건 바꾸기: 1단계로 가고(4단계 모드) 값이 복원된다',
      s.prog === '1/4단계' && s.checkedRadio?.includes('현재 운동 습관 유지'),
      JSON.stringify([s.prog, s.checkedRadio]),
    )
    await next(h)
    await next(h)
    await next(h)
    const rows4 = await h.ev(
      `[...document.querySelectorAll('main ol > li')].map(li=>li.innerText.replace(/\\n+/g,' | ').slice(0,10))`,
    )
    check(
      'B-13 조건 수정 후 4단계: 직접 뺀 뒤의 목록(2개)과 순서가 그대로다',
      rows4.length === 2 &&
        /월 푸시업/.test(rows4[0]) &&
        /플랭크/.test(rows4[1]),
      JSON.stringify(rows4),
    )
    await next(h)
    await h.until(`!!document.getElementById('plan-result-heading')`, 60)
    await h.sleep(300)
    await h.click('^이 운동으로 목록 확인하기$')
    await h.until(`location.pathname==='/records/exercise/review'`, 80)
    await h.sleep(800)
    await h.click('^오늘의 운동으로 저장$')
    await h.until(`location.pathname==='/records/exercise'`, 80)
    await h.sleep(800)
    const saved = await lists(h)
    check(
      'B-14 W11 저장: 고른 순서(월 푸시업 → 플랭크)와 자동 설정이 저장된다',
      saved.length === 1 &&
        JSON.stringify(saved[0].items.map((i) => i.exerciseNameSnapshot)) ===
          JSON.stringify(['월 푸시업', '플랭크']),
      JSON.stringify(saved[0]?.items.map((i) => i.exerciseNameSnapshot)),
    )
  })

// ═══ B2. 운동 고르는 중 새로고침 → 돌아오면 4단계 ═══
if (run('B') || run('B2'))
  await scenario('p91-B2', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'selected')
    await clickLabel(h, '현재 운동 습관 유지')
    await next(h)
    await preset(h, 20)
    await next(h)
    await next(h)
    await h.click('^운동 고르기$')
    await h.sleep(600)
    await h.ev(`location.reload()`)
    await h.until(
      `!!document.querySelector('main h1')||!!document.body.innerText.includes('운동 찾아보기')`,
      80,
    )
    await h.sleep(900)
    check(
      'B2-1 운동 고르는 중 새로고침: 고르는 화면이 그대로 복원된다',
      /운동 찾아보기/.test(await mainText(h)),
    )
    await pickExercises(h, [['푸시업', '월 푸시업']])
    const s = await info(h)
    check(
      'B2-2 고른 뒤 돌아오면 4단계(운동 고르기)이고 고른 운동이 보인다(3단계로 되돌아가지 않는다)',
      s.prog === '4/4단계' && /월 푸시업/.test(await mainText(h)),
      JSON.stringify(s.prog),
    )
    // 고르는 화면의 돌아가기: 고른 운동 없이 4단계로
    await h.click('^운동 더 고르기$')
    await h.sleep(500)
    await h.click('^돌아가기$')
    await h.sleep(500)
    check(
      'B2-3 고르는 화면에서 돌아가기: 4단계로 돌아온다',
      (await info(h)).prog === '4/4단계',
    )
  })

// ═══ C. 뒤로가기(화면 내·브라우저)·진입 경로·새로고침 ═══
if (run('C'))
  await scenario('p91-C', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    await clickLabel(h, '체중 관리')
    await next(h)
    await preset(h, 30)
    await next(h)
    let s = await info(h)
    check('C-1 3단계까지 진행', s.prog === '3/3단계')
    // 브라우저 뒤로가기: 단계 화면은 기록이 쌓이지 않아 W01로 나간다
    await h.ev(`history.back()`)
    await h.until(`location.pathname===${q(DASH)}`, 60)
    await h.sleep(600)
    check(
      'C-2 브라우저 뒤로가기: W01 운동 기록으로 나간다(단계 화면에 갇히지 않는다)',
      (await h.path()) === DASH &&
        /오늘의 운동 추천받기/.test(await mainText(h)),
    )
    await h.ev(`history.forward()`)
    await h.until(`location.pathname===${q(PLAN)}`, 60)
    await h.sleep(800)
    s = await info(h)
    check(
      'C-3 브라우저 앞으로가기: 고른 값이 복원되어 3단계에서 이어진다(처음 단계 아님)',
      s.prog === '3/3단계',
      JSON.stringify(s.prog),
    )
    await back(h)
    s = await info(h)
    check(
      'C-4 복원 뒤 이전: 2단계의 30분이 유지된다',
      s.pressed.join() === '30분',
    )
    await back(h)
    s = await info(h)
    check(
      'C-5 1단계 이전은 진입한 화면(W01)으로 돌아간다',
      s.prog === '1/3단계' && s.checkedRadio?.includes('체중 관리'),
    )
    await back(h)
    await h.until(`location.pathname===${q(DASH)}`, 60)
    check('C-6 1단계에서 화면 내 이전: W01로 이동', (await h.path()) === DASH)
    // 구성 방법 선택에서 들어온 경우: 1단계 이전은 구성 방법 선택으로
    await h.go(PLAN, 1200)
    await h.sleep(600)
    s = await info(h)
    // 같은 계정의 임시 저장이 남아 있어 복원된다 → 조건 단계가 열린다
    check(
      'C-7 임시 저장이 남은 상태로 주소 직접 접근: 입력 값에서 이어진다(3단계)',
      s.prog === '3/3단계',
      JSON.stringify(s.prog),
    )
    await h.ev(CLEAR_PLAN)
    await h.go(PLAN, 1200)
    await h.sleep(700)
    check(
      'C-8 임시 저장이 없으면 구성 방법 선택부터 시작한다(기존 진입 유지)',
      /오늘의 운동 추천받기/.test(await mainText(h)) &&
        /직접 운동 선택하기/.test(await mainText(h)),
    )
    await h.click('오늘의 운동 추천받기')
    await h.sleep(500)
    s = await info(h)
    check(
      'C-9 구성 방법을 고르면 1단계가 열린다',
      s.prog === '1/3단계' && s.h1 === '어떤 목표로 운동하고 싶으세요?',
    )
    check(
      'C-10 구성 방법에서 들어온 1단계의 이전: 구성 방법 선택으로 돌아간다',
      await (async () => {
        await h.ev(
          `document.querySelector('main button[aria-label^="이전"]')?.getAttribute('aria-label')`,
        )
        const label = await h.ev(
          `document.querySelector('main button[aria-label^="이전"]')?.getAttribute('aria-label')`,
        )
        await back(h)
        return (
          /구성 방법/.test(label) &&
          /오늘의 운동 추천받기/.test(await mainText(h)) &&
          (await h.path()) === PLAN
        )
      })(),
    )
    // URL ?mode= 진입
    await h.go(`${PLAN}?mode=selected`, 1000)
    await h.ev(CLEAR_PLAN)
    await h.go(`${PLAN}?mode=selected`, 1000)
    await h.sleep(700)
    s = await info(h)
    check('C-11 ?mode=selected 진입: 1/4단계', s.prog === '1/4단계')
  })

// ═══ D. 반응형·고정 버튼·터치 영역·키보드·접근성 ═══
if (run('D'))
  await scenario('p91-D', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    const stepsAuto = [
      ['1단계', async () => {}],
      [
        '2단계',
        async () => {
          await clickLabel(h, '운동 습관 만들기')
          await next(h)
        },
      ],
      [
        '3단계',
        async () => {
          await preset(h, 20)
          await next(h)
        },
      ],
    ]
    const widths = [
      [320, 640],
      [375, 812],
      [390, 844],
      [768, 1024],
      [1280, 900],
    ]
    for (const [label, go] of stepsAuto) {
      await go()
      for (const [w, hh] of widths) {
        await h.vp(w, hh)
        await h.sleep(350)
        const m = await h.ev(WIDE)
        const l = await h.ev(LAYOUT)
        check(
          `D 반응형 ${label} ${w}px: 가로 넘침 없음·고정 버튼이 화면 안·마지막 내용을 가리지 않음·터치 영역 44px 이상`,
          m.ov <= 0 &&
            m.bad.length === 0 &&
            l.barBottomInView &&
            l.noOverlap &&
            l.btnHeight >= 44 &&
            l.small.length === 0,
          JSON.stringify({ m, l }),
        )
      }
      await h.vp(390, 844)
      await h.sleep(250)
    }
    // 데스크톱 최대 너비
    await h.vp(1280, 900)
    await h.sleep(300)
    const wid = await h.ev(
      `Math.round(document.querySelector('main').getBoundingClientRect().width)`,
    )
    check(
      'D-데스크톱: 콘텐츠 최대 너비가 제한된다(앱 폭 안)',
      wid <= 420,
      String(wid),
    )
    await h.shot('p91-step3-1280.png')
    await h.vp(320, 640)
    await h.sleep(300)
    await h.shot('p91-step3-320.png')
    await h.vp(390, 844)
    // 직접 선택 4단계도 한 번
    await h.go(DASH, 800)
    await h.ev(CLEAR_PLAN)
    await gotoPlan(h, 'selected')
    await clickLabel(h, '운동 습관 만들기')
    await next(h)
    await preset(h, 10)
    await next(h)
    await next(h)
    for (const [w, hh] of widths) {
      await h.vp(w, hh)
      await h.sleep(350)
      const m = await h.ev(WIDE)
      const l = await h.ev(LAYOUT)
      check(
        `D 반응형 4단계(직접 선택) ${w}px`,
        m.ov <= 0 &&
          m.bad.length === 0 &&
          l.barBottomInView &&
          l.noOverlap &&
          l.small.length === 0,
        JSON.stringify({ m, l }),
      )
    }
    await h.vp(390, 844)
    // ── 키보드 ──
    await h.go(DASH, 800)
    await h.ev(CLEAR_PLAN)
    await gotoPlan(h, 'automatic')
    const focusText = () =>
      h.ev(
        `(()=>{const a=document.activeElement;return a?{tag:a.tagName,type:a.type??null,text:(a.innerText||a.getAttribute('aria-label')||a.value||'').trim().slice(0,20),checked:a.checked??null}:null})()`,
      )
    const tabUntil = async (pred, max = 14) => {
      for (let i = 0; i < max; i++) {
        await h.press('Tab', 'Tab', 9)
        const f = await focusText()
        if (f && pred(f)) return f
      }
      return null
    }
    const r = await tabUntil((f) => f.type === 'radio')
    check('D-키보드 1: Tab으로 목표 라디오에 도달한다', !!r, JSON.stringify(r))
    await h.press(' ', 'Space', 32)
    s0: {
      const sel = await info(h)
      check(
        'D-키보드 2: Space로 목표가 선택되고 다음이 활성이다',
        !!sel.checkedRadio && sel.disabled === 'false',
        JSON.stringify(sel.checkedRadio),
      )
    }
    const c = await tabUntil((f) => f.text === '다음')
    check(
      'D-키보드 3: Tab으로 고정 "다음" 버튼에 도달한다',
      !!c,
      JSON.stringify(c),
    )
    await h.press('Enter', 'Enter', 13)
    await h.sleep(500)
    let s = await info(h)
    check(
      'D-키보드 4: Enter로 2단계로 가고 제목에 포커스가 간다',
      s.prog === '2/3단계' && s.focus,
      JSON.stringify([s.prog, s.focus]),
    )
    const pb = await tabUntil((f) =>
      /^(✓)?10분$/.test(f.text.replace(/\s/g, '')),
    )
    await h.press(' ', 'Space', 32)
    await h.sleep(200)
    s = await info(h)
    check(
      'D-키보드 5: 빠른 선택 버튼에 Tab으로 가서 Space로 선택된다',
      !!pb && s.pressed.join() === '10분',
      JSON.stringify([pb, s.pressed]),
    )
    // 선택 상태를 보조기기에 전달: 라디오 role, 눌림, progressbar
    check(
      'D-접근성 1: 목표는 radiogroup(질문과 연결)·시간은 group(aria-label)·진행률은 progressbar(값·문구)',
      await (async () => {
        await back(h)
        const ok1 = await h.ev(
          `(()=>{const g=document.querySelector('main [role=radiogroup]');const id=g?.getAttribute('aria-labelledby');return !!g&&document.getElementById(id)?.tagName==='H1'})()`,
        )
        await next(h)
        const ok2 = await h.ev(
          `!!document.querySelector('main [role=group][aria-label="운동 가능 시간 고르기"]')&&document.querySelector('main [role=progressbar]').getAttribute('aria-valuetext')==='3단계 중 2단계'`,
        )
        return ok1 && ok2
      })(),
    )
    check(
      'D-접근성 2: 이전 버튼의 이름은 "이전"으로 시작하고 터치 영역 44px 이상',
      await h.ev(
        `(()=>{const b=document.querySelector('main button[aria-label^="이전"]');const r=b.getBoundingClientRect();return b.getAttribute('aria-label').startsWith('이전')&&r.height>=43.5&&r.width>=43.5})()`,
      ),
    )
    check(
      'D-접근성 3: 선택 상태는 색뿐 아니라 ✓·굵은 테두리·눌림 상태로도 드러난다',
      await h.ev(
        `(()=>{const p=document.querySelector('main button[aria-pressed=true]');return /✓/.test(p.innerText)&&getComputedStyle(p).borderTopWidth==='2px'})()`,
      ),
    )
    // prefers-reduced-motion
    await h.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await h.sleep(200)
    const anim = await h.ev(
      `(()=>{const d=document.querySelector('main h1').closest('div[class*=animate-]');return d?getComputedStyle(d).animationName:'(none)'})()`,
    )
    check(
      'D-접근성 4: prefers-reduced-motion이면 단계 전환 애니메이션이 없다',
      anim === 'none' || anim === '(none)',
      String(anim),
    )
    await h.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })
    await next(h)
    await h.sleep(150)
    const anim2 = await h.ev(
      `(()=>{const d=document.querySelector('main h1').closest('div[class*=animate-]');return d?getComputedStyle(d).animationName:'(none)'})()`,
    )
    check(
      'D-전환: 일반 설정에서는 단계 이동 시 기존 전환(survey-next)이 재생된다',
      /survey-(next|back)/.test(String(anim2)),
      String(anim2),
    )
  })

// ═══ E. 권한·AI 독립·계정 격리 ═══
if (run('E'))
  await scenario('p91-E', async (h) => {
    await h.login(U)
    await gotoPlan(h, 'automatic')
    await clickLabel(h, '운동 습관 만들기')
    await next(h)
    await preset(h, 20)
    await next(h)
    check('E-1 beginner: 3단계까지 진행', (await info(h)).prog === '3/3단계')
    check(
      'E-2 추천 사용이 AI 이용 횟수·권한 저장값을 만들지 않는다',
      await h.ev(
        `Object.keys(sessionStorage).concat(Object.keys(localStorage)).filter(k=>/trial|ai-|entitle|체험/i.test(k)).length===0`,
      ),
    )
    // 계정 변경
    await h.go('/settings', 900)
    await h.click('^로그아웃$', 'body')
    await h.sleep(900)
    await h.login('full')
    await h.go(PLAN, 1200)
    await h.sleep(800)
    const t = await mainText(h)
    check(
      'E-3 계정 변경: 이전 계정의 조건·단계가 남지 않고 구성 방법 선택부터 시작한다',
      /오늘의 운동 추천받기/.test(t) &&
        /직접 운동 선택하기/.test(t) &&
        !(await h.ev(`!!document.querySelector('main [role=progressbar]')`)),
      t.slice(0, 40),
    )
    await h.click('오늘의 운동 추천받기')
    await h.sleep(500)
    const s = await info(h)
    check(
      'E-4 새 계정 1단계: 목표·시간이 비어 있다(이전 계정 값 없음)',
      s.prog === '1/3단계' && s.checkedRadio === null && s.disabled === 'true',
    )
    await h.go(DASH, 800)
    await setTier(h, 'intermediate', 'beginner', 'full')
    await h.go(PLAN, 1200)
    await h.sleep(900)
    const blocked = await mainText(h)
    check(
      'E-5 비초급(중급) 접근 차단: 이 기능을 쓸 수 없어요, 단계 화면·조건이 없다',
      /이 기능을 쓸 수 없어요/.test(blocked) &&
        !(await h.ev(`!!document.querySelector('main [role=progressbar]')`)) &&
        !/어떤 목표로 운동하고 싶으세요/.test(blocked),
      blocked.slice(0, 40),
    )
    check(
      'E-6 차단 화면에도 이전(운동 기록으로 돌아가기)이 있다',
      /운동 기록으로 돌아가기/.test(blocked) &&
        (await h.ev(
          `!![...document.querySelectorAll('main a')].find(a=>a.getAttribute('aria-label')==='이전 화면으로 돌아가기')`,
        )),
    )
    await h.go('/records/exercise/new', 900)
    const w12 = await mainText(h)
    check(
      'E-7 W12 AI 추천은 "준비 중" 그대로이고 초급 추천 문구가 섞이지 않는다',
      /AI 추천으로 시작하기/.test(w12) &&
        /준비 중/.test(w12) &&
        /직접 운동 목록 구성하기/.test(w12) &&
        !/어떤 목표로 운동하고 싶으세요/.test(w12),
    )
  })

const failed = results.filter((r) => !r.ok)
console.log(
  `\n합계 ${results.length}건 중 통과 ${results.length - failed.length}, 실패 ${failed.length}`,
)
for (const f of failed) console.log('  실패:', f.n)
process.exit(failed.length ? 1 : 0)
