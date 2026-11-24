import {
  ApiError,
  apiRequest,
  INVALID_RESPONSE,
  type ApiRequestOptions,
  type HttpMethod,
} from '../api/http.ts'
import { SIGNUP_MESSAGES, isValidNickname } from '../pages/signupValidation.ts'

/**
 * 프로필과 개인정보 설정(P02)의 입력 검증, 서버 연결, 표시 규칙(F3).
 *
 * 서버 계약(머지된 회원 API, FE-CONTRACT-1로 바꾸지 않음):
 * - `GET /api/v1/users/me` → 실명(`username`)·이메일·닉네임(`nickname`).
 * - `GET /api/v1/users/me/profile` → `displayName`·`birthDate`·`gender`·`phoneNumber` 등.
 * - `PATCH /api/v1/users/me/profile` → 이 화면은 `{ displayName }` 하나만 보낸다(없는 필드는 서버가 "변경 없음"으로 본다).
 *   닉네임 중복은 409 `NICKNAME_ALREADY_EXISTS`, 규칙 위반은 400. 닉네임은 `/users/me`에서는 `nickname`, 프로필에서는 `displayName`이다
 *   (같은 값, 필드명만 다름). 변환은 이 파일의 서버 구현에 둔다.
 *
 * 실제/모의 모드(F1-D3와 같은 기준): 기본은 실제 서버 연결이다. 개발 서버에서 `VITE_DEV_AUTH=true`(모의 로그인)이면 서버 토큰이 없으므로
 * 연결하지 않는다(`createProfileSource()`가 null → 화면은 "연결 전"). 운영 빌드는 값과 상관없이 실제 서버 연결이다.
 *
 * 데이터 출처:
 * - 닉네임·계정 이메일 표시는 로그인한 계정(`useAuth().user`)에서 온다. 화면이 지어내지 않는다.
 * - 이름·휴대폰·나이·성별은 서버 값만 보인다. 주소·알레르기·AI 활용 동의는 서버에 항목이 없어 null("등록된 정보 없음")이다
 *   (알레르기는 수집하지 않는다, Q-20). 가짜 개인정보를 만들지 않는다.
 * - 신체 정보(키·몸무게·BMI)는 P05의 PIN 열람 권한이 필요한 별도 영역이라 이 화면이 다루지 않는다(P01·P06 책임).
 */

/**
 * 모의 로그인 모드(F1-D3: 개발 서버 + `VITE_DEV_AUTH=true`). 가입 화면(SignupPage)과 같은 식을 직접 쓴다.
 * import.meta.env.DEV는 빌드 때 상수(false)로 바뀌어 운영 빌드에서는 항상 실제 서버 연결이다.
 */
const MOCK_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'

export type NicknameError = 'invalid'

/** 닉네임 규칙 안내(가입과 같은 규칙 NAME-2, F3-D2). */
export const NICKNAME_HELP_TEXT =
  '한글·영문·숫자로 입력해 주세요. 한글이 있으면 2~8자, 없으면 2~16자예요.'

export const NICKNAME_ERROR_MESSAGE: Record<NicknameError, string> = {
  invalid: SIGNUP_MESSAGES.nicknameInvalid,
}

/**
 * 닉네임 검증: 가입과 같은 서버 규칙(NAME-2)을 그대로 쓴다(F3-D2, `isValidNickname` 재사용).
 * 앞뒤 공백은 빼고 판단하며, 서버에도 뺀 값을 보낸다.
 */
export function validateNickname(
  value: string,
): { ok: true; nickname: string } | { ok: false; error: NicknameError } {
  const nickname = value.trim()
  return isValidNickname(nickname)
    ? { ok: true, nickname }
    : { ok: false, error: 'invalid' }
}

/** 서버 `gender` 값(소문자 4종). */
export type ProfileSex = 'male' | 'female' | 'other' | 'undisclosed'

/**
 * 화면이 쓰는 프로필 값(서버 응답을 `toProfileData`가 바꾼 것). 항목이 없으면 null이며, 이 앱은 빈 값을 채워 넣지 않는다.
 * allergies: null은 "응답 없음(미확인)", 빈 목록은 "없음"으로 구분한다(명세 A02).
 */
