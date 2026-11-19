// 회귀 스크립트 공용 세션 헬퍼(로그인·시드·W14 진행·스크린샷). 시나리오마다 새 Chrome 프로필(빈 IndexedDB)로 시작한다. 앱 소스를 수정하지 않는다.
import { writeFileSync } from 'node:fs'
import { launch } from './cdp.mjs'

export const q = (s) => JSON.stringify(s)

/**
 * 개발 전용 모의 계정([이메일, 비밀번호]). 개발 서버(`npm run dev`) 코드(src/auth/dev/devAccounts.ts) 안에만 있는 테스트 데이터이며
 * 서버에 만든 계정이 아니다(example.com 가상 주소, 실제 서비스·개인 계정에 쓰지 않는 값). 운영 빌드에서는 로그인이 항상 실패한다.
 * 운영 계정·실제 비밀번호·토큰을 여기에 쓰지 않는다.
 */
export const ACCOUNTS = {
  free: ['member.free@example.com', 'Mr-Dev-Free-2026'],
  full: ['member.full@example.com', 'Mr-Dev-Full-2026'],
}

/** 새 프로필(빈 IndexedDB)의 Chrome을 띄운다. */
export async function start(name) {
  const t = await launch(`${name}-${Date.now()}`)
  const { ev, sleep, cdp } = t
  const out = t.out
  const h = {
    ...t,
    until: async (expr, n = 80, gap = 100) => {
      for (let i = 0; i < n; i++) {
        if (await ev(expr)) return true
        await sleep(gap)
      }
      return false
    },
    setVal: (sel, v) =>
      ev(
        `(()=>{const i=document.querySelector(${q(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;i.focus();set.call(i,${q(v)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`,
      ),
    login: async (who = 'free') => {
      const [email, pw] = ACCOUNTS[who]
      await h.go('/login', 900)
      await h.until(`!!document.querySelector('input[type=email]')`, 120)
      await h.setVal('input[type=email]', email)
      await h.setVal('input[type=password]', pw)
      await ev(`document.querySelector('form').requestSubmit()`)
      await h.until(`location.pathname==='/home'`, 60)
      await sleep(300)
    },
    /** 보이는 텍스트가 re인 button·a를 클릭한다(첫 번째, 비활성 aria-disabled도 클릭은 한다). */
    // 대상이 아직 그려지지 않았을 수 있다(느린 환경·첫 로드). 나타날 때까지 최대 5초 기다린 뒤 누르고, 끝내 없으면 false를 돌려준다.
    click: async (re, scope = 'main') => {
      const expr = `(()=>{const re=new RegExp(${q(re)});const els=[...document.querySelectorAll(${q(scope)}+' button, '+${q(scope)}+' a')];const el=els.find(e=>re.test((e.innerText||'').trim()));if(!el)return false;el.click();return true})()`
      for (let i = 0; i < 50; i++) {
        if (await ev(expr)) return true
        await sleep(100)
      }
      return false
    },
    has: (re, scope = 'main') =>
      ev(
        `new RegExp(${q(re)},'m').test((document.querySelector(${q(scope)})||document.body).innerText)`,
      ),
    text: (scope = 'main') =>
      ev(`(document.querySelector(${q(scope)})||document.body).innerText`),
    path: () => ev(`location.pathname+location.search`),
    shot: async (file) => {
      const r = await cdp('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      })
      writeFileSync(`${out}/${file}`, Buffer.from(r.data, 'base64'))
    },
    press: async (k, code, vk) => {
      await cdp('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
      })
      if (k === 'Enter')
        await cdp('Input.dispatchKeyEvent', {
          type: 'char',
          text: '\r',
          key: k,
          code,
          windowsVirtualKeyCode: vk,
        })
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: k,
        code,
        windowsVirtualKeyCode: vk,
      })
      await sleep(150)
    },
    /** 앱과 같은 저장소 코드로 오늘의 운동 목록을 저장한다(W02·W11 UI를 거치지 않는 시드). */
    seedList: (userId, kind = 'mixed', reqId = 'seed-1') =>
      ev(`(async()=>{
        const src = await import('/src/exercise/workoutSource.ts');
        const repo = src.createWorkoutListRepository(${q(userId)});
        const items = [
          {itemId:'i1',exerciseId:'e-push',name:'푸시업',recordType:'reps',sets:[{reps:10},{reps:10},{reps:8}]},
          {itemId:'i2',exerciseId:'305',name:'덤벨 컬',recordType:'weight',sets:[{reps:10,weightKg:8},{reps:12,weightKg:8}]},
          ${kind === 'mixed' ? "{itemId:'i3',exerciseId:'e-plank',name:'플랭크',recordType:'time',sets:[{targetSeconds:60}]}" : ''}
        ];
        const r = await repo.saveFromDraft({requestId:${q(reqId)}, draft:{v:1,day:'today',items,updatedAt:new Date().toISOString()}, knownExerciseIds:new Set(items.map(i=>i.exerciseId))});
        return r.list.id
      })()`),
    /** 저장소를 직접 읽는다(다른 탭·확인용). */
    store: (userId, expr) =>
      ev(`(async()=>{
        const src = await import('/src/exercise/workoutSource.ts');
        const sessions = src.createWorkoutSessionRepository(${q(userId)});
        const records = src.createWorkoutRecordRepository(${q(userId)});
        const lists = src.createWorkoutListRepository(${q(userId)});
        return await (async()=>{ ${expr} })()
      })()`),
    /** IndexedDB 트랜잭션 실패 주입. kind: 'save'(진행값 저장) | 'complete'. count만큼 실패하고 해제된다. */
    arm: (kind, count = 1) =>
      ev(`(()=>{
        window.__fail = {kind:${q(kind)}, left:${count}, hits:0};
        if(!window.__patched){
          window.__patched = true;
          const orig = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function(stores, mode, opts){
            const f = window.__fail;
            const list = Array.isArray(stores)?stores:[stores];
            if (f && f.left>0 && mode==='readwrite' && list.includes('workoutSessions')) {
              const isComplete = list.includes('workoutRecords');
              if ((f.kind==='complete') === isComplete) { f.left--; f.hits++; throw new DOMException('주입한 실패','QuotaExceededError'); }
            }
            return orig.call(this, stores, mode, opts);
          };
        }
      })()`),
    hits: () => ev(`window.__fail?.hits ?? 0`),
    disarm: () => ev(`window.__fail = null`),
  }
  return h
}

