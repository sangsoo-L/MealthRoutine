import {
  ACCOUNT_SCOPE_PREFIX,
  accountScopedKey,
} from '../../auth/accountScope.ts'
import { EXPERIENCE_SUBJECT_ID } from '../subject.ts'
import type { SurveyDraft, SurveyResult } from '../signupExperienceTypes.ts'
import { sanitizeSurveyDraft } from './surveyProgress.ts'

/**
 * [개발 전용] 가입 체험의 상태 저장. 개발 서버에서만 불러온다(signupExperience.ts). 운영 빌드에는 포함되지 않는다.
 *
 * 이 모듈은 인증과 무관하다. 로그인 상태(AuthProvider)·세션·권한을 만들거나 바꾸지 않고, "가입 체험 중"이라는 표지와
 * 설문 임시 데이터만 sessionStorage에 둔다. 표지가 있어도 마이페이지·기록 같은 회원 화면은 열리지 않는다(이해도 확인 화면만 통과).
 *
 * 저장 항목과 기간
 * - 표지(experience): { v, startedAt }. 가입 폼의 입력값(이름·휴대폰·주소·이메일·비밀번호)은 어떤 것도 저장하지 않는다.
 * - 설문 진행(survey.draft): 설문 도중의 단계·답변. 새로고침 복구용이며 설문을 마치면 지운다.
 * - 설문 결과(survey.result): 설문을 마친 답변. 체험이 끝날 때까지 둔다.
 * - 이해도 확인의 출제·응답·결과는 onboarding-assessment의 Mock 저장소가 같은 주체 ID(signup-experience)로 따로 둔다(assessment.*).
 * - 기간: 브라우저 탭이 닫힐 때까지(sessionStorage). 그 전에 체험 종료 버튼·"홈으로 가기"·로그인·로그아웃이 모두 지운다.
 *   모든 키가 접두어 mealthroutine.account.를 가져 로그인·로그아웃의 기존 정리(clearAccountScopedData)가 함께 지운다.
 */

/** 저장소 최소 모양. 테스트에서 대체할 수 있다. */
export interface ExperienceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

const MARKER_NAME = 'experience'
const MARKER_VERSION = 1

function defaultStorage(): ExperienceStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()
function notify(): void {
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readJson(storage: ExperienceStorage | null, key: string): unknown {
  if (!storage) return null
  try {
    const text = storage.getItem(key)
    return text === null ? null : JSON.parse(text)
  } catch {
    return null
  }
}

function writeJson(
  storage: ExperienceStorage | null,
  key: string,
  value: unknown,
): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장하지 못해도 화면은 동작한다. 체험 표지를 못 남기면 이해도 확인 접근이 막힐 뿐이다.
  }
}

const markerKey = () => accountScopedKey(EXPERIENCE_SUBJECT_ID, MARKER_NAME)

export function isActive(
  storage: ExperienceStorage | null = defaultStorage(),
): boolean {
  const raw = readJson(storage, markerKey())
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { v?: unknown }).v === MARKER_VERSION &&
    typeof (raw as { startedAt?: unknown }).startedAt === 'string'
  )
}

/** 체험 주체의 모든 임시 데이터를 지운다(표지·설문·이해도 확인). 다른 계정의 데이터는 건드리지 않는다. */
export function clearExperienceData(
  storage: ExperienceStorage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    const prefix = `${ACCOUNT_SCOPE_PREFIX}${EXPERIENCE_SUBJECT_ID}.`
    const keys: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key !== null && key.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    // 지울 수 없으면 지울 데이터도 없다.
  }
}

/** 체험을 시작한다. 이전 체험의 데이터는 먼저 모두 지워 새로 시작한다. */
export function start(
  storage: ExperienceStorage | null = defaultStorage(),
  now: () => Date = () => new Date(),
): void {
  clearExperienceData(storage)
  writeJson(storage, markerKey(), {
    v: MARKER_VERSION,
    startedAt: now().toISOString(),
  })
  notify()
}

export function end(
  storage: ExperienceStorage | null = defaultStorage(),
): void {
  clearExperienceData(storage)
  notify()
}

// ───── 설문 임시 데이터(주체 ID는 체험 또는 로그인한 개발용 계정) ─────

const draftKey = (subjectId: string) =>
  accountScopedKey(subjectId, 'survey.draft')
const resultKey = (subjectId: string) =>
  accountScopedKey(subjectId, 'survey.result')

export function loadSurveyDraft(
  subjectId: string,
  storage: ExperienceStorage | null = defaultStorage(),
): SurveyDraft | null {
  return sanitizeSurveyDraft(readJson(storage, draftKey(subjectId)))
}

export function saveSurveyDraft(
  subjectId: string,
  draft: SurveyDraft,
  storage: ExperienceStorage | null = defaultStorage(),
): void {
  writeJson(storage, draftKey(subjectId), { v: 1, ...draft })
}

export function clearSurveyDraft(
  subjectId: string,
  storage: ExperienceStorage | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(draftKey(subjectId))
  } catch {
    // 지울 수 없으면 지울 데이터도 없다.
  }
}

export function saveSurveyResult(
  subjectId: string,
  result: SurveyResult,
  storage: ExperienceStorage | null = defaultStorage(),
): void {
  writeJson(storage, resultKey(subjectId), { v: 1, ...result })
}