export interface ProfileData {
  /**
   * 서버가 가진 닉네임(GET `displayName`). 저장 응답과 같은 성공 조건(`serverNickname`)을 통과할 때만 값이 있다.
   * 화면 저장 기준 동기화에만 쓰고 로그인 정보(전역 닉네임)는 바꾸지 않는다(F3-D3, PR #29 P2-03).
   */
  nickname: string | null
  name: string | null
  phone: string | null
  /** 도로명 + 상세 주소. */
  address: string | null
  /** 회원이 입력한 생년월일(`birthDate`)로 계산한 만 나이와 회원이 입력한 성별. 본인인증으로 확인한 값이 아니다(F3-D4). */
  age: number | null
  sex: ProfileSex | null
  allergies: readonly string[] | null
  /** 선택 AI 활용 동의. null은 응답 없음. */
  aiConsent: boolean | null
}

/**
 * 서버 연결 경계.
 * - getProfile: 내 프로필·가입 개인정보 조회. 본인 정보만 오는 것은 서버가 보장한다(토큰의 회원).
 * - updateNickname: 닉네임 수정. 서버가 저장하면 **서버가 저장한 닉네임(응답 `displayName`)**으로 resolve, 저장하지 못하면 reject한다.
 */
export interface ProfileSource {
  getProfile(signal: AbortSignal): Promise<ProfileData>
  updateNickname(nickname: string, signal: AbortSignal): Promise<string>
}

type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const SEXES: readonly ProfileSex[] = ['male', 'female', 'other', 'undisclosed']
const BIRTH_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 생년월일(`YYYY-MM-DD`)과 오늘 날짜로 만 나이를 센다. 형식이 맞지 않거나 없는 날짜·미래 날짜면 null.
 * 생일이 지나지 않았으면 한 살 뺀다. 2월 29일 생일은 평년에는 3월 1일에 한 살 늘어난다(월·일 비교).
 * `today`는 브라우저 현지 날짜다(시험에서는 주입한다).
 */
export function ageOn(birthDate: unknown, today: Date): number | null {
  if (typeof birthDate !== 'string') return null
  const match = BIRTH_DATE.exec(birthDate)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  )
    return null
  const nowMonth = today.getMonth() + 1
  const nowDay = today.getDate()
  let age = today.getFullYear() - year
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1
  return age >= 0 ? age : null
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('응답 형식이 계약과 다름')
  return value as Record<string, unknown>
}

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

/**
 * 서버 응답 두 개(`/users/me`, `/users/me/profile`)를 화면 값으로 바꾼다.
 * 서버에 없는 주소·알레르기·AI 동의는 null이다. `regionCode`를 주소로, `dietaryPreferences`를 알레르기로 바꾸지 않는다.
 */
export function toProfileData(
  me: unknown,
  profile: unknown,
  today: Date,
): ProfileData {
  const meData = record(me)
  const profileData = record(profile)
  const gender = text(profileData.gender)
  return {
    nickname: serverNickname(profileData.displayName),
    name: text(meData.username),
    phone: text(profileData.phoneNumber),
    address: null,
    age: ageOn(profileData.birthDate, today),
    sex: SEXES.find((sex) => sex === gender) ?? null,
    allergies: null,
    aiConsent: null,
  }
}

/**
 * 서버가 돌려준 닉네임이 계약에 맞는지(PR #29 P2-02). 문자열 + **원문 앞뒤 공백 없음** + 가입과 같은 규칙(NAME-2).
 * `isValidNickname`은 안에서 trim하므로 원문 공백은 따로 본다. 맞지 않으면 null이다(입력값으로 대신하지 않는다).
 */
export function serverNickname(value: unknown): string | null {
  return typeof value === 'string' &&
    value === value.trim() &&
    isValidNickname(value)
    ? value
    : null
}

