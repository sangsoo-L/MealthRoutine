import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// W13 직접 검색의 난이도·운동 부위(그룹·다중 선택) 필터. 순수 함수와 화면 조각의 렌더링을 실제 시드 데이터로 검증한다
// (바텀시트 열기·적용·취소 같은 상호작용은 별도 브라우저 검증). 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Search
let SearchForm
let PartSelector
let Listbox
let Row
let Notices
let Draft
let catalog
let rows

const SEED = new URL('../src/exercise/seed/', import.meta.url)
const readSeed = (name) => JSON.parse(readFileSync(new URL(name, SEED), 'utf8'))
const norm = (text) => text.replace(/\s+/g, '').toLowerCase()
const none = { difficulty: null, parts: [] }

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Search = await server.ssrLoadModule('/src/exercise/exercisePickerSearch.ts')
  const load = async (name) =>
    server.ssrLoadModule(`/src/components/exercise/picker/${name}`)
  SearchForm = (await load('PickerSearchForm.tsx')).default
  PartSelector = (await load('PickerPartSelector.tsx')).default
  Listbox = (await load('PickerFilterListbox.tsx')).default
  Row = (await load('PickerRow.tsx')).default
  Notices = await load('PickerNotices.tsx')
  Draft = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  const { createSeedCatalog } = await server.ssrLoadModule(
    '/src/exercise/seed/seedCatalog.ts',
  )
  rows = readSeed('exercises.json')
  catalog = createSeedCatalog({
    exercises: rows,
    routines: readSeed('exercise_routines.json'),
    routineItems: readSeed('exercise_routine_items.json'),
  }).getAllExercises()
})
after(async () => {
  await server?.close()
})

const LABEL = { beginner: '초급', intermediate: '중급', advanced: '고급' }
/** 원본 행에서 독립적으로 센 기대값. */
const expected = ({ query = '', difficulty = null, parts = [] }) =>
  rows.filter(
    (row) =>
      (query === '' ||
        [
          row.name,
          row.exercise_type,
          row.exercise_equipment === '풀업바'
            ? '풀업 바'
            : row.exercise_equipment,
        ].some((v) => norm(v).includes(norm(query)))) &&
      (difficulty === null || LABEL[row.difficulty] === difficulty) &&
      (parts.length === 0 || parts.includes(row.exercise_type)),
  ).length
const count = (query, filters) =>
  Search.filterPickerExercises(catalog, query, filters).length
const crit = (query, difficulty = null, parts = []) => ({
  query,
  difficulty,
  parts,
})

// ─── 부위 그룹 ──────────────────────────────────────────────

test('그룹 순서: 상체 → 하체 → 코어 → 전신', () => {
  const groups = Search.groupedPickerParts(catalog)
  assert.deepEqual(
    groups.map((g) => g.label),
    ['상체', '하체', '코어', '전신'],
  )
})

test('그룹별 부위 구성(시드에 있는 부위만, 정의된 순서)', () => {
  const groups = Search.groupedPickerParts(catalog)
  assert.deepEqual(
    Object.fromEntries(groups.map((g) => [g.label, [...g.parts]])),
    {
      상체: ['등', '가슴', '어깨', '팔'],
      하체: ['엉덩이', '허벅지', '종아리'],
      코어: ['복부', '허리'],
      전신: ['유산소', '스트레칭'],
    },
  )
  const all = groups.flatMap((g) => g.parts)
  assert.equal(new Set(all).size, all.length)
  assert.deepEqual(new Set(all), new Set(rows.map((r) => r.exercise_type)))
})

