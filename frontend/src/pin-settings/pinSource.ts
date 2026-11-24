import {
  ApiError,
  apiRequest,
  INVALID_RESPONSE,
  type ApiRequestOptions,
  type HttpMethod,
} from '../api/http.ts'
import type { AccountWorkGuard } from '../auth/authContext.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import {
  ExerciseGoalError,
  type ExerciseGoalRepository,
} from '../exercise-goal/exerciseGoalTypes.ts'
import type { PinFormValues, PinSettingsMode } from './pinSettingsPolicy.ts'
import {
  clearPinToken,
  currentPinEpoch,
  storePinToken,
} from './pinTokenStore.ts'

/**
 * 2차 비밀번호(PIN) 연결(F4). 화면 훅(usePinStatus·usePinSettings·usePinVerify)은 이 파일의 `PinSource`만 쓴다.
 *
 * 서버 계약(머지된 회원 단위 7, FE-CONTRACT-1로 바꾸지 않음). 모두 로그인 필요:
 * - `GET /users/me/pin/status` 200 `{registered, locked, lockedUntil}`
 * - `PUT /users/me/pin` `{newPin}` 200 `{pinToken, expiresIn}` — 토큰은 보관하지 않는다(F4-D5)
 * - `POST /users/me/pin/verify` `{pin}` 200 `{pinToken, expiresIn}` — 토큰은 pinTokenStore에만(계획 3.4)
 * - `PATCH /users/me/pin` `{newPin, currentPin}` 204 — `currentPassword` 복구는 F4 범위 밖(F4-D3)
 *
 * 실제/모의 모드(F1-D3과 같은 기준): 개발 서버 + `VITE_DEV_AUTH=true`(모의 로그인)이면 기존 개발용 PIN 저장소
 * (`createExerciseGoalRepository`, 5분 잠금)를 그대로 감싼다. 그 밖(개발 기본·운영 빌드)은 서버 연결이다.
 * **서버 실패 때 모의 저장소로 넘어가지 않는다.** 서버 구현은 어떤 경우에도 로컬 저장소를 부르지 않는다.
 *
 * 잠금 해제 시각(F4-D4, Q4 B′): 서버 `lockedUntil`은 시간대 없는 서버 현지 시각이라 브라우저에서 해석하지 않는다.
 * 서버 모드의 `retryAt`은 항상 null이고 `locked`만 쓴다. 잠금 판정은 서버(403)가 한다.
 */

/** 모의 로그인 모드(F1-D3). 다른 파일 상수를 가져오지 않고 식을 직접 쓴다(운영 빌드에서 DEV가 false 상수가 된다). */
const MOCK_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'

/** 서버 토큰의 최대 유효 시간(초, PIN7-6)과 브라우저 쪽 여유(초). 클라이언트 만료가 서버 만료보다 늦어지지 않게 한다. */
const PIN_TOKEN_MAX_SECONDS = 600
const PIN_TOKEN_MARGIN_SECONDS = 5

/** 등록 여부. `locked`는 서버 모드에서만 의미가 있다(모의 모드는 `retryAt`과 화면 타이머를 쓴다). */
export interface PinStatusValue {
  configured: boolean
  locked: boolean
  retryAt: number | null
}

/**
 * 기존 `ExerciseGoalError` 코드에 없는 서버 모드 전용 실패. 운동 목표 타입은 넓히지 않는다(계획 3.2).
 * - connection: 조회·확인이 서버에 닿지 않았거나 응답을 해석할 수 없음(상태를 바꾸지 않는 요청이라 다시 시도해도 안전)
 * - uncertainRegister / uncertainChange: 등록·변경 요청의 결과를 알 수 없음(서버가 이미 저장했을 수 있다, R4). 자동 재전송하지 않는다
 * - rateLimited: 회원당 1분 5회 제한(429). `retryAfter`는 `Retry-After` 초(없으면 undefined)
 */
