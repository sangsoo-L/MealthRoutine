// P11 2차 비밀번호 등록 · P12 변경: 입력 규칙, 개발용 PIN 저장소 확장(changePin·공통 실패 횟수·열람 권한 무효화),
// 로그아웃·계정 전환 격리, 상태별 화면, P09 메뉴, 운영 빌드 분리를 확인한다. 실제 서버·실제 PIN은 쓰지 않는다(테스트용 번호, 메모리 저장소).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { webcrypto } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server,
  policy,
  messages,
  types,
  local,
  accountScope,
  Body,
  MenuRow,
  menu,
  dest
const T0 = Date.parse('2026-11-19T00:00:00.000Z')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  policy = await server.ssrLoadModule('/src/pin-settings/pinSettingsPolicy.ts')
  messages = await server.ssrLoadModule(
    '/src/pin-settings/pinSettingsMessages.ts',
  )
  types = await server.ssrLoadModule('/src/exercise-goal/exerciseGoalTypes.ts')
  local = await server.ssrLoadModule(
    '/src/exercise-goal/local/localExerciseGoalRepository.ts',
  )
  accountScope = await server.ssrLoadModule('/src/auth/accountScope.ts')
  Body = (
    await server.ssrLoadModule(
      '/src/components/pin-settings/PinSettingsView.tsx',
    )
  ).PinSettingsBody
  MenuRow = (
    await server.ssrLoadModule('/src/components/settings/SettingsGroup.tsx')
  ).PinMenuRowView
  menu = await server.ssrLoadModule('/src/settings/settingsMenu.ts')
  dest = await server.ssrLoadModule('/src/mypage/destinations.ts')
})
after(async () => {
  await server?.close()
})

/** 메모리 저장소와 시계. failWriteAt은 지금부터 N번째 쓰기를 실패시킨다. */
function fixture(owner = 'pin-owner') {
  const data = new Map()
  let clock = T0
  let writes = 0
  let failAt = null
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1
      if (failAt !== null && writes === failAt) throw new Error('quota')
      data.set(key, value)
    },
  }
  const make = (id) =>
    local.createLocalExerciseGoalRepository(id, {
      storage,
      crypto: webcrypto,
      now: () => clock,
    })
  return {
    owner,
    data,
    storage,
    repository: make(owner),
    make,
    advance: (ms) => {
      clock += ms
    },
    failWriteAt: (n) => {
      failAt = writes + n
    },
  }
}
const code = (expected) => (error) =>
  error instanceof types.ExerciseGoalError && error.code === expected
const pinKey = (f, id = f.owner) => local.PIN_KEY_PREFIX + id
const credential = (f, id) => JSON.parse(f.data.get(pinKey(f, id)))

// ── 입력 규칙 ────────────────────────────────────────────────────────────
test('입력은 숫자만 남기고 6자리까지만 받는다', () => {
  assert.equal(policy.sanitizePinInput('12a3-4 56789'), '123456')
  assert.equal(policy.sanitizePinInput('abc'), '')
  assert.equal(policy.sanitizePinInput('12'), '12')
})
test('등록 폼 검증: 빈 입력·숫자 아님·자릿수·확인 불일치', () => {
  const v = (next, confirm) =>
    policy.validatePinForm('register', { current: '', next, confirm })
  assert.deepEqual(v('', ''), {
    field: 'new',
    message: '새 2차 비밀번호를 입력해 주세요.',
  })
  assert.equal(v('12a456', '123456').field, 'new')
  assert.equal(v('12a456', '123456').message, '숫자만 입력해 주세요.')
  assert.equal(v('12345', '12345').message, '숫자 6자리로 입력해 주세요.')
  assert.equal(v('1234567', '1234567').message, '숫자 6자리로 입력해 주세요.')
  assert.equal(v('123456', '').field, 'confirm')
  assert.deepEqual(v('123456', '654321'), {
    field: 'confirm',
    message: '새 비밀번호 확인이 일치하지 않아요.',
  })
  assert.equal(v('123456', '123456'), null)
})
test('변경 폼 검증: 현재 번호 먼저, 현재와 같은 새 번호 거부', () => {
  const v = (current, next, confirm) =>
    policy.validatePinForm('change', { current, next, confirm })
  assert.equal(v('', '123456', '123456').field, 'current')
  assert.equal(v('12', '123456', '123456').field, 'current')
  assert.equal(v('111111', '', '').field, 'new')
  assert.deepEqual(v('111111', '111111', '111111'), {
    field: 'new',
    message: '현재와 다른 새 비밀번호를 입력해 주세요.',
  })
  assert.equal(v('111111', '222222', '222222'), null)
})
test('P11·P12 경로와 화면 ID 연결 값이 승인된 URL과 같다', () => {
  assert.equal(policy.PIN_PATHS.register, '/settings/pin/register')
  assert.equal(policy.PIN_PATHS.change, '/settings/pin/change')
})

