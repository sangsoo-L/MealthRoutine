/** 즐겨찾기 변경이 거절된 이유 */
export type FavoriteSaveErrorReason = 'invalid' | 'failed'

export class FavoriteSaveError extends Error {
  readonly reason: FavoriteSaveErrorReason

  constructor(reason: FavoriteSaveErrorReason) {
    super(`exercise favorite change rejected: ${reason}`)
    this.name = 'FavoriteSaveError'
    this.reason = reason
  }
}

/**
 * 운동 즐겨찾기(회원 전용, 계정별)의 데이터 경계. 운동 상세(E02)가 이 인터페이스만 안다.
 * 이후 마이페이지 즐겨찾기(P07)·운동 목록 구성의 즐겨찾기 탭(W13)·운동 대시보드가 같은 인터페이스로 목록을 읽고 해제한다.
 *
 * 운동 객체를 복사해 두지 않고 운동 id(Exercise.id)만 다룬다. 운동의 이름·부위 같은 값은 운동 저장소(ExerciseRepository.getById)가 맡는다.
 * 그래서 즐겨찾기 저장소와 운동 저장소의 책임이 겹치지 않고, 운동 정보가 바뀌어도 즐겨찾기에 낡은 사본이 남지 않는다.
 *
 * 실제 API(GET·PUT·DELETE /api/v1/users/me/favorite-exercises[/{exerciseId}])는 아직 없고, 목록 응답이 운동 객체 목록이라는 점 외에
 * 요청·응답 구조가 명세서에 정의되지 않았다(frontend/docs/api_exercise_v1.0.md, api-status.md). 연동할 때는 이 인터페이스를 구현한
 * 객체가 응답에서 id만 뽑아 돌려주면 화면은 그대로 쓴다. 명세는 PUT·DELETE를 멱등으로 둔다(이미 등록돼 있어도, 등록돼 있지 않아도 성공).
 * 개발 환경의 Mock 구현(mock/mockFavoriteRepository.ts)과 나중에 만들 API 구현을 이 인터페이스로 교체한다.
 */
export interface ExerciseFavoriteRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /** 이 계정이 즐겨찾기한 운동 id 목록(중복 없음, 등록한 순서). 조회가 실패하면 예외를 던진다. */
  list(): Promise<readonly string[]>

  /** 즐겨찾기에 등록한다. 이미 등록돼 있으면 아무것도 바꾸지 않고 성공한다(멱등). 실패하면 FavoriteSaveError를 던지고 아무것도 바뀌지 않는다. */
  add(exerciseId: string): Promise<void>

  /** 즐겨찾기에서 해제한다. 등록돼 있지 않아도 성공한다(멱등). 실패하면 FavoriteSaveError를 던지고 아무것도 바뀌지 않는다. */
  remove(exerciseId: string): Promise<void>
}
