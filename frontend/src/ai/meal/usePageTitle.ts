import { useEffect } from 'react'

/**
 * 이 화면이 보이는 동안 문서 제목(document.title)을 정하고, 떠나면 이전 제목으로 되돌린다.
 * 라우트별 문서 제목은 아직 공통으로 관리하지 않아서(공통 정책) 이 흐름의 4개 화면만 직접 정한다.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · 밀스루틴`
    return () => {
      document.title = previous
    }
  }, [title])
}
