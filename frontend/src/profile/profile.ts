/**
 * 프로필과 개인정보 설정(P02)의 입력 검증, 서버 계약, 표시 규칙.
 *
 * 프로필 API(`GET/PATCH /api/v1/users/me/profile`, `GET /api/v1/users/me`)는 API 명세서에 경로만 있고 요청·응답 구조가 정의돼 있지 않다
 * (API 정책 문서 §4). 아래 `ProfileSource`·`ProfileData`는 **확정된 API가 아니라** 화면이 주고받을 값의 모양이며, 실제 필드·상태값은 백엔드와
 * 확정한 뒤 변환을 `ProfileSource` 구현에 둔다. 연결된 구현(`createProfileSource`)은 지금 항상 null(연결 전)이다.
 *
 * 데이터 출처:
 * - 닉네임·계정 이메일은 로그인한 계정(`useAuth().user`, 개발용 로그인의 계정 값)에서 온다. 화면이 지어내지 않는다.
 * - 이름·휴대폰·나이·성별·주소·알레르기·AI 활용 동의는 이 앱에 저장소가 없다(개발용 저장소도 없다). 서버가 주는 값만 보여 주고,
 *   서버 연결 전에는 "연결 전", 서버가 값을 주지 않으면 "등록된 정보 없음"으로 구분해 알린다. 가짜 개인정보를 만들지 않는다.
 * - 신체 정보(키·몸무게·BMI)는 P05의 PIN 열람 권한이 필요한 별도 영역이라 이 화면이 다루지 않는다(P01·P06 책임).
 */

/** 닉네임 길이 범위(명세 P02: "닉네임 2~20자"). 앞뒤 공백을 뺀 뒤 글자(코드 포인트) 수로 센다. */
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 20

export type NicknameError = 'length'

export const NICKNAME_ERROR_MESSAGE: Record<NicknameError, string> = {
  length: `닉네임은 ${NICKNAME_MIN}자 이상 ${NICKNAME_MAX}자 이하로 입력해 주세요.`,
}

/** 닉네임 검증: 앞뒤 공백을 뺀 글자 수가 2~20자여야 한다. 명세에 허용 문자 규칙이 없어 그 밖의 제한을 만들지 않는다. */
export function validateNickname(
  value: string,
): { ok: true; nickname: string } | { ok: false; error: NicknameError } {
  const nickname = value.trim()
  const length = Array.from(nickname).length
  return length >= NICKNAME_MIN && length <= NICKNAME_MAX
    ? { ok: true, nickname }
    : { ok: false, error: 'length' }
}

export type ProfileSex = 'male' | 'female'

/**
 * 서버가 준 프로필 값(확정된 API 응답이 아니다). 항목이 없으면 null이며, 이 앱은 빈 값을 채워 넣지 않는다.
 * allergies: null은 "응답 없음(미확인)", 빈 목록은 "없음"으로 구분한다(명세 A02).
 */
export interface ProfileData {
  name: string | null
  phone: string | null
  /** 도로명 + 상세 주소. */
  address: string | null
  /** 본인인증으로 확인된 나이·성별(명세 P02 "본인인증 나이·성별 확인"). */
  age: number | null
  sex: ProfileSex | null
  allergies: readonly string[] | null
  /** 선택 AI 활용 동의. null은 응답 없음. */
  aiConsent: boolean | null
}

/**
 * 서버 연결 경계(확정된 API가 아니다).
 * - getProfile: 내 프로필·가입 개인정보·동의 조회. 본인 정보만 오는 것은 서버가 보장한다.
 * - updateNickname: 닉네임 수정. 서버가 저장하면 resolve, 저장하지 못하면 reject한다.
 */
export interface ProfileSource {
  getProfile(signal: AbortSignal): Promise<ProfileData>
  updateNickname(nickname: string, signal: AbortSignal): Promise<void>
}

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createProfileSource(): ProfileSource | null {
  return null
}

/**
 * 조회 상태(조회 전·로딩은 loading으로 보인다).
 * unavailable은 서버 연결 전이다. 서버가 값을 주지 않은 "정보 없음"(ready의 null 항목)과 다르다.
 */
export type ProfileState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; data: ProfileData }

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

/** 저장 상태. idle 초기 · invalid 입력 오류 · saving 저장 요청 중 · failed 저장 실패 · saved 저장 완료(서버가 저장했을 때만). */
export type NicknameSavePhase =
  'idle' | 'invalid' | 'saving' | 'failed' | 'saved'

/** 저장 요청 한 번의 결과. 연결이 없으면 보내지 않고 null이다(호출한 쪽이 연결 전으로 다룬다). 예외는 failed다. */
export async function runUpdateNickname(
  source: ProfileSource | null,
  nickname: string,
  signal: AbortSignal,
): Promise<'saved' | 'failed' | null> {
  if (source === null) return null
  try {
    await source.updateNickname(nickname, signal)
    return 'saved'
  } catch {
    return 'failed'
  }
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

const SEX_LABEL: Record<ProfileSex, string> = { male: '남성', female: '여성' }

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
        data.age > 0 &&
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