/** 요청은 성공(2xx)했지만 응답을 계약대로 해석할 수 없음. 서버가 저장했는지 알 수 없다(`uncertain`). */
export class NicknameResponseError extends Error {
  constructor() {
    super('닉네임 저장 응답이 계약과 다름')
    this.name = 'NicknameResponseError'
  }
}

/** 실제 서버 구현. 시험에서는 가짜 fetch를 쓰는 세션의 request를 넘긴다. 앱은 공통 호출(apiRequest)을 쓴다. */
export function createServerProfileSource(
  request: RequestFn = apiRequest,
  now: () => Date = () => new Date(),
): ProfileSource {
  return {
    async getProfile(signal) {
      const [me, profile] = await Promise.all([
        request<unknown>('GET', '/users/me', { signal }),
        request<unknown>('GET', '/users/me/profile', { signal }),
      ])
      return toProfileData(me, profile, now())
    },
    async updateNickname(nickname, signal) {
      // 성공은 200만(P2-02). 200이 아닌 2xx는 공통 호출이 INVALID_RESPONSE로 던진다.
      const data = await request<unknown>('PATCH', '/users/me/profile', {
        body: { displayName: nickname },
        signal,
        expectStatus: 200,
      })
      // 서버가 저장한 값을 돌려준다. 계약에 맞는 닉네임이 없으면 저장 여부를 확인할 수 없다(입력값으로 대신하지 않는다).
      const saved =
        typeof data === 'object' && data !== null && !Array.isArray(data)
          ? serverNickname((data as Record<string, unknown>).displayName)
          : null
      if (saved === null) throw new NicknameResponseError()
      return saved
    },
  }
}

/** 이 빌드·모드의 서버 연결. 모의 로그인 모드에서는 null(연결 전)이다. */
export function createProfileSource(): ProfileSource | null {
  return MOCK_AUTH ? null : createServerProfileSource()
}

/**
 * 조회 상태(조회 전·로딩은 loading으로 보인다).
 * unavailable은 서버 연결 전이다. 서버가 값을 주지 않은 "정보 없음"(ready의 null 항목)과 다르다.
 */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      data: ProfileData
      /**
       * 이 조회를 시작할 때의 화면 저장 버전(PR #29 P2-03). 편집기는 지금 저장 버전과 같을 때만 이 조회의 닉네임을 반영한다
       * (`readNicknameToApply`). 없으면(시험용 화면) 버전을 보지 않는다.
       */
      readVersion?: number
    }

/** 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. */
export async function runGetProfile(
  source: ProfileSource | null,
  signal: AbortSignal,
): Promise<Exclude<ProfileState, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    return { status: 'ready', data: await source.getProfile(signal) }
  } catch {
    return { status: 'error' }
  }
}

/**
 * 저장 상태. idle 초기 · invalid 입력 오류 · saving 저장 요청 중 · failed 서버가 거절함(저장 안 됨) · taken 닉네임 중복(409) ·
 * rejected 요청 거절(400 INVALID_REQUEST) · uncertain 저장 여부를 확인할 수 없음 · saved 저장 완료(서버가 저장했을 때만).
 */
export type NicknameSavePhase =
  | 'idle'
  | 'invalid'
  | 'saving'
  | 'failed'
  | 'taken'
  | 'rejected'
  | 'uncertain'
  | 'saved'

/** 저장 요청 한 번의 결과. saved에는 서버가 저장한 닉네임이 있다. */
export type NicknameSaveResult =
  | { phase: 'saved'; nickname: string }
  | { phase: 'failed' | 'taken' | 'rejected' | 'uncertain' }

/**
 * 서버 오류를 화면 결과로 나눈다(PR #29 P2-02, F3-R29-QA·QB).
 * - uncertain: 요청은 성공(2xx)했지만 응답이 계약과 다름, 또는 서버에 닿지 못함(네트워크)·5xx. 서버가 이미 저장했을 수 있어 "저장 안 됨"으로 단정하지 않는다.
 *   4xx는 본문이 깨져 있어도 서버가 거절한 것이고, 보내기 전에 막힌 호출(상태 0 INVALID_REQUEST)도 보내지 않았으므로 failed다.
 * - taken: 409 NICKNAME_ALREADY_EXISTS. rejected: 400 INVALID_REQUEST(닉네임 규칙 외의 형식 오류도 같은 코드라 일반 거절로 안내).
 * - failed: 그 밖에 서버가 분명히 거절한 응답(401 등 — 로그인 만료는 공통 세션 처리가 화면을 정리한다).
 */
