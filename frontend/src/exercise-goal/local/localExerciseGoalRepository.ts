import { registerAccountCleanup } from '../../auth/accountScope.ts'
import {
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  isValidMeasurement,
} from '../../body-measurements/bodyValidation.ts'
import { mockKey } from '../../dev-mock/devMockStorage.ts'
import { loadExerciseGoalContext } from '../exerciseGoalContext.ts'
import {
  calculateExerciseGoal,
  parseExerciseGoal,
  sameGoalContext,
  isStoredGoalProfile,
  validGoalProfile,
} from '../exerciseGoalPolicy.ts'
import {
  ExerciseGoalError,
  type ExerciseGoalContext,
  type ExerciseGoalProfile,
  type ExerciseGoalRepository,
  type GoalAuthorization,
} from '../exerciseGoalTypes.ts'

/** 개발용 로컬 보호 흐름이다. 서버 인증·접근 통제를 대체하지 않는다. */
export const PIN_KEY_PREFIX = 'mealthroutine.dev.exercise-goal.pin.'
export const GOAL_KEY_PREFIX = 'mealthroutine.dev.exercise-goal.value.'
export const ACCESS_MS = 60_000
export const PIN_LOCK_MS = 5 * 60_000
const ITERATIONS = 600_000
/**
 * 열람 권한. `credential`은 발급 당시 PIN 자격의 식별 값(솔트+해시)이다. 확인 때마다 지금 저장된 자격과 비교해
 * 다른 탭에서 PIN이 바뀐 권한도 무효로 만든다(권한 Map은 탭마다 따로라 `revokeOwnerGrants`가 닿지 않는다). 화면·로그에는 내보내지 않는다.
 */
const grants = new Map<
  string,
  { ownerId: string; expiresAt: number; credential: string }
>()

/**
 * 개발용 열람 권한을 모두 지운다. 로그인·로그아웃(계정 전환) 때 `clearAccountScopedData`가 호출한다.
 * 저장된 PIN 자격(해시·실패 횟수)은 지우지 않는다. 권한 토큰은 메모리에만 있다.
 */
export function revokeAllLocalGoalAccess(): void {
  grants.clear()
}
registerAccountCleanup(revokeAllLocalGoalAccess)

/** 한 계정의 열람 권한만 지운다. PIN을 바꾼 뒤 이전 권한이 남지 않게 한다. */
function revokeOwnerGrants(ownerId: string): void {
  for (const [token, grant] of grants) {
    if (grant.ownerId === ownerId) grants.delete(token)
  }
}

interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
interface PinCredential {
  v: 1
  ownerId: string
  salt: string
  hash: string
  failures: number
  retryAt: number
}
export interface LocalGoalOptions {
  storage?: LocalStorageLike
  crypto?: Crypto
  now?: () => number
  loadContext?: () => Promise<ExerciseGoalContext | null>
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const unhex = (value: string) =>
  Uint8Array.from(value.match(/.{2}/g) ?? [], (part) =>
    Number.parseInt(part, 16),
  )

export function createLocalExerciseGoalRepository(
  ownerId: string,
  options: LocalGoalOptions = {},
): ExerciseGoalRepository {
  if (!ownerId || ownerId.length > 200)
    throw new ExerciseGoalError('validation')
  const now = options.now ?? Date.now
  const getCrypto = () => {
    const c = options.crypto ?? globalThis.crypto
    if (!c?.subtle || !c.getRandomValues)
      throw new ExerciseGoalError('unavailable')
    return c
  }
  const getStorage = () => options.storage ?? window.localStorage
  function read(key: string): unknown {
    try {
      const raw = getStorage().getItem(key)
      return raw === null ? undefined : JSON.parse(raw)
    } catch (error) {
      throw new ExerciseGoalError(
        error instanceof SyntaxError ? 'corrupt' : 'load',
      )
    }
  }
  function write(key: string, value: unknown): void {
    try {
      getStorage().setItem(key, JSON.stringify(value))
    } catch {
      throw new ExerciseGoalError('save')
    }
  }
  function flag(
    name: 'failLoad' | 'failSave' | 'unavailable',
    domain = 'exerciseGoal',
  ) {
    try {
      return (getStorage().getItem(`mealthroutine.dev.mock.flag.${name}`) ?? '')
        .split(',')
        .some((value) => value.trim() === 'all' || value.trim() === domain)
    } catch {
      return false
    }
  }
  function checkRead(domain = 'exerciseGoal') {
    if (flag('unavailable', domain)) throw new ExerciseGoalError('unavailable')
    if (flag('failLoad', domain)) throw new ExerciseGoalError('load')
  }
  function checkWrite(domain = 'exerciseGoal') {
    if (flag('unavailable', domain)) throw new ExerciseGoalError('unavailable')
    if (flag('failSave', domain)) throw new ExerciseGoalError('save')
  }
  const pinKey = PIN_KEY_PREFIX + ownerId
  const goalKey = GOAL_KEY_PREFIX + ownerId
  function credential(): PinCredential | null {
    const raw = read(pinKey)
    if (raw === undefined) return null
    if (typeof raw !== 'object' || raw === null)
      throw new ExerciseGoalError('corrupt')
    const c = raw as Partial<PinCredential>
    if (
      c.v !== 1 ||
      c.ownerId !== ownerId ||
      typeof c.salt !== 'string' ||
      !/^[a-f0-9]{32}$/.test(c.salt) ||
      typeof c.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(c.hash) ||
      !Number.isInteger(c.failures) ||
      c.failures! < 0 ||
      c.failures! > 5 ||
      typeof c.retryAt !== 'number' ||
      !Number.isFinite(c.retryAt) ||
      c.retryAt < 0
    )
      throw new ExerciseGoalError('corrupt')
    return c as PinCredential
  }
  async function hashPin(pin: string, salt: string): Promise<string> {
    const c = getCrypto()
    const key = await c.subtle.importKey(
      'raw',
      new TextEncoder().encode(pin),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await c.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: unhex(salt),
        iterations: ITERATIONS,
      },
      key,
      256,
    )
    return hex(new Uint8Array(bits))
  }
  /**
   * 현재 PIN을 확인한다. 잠금 확인·실패 횟수 증가·5회 시 5분 잠금·성공 시 횟수 초기화를 한곳에서 맡아
   * unlock(W01-1·D01-4)과 changePin(P12)이 같은 계정별 횟수를 공유한다. 성공하면 초기화된 자격을 돌려준다.
   */
  async function verifyCurrentPin(pin: string): Promise<PinCredential> {
    checkRead()
    if (!/^\d{6}$/.test(pin)) throw new ExerciseGoalError('pinFormat')
    const c = credential()
    if (!c) throw new ExerciseGoalError('pinMissing')
    if (c.retryAt > now()) throw new ExerciseGoalError('locked', c.retryAt)
    const hash = await hashPin(pin, c.salt)
    const latest = credential()
    if (!latest || latest.hash !== c.hash || latest.salt !== c.salt)
      throw new ExerciseGoalError('contextChanged')
    if (latest.retryAt > now())
      throw new ExerciseGoalError('locked', latest.retryAt)
    let different = 0
    for (let i = 0; i < hash.length; i++)
      different |= hash.charCodeAt(i) ^ c.hash.charCodeAt(i)
    checkWrite()
    if (different !== 0) {
      const failures =
        (latest.retryAt > 0 && latest.retryAt <= now() ? 0 : latest.failures) +
        1
      const retryAt = failures >= 5 ? now() + PIN_LOCK_MS : 0
      write(pinKey, { ...latest, failures: Math.min(5, failures), retryAt })
      throw new ExerciseGoalError(
        retryAt ? 'locked' : 'pinWrong',
        retryAt || undefined,
        retryAt ? 0 : 5 - failures,
      )
    }
    const cleared = { ...latest, failures: 0, retryAt: 0 }
    write(pinKey, cleared)
    return cleared
  }
  function authorize(access: GoalAuthorization) {
    const grant = grants.get(access.token)
    if (!grant || grant.ownerId !== ownerId || grant.expiresAt <= now()) {
      if (grant?.ownerId === ownerId) grants.delete(access.token)
      throw new ExerciseGoalError('expired')
    }
    // 발급 뒤 PIN 자격이 바뀌었으면(다른 탭의 변경 포함) 무효다. 자격을 읽지 못해도 열어 두지 않는다(실패하면 닫는다).
    let current: PinCredential | null = null
    try {
      current = credential()
    } catch {
      current = null
    }
    if (!current || current.salt + current.hash !== grant.credential) {
      grants.delete(access.token)
      throw new ExerciseGoalError('expired')
    }
  }
  function protectedProfile(
    access: GoalAuthorization,
  ): ExerciseGoalProfile | null {
    authorize(access)
    checkRead('body')
    const raw = read(mockKey('body', ownerId))
    if (raw === undefined) return null
    if (typeof raw !== 'object' || raw === null)
      throw new ExerciseGoalError('corrupt')
    const body = raw as Record<string, unknown>
    if (body.v !== 1) throw new ExerciseGoalError('corrupt')
    const meta = body.exerciseGoalProfile
    if (!meta || typeof meta !== 'object') return null
    const p = meta as Record<string, unknown>
    if (p.ownerId !== ownerId) throw new ExerciseGoalError('corrupt')
    // 나이·성별은 이 화면이 검증해서 저장한 값이라, 형식이 어긋나면 손상이다.
    if (
      typeof p.age !== 'number' ||
      !Number.isInteger(p.age) ||
      (p.sex !== 'male' && p.sex !== 'female')
    )
      throw new ExerciseGoalError('corrupt')
    // 키·몸무게가 비었거나 신체 정보 기준으로 무효이면 손상이 아니라 "아직 입력이 필요한 상태"다(프로필 없음).
    if (
      !isValidMeasurement(body.heightCm, HEIGHT_RANGE) ||
      !isValidMeasurement(body.weightKg, WEIGHT_RANGE)
    )
      return null
    const profile = {
      age: p.age,
      sex: p.sex,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      updatedAt: body.updatedAt,
    }
    // 구조가 정상이면 목표 계산 범위 밖이어도 돌려준다. 계산 가능 여부는 호출한 쪽이 goalProfileIneligibility로 판단한다.
    if (!isStoredGoalProfile(profile)) throw new ExerciseGoalError('corrupt')
    return profile
  }
  function profilePrefill(
    access: GoalAuthorization,
  ): Partial<ExerciseGoalProfile> {
    authorize(access)
    checkRead('body')
    const raw = read(mockKey('body', ownerId))
    if (raw === undefined) return {}
    if (typeof raw !== 'object' || raw === null)
      throw new ExerciseGoalError('corrupt')
    const body = raw as Record<string, unknown>
    if (body.v !== 1) throw new ExerciseGoalError('corrupt')
    const result: Partial<ExerciseGoalProfile> = {}
    // 사전 입력값은 신체 정보로 저장된 유효한 값이면 계산 범위와 무관하게 보여 준다. 범위 밖이면 입력 화면이 범위를 안내한다.
    for (const [field, range] of [
      ['heightCm', HEIGHT_RANGE],
      ['weightKg', WEIGHT_RANGE],
    ] as const) {
      const value = body[field]
      if (isValidMeasurement(value, range)) result[field] = value
    }
    return result
  }
  function storedGoal() {
    checkRead()
    const raw = read(goalKey)
    if (raw === undefined) return null
    if (typeof raw !== 'object' || raw === null)
      throw new ExerciseGoalError('corrupt')
    const entry = raw as Record<string, unknown>
    const goal =
      entry.ownerId === ownerId ? parseExerciseGoal(entry.goal) : null
    if (!goal) throw new ExerciseGoalError('corrupt')
    return goal
  }

