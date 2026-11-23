import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 운동·식단 대시보드 UI/UX 개선에서 추가한 순수 함수와 연결 구조 검사. 새 패키지·저장소를 사용하지 않는다.
let server
let ReturnTo
let RecordsTab
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  ReturnTo = await server.ssrLoadModule('/src/auth/returnTo.ts')
  RecordsTab = await server.ssrLoadModule('/src/app/recordsTab.ts')
})
after(async () => {
  await server?.close()
})

test('로그인 후 복귀: 안전한 앱 내부 경로만 허용하고 그 밖에는 null(기본 /home)이다', () => {
  const { safeReturnTo } = ReturnTo
  assert.equal(safeReturnTo({ returnTo: '/records/meal' }), '/records/meal')
  assert.equal(
    safeReturnTo({ returnTo: '/records/exercise?sample=before' }),
    '/records/exercise?sample=before',
  )
  for (const bad of [
    undefined,
    null,
    'string',
    {},
    { returnTo: 42 },
    { returnTo: '' },
    { returnTo: 'records/meal' },
    { returnTo: '//evil.example/path' },
    { returnTo: '/\\evil.example' },
    { returnTo: 'https://evil.example/' },
    { returnTo: 'javascript:alert(1)' },
    { returnTo: '/records meal' },
    { returnTo: '/records\nmeal' },
    { returnTo: '/login' },
    { returnTo: '/login?x=1' },
    { returnTo: '/signup' },
    { returnTo: '/Login' },
    { returnTo: '/%6Cogin' },
    { returnTo: '/%E0%A4%A' },
    { returnTo: `/${'a'.repeat(3000)}` },
  ]) {
    assert.equal(safeReturnTo(bad), null, JSON.stringify(bad))
  }
  // 해시는 넘기지 않는다.
  assert.equal(safeReturnTo({ returnTo: '/mypage#top' }), '/mypage')
})

test('로그인 화면은 로그인 상태가 되면 검증한 returnTo로, 없으면 /home으로 보낸다', () => {
  const page = read('../src/pages/LoginPage.tsx')
  assert.match(
    page,
    /<Navigate to=\{safeReturnTo\(location\.state\) \?\? '\/home'\} replace \/>/,
  )
  const notice = read('../src/components/auth/LoginRequiredNotice.tsx')
  assert.match(
    notice,
    /state=\{\{ returnTo: location\.pathname \+ location\.search \}\}/,
  )
})

test('하단 기록 탭: 식단 화면에서는 식단 기록, 운동 화면에서는 운동 기록이고 기록 화면이 아니면(기억 없음) 운동 기록이다', () => {
  const { recordsDomainOf, recordsTabPath } = RecordsTab
  assert.equal(recordsDomainOf('/records/meal'), 'meal')
  assert.equal(recordsDomainOf('/records/meal/plan'), 'meal')
  assert.equal(recordsDomainOf('/records/exercise/my'), 'exercise')
  assert.equal(recordsDomainOf('/records/mealx'), null)
  assert.equal(recordsDomainOf('/home'), null)
  assert.equal(recordsTabPath('/records/meal/breakfast'), '/records/meal')
  assert.equal(recordsTabPath('/records/exercise'), '/records/exercise')
  // 서버 렌더링(window 없음)에서는 기억한 값을 읽지 않고 기본값이다.
  assert.equal(recordsTabPath('/home'), '/records/exercise')
  // 기억하는 값은 화면 종류뿐이다(건강 데이터를 저장하지 않는다).
  const source = read('../src/app/recordsTab.ts')
  assert.match(source, /sessionStorage\.setItem\(STORAGE_KEY, domain\)/)
  assert.equal((source.match(/setItem\(/g) ?? []).length, 1)
})

test('로그아웃은 기록 탭 기억값만 지운다', () => {
  const source = read('../src/app/recordsTab.ts')
  assert.match(source, /sessionStorage\.removeItem\(STORAGE_KEY\)/)
  const auth = read('../src/auth/AuthProvider.tsx')
  assert.match(auth, /clearRememberedRecordsDomain\(\)/)
})

test('W01·D01도 다른 화면과 같은 공통 앱 폭(390px)·한 열이다(넓은 폭 옵션 없음)', () => {
  const router = read('../src/app/router.tsx')
  assert.doesNotMatch(router, /wide: true/)
  const css = read('../src/styles/global.css')
  assert.match(css, /--container-app: 24\.375rem;/)
  assert.doesNotMatch(css, /container-dashboard/)
  const shell = read('../src/layouts/AppShell.tsx')
  assert.doesNotMatch(shell, /handle\.wide|max-w-dashboard/)
  for (const file of [
    '../src/pages/ExerciseDashboardPage.tsx',
    '../src/components/food/MealDashboardView.tsx',
  ])
    assert.doesNotMatch(read(file), /md:grid/, file)
  // BottomSheet는 기존 앱 폭을 유지한다.
  assert.match(read('../src/components/layout/BottomSheet.tsx'), /max-w-app/)
})

test('D01은 운동과 같은 날짜 변경 감지(useLocalToday)를 쓰고 계획 전용 다시 시도를 연결한다', () => {
  const page = read('../src/pages/MealDashboardPage.tsx')
  assert.match(page, /const localDate = useLocalToday\(\)/)
  assert.doesNotMatch(page, /useState\(\(\) => toLocalDate/)
  assert.match(
    page,
    /useMealPlans\(user\?\.id \?\? null, addDays\(localDate, 1\)\)/,
  )
  assert.match(page, /onRetryPlans=\{plans\.reload\}/)
})