function classifySaveError(error: unknown): NicknameSaveResult {
  if (error instanceof NicknameResponseError) return { phase: 'uncertain' }
  if (error instanceof ApiError) {
    // 응답 형식 오류는 성공(2xx) 응답일 때만 결과 미확인이다. 4xx는 본문이 깨져도 서버가 거절한 것이다(Codex 재검토).
    const malformedSuccess =
      error.errorCode === INVALID_RESPONSE &&
      error.status >= 200 &&
      error.status < 300
    // 상태 0은 서버에 닿지 못한 네트워크 오류(`NETWORK`, api/core.ts NETWORK_ERROR)만. 보내기 전에 막힌 잘못된 호출(INVALID_REQUEST)은 보내지 않았으므로 실패다.
    const unreached = error.status === 0 && error.errorCode === 'NETWORK'
    if (malformedSuccess || unreached || error.status >= 500)
      return { phase: 'uncertain' }
    if (error.status === 409 && error.errorCode === 'NICKNAME_ALREADY_EXISTS')
      return { phase: 'taken' }
    if (error.status === 400 && error.errorCode === 'INVALID_REQUEST')
      return { phase: 'rejected' }
  }
  return { phase: 'failed' }
}

/** 저장 요청 한 번. 연결이 없으면 보내지 않고 null이다(호출한 쪽이 연결 전으로 다룬다). 자동으로 다시 보내지 않는다. */
export async function runUpdateNickname(
  source: ProfileSource | null,
  nickname: string,
  signal: AbortSignal,
): Promise<NicknameSaveResult | null> {
  if (source === null) return null
  try {
    return {
      phase: 'saved',
      nickname: await source.updateNickname(nickname, signal),
    }
  } catch (error) {
    return classifySaveError(error)
  }
}

/**
 * 저장 한 번에 묶인 로그인 작업 표식(AuthContext의 `beginNicknameSave()` 결과와 같은 모양).
 * isCurrent: 시작 때의 로그인 작업이 아직 유효한지. commit: 유효하면 로그인 정보에 반영하고 true, 무효면 아무것도 바꾸지 않고 false.
 */
export interface NicknameSaveGuard {
  isCurrent(): boolean
  commit(nickname: string): boolean
}

/**
 * 화면의 저장 순서(F3-R1·C2, React와 분리해 보류 Promise로 시험한다).
 * 1) 저장 요청 → 2) 응답이 왔을 때 화면이 그 요청을 중단했으면(화면 이탈) 'stale'
 * → 3) 저장 시작 때의 로그인 작업이 무효가 됐으면(그 사이 로그인 시작·완료, 로그아웃, 세션 종료) 결과 종류와 상관없이 'stale'
 * → 4) 저장됐으면 `guard.commit(서버가 저장한 닉네임)`. 로그인 정보 반영이 거절되면(false) 화면도 같은 판정으로 'stale'.
 * 'stale'이면 화면은 저장 기준·입력·성공 표시를 바꾸지 않는다. 화면과 로그인 정보가 같은 판정을 쓰므로 한쪽만 반영되지 않는다.
 * guard가 없으면(시험용 화면) 3·4는 건너뛴다. 서버에 이미 저장된 변경을 되돌리지는 않는다('stale'을 "취소됨"으로 안내하지 않는다).
 */
export async function saveNickname(
  source: ProfileSource | null,
  nickname: string,
  signal: AbortSignal,
  guard?: NicknameSaveGuard,
): Promise<NicknameSaveResult | null | 'stale'> {
  const result = await runUpdateNickname(source, nickname, signal)
  if (signal.aborted) return 'stale'
  if (guard && !guard.isCurrent()) return 'stale'
  if (result?.phase === 'saved' && guard && !guard.commit(result.nickname))
    return 'stale'
  return result
}