test('그룹 선택지에 "분류 전체" 항목은 없다. 없는 부위를 만들어 채우지 않는다', () => {
  const groups = Search.groupedPickerParts(catalog)
  const labels = new Set(groups.map((g) => g.label))
  for (const group of groups) {
    assert.ok(group.parts.every((p) => !labels.has(p) && !p.includes('전체')))
  }
  const onlyBackAndLegs = catalog.filter((e) =>
    ['등', '허벅지'].some((p) => e.targetMuscles.includes(p)),
  )
  assert.deepEqual(
    Search.groupedPickerParts(onlyBackAndLegs).map((g) => [
      g.label,
      [...g.parts],
    ]),
    [
      ['상체', ['등']],
      ['하체', ['허벅지']],
    ],
  )
  assert.deepEqual(Search.groupedPickerParts([]), [])
})

// ─── 전체·다중 선택 정책 ────────────────────────────────────

test('초기 상태는 전체(빈 선택), "전체"는 부위 값으로 저장하지 않는다', () => {
  assert.deepEqual(Search.EMPTY_PICKER_FILTERS.parts, [])
  assert.deepEqual(Search.EMPTY_PICKER_CRITERIA.parts, [])
  assert.equal(Search.formatPickerParts([]), '전체')
  assert.ok(!Search.availablePickerParts(catalog).includes('전체'))
})

test('개별 부위 선택·추가·해제, 마지막 해제 시 전체 복귀', () => {
  let sel = []
  sel = Search.togglePickerPart(sel, '어깨')
  assert.deepEqual(sel, ['어깨'])
  sel = Search.togglePickerPart(sel, '등')
  assert.deepEqual(
    sel,
    ['등', '어깨'],
    '추가 선택은 기존 선택 유지, 분류 순서로 정리',
  )
  sel = Search.togglePickerPart(sel, '스트레칭')
  assert.deepEqual(sel, ['등', '어깨', '스트레칭'])
  sel = Search.togglePickerPart(sel, '어깨')
  assert.deepEqual(
    sel,
    ['등', '스트레칭'],
    '선택한 부위를 다시 누르면 그 부위만 해제',
  )
  sel = Search.togglePickerPart(sel, '등')
  sel = Search.togglePickerPart(sel, '스트레칭')
  assert.deepEqual(sel, [], '마지막 부위를 해제하면 전체')
  const base = Object.freeze(['등'])
  assert.deepEqual(Search.togglePickerPart(base, '팔'), ['등', '팔'])
  assert.deepEqual(base, ['등'], '입력을 바꾸지 않는다')
})

test('전체를 고르면 개별 선택이 모두 풀리고(빈 배열) 개별 선택은 전체를 푼다', () => {
  assert.equal(Search.formatPickerParts([]), '전체')
  assert.notEqual(
    Search.formatPickerParts(Search.togglePickerPart([], '등')),
    '전체',
  )
})

test('선택값 요약 표시: 전체 / 1개 / 2개 / 3개 이상', () => {
  assert.equal(Search.formatPickerParts([]), '전체')
  assert.equal(Search.formatPickerParts(['등']), '등')
  assert.equal(Search.formatPickerParts(['등', '어깨']), '등, 어깨')
  assert.equal(Search.formatPickerParts(['등', '어깨', '팔']), '등 외 2개')
  assert.equal(
    Search.formatPickerParts(['스트레칭', '등', '허리', '팔']),
    '등 외 3개',
  )
  assert.equal(
    Search.formatPickerParts(['어깨', '등']),
    '등, 어깨',
    '정의 순서',
  )
  assert.equal(
    Search.formatPickerParts(['스트레칭', '유산소']),
    '유산소, 스트레칭',
  )
  assert.equal(
    Search.formatPickerParts(['스트레칭', '등', '가슴']),
    '등 외 2개',
  )
})

// ─── 검색 필터 ──────────────────────────────────────────────

test('초기 조건(검색어 없음·전체·전체)은 시드 전체', () => {
  assert.equal(count('', Search.EMPTY_PICKER_FILTERS), 105)
})

test('난이도 필터: 초급·중급·고급', () => {
  for (const difficulty of ['초급', '중급', '고급']) {
    const items = Search.filterPickerExercises(catalog, '', {
      ...none,
      difficulty,
    })
    assert.equal(items.length, expected({ difficulty }), difficulty)
    assert.ok(items.every((e) => e.difficulty === difficulty))
  }
  assert.deepEqual(
    ['초급', '중급', '고급'].map((d) => count('', { ...none, difficulty: d })),
    [59, 36, 10],
  )
})