export type PinConnectErrorCode =
  'connection' | 'uncertainRegister' | 'uncertainChange' | 'rateLimited'

export class PinConnectError extends Error {
  readonly code: PinConnectErrorCode
  readonly retryAfter?: number
  constructor(code: PinConnectErrorCode, retryAfter?: number) {
    super(`pin connect ${code}`)
    this.name = 'PinConnectError'
    this.code = code
    this.retryAfter = retryAfter
  }
}

/** PIN 확인 결과. 토큰 값은 돌려주지 않는다(F5는 `getPinToken`으로만 읽는다). */
export type PinVerifyOutcome =
  { ok: true } | { ok: false; reason: 'stale' | 'expired' }

export interface PinSource {
  readonly mode: 'mock' | 'server'
  getStatus(signal?: AbortSignal): Promise<PinStatusValue>
  /** 확인칸 비교는 화면이 먼저 한다. 서버에는 새 번호만 보낸다(모의 저장소는 확인값도 받는다). */
  register(newPin: string, confirmation: string): Promise<void>
  change(
    currentPin: string,
    newPin: string,
    confirmation: string,
  ): Promise<void>
  /** 서버 모드만 있다. F4에서는 화면이 쓰지 않는다(F4-D1, F5가 연결). */
  verify?(
    pin: string,
    guard: AccountWorkGuard | null,
    signal?: AbortSignal,
  ): Promise<PinVerifyOutcome>
  /** 모의 모드 P05 전용: 기존 열람 권한 경로(unlock·verifyAccess·lock). 서버 모드에는 없다(서버 토큰과 섞지 않는다). */
  readonly mockGoal?: ExerciseGoalRepository
}

type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 서버에 닿지 않았거나(네트워크), 서버가 처리 중 실패했거나(5xx), 응답을 해석할 수 없음 → 결과 미확인 계열 */
function isUnknownOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return (
    error.status === 0 ||
    error.status >= 500 ||
    error.errorCode === INVALID_RESPONSE
  )
}

/** `PIN_INVALID`의 `data.remainingAttempts`. 0 이상 정수가 아니면 남은 횟수 없이 다룬다. */
function remainingAttempts(data: unknown): number | undefined {
  const value = record(data)?.remainingAttempts
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined
}

/**
 * 서버 업무 오류 → 화면 오류(계획 3.3). `errorCode`로 구분한다(403이 셋). 알 수 없는 업무 오류는 그대로 던진다
 * (문구 함수가 일반 실패 문구를 쓴다). 결과 미확인 계열은 호출하는 쪽이 따로 판단한다.
 */
function mapBusinessError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error
  switch (error.errorCode) {
    case 'PIN_INVALID':
      return new ExerciseGoalError(
        'pinWrong',
        undefined,
        remainingAttempts(error.data),
      )
    case 'PIN_LOCKED':
      // 해제 시각은 해석하지 않는다(F4-D4).
      return new ExerciseGoalError('locked')
    case 'PIN_NOT_REGISTERED':
      return new ExerciseGoalError('pinMissing')
    case 'PIN_ALREADY_SET':
      return new ExerciseGoalError('pinExists')
    case 'INVALID_REQUEST':
      return new ExerciseGoalError('pinFormat')
    case 'TOO_MANY_REQUESTS':
      return new PinConnectError('rateLimited', error.retryAfter)
    default:
      return error
  }
}

