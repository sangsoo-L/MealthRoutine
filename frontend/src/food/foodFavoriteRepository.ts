/**
 * 음식 즐겨찾기(회원 전용, 계정별)의 데이터 경계. 음식 객체를 복사해 두지 않고 음식 id만 다룬다(음식 정보는 FoodRepository가 맡는다).
 * 실제 API는 아직 없다. 등록·해제는 멱등이다(이미 등록돼 있어도, 등록돼 있지 않아도 성공). 변경이 거절되면 FavoriteSaveError를 던진다.
 * 운동 즐겨찾기 저장소(exercise/favoriteRepository.ts)와 데이터·키가 완전히 따로다.
 */
export interface FoodFavoriteRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock'
  /** 이 계정이 즐겨찾기한 음식 id 목록(중복 없음, 등록한 순서). 조회가 실패하면 예외를 던진다. */
  list(): Promise<readonly string[]>
  add(foodId: string): Promise<void>
  remove(foodId: string): Promise<void>
}