// ── 저장소: 등록 상태·P11 ────────────────────────────────────────────────
test('등록 여부를 구분하고 이미 등록되면 다시 등록할 수 없으며 미등록은 변경할 수 없다', async () => {
  const f = fixture('state-owner')
  assert.deepEqual(await f.repository.getPinStatus(), {
    configured: false,
    retryAt: null,
  })
  await assert.rejects(
    f.repository.changePin('123456', '654321', '654321'),
    code('pinMissing'),
  )
  await f.repository.registerPin('123456', '123456')
  assert.equal((await f.repository.getPinStatus()).configured, true)
  await assert.rejects(
    f.repository.registerPin('654321', '654321'),
    code('pinExists'),
  )
})

// ── 저장소: P12 변경 ─────────────────────────────────────────────────────
test('P12 변경: 현재 번호 확인 뒤 변경되고 이전 번호는 쓸 수 없으며 원문은 저장되지 않는다', async () => {
  const f = fixture('change-owner')
  await f.repository.registerPin('123456', '123456')
  const before = credential(f)
  await f.repository.changePin('123456', '654321', '654321')
  const after = credential(f)
  assert.notEqual(after.hash, before.hash)
  assert.notEqual(after.salt, before.salt)
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort())
  assert.doesNotMatch(f.data.get(pinKey(f)), /123456|654321/)
  await assert.rejects(f.repository.unlock('123456'), code('pinWrong'))
  assert.ok((await f.repository.unlock('654321')).token)
})
test('P12 입력 오류(형식·확인 불일치·같은 번호)는 현재 번호 실패 횟수에 넣지 않는다', async () => {
  const f = fixture('no-count')
  await f.repository.registerPin('123456', '123456')
  await assert.rejects(
    f.repository.changePin('12', '654321', '654321'),
    code('pinFormat'),
  )
  await assert.rejects(
    f.repository.changePin('123456', 'abcdef', 'abcdef'),
    code('pinFormat'),
  )
  await assert.rejects(
    f.repository.changePin('123456', '654321', '000000'),
    code('pinMismatch'),
  )
  await assert.rejects(
    f.repository.changePin('123456', '123456', '123456'),
    code('pinSame'),
  )
  assert.equal(credential(f).failures, 0)
  // 위 오류가 횟수에 들어갔다면 아래 네 번째 오답이 잠금을 만든다.
  for (let i = 0; i < 4; i++)
    await assert.rejects(
      f.repository.changePin('000000', '654321', '654321'),
      code('pinWrong'),
    )
  assert.equal(credential(f).failures, 4)
})
test('현재 번호 오류는 남은 횟수를 알리고 5회째에 5분 잠금이 되며 잠금 중에는 요청이 막힌다', async () => {
  const f = fixture('lock-owner')
  await f.repository.registerPin('123456', '123456')
  for (const remaining of [4, 3, 2, 1]) {
    await assert.rejects(
      f.repository.changePin('000000', '654321', '654321'),
      (error) =>
        error.code === 'pinWrong' &&
        error.remaining === remaining &&
        error.retryAt === undefined,
    )
  }
  await assert.rejects(
    f.repository.changePin('000000', '654321', '654321'),
    (error) =>
      error.code === 'locked' &&
      error.remaining === 0 &&
      error.retryAt === T0 + local.PIN_LOCK_MS,
  )
  // 잠금 중에는 맞는 번호도 막힌다(P12와 W01-1·D01-4 모두).
  await assert.rejects(
    f.repository.changePin('123456', '654321', '654321'),
    code('locked'),
  )
  await assert.rejects(f.repository.unlock('123456'), code('locked'))
  assert.equal(
    (await f.repository.getPinStatus()).retryAt,
    T0 + local.PIN_LOCK_MS,
  )
  // 잠금 만료 뒤 재시도할 수 있고 성공하면 횟수가 초기화된다.
  f.advance(local.PIN_LOCK_MS + 1)
  assert.equal((await f.repository.getPinStatus()).retryAt, null)
  await f.repository.changePin('123456', '654321', '654321')
  assert.equal(credential(f).failures, 0)
  assert.equal(credential(f).retryAt, 0)
})
test('P12와 목표 화면의 PIN 확인은 같은 계정 실패 횟수를 공유한다', async () => {
  const f = fixture('shared-count')
  await f.repository.registerPin('123456', '123456')
  // P12에서 2번, 목표 화면(unlock)에서 2번 → 다음 실패가 5번째가 된다.
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      f.repository.changePin('000000', '654321', '654321'),
      code('pinWrong'),
    )
  for (let i = 0; i < 2; i++)
    await assert.rejects(f.repository.unlock('000000'), code('pinWrong'))
  await assert.rejects(f.repository.unlock('000000'), (error) => {
    return error.code === 'locked' && error.retryAt > T0
  })
  // 새 저장소 인스턴스(다른 화면·새로고침)에서도 P12가 같은 잠금을 본다.
  await assert.rejects(
    f.make(f.owner).changePin('123456', '654321', '654321'),
    code('locked'),
  )
  // 반대 방향: unlock이 올린 횟수를 P12가 이어받는다.
  const g = fixture('shared-count-2')
  await g.repository.registerPin('123456', '123456')
  for (let i = 0; i < 3; i++)
    await assert.rejects(g.repository.unlock('000000'), code('pinWrong'))
  await assert.rejects(
    g.repository.changePin('000000', '654321', '654321'),
    (error) => error.code === 'pinWrong' && error.remaining === 1,
  )
})
test('이미 잠긴 계정은 PIN 변경으로 잠금을 우회할 수 없다', async () => {
  const f = fixture('no-bypass')
  await f.repository.registerPin('123456', '123456')
  for (let i = 0; i < 5; i++)
    await assert.rejects(f.repository.unlock('000000'), (e) =>
      ['pinWrong', 'locked'].includes(e.code),
    )
  const locked = credential(f)
  assert.ok(locked.retryAt > T0)
  await assert.rejects(
    f.repository.changePin('123456', '654321', '654321'),
    code('locked'),
  )
  // 잠금 상태와 기존 PIN이 그대로다.
  assert.deepEqual(credential(f), locked)
  await assert.rejects(f.repository.unlock('654321'), code('locked'))
})
test('변경 중 저장이 실패하면 기존 PIN이 그대로이고 새 PIN은 쓸 수 없다', async () => {
  const f = fixture('save-fail')
  await f.repository.registerPin('123456', '123456')
  // changePin의 쓰기는 ① 현재 번호 확인 후 횟수 초기화 ② 새 자격 저장이다. 두 번째 쓰기를 실패시킨다.
  f.failWriteAt(2)
  await assert.rejects(
    f.repository.changePin('123456', '654321', '654321'),
    code('save'),
  )
  assert.ok((await f.repository.unlock('123456')).token)
  await assert.rejects(f.repository.unlock('654321'), code('pinWrong'))
})
test('검증과 변경 사이에 PIN이 바뀌면 덮어쓰지 않는다', async () => {
  const f = fixture('race')
  await f.repository.registerPin('123456', '123456')
  const other = f.make(f.owner)
  const pending = f.repository.changePin('123456', '654321', '654321')
  // 첫 변경이 해시를 계산하는 동안 다른 인스턴스가 먼저 PIN을 바꾼다.
  await other.changePin('123456', '111222', '111222').catch(() => {})
  const outcome = await pending.then(
    () => 'ok',
    (error) => error.code,
  )
  const winner =
    (await f.repository.unlock('654321').then(
      () => '654321',
      () => null,
    )) ??
    (await f
      .make(f.owner)
      .unlock('111222')
      .then(
        () => '111222',
        () => null,
      ))
  // 둘 중 하나만 반영되고, 졌다면 contextChanged로 알린다. 두 번호가 동시에 유효하지 않다.
  assert.ok(winner === '654321' || winner === '111222')
  if (outcome !== 'ok') assert.equal(outcome, 'contextChanged')
})