/**
 * 저장 결과를 화면 상태에 반영할 내용(React와 분리해 시험한다).
 * - 'stale'(화면 이탈·로그인 작업 무효)·null(연결 없음): 진행 표시만 끝낸다. 저장 기준·입력·성공 표시는 그대로다(saved 없음).
 * - saved: 서버가 저장한 닉네임이 새 저장 기준이자 입력값이다(입력값이 아니다).
 * - 실패(failed·taken·rejected): 안내만 바꾸고 입력은 그대로 둔다.
 */
export function saveOutcomePatch(
  outcome: NicknameSaveResult | null | 'stale',
): { phase: NicknameSavePhase; saved?: string } {
  if (outcome === 'stale' || outcome === null) return { phase: 'idle' }
  // uncertain도 실패와 같이 안내만 바꾸고 입력·기준은 그대로 둔다.
  if (outcome.phase === 'saved')
    return { phase: 'saved', saved: outcome.nickname }
  return { phase: outcome.phase }
}

/**
 * 편집기의 닉네임 상태. input은 입력칸, saved는 변경 여부(dirty)의 기준(서버가 가진 것으로 아는 닉네임)이다.
 */
export interface NicknameEditor {
  input: string
  saved: string
}

/**
 * 새 서버 값(최신 GET의 닉네임, 같은 계정 재로그인 뒤 로그인 정보의 닉네임)을 편집기에 맞춘다(PR #29 P2-03).
 * - 기준(saved)은 들어온 값이 된다.
 * - 입력이 기준과 같으면(미저장 입력 없음) 입력도 들어온 값으로 바꾼다.
 * - 미저장 입력이 있거나 저장 중이면 입력은 그대로 둔다(저장 중에는 응답이 마지막으로 정리한다).
 */
export function syncNicknameBaseline(
  editor: NicknameEditor,
  incoming: string,
  saving: boolean,
): NicknameEditor {
  const clean = editor.input.trim() === editor.saved
  return {
    input: clean && !saving ? incoming : editor.input,
    saved: incoming,
  }
}

/**
 * 조회(GET) 결과를 반영해도 되는지 판단하는 함수를 만든다(PR #29 P2-03).
 * 조회를 시작할 때 `begin()`을 부르면, 그때의 로그인 작업 표식과 화면 저장 버전을 잡아 두고 도착 때 쓸 판정 함수를 돌려준다.
 * 판정 = 로그인 작업이 그대로(같은 회원 재로그인도 새 작업) **그리고** 그 사이 저장 성공이 반영되지 않음.
 * 하나라도 바뀌면 그 조회는 오래된 값일 수 있어 버린다. 표식은 `isCurrent`만 쓰고 로그인 정보를 바꾸지 않는다.
 */
export function createReadGate(
  beginGuard: () => { isCurrent(): boolean } | null,
  saveVersion: () => number,
): () => ProfileRead {
  return () => {
    const guard = beginGuard()
    const version = saveVersion()
    return {
      version,
      fresh: () =>
        guard !== null && guard.isCurrent() && saveVersion() === version,
    }
  }
}

/** 조회 한 번의 판정: 시작 때의 저장 버전과, 도착 때 반영해도 되는지 보는 함수. */
export interface ProfileRead {
  version: number
  fresh(): boolean
}

/**
 * 편집기에 반영할 조회 닉네임(PR #29 P2-03, Codex 재검토). 상태에 들어온 조회라도 **편집기에 적용하는 순간** 시작 때의 저장 버전이
 * 지금 화면의 저장 버전과 같아야 한다. 저장 응답과 조회 응답이 같은 턴에 끝나 조회가 먼저 유효 판정을 통과하고 같은 렌더에서
 * 저장이 반영되는 경우, 이 확인이 예전 조회가 저장 직후의 입력·기준을 되돌리는 것을 막는다. 반영할 값이 없으면 null.
 */