test('부위 한 개 필터: 시드의 모든 부위, exercise_type 기준', () => {
  let total = 0
  for (const part of Search.availablePickerParts(catalog)) {
    const n = count('', { ...none, parts: [part] })
    assert.equal(n, expected({ parts: [part] }), part)
    total += n
  }
  assert.equal(total, 105, '모든 운동은 정확히 한 부위에 속한다')
  assert.equal(
    count('', { ...none, parts: ['상체'] }),
    0,
    '큰 분류는 부위가 아니다',
  )
})

test('부위 OR 검색: 등 또는 어깨, 그 외 부위만의 운동은 제외', () => {
  const items = Search.filterPickerExercises(catalog, '', {
    ...none,
    parts: ['등', '어깨'],
  })
  assert.equal(items.length, expected({ parts: ['등', '어깨'] }))
  assert.equal(items.length, 15 + 10)
  assert.ok(items.every((e) => ['등', '어깨'].includes(e.targetMuscles[0])))
  assert.ok(items.some((e) => e.targetMuscles[0] === '등'))
  assert.ok(items.some((e) => e.targetMuscles[0] === '어깨'))
  assert.ok(!items.some((e) => e.targetMuscles[0] === '가슴'))
  assert.equal(
    count('', { ...none, parts: ['등', '어깨', '스트레칭'] }),
    15 + 10 + 9,
  )
  // 여러 부위가 지정된 운동은 하나라도 맞으면 포함한다
  const multi = [
    { ...catalog[0], id: 'm1', targetMuscles: ['가슴', '어깨'] },
    { ...catalog[1], id: 'm2', targetMuscles: ['등'] },
    { ...catalog[2], id: 'm3', targetMuscles: ['허리'] },
  ]
  const hit = Search.filterPickerExercises(multi, '', {
    difficulty: null,
    parts: ['어깨', '허리'],
  })
  assert.deepEqual(
    hit.map((e) => e.id),
    ['m1', 'm3'],
  )
})

test('검색어만: 이름·부위·도구 일치', () => {
  assert.equal(
    count('푸시업', Search.EMPTY_PICKER_FILTERS),
    expected({ query: '푸시업' }),
  )
  assert.equal(
    count('덤벨', Search.EMPTY_PICKER_FILTERS),
    expected({ query: '덤벨' }),
  )
})

test('검색어 AND 난이도 AND (부위 OR) 조합', () => {
  const cases = [
    { query: '덤벨', difficulty: '초급', parts: ['등', '어깨'] },
    { query: '덤벨', difficulty: '중급', parts: [] },
    { query: '', difficulty: '초급', parts: ['어깨', '팔'] },
    { query: '덤벨', difficulty: null, parts: ['등'] },
    { query: '푸시업', difficulty: '초급', parts: ['가슴', '어깨'] },
  ]
  for (const c of cases) {
    const items = Search.filterPickerExercises(catalog, c.query, {
      difficulty: c.difficulty,
      parts: c.parts,
    })
    assert.equal(items.length, expected(c), JSON.stringify(c))
    assert.ok(
      items.every(
        (e) =>
          (c.difficulty === null || e.difficulty === c.difficulty) &&
          (c.parts.length === 0 ||
            e.targetMuscles.some((m) => c.parts.includes(m))),
      ),
    )
  }
  const sample = Search.filterPickerExercises(catalog, '덤벨', {
    difficulty: '초급',
    parts: ['등', '어깨'],
  })
  assert.ok(sample.length > 0)
  assert.ok(
    sample.every(
      (e) => e.equipment.includes('덤벨') || e.name.includes('덤벨'),
    ),
  )
})

test('결과 없음', () => {
  assert.equal(count('없는운동이름', Search.EMPTY_PICKER_FILTERS), 0)
  assert.equal(count('덤벨', { difficulty: '고급', parts: ['스트레칭'] }), 0)
})