// ── 열람 권한·로그아웃·계정 전환 ─────────────────────────────────────────
test('PIN 변경 성공 시 이미 발급된 열람 권한이 즉시 무효가 되고 새 PIN으로 다시 확인할 수 있다', async () => {
  const f = fixture('grant-revoke')
  await f.repository.registerPin('123456', '123456')
  const access = await f.repository.unlock('123456')
  assert.equal(await f.repository.getProfile(access), null) // 권한이 유효하다
  await f.repository.changePin('123456', '654321', '654321')
  await assert.rejects(f.repository.getProfile(access), code('expired'))
  await assert.rejects(f.repository.getGoal(access), code('expired'))
  await assert.rejects(f.repository.unlock('123456'), code('pinWrong'))
  const next = await f.repository.unlock('654321')
  assert.equal(await f.repository.getProfile(next), null)
})
test('변경 실패(현재 번호 오류)는 열람 권한을 건드리지 않는다', async () => {
  const f = fixture('grant-keep')
  await f.repository.registerPin('123456', '123456')
  const access = await f.repository.unlock('123456')
  await assert.rejects(
    f.repository.changePin('000000', '654321', '654321'),
    code('pinWrong'),
  )
  assert.equal(await f.repository.getProfile(access), null)
})
test('PIN 변경은 다른 계정의 PIN·권한에 영향이 없다', async () => {
  const f = fixture('owner-a')
  await f.repository.registerPin('123456', '123456')
  const other = f.make('owner-b')
  await other.registerPin('222222', '222222')
  const accessB = await other.unlock('222222')
  const accessA = await f.repository.unlock('123456')
  await f.repository.changePin('123456', '654321', '654321')
  assert.equal(await other.getProfile(accessB), null)
  assert.ok((await other.unlock('222222')).token)
  // 한 계정의 권한으로 다른 계정을 읽을 수 없다.
  await assert.rejects(other.getProfile(accessA), code('expired'))
  assert.equal(credential(f, 'owner-b').ownerId, 'owner-b')
  assert.equal((await f.make('owner-c').getPinStatus()).configured, false)
})
test('로그아웃·로그인의 계정 정리가 개발용 열람 권한을 지우지만 등록된 PIN은 지우지 않는다', async () => {
  const f = fixture('logout-owner')
  await f.repository.registerPin('123456', '123456')
  const access = await f.repository.unlock('123456')
  assert.equal(await f.repository.getProfile(access), null)
  accountScope.clearAccountScopedData()
  await assert.rejects(f.repository.getProfile(access), code('expired'))
  assert.equal((await f.repository.getPinStatus()).configured, true)
  assert.ok(f.data.has(pinKey(f)))
  assert.ok((await f.repository.unlock('123456')).token)
})
test('등록된 정리 함수 하나가 던져도 다른 정리는 계속된다', () => {
  let ran = false
  accountScope.registerAccountCleanup(() => {
    throw new Error('boom')
  })
  accountScope.registerAccountCleanup(() => {
    ran = true
  })
  accountScope.clearAccountScopedData()
  assert.equal(ran, true)
})
test('기존 형식으로 저장된 PIN(실패 횟수 포함)이 P12와 호환된다', async () => {
  const f = fixture('compat')
  await f.repository.registerPin('123456', '123456')
  // 목표 화면에서 3번 틀린 상태(기존 저장 형식 그대로)를 만든다.
  for (let i = 0; i < 3; i++)
    await assert.rejects(f.repository.unlock('000000'), code('pinWrong'))
  const stored = credential(f)
  assert.equal(stored.v, 1)
  assert.equal(stored.failures, 3)
  await assert.rejects(
    f.repository.changePin('000000', '654321', '654321'),
    (e) => e.code === 'pinWrong' && e.remaining === 1,
  )
  await f.repository.changePin('123456', '654321', '654321')
  const next = credential(f)
  assert.deepEqual(Object.keys(next).sort(), Object.keys(stored).sort())
  assert.equal(next.ownerId, f.owner)
})