/** W14까지 진행한다: 로그인 → 시드 → W01 시작 → W14. */
export async function toSession(h, who = 'free', kind = 'mixed') {
  await h.login(who)
  await h.seedList(who, kind)
  await h.go('/records/exercise', 700)
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/운동 시작/.test(b.innerText))`,
    80,
  )
  await h.click('이 목록으로 바로 운동 시작')
  await h.until(`location.pathname==='/records/exercise/session'`, 80)
  await h.until(`!!document.querySelector('#session-current-heading')`, 80)
  await h.sleep(300)
}

/**
 * W14에서 현재 세트를 목표 값으로 완료한다. 완료 버튼이 보일 때까지 기다린다.
 * 신규 완료 세트는 시간형이면 실제 측정 시간(1ms 이상)이 필수다(completedSetValidation A안, W14 안내 "타이머를 시작한 뒤 세트를 완료할 수 있어요").
 * 그래서 현재 세트가 시간형(타이머 "시작" 버튼이 있음)이면 타이머를 시작해 잠시 측정한 뒤 완료한다.
 */
export async function completeCurrent(h) {
  await h.until(
    `!![...document.querySelectorAll('main button')].find(b=>/^세트 완료$/.test(b.innerText.trim()))`,
    60,
  )
  const timed = await h.ev(
    `!![...document.querySelectorAll('main button')].find(b=>/^시작$/.test(b.innerText.trim()))`,
  )
  if (timed) {
    await h.click('^시작$')
    await h.sleep(1300)
  }
  await h.click('^세트 완료$')
  await h.sleep(350)
}
