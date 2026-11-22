import { isValidIsoDate } from './weightDate.ts'

/**
 * 홈 몸무게 확인 카드의 "나중에 하기". 서울 기준 그날(today)에만 카드를 숨긴다. 다음 날 홈에 들어오면 조건을 다시 평가한다.
 *
 * - 사용자별 키(`mealthroutine.weightCard.dismissed.<사용자 id>`)에 날짜만 저장한다. 몸무게·기록 내용은 담지 않는다.
 *   로그인·로그아웃으로 지워지지 않아 같은 날 다시 로그인해도 숨김이 이어진다. 다른 계정의 키는 읽지 않는다.
 * - 이것은 기록 완료도, 알림 읽음도 아니다. 마지막 기록일·다음 확인일·이력은 바꾸지 않는다.
 * - 저장소를 쓸 수 없을 때만 메모리에 둔다(그 경우 새로고침하면 다시 보일 수 있다).
 */
export interface WeightCardDismissal {
  /** 숨긴 날(서울 기준 'YYYY-MM-DD') */
  date: string
}

export interface DismissalStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const memory = new Map<string, WeightCardDismissal>()
const keyOf = (userId: string) => `mealthroutine.weightCard.dismissed.${userId}`

function defaultStorage(): DismissalStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 저장된 숨김 기록. 없거나 형식이 맞지 않으면 null(없는 것으로 본다). */
export function readWeightCardDismissal(
  userId: string,
  storage: DismissalStorage | null = defaultStorage(),
): WeightCardDismissal | null {
  try {
    const raw = storage?.getItem(keyOf(userId))
    if (raw === null || raw === undefined) return memory.get(userId) ?? null
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<string, unknown>).v === 1 &&
      isValidIsoDate((value as Record<string, unknown>).date)
    )
      return { date: (value as { date: string }).date }
  } catch {
    // 읽을 수 없으면 숨기지 않는다.
  }
  return memory.get(userId) ?? null
}

/** 오늘(서울) 이미 "나중에 하기"를 눌렀는가. 다른 날의 기록은 숨기지 않는다. */
export function isWeightCardDismissed(
  record: WeightCardDismissal | null,
  today: string,
): boolean {
  return record !== null && record.date === today
}

export function markWeightCardDismissed(
  userId: string,
  today: string,
  storage: DismissalStorage | null = defaultStorage(),
): WeightCardDismissal {
  const record = { date: today }
  try {
    if (!storage) throw new Error('unavailable')
    storage.setItem(keyOf(userId), JSON.stringify({ v: 1, ...record }))
    memory.delete(userId)
  } catch {
    memory.set(userId, record)
  }
  return record
}