/** 실제 서버 구현. 시험에서는 가짜 fetch 세션의 request와 시계를 넘긴다. 앱은 공통 호출(apiRequest)을 쓴다. */
export function createServerPinSource(
  ownerId: string,
  request: RequestFn = apiRequest,
  now: () => number = () => Date.now(),
): PinSource {
  return {
    mode: 'server',

    async getStatus(signal) {
      let data: unknown
      try {
        data = await request<unknown>('GET', '/users/me/pin/status', {
          signal,
          expectStatus: 200,
        })
      } catch (error) {
        if (isUnknownOutcome(error)) throw new PinConnectError('connection')
        throw mapBusinessError(error)
      }
      const value = record(data)
      if (
        value === null ||
        typeof value.registered !== 'boolean' ||
        typeof value.locked !== 'boolean'
      )
        throw new PinConnectError('connection')
      return {
        configured: value.registered,
        locked: value.locked,
        retryAt: null,
      }
    },

    async register(newPin) {
      try {
        // 응답 토큰은 읽지도 보관하지도 않는다(F4-D5).
        await request<unknown>('PUT', '/users/me/pin', {
          body: { newPin },
          expectStatus: 200,
        })
      } catch (error) {
        if (isUnknownOutcome(error))
          throw new PinConnectError('uncertainRegister')
        throw mapBusinessError(error)
      }
      // PIN 폐기(계획 3.4 ①)는 여기서 하지 않는다: 응답이 지금 로그인 작업의 것인지 확인한 뒤 submitPinSettings가 한다(F4-C1).
    },

    async change(currentPin, newPin) {
      try {
        await request<unknown>('PATCH', '/users/me/pin', {
          body: { newPin, currentPin },
          expectStatus: 204,
        })
      } catch (error) {
        if (isUnknownOutcome(error))
          throw new PinConnectError('uncertainChange')
        throw mapBusinessError(error)
      }
      // 성공·잠금의 PIN 폐기(계획 3.4 ①②)는 submitPinSettings가 로그인 표식을 확인한 뒤 한다(F4-C1).
    },

    async verify(pin, guard, signal) {
      // 시작 때 로그인 작업·PIN 폐기 번호를 잡는다(계획 3.4).
      if (guard === null || guard.userId !== ownerId || !guard.isCurrent())
        return { ok: false, reason: 'stale' }
      const startEpoch = currentPinEpoch()
      const requestedAt = now()
      const isStale = () =>
        signal?.aborted === true ||
        !guard.isCurrent() ||
        currentPinEpoch() !== startEpoch

      let data: unknown
      try {
        data = await request<unknown>('POST', '/users/me/pin/verify', {
          body: { pin },
          signal,
          expectStatus: 200,
        })
      } catch (error) {
        const mapped = isUnknownOutcome(error)
          ? new PinConnectError('connection')
          : mapBusinessError(error)
        // 판정을 먼저 한다: 아래 잠금 폐기가 번호를 올려 이 응답 자신을 stale로 만들지 않게.
        const stale = isStale()
        // 잠금 폐기(계획 3.4 ②)는 응답이 지금 로그인 작업의 것일 때만 한다. 로그인이 바뀐 뒤 도착한 이전 요청의 잠금이
        // 새 로그인 작업의 토큰·폐기 번호를 건드리지 않게 한다(F4-C1). 같은 로그인이면 취소·번호 변경으로 stale이어도
        // 이 계정이 잠긴 사실은 그대로이므로 보수적으로 폐기한다.
        if (
          guard.isCurrent() &&
          mapped instanceof ExerciseGoalError &&
          mapped.code === 'locked'
        )
          clearPinToken()
        // 취소·로그인 변경·PIN 폐기 뒤의 응답은 화면에 반영하지 않는다.
        if (stale) return { ok: false, reason: 'stale' }
        throw mapped
      }
      if (isStale()) return { ok: false, reason: 'stale' }

      const value = record(data)
      const token = value?.pinToken
      const expiresIn = value?.expiresIn
      if (
        typeof token !== 'string' ||
        token === '' ||
        typeof expiresIn !== 'number' ||
        !Number.isInteger(expiresIn) ||
        expiresIn <= 0
      )
        throw new PinConnectError('connection')

      // 요청 시작 시각 기준: 서버 만료(발급 시각 + TTL)는 요청 시작 이후이므로 응답이 늦어도 클라이언트 만료가 더 늦어지지 않는다.
      const seconds =
        Math.min(expiresIn, PIN_TOKEN_MAX_SECONDS) - PIN_TOKEN_MARGIN_SECONDS
      const expiresAt = requestedAt + seconds * 1000
      if (now() >= expiresAt) return { ok: false, reason: 'expired' }
      storePinToken(ownerId, token, expiresAt, guard)
      return { ok: true }
    },
  }
}