test('필터는 목록을 거를 뿐 운동 값(id·이름)을 바꾸지 않고 순서를 유지한다', () => {
  const items = Search.filterPickerExercises(catalog, '', {
    difficulty: '초급',
    parts: ['등', '팔'],
  })
  for (const e of items)
    assert.equal(
      e,
      catalog.find((c) => c.id === e.id),
      '같은 객체',
    )
  const order = items.map((e) => catalog.indexOf(e))
  assert.deepEqual(
    order,
    [...order].sort((x, y) => x - y),
  )
})

test('필터로 고른 운동의 W02 전달: id 보존, 중복 등록 방지', () => {
  const first = Search.filterPickerExercises(catalog, '', {
    difficulty: '초급',
    parts: ['등'],
  })
  const second = Search.filterPickerExercises(catalog, '', {
    difficulty: '초급',
    parts: ['어깨', '팔'],
  })
  const picked = [first[0], second[0]]
  const ids = picked.map((e) => e.id)
  const draft = { v: 1, day: 'today', updatedAt: 'x', items: [] }
  const added = Draft.addExercisesToDraft(draft, picked, () => 'now')
  assert.deepEqual(
    added.items.map((i) => i.exerciseId),
    ids,
  )
  const again = Draft.addExercisesToDraft(
    added,
    [picked[0], catalog.find((e) => e.id === ids[1])],
    () => 'now',
  )
  assert.equal(again, added, '추가할 것이 없으면 같은 초안')
  assert.equal(again.items.length, 2)
})

test('운동 선택은 부위 조건과 무관한 id 집합이다(부위를 바꿔도 이미 고른 운동은 그대로)', () => {
  const selectedIds = Object.freeze(['5', '2'])
  for (const parts of [[], ['가슴'], ['등', '어깨'], ['스트레칭']]) {
    Search.filterPickerExercises(catalog, '', { difficulty: null, parts })
    assert.deepEqual([...selectedIds], ['5', '2'])
  }
  const visible = Search.filterPickerExercises(catalog, '', {
    difficulty: null,
    parts: ['스트레칭'],
  })
  assert.ok(
    !visible.some((e) => selectedIds.includes(e.id)),
    '보이지 않아도 선택 id로는 남는다',
  )
})

// ─── 검색 조건(입력 중 / 적용) ──────────────────────────────

test('검색 조건 비교: 검색어 공백 무시, 부위는 선택한 순서와 무관', () => {
  assert.equal(Search.samePickerCriteria(crit('덤벨'), crit(' 덤벨 ')), true)
  assert.equal(
    Search.samePickerCriteria(crit('덤벨'), crit('덤벨', '초급')),
    false,
  )
  assert.equal(
    Search.samePickerCriteria(
      crit('', null, ['어깨', '등']),
      crit('', null, ['등', '어깨']),
    ),
    true,
  )
  assert.equal(
    Search.samePickerCriteria(
      crit('', null, ['등']),
      crit('', null, ['등', '어깨']),
    ),
    false,
  )
  assert.equal(
    Search.samePickerCriteria(crit(''), Search.EMPTY_PICKER_CRITERIA),
    true,
  )
})

test('처음 상태 판정과 초기화 후 전체 복귀', () => {
  assert.equal(
    Search.isDefaultPickerCriteria(Search.EMPTY_PICKER_CRITERIA),
    true,
  )
  assert.equal(Search.isDefaultPickerCriteria(crit('  ')), true)
  assert.equal(Search.isDefaultPickerCriteria(crit('a')), false)
  assert.equal(Search.isDefaultPickerCriteria(crit('', '초급')), false)
  assert.equal(Search.isDefaultPickerCriteria(crit('', null, ['등'])), false)
  assert.equal(
    Search.formatPickerParts(Search.EMPTY_PICKER_CRITERIA.parts),
    '전체',
  )
})

