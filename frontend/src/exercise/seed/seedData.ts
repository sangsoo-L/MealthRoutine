import exerciseRoutineItems from './exercise_routine_items.json'
import exerciseRoutines from './exercise_routines.json'
import exercises from './exercises.json'
import { createSeedCatalog, type SeedCatalog } from './seedCatalog.ts'

/**
 * 운동 JSON 시드 원본(exercises·exercise_routines·exercise_routine_items)을 읽는 유일한 모듈. 다른 코드는 JSON을 직접 import하지 않고
 * 이 모듈의 getSeedCatalog()가 돌려주는 조회 계층(seedCatalog.ts)만 쓴다.
 *
 * 개발 서버에서만 동적 import 한다(exerciseSource.ts). 운영 빌드에는 이 모듈과 JSON이 들어가지 않는다.
 *
 * 처음 부를 때 한 번 검증하고 만든다. 원본이 올바르지 않으면 모듈을 불러오는 것이 아니라 호출이 던지므로(앱이 통째로 멈추지 않는다)
 * 호출한 화면은 오류 상태를 보여 주고, 개발 콘솔에는 원인(어느 파일·행·필드)을 한 번 남긴다. 실패도 한 번만 계산해 같은 오류를 돌려준다.
 */
let cached: { catalog: SeedCatalog } | { error: unknown } | null = null

export function getSeedCatalog(): SeedCatalog {
  if (cached === null) {
    try {
      cached = {
        catalog: createSeedCatalog({
          exercises,
          routines: exerciseRoutines,
          routineItems: exerciseRoutineItems,
        }),
      }
    } catch (error) {
      cached = { error }
      console.error('[운동 시드]', error)
    }
  }
  if ('error' in cached) throw cached.error
  return cached.catalog
}