  return {
    kind: 'local',
    async getPinStatus() {
      checkRead()
      const c = credential()
      return {
        configured: c !== null,
        retryAt: c && c.retryAt > now() ? c.retryAt : null,
      }
    },
    async registerPin(pin, confirmation) {
      checkRead()
      checkWrite()
      if (!/^\d{6}$/.test(pin)) throw new ExerciseGoalError('pinFormat')
      if (pin !== confirmation) throw new ExerciseGoalError('pinMismatch')
      if (credential()) throw new ExerciseGoalError('pinExists')
      const salt = hex(getCrypto().getRandomValues(new Uint8Array(16)))
      const hash = await hashPin(pin, salt)
      if (credential()) throw new ExerciseGoalError('pinExists')
      checkWrite()
      write(pinKey, {
        v: 1,
        ownerId,
        salt,
        hash,
        failures: 0,
        retryAt: 0,
      } satisfies PinCredential)
    },
    async changePin(currentPin, newPin, confirmation) {
      checkRead()
      checkWrite()
      // 새 PIN의 형식·확인·동일 여부는 입력끼리의 비교라 현재 PIN 실패 횟수에 넣지 않는다.
      if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin))
        throw new ExerciseGoalError('pinFormat')
      if (newPin !== confirmation) throw new ExerciseGoalError('pinMismatch')
      if (newPin === currentPin) throw new ExerciseGoalError('pinSame')
      // 현재 PIN 확인은 unlock과 같은 계정별 실패 횟수·잠금을 쓴다(잠금 중이면 여기서 막힌다).
      const verified = await verifyCurrentPin(currentPin)
      const salt = hex(getCrypto().getRandomValues(new Uint8Array(16)))
      const hash = await hashPin(newPin, salt)
      // 해시 계산 동안 다른 곳에서 PIN이 바뀌었으면 덮어쓰지 않는다.
      const latest = credential()
      if (
        !latest ||
        latest.hash !== verified.hash ||
        latest.salt !== verified.salt
      )
        throw new ExerciseGoalError('contextChanged')
      checkWrite()
      // 단일 쓰기. 실패하면 기존 PIN이 그대로다.
      write(pinKey, {
        v: 1,
        ownerId,
        salt,
        hash,
        failures: 0,
        retryAt: 0,
      } satisfies PinCredential)
      // 이미 발급된 열람 권한(W01-1·D01-4)은 새 PIN으로 다시 확인하게 한다.
      revokeOwnerGrants(ownerId)
    },
    async unlock(pin) {
      const verified = await verifyCurrentPin(pin)
      const token = hex(getCrypto().getRandomValues(new Uint8Array(24)))
      const expiresAt = now() + ACCESS_MS
      grants.set(token, {
        ownerId,
        expiresAt,
        credential: verified.salt + verified.hash,
      })
      return { token, expiresAt }
    },
    lock(access) {
      if (grants.get(access.token)?.ownerId === ownerId)
        grants.delete(access.token)
    },
    verifyAccess(access) {
      authorize(access)
    },
    async getProfile(access) {
      return protectedProfile(access)
    },
    async getProfilePrefill(access) {
      return profilePrefill(access)
    },
    async saveProfile(access, input) {
      authorize(access)
      checkWrite('body')
      const profile = { ...input, updatedAt: new Date(now()).toISOString() }
      // 목표로 계산할 수 있는 값만 목표용 프로필로 저장한다(범위 밖 값은 입력 화면이 안내한다).
      if (!validGoalProfile(profile)) throw new ExerciseGoalError('validation')
      // 같은 객체의 다른 필드(홈 신체 정보 저장이 쓰는 값, 이후 추가될 필드)를 지우지 않도록 기존 객체를 읽어 이어받는다.
      // 읽을 수 없거나 형식이 손상된 객체 위에는 덮어쓰지 않는다.
      const key = mockKey('body', ownerId)
      const existing = read(key)
      if (
        existing !== undefined &&
        (typeof existing !== 'object' ||
          existing === null ||
          Array.isArray(existing) ||
          (existing as Record<string, unknown>).v !== 1)
      )
        throw new ExerciseGoalError('corrupt')
      write(key, {
        ...(existing as Record<string, unknown> | undefined),
        v: 1,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        updatedAt: profile.updatedAt,
        exerciseGoalProfile: { ownerId, age: profile.age, sex: profile.sex },
      })
      return profile
    },
    async getGoal(access) {
      authorize(access)
      return storedGoal()
    },
    async saveGoal(access, draft, expectedContext, expectedProfile) {
      authorize(access)
      const context = await (options.loadContext
        ? options.loadContext()
        : loadExerciseGoalContext(ownerId))
      authorize(access)
      const profile = protectedProfile(access)
      if (!context || !profile) throw new ExerciseGoalError('validation')
      if (
        !sameGoalContext(context, expectedContext) ||
        profile.updatedAt !== expectedProfile.updatedAt ||
        profile.age !== expectedProfile.age ||
        profile.sex !== expectedProfile.sex ||
        profile.heightCm !== expectedProfile.heightCm ||
        profile.weightKg !== expectedProfile.weightKg
      )
        throw new ExerciseGoalError('contextChanged')
      const result = calculateExerciseGoal(
        draft,
        context,
        profile,
        new Date(now()),
      )
      if (!result.ok) throw new ExerciseGoalError('validation')
      // 손상된 기존 목표는 숨겨진 채 덮어쓰지 않는다. 모든 검증 뒤 단일 쓰기로 교체한다.
      storedGoal()
      checkWrite()
      write(goalKey, { ownerId, goal: result.goal })
      return result.goal
    },
    async getSummary() {
      const goal = storedGoal()
      return goal
        ? {
            daysPerWeek: goal.daysPerWeek,
            minutesPerSession: goal.minutesPerSession,
            mode: goal.mode,
            updatedAt: goal.updatedAt,
          }
        : null
    },
  }
}