test('조건 요약: 있는 조건만, 부위는 선택한 것을 모두, 없으면 전체 운동', () => {
  assert.deepEqual(Search.pickerCriteriaSummary(crit('')), ['전체 운동'])
  assert.deepEqual(Search.pickerCriteriaSummary(crit('덤벨', '초급')), [
    '검색어: 덤벨',
    '난이도: 초급',
  ])
  assert.deepEqual(
    Search.pickerCriteriaSummary(crit('', '중급', ['어깨', '등'])),
    ['난이도: 중급', '운동 부위: 등, 어깨'],
  )
})

test('조건으로 검색: 전체·검색어만·난이도만·부위 여러 개·세 조건', () => {
  const run = (c) => Search.searchByCriteria(catalog, c).length
  assert.equal(run(Search.EMPTY_PICKER_CRITERIA), 105)
  assert.equal(run(crit('푸시업')), expected({ query: '푸시업' }))
  assert.equal(run(crit('', '초급')), expected({ difficulty: '초급' }))
  assert.equal(
    run(crit('', null, ['등', '가슴'])),
    expected({ parts: ['등', '가슴'] }),
  )
  assert.equal(
    run(crit('덤벨', '중급', ['등', '어깨'])),
    expected({ query: '덤벨', difficulty: '중급', parts: ['등', '어깨'] }),
  )
  assert.equal(run(crit('없는운동zzz')), 0)
})

test('검색 전·후 상태 전환: 부위 확정은 입력 조건만 바꿔 이전 결과를 무효화한다', () => {
  const visible = (draft, applied) =>
    applied !== null && Search.samePickerCriteria(draft, applied)
  const applied = crit('덤벨', '초급', ['등'])
  assert.equal(
    visible(crit('덤벨', '초급', ['등']), applied),
    true,
    '검색 직후',
  )
  assert.equal(
    visible(crit('덤벨', '초급', ['등', '어깨']), applied),
    false,
    '부위를 바꾸면 숨김',
  )
  assert.equal(
    visible(crit('덤벨', '초급', []), applied),
    false,
    '전체로 바꿔도 숨김',
  )
  assert.equal(
    visible(Search.EMPTY_PICKER_CRITERIA, null),
    false,
    '초기화 후 숨김',
  )
})

// ─── 화면 조각 렌더링 ───────────────────────────────────────

const noop = () => {}
const renderForm = (criteria, canReset = false) =>
  renderToStaticMarkup(
    createElement(SearchForm, {
      criteria,
      partGroups: Search.groupedPickerParts(catalog),
      canReset,
      onQuery: noop,
      onDifficulty: noop,
      onParts: noop,
      onSubmit: noop,
      onReset: noop,
    }),
  )
const renderSelector = (value) =>
  renderToStaticMarkup(
    createElement(PartSelector, {
      groups: Search.groupedPickerParts(catalog),
      value,
      onApply: noop,
    }),
  )

test('부위 선택(바텀시트 본문): 전체 + 상체·하체·코어·전신 순서의 칩, 분류 전체 버튼 없음', () => {
  const html = renderSelector([])
  const titles = [
    ...html.matchAll(/id="picker-part-group-\d+"[^>]*>([^<]+)</g),
  ].map((m) => m[1])
  assert.deepEqual(titles, ['상체', '하체', '코어', '전신'])
  assert.doesNotMatch(html, /상체 전체|하체 전체|코어 전체|전신 전체/)
  const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(
    (m) =>
      m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/^✓/, '')
        .trim(),
  )
  assert.deepEqual(buttons, [
    '전체',
    '등',
    '가슴',
    '어깨',
    '팔',
    '엉덩이',
    '허벅지',
    '종아리',
    '복부',
    '허리',
    '유산소',
    '스트레칭',
    '적용하기',
  ])
  assert.ok(!buttons.includes('상체') && !buttons.includes('하체'))
  assert.equal((html.match(/role="group"/g) ?? []).length, 4)
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?전체/)
})

