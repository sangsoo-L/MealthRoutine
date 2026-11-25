import {
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../../api/http.ts'
import type { ExerciseRepository } from '../exerciseRepository.ts'
import {
  BODY_PART_GROUPS,
  TOOLS,
  type ExerciseDifficulty,
  type ExerciseTool,
} from '../exerciseTaxonomy.ts'
import type { Exercise, ExerciseCategory } from '../exerciseTypes.ts'
import { filterExercises } from '../mock/filterExercises.ts'
import { validateRecordModes } from '../recordMode.ts'

/**
 * 운동 API(GET /api/v1/exercises, docs/api_exercise_v1.0.md "운동")를 ExerciseRepository로 보여 주는 저장소. 운영 빌드에서 쓴다(exerciseSource.ts).
 *
 * - 운동 카탈로그는 105개 정도의 공용 읽기 전용 데이터라, 처음 조회할 때 전체를 페이지(최대 100개)로 나눠 한 번 받아 메모리에 둔다.
 *   이후 list(조건)과 getById는 그 목록에서 찾는다. 필터 규칙은 개발용 시드와 같은 filterExercises다. 목록 순서는 서버 응답
 *   순서(운동 id 순)라 개발용 시드(파일 순서)와 다르다.
 * - 서버의 운동 행은 프론트 시드(exercises.json)와 같은 값을 쓴다(DB 시드가 그 파일에서 만들어진다, PR #34). 그 전의 DB 시드
 *   (영어 장비 값, 다른 id)로 채워진 서버에 붙으면 장비 값이 맞지 않아 조회 실패가 되므로, 서버에 새 DB 시드가 들어간 뒤에 배포한다. 그래서 변환 규칙도 시드 조회 계층
 *   (seed/seedCatalog.ts)과 같다. 시드 모듈은 운영 번들에 넣지 않으므로 필요한 값만 여기에 둔다.
 * - 응답은 외부 입력으로 본다. 모양이 맞지 않는 운동이 하나라도 있으면 목록 전체를 쓰지 않고 조회 실패로 끝낸다(시드와 같은 정책:
 *   문제 있는 운동만 빼거나 다른 값으로 바꾸지 않는다). 실패하면 캐시하지 않아 다음 조회가 다시 받는다.
 * - 비회원도 운동을 볼 수 있어 auth: 'optional'로 부른다.
 */

type Request = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const PAGE_SIZE = 100
/** 카탈로그 전체(현재 두 페이지)를 받는 시간 제한. */
const LOAD_TIMEOUT_MS = 15_000
/** 페이지 수 상한(운동 2000개). 서버가 이상한 totalPages를 보내도 요청이 끝없이 이어지지 않게 한다. */
const MAX_PAGES = 20

const DIFFICULTY_LABEL: Record<string, ExerciseDifficulty> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
}

/** 서버 장비 값 → 화면 도구. 시드 조회 계층과 같은 대응이다(`풀업바`는 화면 분류의 `풀업 바`와 띄어쓰기만 다르다). */
const EQUIPMENT_TOOL: Record<string, ExerciseTool> = {
  덤벨: '덤벨',
  맨몸: '맨몸',
  밴드: '밴드',
  폼롤러: '폼롤러',
  마사지볼: '마사지볼',
  풀업바: '풀업 바',
}

const HTTP_URL = /^https?:\/\/\S+$/i

