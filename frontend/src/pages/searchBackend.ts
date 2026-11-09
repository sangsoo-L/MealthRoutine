import type { SearchBackend } from './searchTypes.ts'

/**
 * 현재 검색 연결. 운동·음식 검색 API와 데이터가 없어서 항상 "데이터 소스 미연결"을 돌려준다.
 * 가짜 결과를 만들지 않고, 결과 없음·오류로도 처리하지 않는다. 실제 검색이 연결되면 이 객체를 교체한다.
 */
export const searchBackend: SearchBackend = {
  search: () => Promise.resolve({ status: 'unavailable' }),
}
