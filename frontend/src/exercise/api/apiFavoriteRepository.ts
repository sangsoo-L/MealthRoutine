import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../../api/http.ts'
import {
  FavoriteSaveError,
  type ExerciseFavoriteRepository,
} from '../favoriteRepository.ts'

/**
 * 운동 즐겨찾기 API(GET·PUT·DELETE /api/v1/users/me/favorite-exercises[/{exerciseId}], docs/api_exercise_v1.0.md "즐겨찾기")를
 * ExerciseFavoriteRepository로 보여 주는 저장소. 운영 빌드에서 쓴다(favoriteSource.ts).
 *
 * - 서버가 로그인 토큰으로 회원을 정하므로 요청에 회원 id를 넣지 않는다. 토큰은 공통 코드(apiRequest)가 붙인다.
 * - 목록 응답은 운동 객체 목록이며 여기서는 id만 뽑는다(운동 정보는 운동 저장소가 맡는다). 서버는 최근에 등록한 순서로 주고
 *   인터페이스는 등록한 순서를 약속하므로 뒤집어서 돌려준다. 모양이 맞지 않으면 조회 실패다.
 * - 등록·해제는 서버도 멱등이다. 서버에 없는 운동이면(404 EXERCISE_NOT_FOUND) 'invalid', 그 밖의 실패는 'failed'다.
 *   네트워크 오류·500은 공통 코드가 다시 보내지 않으므로 화면이 다시 시도하게 한다.
 * - 요청마다 시간 상한(15초)을 둔다. 서버가 답하지 않아도 조회는 실패(화면의 다시 시도)로, 등록·해제는 'failed'로 끝나서
 *   로딩이나 버튼 잠금이 풀린다. 상한을 넘긴 등록·해제가 서버에서는 처리됐을 수 있지만, 서버도 멱등이라 다시 눌러도 되고
 *   다음 조회에서 서버 값으로 맞춰진다.
 */

type Request = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const BASE = '/users/me/favorite-exercises'
/** 운동 id는 서버의 양의 정수 id를 문자열로 바꾼 값이다. 그 밖의 값은 요청하지 않는다(경로에 그대로 들어가므로). */
const EXERCISE_ID = /^[1-9][0-9]{0,15}$/
/** 요청 하나의 시간 상한. 운동 목록(apiExerciseRepository)과 같다. */
const REQUEST_TIMEOUT_MS = 15_000

export function createApiFavoriteRepository(
  request: Request = apiRequest,
  options: { timeoutMs?: number } = {},
): ExerciseFavoriteRepository {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS

  async function change(method: 'PUT' | 'DELETE', exerciseId: string) {
    if (!EXERCISE_ID.test(exerciseId)) throw new FavoriteSaveError('invalid')
    try {
      await request(method, `${BASE}/${exerciseId}`, {
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.errorCode === 'EXERCISE_NOT_FOUND'
      ) {
        throw new FavoriteSaveError('invalid')
      }
      throw new FavoriteSaveError('failed')
    }
  }

  return {
    kind: 'api',

    async list() {
      const data = await request<unknown>('GET', BASE, {
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!Array.isArray(data)) {
        throw new Error('운동 즐겨찾기 응답이 목록이 아닙니다')
      }
      const ids: string[] = []
      for (const row of data) {
        const id =
          typeof row === 'object' && row !== null
            ? (row as { exerciseId?: unknown }).exerciseId
            : undefined
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
          throw new Error('운동 즐겨찾기 응답의 exerciseId가 올바르지 않습니다')
        }
        ids.push(String(id))
      }
      // 최근 등록 순 → 등록한 순. 중복은 앞의 것(먼저 등록한 것)만 둔다.
      return [...new Set(ids.reverse())]
    },

    add: (exerciseId) => change('PUT', exerciseId),

    remove: (exerciseId) => change('DELETE', exerciseId),
  }
}