export function readNicknameToApply(
  state: ProfileState,
  saveVersion: number,
): string | null {
  if (state.status !== 'ready') return null
  if (state.readVersion !== undefined && state.readVersion !== saveVersion)
    return null
  return typeof state.data.nickname === 'string' ? state.data.nickname : null
}

/** 한 칸의 표시: 값이 있거나, 값 대신 상태 글자(조회 중·연결 전·불러오지 못함·등록된 정보 없음)를 보인다. */
export type FieldView =
  | { kind: 'value'; text: string }
  | { kind: 'status'; status: 'loading' | 'unavailable' | 'error' | 'empty' }

export const FIELD_STATUS_TEXT: Record<
  Extract<FieldView, { kind: 'status' }>['status'],
  string
> = {
  loading: '불러오는 중…',
  unavailable: '연결 전',
  error: '불러오지 못했어요',
  empty: '등록된 정보 없음',
}

/** 휴대폰 번호는 화면에 일부만 보인다(앞 3자리와 끝 4자리). 숫자가 8자리보다 짧으면 전부 가린다. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 8) return '***'
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`
}

const SEX_LABEL: Record<ProfileSex, string> = {
  male: '남성',
  female: '여성',
  other: '기타',
  undisclosed: '밝히지 않음',
}

function present(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

export type ProfileRowKey =
  'name' | 'phone' | 'identity' | 'address' | 'allergies' | 'aiConsent'

/** 서버 값(`ready`)이 없을 때의 상태 표시. ready이면 null이다. */
function stateView(state: ProfileState): FieldView | null {
  if (state.status === 'ready') return null
  return { kind: 'status', status: state.status }
}

/**
 * 읽기 전용 항목의 표시. 서버가 값을 주지 않은 항목(null·빈 글자)은 "등록된 정보 없음"이고, 서버 연결 전·조회 중·실패는 값 대신 그 상태다.
 * 휴대폰은 일부만 보이고, 알레르기는 빈 목록이면 "없음"이다.
 */
export function profileFieldView(
  state: ProfileState,
  key: ProfileRowKey,
): FieldView {
  const pending = stateView(state)
  if (pending !== null) return pending
  if (state.status !== 'ready') return { kind: 'status', status: 'error' }
  const data = state.data
  const empty: FieldView = { kind: 'status', status: 'empty' }
  const value = (text: string | null): FieldView =>
    text === null ? empty : { kind: 'value', text }
  switch (key) {
    case 'name':
      return value(present(data.name))
    case 'phone': {
      const phone = present(data.phone)
      return value(phone === null ? null : maskPhone(phone))
    }
    case 'identity': {
      const parts: string[] = []
      if (
        data.age !== null &&
        Number.isInteger(data.age) &&
        data.age >= 0 &&
        data.age < 150
      )
        parts.push(`${data.age}세`)
      if (data.sex !== null && data.sex in SEX_LABEL)
        parts.push(SEX_LABEL[data.sex])
      return value(parts.length === 0 ? null : parts.join(' · '))
    }
    case 'address':
      return value(present(data.address))
    case 'allergies': {
      if (data.allergies === null) return empty
      const list = data.allergies
        .map((item) => item.trim())
        .filter((item) => item !== '')
      return {
        kind: 'value',
        text: list.length === 0 ? '없음' : list.join(', '),
      }
    }
    case 'aiConsent':
      return data.aiConsent === null
        ? empty
        : { kind: 'value', text: data.aiConsent ? '동의함' : '동의하지 않음' }
  }
}

/** 서버가 준 읽기 전용 항목이 하나도 없는 상태(조회는 됐지만 등록된 정보가 없다). */
export function isProfileEmpty(state: ProfileState): boolean {
  if (state.status !== 'ready') return false
  const keys: ProfileRowKey[] = [
    'name',
    'phone',
    'identity',
    'address',
    'allergies',
    'aiConsent',
  ]
  return keys.every((key) => {
    const view = profileFieldView(state, key)
    return view.kind === 'status'
  })
}

/** P02 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_PROFILE = '/settings/profile'