export class ExerciseApiDataError extends Error {
  constructor(message: string) {
    super(`운동 API 응답이 올바르지 않습니다: ${message}`)
    this.name = 'ExerciseApiDataError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== ''

function categoryOf(part: string): ExerciseCategory | null {
  const group = BODY_PART_GROUPS.find((g) => g.parts.includes(part))
  return group ? (group.label as ExerciseCategory) : null
}

/** 서버 운동 한 건 → 화면 모델. 모양이 맞지 않으면 ExerciseApiDataError. */
export function toExercise(row: unknown): Exercise {
  if (!isRecord(row)) throw new ExerciseApiDataError('운동이 객체가 아님')
  const id = row.exerciseId
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    throw new ExerciseApiDataError('exerciseId')
  }
  const where = `exerciseId ${id}`
  if (!isText(row.name)) throw new ExerciseApiDataError(`${where}: name`)
  const difficulty =
    typeof row.difficulty === 'string'
      ? DIFFICULTY_LABEL[row.difficulty]
      : undefined
  if (!difficulty) throw new ExerciseApiDataError(`${where}: difficulty`)
  const category =
    typeof row.exerciseType === 'string' ? categoryOf(row.exerciseType) : null
  if (!category) throw new ExerciseApiDataError(`${where}: exerciseType`)
  const tool =
    typeof row.exerciseEquipment === 'string'
      ? EQUIPMENT_TOOL[row.exerciseEquipment]
      : undefined
  if (!tool || !TOOLS.includes(tool)) {
    throw new ExerciseApiDataError(`${where}: exerciseEquipment`)
  }
  for (const field of ['instructions', 'description', 'cautions'] as const) {
    if (row[field] !== null && typeof row[field] !== 'string') {
      throw new ExerciseApiDataError(`${where}: ${field}`)
    }
  }

  const exercise: Exercise = {
    id: String(id),
    name: row.name,
    category,
    targetMuscles: [row.exerciseType as string],
    difficulty,
    equipment: [tool],
    // 서버 값도 단계로 나뉘어 있지 않아 단계 목록은 비우고, 소개(instructions)·방법(description)을 각각 담는다(시드와 같은 방식).
    instructions: [],
    precautions: isText(row.cautions) ? [row.cautions] : [],
  }
  if (isText(row.instructions)) exercise.summary = row.instructions
  if (isText(row.description)) exercise.description = row.description
  if (typeof row.sourceUrl === 'string' && HTTP_URL.test(row.sourceUrl)) {
    exercise.sourceUrl = row.sourceUrl
  }
  // 기록 방식은 둘이 함께 올 때만 담는다. 서버는 값이 없거나 서로 맞지 않으면 둘 다 null로 보낸다.
  // 필드 자체가 없는 응답(기록 방식 컬럼을 추가하기 전 백엔드)도 null과 같게 본다(== null은 undefined도 포함).
  if (row.defaultRecordMode != null || row.allowedRecordModes != null) {
    const modes = validateRecordModes(
      row.defaultRecordMode,
      row.allowedRecordModes,
    )
    if (!modes.ok) throw new ExerciseApiDataError(`${where}: 기록 방식`)
    exercise.recordModes = Object.freeze({
      default: modes.value.default,
      allowed: Object.freeze([...modes.value.allowed]),
    })
  }
  return Object.freeze(exercise)
}

interface Page {
  content: readonly unknown[]
  totalElements: number
  totalPages: number
}

function toPage(data: unknown): Page {
  if (
    !isRecord(data) ||
    !Array.isArray(data.content) ||
    typeof data.totalElements !== 'number' ||
    !Number.isSafeInteger(data.totalElements) ||
    data.totalElements < 0 ||
    typeof data.totalPages !== 'number' ||
    !Number.isSafeInteger(data.totalPages) ||
    data.totalPages < 0
  ) {
    throw new ExerciseApiDataError('페이지 모양')
  }
  return {
    content: data.content,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
  }
}

interface Catalog {
  exercises: readonly Exercise[]
  byId: ReadonlyMap<string, Exercise>
}

async function loadCatalog(
  request: Request,
  timeoutMs: number,
): Promise<Catalog> {
  // 공통 코드(apiRequest)에는 시간 제한이 없다. 응답이 오지 않으면 모든 운동 화면이 계속 불러오는 중에 머무르므로,
  // 페이지 전체를 받는 데 시간 제한을 두고 넘으면 요청을 취소해 실패로 끝낸다(실패는 캐시하지 않아 다시 시도할 수 있다).
  const signal = AbortSignal.timeout(timeoutMs)
  const fetchPage = async (page: number) =>
    toPage(
      await request<unknown>(
        'GET',
        `/exercises?page=${page}&size=${PAGE_SIZE}`,
        { auth: 'optional', signal },
      ),
    )
  const first = await fetchPage(0)
  if (first.totalPages > MAX_PAGES) {
    throw new ExerciseApiDataError('페이지가 너무 많음')
  }
  const pages = [first]
  for (let page = 1; page < first.totalPages; page += 1) {
    pages.push(await fetchPage(page))
  }

  const exercises: Exercise[] = []
  const byId = new Map<string, Exercise>()
  for (const row of pages.flatMap((p) => p.content)) {
    const exercise = toExercise(row)
    // 페이지를 나눠 받는 사이 순서가 바뀌면 같은 운동이 두 번 올 수 있다. 같은 id는 하나만 둔다.
    if (byId.has(exercise.id)) continue
    byId.set(exercise.id, exercise)
    exercises.push(exercise)
  }
  // 빠진 운동이 있으면(받는 도중 순서가 바뀜) 일부만 보여 주지 않고 실패로 끝낸다. 다시 조회하면 새로 받는다.
  if (exercises.length !== first.totalElements) {
    throw new ExerciseApiDataError('받은 운동 수가 전체 개수와 다름')
  }
  return { exercises: Object.freeze(exercises), byId }
}

/**
 * 운동 API 저장소. 한 저장소 객체가 카탈로그를 한 번만 받아 둔다(exerciseSource.ts가 객체 하나를 계속 쓴다).
 * 동시에 여러 화면이 불러도 요청은 한 번이다. 실패하거나 시간 제한을 넘기면 저장한 요청을 지워 다음 조회가 다시 받는다.
 */
export function createApiExerciseRepository(
  request: Request = apiRequest,
  options: { timeoutMs?: number } = {},
): ExerciseRepository {
  const timeoutMs = options.timeoutMs ?? LOAD_TIMEOUT_MS
  let pending: Promise<Catalog> | null = null
  const catalog = (): Promise<Catalog> => {
    if (pending === null) {
      const attempt = loadCatalog(request, timeoutMs)
      pending = attempt
      attempt.catch(() => {
        if (pending === attempt) pending = null
      })
    }
    return pending
  }

  return {
    kind: 'api',

    async list(query) {
      return filterExercises((await catalog()).exercises, query)
    },

    async getById(id) {
      return (await catalog()).byId.get(id) ?? null
    },
  }
}
