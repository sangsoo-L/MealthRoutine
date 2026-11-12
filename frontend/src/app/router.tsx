import { createBrowserRouter, type RouteObject } from 'react-router'
import AuthGate from '../guards/AuthGate.tsx'
import AuthOrExperienceGate from '../guards/AuthOrExperienceGate.tsx'
import AppShell from '../layouts/AppShell.tsx'
import HomePage from '../pages/HomePage.tsx'
import IntroPage from '../pages/IntroPage.tsx'
import LoginPage from '../pages/LoginPage.tsx'
import MyPage from '../pages/MyPage.tsx'
import OnboardingAssessmentPage from '../pages/OnboardingAssessmentPage.tsx'
import SettingsPage from '../pages/SettingsPage.tsx'
import PagePlaceholder, {
  NotFoundPlaceholder,
} from '../pages/PagePlaceholder.tsx'
import ExerciseDetailPage from '../pages/ExerciseDetailPage.tsx'
import ExerciseComposePage from '../pages/ExerciseComposePage.tsx'
import ExerciseDashboardPage from '../pages/ExerciseDashboardPage.tsx'
import ExerciseGoalPage from '../pages/ExerciseGoalPage.tsx'
import ExerciseMethodPage from '../pages/ExerciseMethodPage.tsx'
import ExercisePickerPage from '../pages/ExercisePickerPage.tsx'
import ExercisesPage from '../pages/ExercisesPage.tsx'
import FoodsPage from '../pages/FoodsPage.tsx'
import ExplorePage from '../pages/ExplorePage.tsx'
import SearchPage from '../pages/SearchPage.tsx'
import SignupPage from '../pages/SignupPage.tsx'
import SurveyPage from '../pages/SurveyPage.tsx'
import type { RouteHandle } from './routeHandle.ts'

/** 임시 화면 라우트 설정. 임시 화면은 화면 ID를 표시하므로 screenId가 반드시 있다. */
type PlaceholderRouteConfig = { path?: string; index?: true } & RouteHandle & {
    screenId: string
  }

/**
 * 대표 경로 라우트 생성. handle과 임시 화면이 같은 값을 쓰도록 한 곳에서 만든다.
 */
function placeholderRoute({
  path,
  index,
  ...handle
}: PlaceholderRouteConfig): RouteObject {
  const element = (
    <PagePlaceholder screenId={handle.screenId} name={handle.title} />
  )
  return index ? { index, element, handle } : { path, element, handle }
}

const introHandle: RouteHandle = {
  screenId: null,
  title: '인트로',
  tab: null,
  focus: true,
  splash: true,
  domain: 'brand',
  parent: null,
}

// 홈은 비회원이면 랜딩(H01, 자체 헤더 LandingHeader), 로그인했으면 회원 홈이다.
// landing: 비회원일 때만 자체 헤더(LandingHeader)를 쓰므로 하단 탭과 공통 h1을 그리지 않는다(AppShell). 회원 홈은 일반 화면이라 focus는 false다.
const homeHandle: RouteHandle = {
  screenId: 'H01',
  title: '홈',
  tab: 'home',
  focus: false,
  landing: true,
  domain: 'brand',
  parent: null,
  transition: 'fade',
}

const loginHandle: RouteHandle = {
  screenId: 'A01',
  title: '로그인',
  tab: 'home',
  focus: true,
  // 뒤로가기(→홈)는 흰 면을 가득 채우는 로그인 틀(AuthFrame) 안에서 화면이 직접 그린다.
  bodyBack: true,
  domain: 'brand',
  parent: '/home',
}

const signupHandle: RouteHandle = {
  screenId: 'A03',
  title: '회원가입',
  tab: 'home',
  focus: true,
  // 회원가입은 뒤로가기를 그리지 않는다. 로그인으로 돌아가는 길은 본문 하단 안내 카드가 맡는다.
  bodyBack: true,
  domain: 'brand',
  parent: '/login',
}

const surveyHandle: RouteHandle = {
  screenId: 'A02',
  // 스토리보드 앱바의 질문 단계 제목(상단 바가 없어 지금은 보조기기용 h1로만 쓴다). 최종 확인 단계의 '시작 전 확인'은 정적 handle로 바꿀 수 없어 반영하지 않았다.
  title: '나에게 맞는 시작',
  tab: 'home',
  focus: true,
  domain: 'brand',
  // 다른 화면과 연결하지 않는다. 개발용으로 주소를 직접 입력해 확인하는 화면이다.
  parent: null,
}