// ── 메시지 ───────────────────────────────────────────────────────────────
test('오류 문구는 남은 횟수를 (n/5)로 알리고 입력한 번호를 담지 않는다', () => {
  const E = types.ExerciseGoalError
  assert.equal(
    messages.pinSettingsMessage(new E('pinWrong', undefined, 4)),
    '현재 2차 비밀번호가 일치하지 않아요. (1/5)',
  )
  assert.equal(
    messages.pinSettingsMessage(new E('pinWrong', undefined, 1)),
    '현재 2차 비밀번호가 일치하지 않아요. (4/5)',
  )
  assert.equal(
    messages.pinSettingsMessage(new E('pinWrong')),
    '현재 2차 비밀번호가 일치하지 않아요.',
  )
  assert.equal(
    messages.pinSettingsMessage(new E('locked', T0, 0)),
    messages.PIN_LOCKED_MESSAGE,
  )
  assert.match(
    messages.pinSettingsMessage(new E('save')),
    /기존 2차 비밀번호는 바뀌지 않았어요/,
  )
  assert.equal(messages.pinErrorField(new E('pinWrong')), 'current')
  assert.equal(messages.pinErrorField(new E('locked')), 'current')
  assert.equal(messages.pinErrorField(new E('pinMismatch')), 'confirm')
  assert.equal(messages.pinErrorField(new E('pinSame')), 'new')
  assert.doesNotMatch(
    messages.pinSettingsMessage(new E('pinFormat')),
    /\d{6}(?!자리)/,
  )
})
test('기존 목표 화면의 PIN 오류 문구는 그대로다', async () => {
  const goalMessages = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalMessages.ts',
  )
  const E = types.ExerciseGoalError
  assert.equal(
    goalMessages.exerciseGoalMessage(new E('pinWrong', undefined, 3)),
    '비밀번호가 일치하지 않아요. 5회 틀리면 5분 동안 확인할 수 없어요.',
  )
  assert.equal(
    goalMessages.exerciseGoalMessage(new E('locked', T0)),
    '비밀번호 확인이 5분 동안 제한돼요. 잠시 후 다시 시도해 주세요.',
  )
})