test('부위 선택: 선택 상태는 aria-pressed와 ✓ 표시로 전하고, 선택이 있으면 전체는 해제된다', () => {
  const html = renderSelector(['등', '어깨'])
  const pressed = (name) =>
    new RegExp(
      `aria-pressed="true"[^>]*>(?:<span[^>]*>✓</span>)?${name}</button>`,
    ).test(html)
  assert.ok(pressed('등') && pressed('어깨'))
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2)
  assert.match(html, /aria-pressed="false"[^>]*>전체</)
  assert.equal((html.match(/✓/g) ?? []).length, 2)
  assert.match(html, /data-autofocus=""[^>]*>(?:<span[^>]*>✓<\/span>)?등</)
})

test('검색 영역: 부위 행은 전체/선택값 요약을 보이고 난이도는 단일 선택 그대로', () => {
  const base = renderForm(Search.EMPTY_PICKER_CRITERIA)
  assert.match(base, /<form[^>]*role="search"/)
  assert.match(base, /<label[^>]*for="picker-query"/)
  assert.equal((base.match(/aria-haspopup="dialog"/g) ?? []).length, 2)
  assert.equal((base.match(/>전체<\/span>/g) ?? []).length, 2)
  assert.match(base, /<button[^>]*type="submit"[^>]*>검색하기<\/button>/)
  assert.doesNotMatch(base, /조건 초기화/)
  assert.doesNotMatch(base, /<select/)
  assert.match(
    renderForm(crit('', null, ['등'])),
    /font-semibold text-exercise[^>]*>등</,
  )
  const two = renderForm(crit('', '초급', ['등', '어깨']), true)
  assert.match(two, />등, 어깨</)
  assert.match(two, />초급</)
  assert.match(two, /조건 초기화/)
  const three = renderForm(crit('', null, ['등', '어깨', '팔']))
  assert.match(three, />등 외 2개</)
  assert.match(three, /break-keep wrap-anywhere/)
  assert.match(three, /min-w-0/)
})

test('난이도 선택지(listbox): 전체 + 3단계, 선택 상태', () => {
  const html = renderToStaticMarkup(
    createElement(Listbox, {
      label: '난이도',
      options: ['초급', '중급', '고급'],
      value: '중급',
      onSelect: noop,
    }),
  )
  assert.match(html, /role="listbox"[^>]*aria-label="난이도"/)
  assert.equal((html.match(/role="option"/g) ?? []).length, 4)
  assert.match(html, /aria-selected="true"[^>]*>중급</)
  assert.equal((html.match(/tabindex="0"/g) ?? []).length, 1)
})

test('검색 전 안내 문구', () => {
  const html = renderToStaticMarkup(createElement(Notices.PickerSearchGuide))
  assert.match(html, /어떤 운동을 찾고 계신가요\?/)
  assert.match(
    html,
    /운동명이나 난이도, 운동 부위를 선택해 원하는 운동을 찾아보세요\./,
  )
})

const star = {
  label: '즐겨찾기에 추가: 푸시업',
  favorite: false,
  waiting: false,
  failed: false,
  onClick: noop,
}
const renderRow = (exercise, selected, variant) =>
  renderToStaticMarkup(
    createElement(
      'ul',
      null,
      createElement(Row, {
        exercise,
        selected,
        onToggleSelect: noop,
        star,
        variant,
      }),
    ),
  )

test('검색 결과 카드: 선택·즐겨찾기는 별개의 버튼이고 선택 상태가 드러난다', () => {
  const exercise = catalog.find((e) => e.name === '푸시업')
  const off = renderRow(exercise, false, 'search')
  assert.match(off, /aria-pressed="false"/)
  assert.equal((off.match(/<button/g) ?? []).length, 2)
  const on = renderRow(exercise, true, 'search')
  assert.match(on, /aria-pressed="true"/)
  assert.match(on, /border-exercise bg-exercise-soft/)
  assert.match(renderRow(exercise, true, undefined), /✓ 선택됨/)
})