const exploreHandle: RouteHandle = {
  screenId: null,
  title: '탐색',
  tab: 'explore',
  focus: false,
  domain: 'brand',
  parent: null,
  transition: 'fade',
}

// 통합검색: 화면이 뒤로가기·검색창이 있는 자체 헤더와 자체 h1을 가지고, 키보드가 열리는 화면이라 하단 탭도 그리지 않는다.
// 탐색 탭의 하위 화면이라 tab은 'explore'로 둔다(하단 탭을 그리지 않으므로 표시는 되지 않는다).
const searchHandle: RouteHandle = {
  screenId: null,
  title: '통합검색',
  tab: 'explore',
  focus: true,
  bodyBack: true,
  ownH1: true,
  domain: 'brand',
  parent: '/explore',
}

// 운동 탐색: 뒤로가기는 본문 제목 위에 화면이 직접 그린다(bodyBack).
const exercisesHandle: RouteHandle = {
  screenId: 'E01',
  title: '운동 탐색',
  tab: 'explore',
  focus: false,
  bodyBack: true,
  domain: 'exercise',
  parent: '/home',
  transition: 'fade',
}

// 음식 탐색: 운동 탐색과 같이 뒤로가기는 본문 제목 옆에 화면이 직접 그린다(bodyBack).
const foodsHandle: RouteHandle = {
  screenId: 'F01',
  title: '음식 검색',
  tab: 'explore',
  focus: false,
  bodyBack: true,
  domain: 'meal',
  parent: '/home',
  transition: 'fade',
}

const notFoundHandle: RouteHandle = {
  screenId: null,
  title: '페이지를 찾을 수 없습니다',
  tab: null,
  focus: false,
  domain: 'brand',
  // 본문에 "홈으로 이동" 링크가 있어 뒤로가기를 따로 두지 않는다.
  parent: null,
}