// ── 화면 ─────────────────────────────────────────────────────────────────
const noop = async () => null
function render(props) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Body, {
        done: false,
        locked: false,
        submit: noop,
        reload: () => {},
        ...props,
      }),
    ),
  )
}
const ready = (configured, retryAt = null) => ({
  kind: 'ready',
  configured,
  retryAt,
})
const submitButton = (html) => html.match(/<button type="submit"([^>]*)>/)?.[1]
// 속성 disabled=""만 본다(클래스의 disabled: 변형과 구분).
const isDisabled = (attributes) => /(^|\s)disabled=""/.test(attributes)
const countOf = (html, pattern) => (html.match(pattern) ?? []).length

test('P11 등록 폼: 새 번호·확인 두 칸, 마스킹·숫자 키패드·보기 토글·저장·취소', () => {
  const html = render({ mode: 'register', status: ready(false) })
  assert.match(html, /<h1[^>]*>2차 비밀번호 등록<\/h1>/)
  assert.equal(countOf(html, /type="password"/g), 2)
  assert.equal(countOf(html, /inputMode="numeric"/g), 2)
  assert.equal(countOf(html, /autoComplete="off"/g), 2)
  assert.equal(countOf(html, /aria-pressed="false"/g), 2)
  assert.match(html, /aria-label="새 2차 비밀번호 보기"/)
  assert.match(html, /aria-label="새 2차 비밀번호 확인 보기"/)
  assert.doesNotMatch(html, /현재 2차 비밀번호/)
  assert.match(html, /2차 비밀번호 등록<\/button>/)
  assert.equal(isDisabled(submitButton(html)), false)
  assert.match(html, /href="\/settings"[^>]*>취소</)
  assert.match(html, /이럴 때 사용해요/)
  assert.doesNotMatch(html, /재설정 기능은 준비 중/)
})
test('P12 변경 폼: 현재·새·확인 세 칸과 분실 준비 중 안내(링크 없음)', () => {
  const html = render({ mode: 'change', status: ready(true) })
  assert.match(html, /<h1[^>]*>2차 비밀번호 변경<\/h1>/)
  assert.equal(countOf(html, /type="password"/g), 3)
  assert.match(html, /현재 2차 비밀번호/)
  assert.match(html, /변경 내용 저장<\/button>/)
  assert.equal(isDisabled(submitButton(html)), false)
  assert.match(
    html,
    /2차 비밀번호를 잊으셨나요\? 재설정 기능은 준비 중이에요\./,
  )
  // S02 등 문의 화면으로 가는 링크를 만들지 않는다.
  assert.doesNotMatch(html, /href="\/support|S02|문의하기/)
})
test('이미 등록된 회원이 P11에 오면 폼 대신 P12 이동 안내를 본다', () => {
  const html = render({ mode: 'register', status: ready(true) })
  assert.match(html, /이미 등록되어 있어요/)
  assert.match(html, /href="\/settings\/pin\/change"/)
  assert.doesNotMatch(html, /<form/)
})
test('미등록 회원이 P12에 오면 등록 링크가 있고 폼은 비활성이다', () => {
  const html = render({ mode: 'change', status: ready(false) })
  assert.match(html, /먼저 2차 비밀번호를 등록해 주세요/)
  assert.match(html, /href="\/settings\/pin\/register"/)
  assert.equal(isDisabled(submitButton(html)), true)
  assert.equal(countOf(html, /type="password"[^>]*disabled/g), 3)
})
test('등록 여부를 확인하는 중·실패일 때는 폼을 열지 않는다(미등록으로 보지 않는다)', () => {
  const checking = render({ mode: 'register', status: { kind: 'checking' } })
  assert.match(checking, /등록 여부를 확인하고 있어요/)
  assert.doesNotMatch(checking, /<form|type="password"/)
  const failed = render({ mode: 'register', status: { kind: 'error' } })
  assert.match(failed, /확인하지 못했어요/)
  assert.match(failed, /다시 확인하기/)
  assert.doesNotMatch(failed, /<form|type="password"/)
})
test('연결 전(운영 빌드): 안내만 보이고 등록·변경 버튼과 입력은 비활성이며 완료 화면이 없다', () => {
  for (const mode of ['register', 'change']) {
    const html = render({ mode, status: { kind: 'unavailable' } })
    assert.match(html, /서비스 연결이 준비되면 이용할 수 있어요/)
    assert.equal(isDisabled(submitButton(html)), true)
    assert.ok(countOf(html, /type="password"[^>]*disabled/g) >= 2)
    assert.doesNotMatch(html, /data-pin-done|했어요<\/h1>/)
  }
})
test('현재 번호 확인이 잠기면 저장 버튼이 비활성이고 잠금 안내가 보인다(변경만)', () => {
  const html = render({
    mode: 'change',
    status: ready(true, T0 + local.PIN_LOCK_MS),
    locked: true,
  })
  assert.equal(isDisabled(submitButton(html)), true)
  assert.match(html, /role="alert"[^>]*>[^<]*5회 일치하지 않아/)
  assert.match(html, /aria-invalid="true"/)
})
test('완료 화면은 done일 때만 나오고 P09·P01 이동과 가림 유지 안내를 담는다', () => {
  const reg = render({ mode: 'register', status: ready(false), done: true })
  assert.match(reg, /data-pin-done="register"/)
  assert.match(reg, /2차 비밀번호를 등록했어요/)
  assert.match(reg, /키·몸무게·BMI는 계속 가려져 있어요/)
  assert.match(reg, /href="\/settings"[^>]*>상세 설정으로/)
  assert.match(reg, /href="\/mypage"[^>]*>마이페이지로/)
  const chg = render({ mode: 'change', status: ready(true), done: true })
  assert.match(chg, /2차 비밀번호를 변경했어요/)
  assert.equal(countOf(reg, /<h1/g), 1)
  assert.doesNotMatch(reg, /<form/)
})

// ── P09 메뉴 ─────────────────────────────────────────────────────────────
test('P09 2차 비밀번호 행: 등록 여부로 이동하고 확인 전에는 이동하지 않는다', () => {
  const row = (status) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(MenuRow, {
          label: '2차 비밀번호',
          status,
          reload: () => {},
        }),
      ),
    )
  const unregistered = row(ready(false))
  assert.match(unregistered, /href="\/settings\/pin\/register"/)
  assert.match(unregistered, />미등록</)
  const registered = row(ready(true))
  assert.match(registered, /href="\/settings\/pin\/change"/)
  assert.match(registered, />등록됨</)
  for (const [status, text] of [
    [{ kind: 'checking' }, '확인 중'],
    [{ kind: 'unavailable' }, '연결 전'],
  ]) {
    const html = row(status)
    assert.match(html, new RegExp(`>${text}<`))
    assert.doesNotMatch(html, /href=|<a |<button/)
  }
  const failed = row({ kind: 'error' })
  assert.match(failed, /<button/)
  assert.match(failed, /다시 확인/)
  assert.doesNotMatch(failed, /href=/)
})
test('P09 메뉴 정의: 이름은 그대로, 새 카테고리 없음, P01에는 직접 링크가 없다', () => {
  const account = menu.SETTINGS_MENU_GROUPS.find((g) => g.id === 'account')
  const item = account.items.find((i) => i.screenId === 'P11·P12')
  assert.equal(item.label, '2차 비밀번호')
  assert.equal(item.dynamic, 'pin')
  assert.deepEqual(
    menu.SETTINGS_MENU_GROUPS.map((g) => g.id),
    ['activity', 'account', 'membership', 'support'],
  )
  // P01의 신체 정보 열람 진입점은 P05 확인 화면(사용자 승인 경로)으로 연결됐다(이전에는 화면이 없어 null). P11·P12로 직접 가지 않는 규칙은 그대로다.
  assert.equal(dest.MY_DESTINATIONS.bodyUnlock.to, '/mypage/body/unlock')
  assert.ok(
    Object.values(dest.MY_DESTINATIONS).every(
      (d) => !String(d.to ?? '').includes('/settings/pin'),
    ),
  )
})

