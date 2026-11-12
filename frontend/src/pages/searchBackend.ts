import { EMPTY_FILTERS } from '../exercise/exerciseFilters.ts'
import { exerciseBackend } from './exerciseSearch.ts'
import type { SearchBackend } from './searchTypes.ts'

/**
 * 통합검색의 검색 연결. 운동은 운동 탐색(E01)이 쓰는 `exerciseBackend`(→ `ExerciseRepository`)를 그대로 재사용한다.
 * 운동 데이터를 따로 만들거나 복사하지 않으므로 운동 id·이름 검색 규칙(부분 일치, 공백 무시)·개발/운영 분기가 E01과 같다.
 *
 * - 운동 범위(전체·운동): 검색어만으로 운동을 찾는다(필터 없음). 개발 서버에서는 Mock 운동 15종, 운영 빌드에서는 운동 데이터 소스가
 *   없어서 `exerciseBackend`가 "미연결"을 돌려준다(가짜 결과를 만들지 않는다). 조회가 실패하면 오류다.
 * - 음식 범위: 음식 검색 데이터·저장소가 아직 없다(음식 탐색 F01은 미구현). 어느 환경에서도 "미연결"이다.
 * - 전체 범위: 운동은 검색하지만 음식은 검색하지 못한다. 그래서 음식 목록이 비어 있어도 "음식 결과 0건"이 아니라 `unavailable: ['food']`로
 *   표시해 화면이 "음식 검색은 준비 중"이라고 따로 안내한다.
 *
 * 통합검색 전용 API는 API 명세서에 없다(`GET /api/v1/exercises`, `GET /api/v1/foods`만 있고 요청·응답 구조는 미정의). 실제 API가
 * 정해지면 `exerciseBackend`와 음식 검색 쪽을 실제 구현으로 교체하고, 이 객체는 두 결과를 합치는 일만 한다.
 */
export const searchBackend: SearchBackend = {
  async search(query, category) {
    if (category === 'food') return { status: 'unavailable' }

    const outcome = await exerciseBackend.search({
      query,
      filters: EMPTY_FILTERS,
    })
    // 운동 데이터가 연결되지 않았거나 조회에 실패했으면 그대로 돌려준다(결과 없음으로 바꾸지 않는다).
    if (outcome.status !== 'results') return outcome

    return {
      status: 'results',
      exercises: outcome.items,
      foods: [],
      ...(category === 'all' ? { unavailable: ['food' as const] } : {}),
    }
  },
}