// 근거: documents/화면명세_v5.0.json(화면 ID·화면명), URL은 frontend/docs/screen-route-map.md (대표 경로만 정의)
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        // 인트로 스플래시(화면명세 밖). 약 3초 뒤 홈(/home)으로 자동 이동한다.
        index: true,
        element: <IntroPage />,
        handle: introHandle,
      },
      // 인트로가 `/`를 쓰므로 H01 홈은 `/home`에 둔다. 이 경로는 기획 문서에 없는 임시 확정이다.
      {
        path: 'home',
        element: <HomePage />,
        handle: homeHandle,
      },
      {
        path: 'login',
        element: <LoginPage />,
        handle: loginHandle,
      },
      {
        // A03 회원가입. `/signup`은 기획 문서에 없는 임시 확정이다. (로그인 `/login`과 같은 일반 경로 규칙)
        path: 'signup',
        element: <SignupPage />,
        handle: signupHandle,
      },
      {
        // A02 초기설문. `/survey`는 기획 문서에 없는 임시 확정이며, 다른 화면과 연결하지 않고 직접 접근만 허용한다.
        // 가입 완료·인증 상태를 가정하는 가드도 두지 않는다.
        path: 'survey',
        element: <SurveyPage />,
        handle: surveyHandle,
      },
      {
        // 통합 탐색 메인. 화면명세 v5.0에 없는 화면이라 화면 ID는 null이고 `/explore`는 사용자 지시로 정한 임시 확정이다.
        // 하단 탭 '탐색'의 도착 화면이며, 운동 탐색(/exercises)·음식 검색(/foods)과 같은 탭을 활성으로 둔다.
        path: 'explore',
        element: <ExplorePage />,
        handle: exploreHandle,
      },
      {
        // 통합검색. 화면명세 v5.0에 없는 화면이며 `/search`는 사용자 지시로 정한 임시 확정이다.
        path: 'search',
        element: <SearchPage />,
        handle: searchHandle,
      },
      {
        // E01 운동 탐색. 검색 전·결과 화면과 필터 조건을 주소(검색 파라미터)에 보관한다. 운동 검색 API는 아직 없다.
        path: 'exercises',
        element: <ExercisesPage />,
        handle: exercisesHandle,
      },
      {
        // F01 음식 탐색. 운동 탐색(E01)과 같은 구성이며 검색 조건과 화면 상태를 주소(검색 파라미터)에 보관한다. 음식 검색 API는 아직 없다.
        path: 'foods',
        element: <FoodsPage />,
        handle: foodsHandle,
      },
      {
        // 비회원 접근 정책: 기록·마이는 로그인 안내를 보여 준다(탐색·AI·고객지원은 공개).
        // 경로를 만들지 않는 레이아웃 라우트라 URL·handle(활성 탭, 화면 제목)은 그대로 유지된다.
        // 로그인 여부는 AuthProvider의 상태를 따른다. 현재 로그인은 UI 개발용이며 실제 인증이 아니다.
        element: <AuthGate />,
        children: [
          {
            // W01 운동 기록 대시보드. 운동·수행 기록·루틴·운동 목표가 아직 연결되지 않아 영역이 모두 "준비 중"인 UI 구현이다(ExerciseDashboardPage).
            // 화면의 h1은 시안의 "운동 대시보드"이고 라우트 제목(보조기기·비회원 안내용)은 명세의 화면명이다. 하단 탭은 "기록" 탭이 활성이다.
            path: 'records/exercise',
            element: <ExerciseDashboardPage />,
            handle: {
              screenId: 'W01',
              title: '운동 기록 대시보드',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: null,
              transition: 'fade',
            } satisfies RouteHandle,
          },
          {
            // W01-1 운동 목표 설정. PIN·신체 정보 단계는 목표 화면 안에서 처리한다.
            path: 'records/exercise/goal',
            element: <ExerciseGoalPage />,
            handle: {
              screenId: 'W01-1',
              title: '운동 목표 설정',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W13 운동 검색·즐겨찾기 등록(운동 선택). 화면명세 v5.0은 URL을 정의하지 않아 `/records/exercise/select`는 사용자 지시로 정한 임시 URL이다.
            // 회원 전용(AuthGate). 호출부인 W02(운동 목록 구성)의 URL이 미정이라 상위 화면(parent)은 존재하는 운동 기록 화면(W01)을 임시로 쓰며
            // 최종 계약이 아니다. 진입한 화면(state.from)이 있으면 그곳으로 돌아간다. 하단 탭은 그리지 않고(focus) 화면이 h1과 뒤로가기를 직접 가진다.
            path: 'records/exercise/select',
            element: <ExercisePickerPage />,
            handle: {
              screenId: 'W13',
              title: '운동 검색·등록',
              tab: 'records',
              focus: true,
              ownH1: true,
              bodyBack: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W12 운동 목록 구성 방법 선택. URL은 사용자 지시로 정한 임시 확정이며(`/records/exercise/new`) v5.0은 URL을 정의하지 않는다.
            // 회원 전용(AuthGate). 하단 탭은 표시한다. 상위 화면 W10(나의 운동 목록)이 아직 없어 임시로 운동 기록 대시보드(W01)를 쓴다.
            path: 'records/exercise/new',
            element: <ExerciseMethodPage />,
            handle: {
              screenId: 'W12',
              title: '운동 목록 구성 방법 선택',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W02 직접 운동 목록 구성(운동 편집). URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/compose`).
            // 회원 전용(AuthGate). 스토리보드 v5.0 W02처럼 하단 탭을 숨긴다(focus). 상위 화면은 W10이 없어 임시로 W01이다.
            // W11(최종 검토)의 예약 경로 `/records/exercise/review`는 아직 라우트로 만들지 않는다.
            path: 'records/exercise/compose',
            element: <ExerciseComposePage />,
            handle: {
              screenId: 'W02',
              title: '직접 운동 목록 구성',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          placeholderRoute({
            path: 'records/meal',
            screenId: 'D01',
            title: '식단 기록 대시보드',
            tab: 'records',
            focus: false,
            domain: 'meal',
            parent: null,
            transition: 'fade',
          }),
          {
            // P01 마이페이지. 7개 섹션 정식 화면이며 마이페이지 API가 없어 대부분 "연결 전" 상태로 표시한다(MyPage).
            path: 'mypage',
            element: <MyPage />,
            handle: {
              screenId: 'P01',
              title: '마이페이지',
              tab: 'my',
              focus: false,
              domain: 'brand',
              parent: null,
              transition: 'fade',
            } satisfies RouteHandle,
          },
          {
            // P09 상세 설정. P01 설정 버튼으로 진입한다. 화면명세 v5.0은 URL을 정의하지 않아 `/settings`는 사용자 지시로 정한 임시 확정이다.
            // 무료·유료 회원 모두 접근하고 비회원은 AuthGate의 로그인 안내를 본다. 하단 탭은 마이 탭이 활성이며 뒤로가기는 P01이다.
            path: 'settings',
            element: <SettingsPage />,
            handle: {
              screenId: 'P09',
              title: '상세 설정',
              tab: 'my',
              focus: false,
              // 화면이 보이는 제목(h1 "상세 설정")을 직접 그린다. 뒤로가기(→P01)는 AppShell이 본문 위에 그린다.
              ownH1: true,
              domain: 'brand',
              parent: '/mypage',
            } satisfies RouteHandle,
          },
        ],
      },
      {
        // 운동·식단 이해도 확인(최초 회원가입 후 지식 진단). 화면명세 v5.0에 없는 화면이라 화면 ID는 미정(null)이고,
        // `/onboarding/assessment`는 사용자 지시로 정한 임시 확정이다.
        // 접근: 로그인한 회원(개발용 로그인 포함) 또는 개발 서버의 가입 체험 중인 사용자만 열 수 있다(AuthOrExperienceGate).
        // 가입 체험은 로그인이 아니며 운영 빌드에서는 항상 꺼져 있어, 운영에서는 AuthGate와 똑같이 비회원에게 로그인 안내를 보여 준다.
        // 흐름: (개발 서버) A03 가입 체험 → 이 화면 → 홈. 정식 흐름의 P05(2차 비밀번호 설정)·A02(초기설문)는 체험에서만 건너뛴다.
        // 가입 흐름의 집중 화면이라 survey와 같이 하단 탭을 그리지 않고, 상위 화면 이동도 두지 않는다(화면 안의 이전 버튼이 맡는다).
        element: <AuthOrExperienceGate />,
        children: [
          {
            path: 'onboarding/assessment',
            element: <OnboardingAssessmentPage />,
            handle: {
              screenId: null,
              title: '운동·식단 이해도 확인',
              tab: null,
              focus: true,
              // 화면이 보조기기용 h1을 직접 가진다(AssessmentFlow·OnboardingAssessmentPage).
              ownH1: true,
              domain: 'brand',
              parent: null,
            } satisfies RouteHandle,
          },
        ],
      },
      {
        // E02 운동 상세 안내. `/exercises/:exerciseId`는 화면명세 v5.0이 URL을 정의하지 않아 사용자 지시(1단계의 상세 진입점)로 정한
        // 임시 확정이다. 비회원도 열람할 수 있다(공개 무료). 대표 미디어가 화면 폭을 채우도록 뒤로가기는 화면이 직접 그리며(bodyBack),
        // 진입한 검색 화면(없으면 운동 탐색)으로 돌아간다. 화면이 운동명 h1을 직접 가진다(ownH1).
        path: 'exercises/:exerciseId',
        element: <ExerciseDetailPage />,
        handle: {
          screenId: 'E02',
          title: '운동 상세 안내',
          tab: 'explore',
          focus: false,
          ownH1: true,
          bodyBack: true,
          domain: 'exercise',
          parent: '/exercises',
        } satisfies RouteHandle,
      },
      placeholderRoute({
        path: 'ai',
        screenId: 'I01',
        title: 'AI 서비스 안내',
        tab: 'ai',
        focus: false,
        domain: 'brand',
        parent: null,
        transition: 'fade',
      }),
      placeholderRoute({
        path: 'support',
        screenId: 'S01',
        title: '고객지원',
        tab: 'my',
        focus: false,
        domain: 'brand',
        parent: '/mypage',
      }),
      {
        // 404 임시 최소 처리. 정식 디자인은 확정 후 반영한다.
        path: '*',
        element: <NotFoundPlaceholder />,
        handle: notFoundHandle,
      },
    ],
  },
])