/** 모의 모드: 기존 개발용 PIN 저장소를 동작 그대로 감싼다(5분 잠금·오류 코드 그대로). */
function createMockPinSource(repository: ExerciseGoalRepository): PinSource {
  return {
    mode: 'mock',
    async getStatus() {
      const value = await repository.getPinStatus()
      return {
        configured: value.configured,
        locked: value.retryAt !== null,
        retryAt: value.retryAt,
      }
    },
    register: (newPin, confirmation) =>
      repository.registerPin(newPin, confirmation),
    change: (currentPin, newPin, confirmation) =>
      repository.changePin(currentPin, newPin, confirmation),
    mockGoal: repository,
  }
}

/** 이 빌드·모드의 PIN 연결. 모의 모드인데 개발용 저장소가 없으면 null(연결 전)이다. */
export function createPinSource(ownerId: string): PinSource | null {
  if (MOCK_AUTH) {
    const repository = createExerciseGoalRepository(ownerId)
    return repository ? createMockPinSource(repository) : null
  }
  return createServerPinSource(ownerId)
}

/** 등록·변경 한 번의 결과. stale은 응답이 왔지만 그 사이 로그인 작업이 바뀌어 화면에 반영하지 않는 경우다. */
export type PinSubmitOutcome =
  { kind: 'done' } | { kind: 'failed'; error: unknown } | { kind: 'stale' }

/**
 * 등록·변경 제출(화면 훅이 부른다). 서버 모드는 시작 때의 로그인 작업 표식이 응답 도착 때도 유효해야 결과를 반영한다
 * (계획 3.4 마지막 항목). 표식이 없으면(로그인 전) 보내지 않는다. 모의 모드는 기존 동작 그대로 표식을 보지 않는다.
 * PIN 자체 폐기(계획 3.4 ① 등록·변경 성공, ② `PIN_LOCKED`)도 여기서, **표식이 유효할 때만** 한다(F4-C1).
 * 로그인이 바뀐 뒤 도착한 이전 요청의 응답은 공용 PIN 상태(새 로그인 작업의 토큰·폐기 번호)를 건드리지 않고 stale이다.
 * 서버 source의 register·change는 폐기하지 않으므로 화면은 반드시 이 함수를 거친다.
 */
export async function submitPinSettings(
  source: PinSource,
  mode: PinSettingsMode,
  values: PinFormValues,
  guard: AccountWorkGuard | null,
): Promise<PinSubmitOutcome> {
  const server = source.mode === 'server'
  if (server && (guard === null || !guard.isCurrent())) return { kind: 'stale' }
  try {
    if (mode === 'register') await source.register(values.next, values.confirm)
    else await source.change(values.current, values.next, values.confirm)
  } catch (error) {
    if (!server) return { kind: 'failed', error }
    if (!guard?.isCurrent()) return { kind: 'stale' }
    // 지금 로그인 작업의 잠금: 이 탭의 토큰을 버리고 잠금 오류는 그대로 화면에 전달한다.
    if (error instanceof ExerciseGoalError && error.code === 'locked')
      clearPinToken()
    return { kind: 'failed', error }
  }
  if (!server) return { kind: 'done' }
  if (!guard?.isCurrent()) return { kind: 'stale' }
  // 지금 로그인 작업의 등록·변경 성공: 남은 토큰이 없어도 번호를 올려 진행 중인 확인 응답을 무효로 한다.
  clearPinToken()
  return { kind: 'done' }
}
