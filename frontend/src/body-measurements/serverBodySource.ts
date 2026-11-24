import {
  ApiError,
  apiRequest,
  INVALID_RESPONSE,
  type ApiRequestOptions,
  type HttpMethod,
} from '../api/http.ts'
import type {
  BodyMeasurementInput,
  BodyMeasurementValues,
  BodyServerMetrics,
} from './bodyTypes.ts'

/**
 * 신체 정보 서버 연결(F5). 실제 모드(개발 기본·운영 빌드)에서 쓴다. 모의 모드는 기존 개발용 저장소를 그대로 쓴다(bodySource.ts).
 *
 * 서버 계약(머지된 회원 단위 8, FE-CONTRACT-1로 바꾸지 않음). 모두 로그인 필요:
 * - `POST /health/measurements` — **PIN 불필요.** 입력한 항목만 JSON 숫자로 보낸다. 201 `{measurementId}`(수치 없음, 항상 새 측정 행)
 * - `GET /health/metrics` — `X-Pin-Token` 필요. 200 `{basedOn:{heightCm, weightKg, …}, bmi, bmr, tdee, missingFields, notCalculableFields, …}`
 *   403 `PIN_EXPIRED`·`PIN_REQUIRED`·`PIN_NOT_REGISTERED`
 * - PIN 없이 등록 여부를 알려 주는 API는 없다(HEALTH8-15). 그래서 이 연결에는 등록 여부 메서드가 없다(F5-D1).
 * - `PATCH`·`GET /health/measurements`는 화면에 연결하지 않는다(F5-D4).
 *
 * 수치·토큰은 오류 객체·로그에 넣지 않는다. 서버 실패 때 모의 저장소로 넘어가지 않는다.
 */

/**
 * 저장 결과.
 * - saved: 201 + 양의 정수 `measurementId`
 * - invalid: 400(서버가 값을 거절. 저장되지 않음)
 * - failed: 그 밖의 확정 실패(4xx, 보내기 전에 막힘)
 * - uncertain: 네트워크 오류·5xx·형식이 어긋난 성공 응답 — 서버가 이미 저장했을 수 있다. 새 행이 생기므로 자동으로 다시 보내지 않는다.
 */
export type ServerSaveResult = 'saved' | 'invalid' | 'failed' | 'uncertain'

export type MetricsResult =
  | { ok: true; values: BodyMeasurementValues; metrics: BodyServerMetrics }
  | {
      ok: false
      reason: 'pinExpired' | 'pinRequired' | 'pinNotRegistered' | 'failed'
    }

export interface ServerBodySource {
  readonly mode: 'server'
  save(input: BodyMeasurementInput): Promise<ServerSaveResult>
  /** PIN 토큰은 호출하는 쪽이 `getPinToken`으로 읽어 넘긴다. 이 함수는 토큰을 보관하지 않는다. */
  metrics(pinToken: string, signal?: AbortSignal): Promise<MetricsResult>
}

type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

/** 공통 호출의 네트워크 오류 코드(api/core.ts `NETWORK_ERROR`와 같은 값). */
const NETWORK = 'NETWORK'

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** 유한한 숫자 또는 null. 그 밖(문자열·undefined 등)은 형식 오류다. */
function numberOrNull(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? [...value]
    : undefined
}

/** 저장 실패 분류(F3 닉네임 저장과 같은 기준: 상태 0은 실제 네트워크 오류만, 형식 오류는 2xx일 때만 결과 불확실). */
export function classifySaveError(error: unknown): ServerSaveResult {
  if (!(error instanceof ApiError)) return 'uncertain'
  if (error.status === 0)
    return error.errorCode === NETWORK ? 'uncertain' : 'failed'
  if (error.status >= 500) return 'uncertain'
  if (error.status >= 200 && error.status < 300) return 'uncertain'
  if (error.errorCode === INVALID_RESPONSE) return 'failed'
  return error.status === 400 ? 'invalid' : 'failed'
}

/** metrics 응답을 화면 값으로 바꾼다. 형식이 어긋나면 null(표시하지 않는다). 0은 정상 값이다. */
export function parseMetrics(
  data: unknown,
): { values: BodyMeasurementValues; metrics: BodyServerMetrics } | null {
  const value = record(data)
  const basedOn = record(value?.basedOn)
  if (value === null || basedOn === null) return null
  const heightCm = numberOrNull(basedOn.heightCm)
  const weightKg = numberOrNull(basedOn.weightKg)
  const bmi = numberOrNull(value.bmi)
  const bmr = numberOrNull(value.bmr)
  const tdee = numberOrNull(value.tdee)
  const missingFields = stringList(value.missingFields)
  const notCalculableFields = stringList(value.notCalculableFields)
  if (
    heightCm === undefined ||
    weightKg === undefined ||
    bmi === undefined ||
    bmr === undefined ||
    tdee === undefined ||
    missingFields === undefined ||
    notCalculableFields === undefined
  )
    return null
  return {
    values: { heightCm, weightKg },
    metrics: { bmi, bmr, tdee, missingFields, notCalculableFields },
  }
}

/** 실제 서버 구현. 시험에서는 가짜 fetch 세션의 request를 넘긴다. 앱은 공통 호출(apiRequest)을 쓴다. */
export function createServerBodySource(
  request: RequestFn = apiRequest,
): ServerBodySource {
  return {
    mode: 'server',

    async save(input) {
      // 입력한 항목만 보낸다. 측정 시각은 서버가 정한다(생략 = 서버 현재 시각).
      const body: Record<string, number> = {}
      if (input.heightCm !== undefined) body.heightCm = input.heightCm
      if (input.weightKg !== undefined) body.weightKg = input.weightKg
      if (body.heightCm === undefined && body.weightKg === undefined)
        return 'invalid'
      let data: unknown
      try {
        data = await request<unknown>('POST', '/health/measurements', {
          body,
          expectStatus: 201,
        })
      } catch (error) {
        return classifySaveError(error)
      }
      const id = record(data)?.measurementId
      return typeof id === 'number' && Number.isInteger(id) && id > 0
        ? 'saved'
        : 'uncertain'
    },

    async metrics(pinToken, signal) {
      let data: unknown
      try {
        data = await request<unknown>('GET', '/health/metrics', {
          headers: { 'X-Pin-Token': pinToken },
          signal,
          expectStatus: 200,
        })
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          if (error.errorCode === 'PIN_EXPIRED')
            return { ok: false, reason: 'pinExpired' }
          if (error.errorCode === 'PIN_REQUIRED')
            return { ok: false, reason: 'pinRequired' }
          if (error.errorCode === 'PIN_NOT_REGISTERED')
            return { ok: false, reason: 'pinNotRegistered' }
        }
        return { ok: false, reason: 'failed' }
      }
      const parsed = parseMetrics(data)
      return parsed ? { ok: true, ...parsed } : { ok: false, reason: 'failed' }
    },
  }
}
