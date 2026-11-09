import { useState } from 'react'

/**
 * 최근 검색어. 서버에 보내지 않고 이 브라우저의 localStorage에만 둔다(MVP).
 *
 * - 저장 범위: 로그인한 계정은 계정 id별, 비로그인은 'guest' 키 하나. 서로 섞이지 않는다.
 *   (로그아웃해도 그 계정의 기록은 이 브라우저에 남는다. 공용 기기 정책은 미확정이다.)
 * - 보존: 최대 MAX_RECENT개, 같은 검색어는 맨 앞으로 옮긴다. 기간 만료는 두지 않는다(보존 기간 정책 미확정).
 * - 사용자가 직접 실행한 검색어만 저장한다. 개별·전체 삭제를 제공한다.
 * 저장소를 쓸 수 없으면(차단·가득 참) 이 세션 동안만 메모리에 유지된다.
 */
const MAX_RECENT = 10
const KEY_PREFIX = 'mealthroutine.recentSearches.'

function storageKey(scope: string): string {
  return `${KEY_PREFIX}${scope}`
}

function load(scope: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim().slice(0, 50))
              .filter((item) => item !== ''),
          ),
        ].slice(0, MAX_RECENT)
      : []
  } catch {
    return []
  }
}

function save(scope: string, items: string[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(storageKey(scope))
    else localStorage.setItem(storageKey(scope), JSON.stringify(items))
  } catch {
    // 저장소를 쓸 수 없어도 화면 상태는 유지된다.
  }
}

export interface RecentSearches {
  items: readonly string[]
  add(query: string): void
  remove(query: string): void
  clear(): void
}

/** scope(계정 id 또는 'guest')가 바뀌면 그 범위의 기록을 다시 읽는다. */
export function useRecentSearches(scope: string): RecentSearches {
  const [state, setState] = useState(() => ({ scope, items: load(scope) }))
  // 렌더 중 파생 상태 갱신: 계정이 바뀐 이번 렌더에서 곧바로 해당 계정의 기록으로 바꾼다.
  const items = state.scope === scope ? state.items : load(scope)
  if (state.scope !== scope) setState({ scope, items })

  function update(next: string[]) {
    save(scope, next)
    setState({ scope, items: next })
  }

  return {
    items,
    add: (query) => {
      const trimmed = query.trim()
      if (!trimmed) return
      update(
        [trimmed, ...items.filter((item) => item !== trimmed)].slice(
          0,
          MAX_RECENT,
        ),
      )
    },
    remove: (query) => update(items.filter((item) => item !== query)),
    clear: () => update([]),
  }
}