// ── 운영 빌드 분리 ───────────────────────────────────────────────────────
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : []
  })
}
test('개발용 PIN 저장소 모듈은 DEV 분기의 exerciseGoalSource만 불러온다', () => {
  const root = join(process.cwd(), 'src')
  const importers = sourceFiles(root).filter((file) =>
    /local\/localExerciseGoalRepository/.test(readFileSync(file, 'utf8')),
  )
  const names = importers.map((file) =>
    relative(root, file).replaceAll('\\', '/'),
  )
  assert.deepEqual(names, ['exercise-goal/exerciseGoalSource.ts'])
  const source = readFileSync(
    join(root, 'exercise-goal/exerciseGoalSource.ts'),
    'utf8',
  )
  assert.match(
    source,
    /import\.meta\.env\.DEV\s*\?\s*await import\('\.\/local\/localExerciseGoalRepository\.ts'\)/,
  )
})
test('운영 환경(NODE_ENV=production)에서는 개발용 PIN 저장소가 만들어지지 않고 연결 전 화면이 된다', () => {
  const script = `
    import { createServer } from 'vite'
    const server = await createServer({
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    })
    const source = await server.ssrLoadModule('/src/exercise-goal/exerciseGoalSource.ts')
    await server.ssrLoadModule('/src/pin-settings/usePinStatus.ts')
    await server.ssrLoadModule('/src/pin-settings/usePinSettings.ts')
    // 정적 분석으로 모듈 그래프에 이름이 올라가도, 실제로 실행(평가)되지 않았으면 ssrModule이 비어 있다.
    const local = server.moduleGraph.urlToModuleMap.get('/src/exercise-goal/local/localExerciseGoalRepository.ts')
    console.log(JSON.stringify({
      repository: source.createExerciseGoalRepository('prod-user'),
      localLoaded: Boolean(local?.ssrModule),
      env: process.env.NODE_ENV,
    }))
    await server.close()
  `
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    },
  )
  const result = JSON.parse(out.trim().split('\n').at(-1))
  assert.equal(result.env, 'production')
  assert.equal(result.repository, null)
  assert.equal(result.localLoaded, false)
})
