import { createBrowserRouter } from 'react-router'
import AuthGate from '../guards/AuthGate.tsx'
import AuthOrExperienceGate from '../guards/AuthOrExperienceGate.tsx'
import AppShell from '../layouts/AppShell.tsx'
import AiExercisePage from '../pages/AiExercisePage.tsx'
import AiExercisePlanPage from '../pages/AiExercisePlanPage.tsx'
import AiPage from '../pages/AiPage.tsx'
import WeeklyReportPage from '../pages/WeeklyReportPage.tsx'
import WeeklyScorePage from '../pages/WeeklyScorePage.tsx'
import HomePage from '../pages/HomePage.tsx'
import IntroPage from '../pages/IntroPage.tsx'
import LoginPage from '../pages/LoginPage.tsx'
import MyPage from '../pages/MyPage.tsx'
import OnboardingAssessmentPage from '../pages/OnboardingAssessmentPage.tsx'
import NotificationsPage from '../pages/NotificationsPage.tsx'
import QuizPage from '../pages/QuizPage.tsx'
import SettingsPage from '../pages/SettingsPage.tsx'
import { NotFoundPlaceholder } from '../pages/PagePlaceholder.tsx'
import ExerciseDetailPage from '../pages/ExerciseDetailPage.tsx'
import ExerciseComposePage from '../pages/ExerciseComposePage.tsx'
import ExerciseDashboardPage from '../pages/ExerciseDashboardPage.tsx'
import ExerciseGoalPage from '../pages/ExerciseGoalPage.tsx'
import ExerciseMethodPage from '../pages/ExerciseMethodPage.tsx'
import ExerciseMyPage from '../pages/ExerciseMyPage.tsx'
import ExercisePreviousPage from '../pages/ExercisePreviousPage.tsx'
import ExercisePlanPage from '../pages/ExercisePlanPage.tsx'
import ExercisePickerPage from '../pages/ExercisePickerPage.tsx'
import ExerciseReviewPage from '../pages/ExerciseReviewPage.tsx'
import ExerciseResultPage from '../pages/ExerciseResultPage.tsx'
import ExerciseSessionPage from '../pages/ExerciseSessionPage.tsx'
import ExercisesPage from '../pages/ExercisesPage.tsx'
import ExerciseStatsPage from '../pages/ExerciseStatsPage.tsx'
import RoutineDetailPage from '../pages/RoutineDetailPage.tsx'
import RoutineEditPage from '../pages/RoutineEditPage.tsx'
import RoutineListPage from '../pages/RoutineListPage.tsx'
import FaqPage from '../pages/FaqPage.tsx'
import FavoritesPage from '../pages/FavoritesPage.tsx'
import LevelGuidePage from '../pages/LevelGuidePage.tsx'
import NoticeDetailPage from '../pages/NoticeDetailPage.tsx'
import SupportPage from '../pages/SupportPage.tsx'
import FoodsPage from '../pages/FoodsPage.tsx'
import FoodDetailPage from '../pages/FoodDetailPage.tsx'
import MealDashboardPage from '../pages/MealDashboardPage.tsx'
import MealDetailPage from '../pages/MealDetailPage.tsx'
import MealGoalPage from '../pages/MealGoalPage.tsx'
import MealGoalRequiredPage from '../pages/MealGoalRequiredPage.tsx'
import MealListPage from '../pages/MealListPage.tsx'
import MealPlanPage from '../pages/MealPlanPage.tsx'
import MealPreviousPage from '../pages/MealPreviousPage.tsx'
import MealRecordPage from '../pages/MealRecordPage.tsx'
import ExplorePage from '../pages/ExplorePage.tsx'
import SearchPage from '../pages/SearchPage.tsx'
import SignupPage from '../pages/SignupPage.tsx'
import SurveyPage from '../pages/SurveyPage.tsx'
import type { RouteHandle } from './routeHandle.ts'

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
        // F02 음식 영양정보·알레르기 안내. URL `/foods/:foodId`는 사용자 지시로 정한 임시 확정이며 비회원도 열람한다(즐겨찾기·기록은 회원 전용).
        // 하단 탭은 탐색이 활성이고 상위 화면은 F01이다. 화면이 h1(음식 이름)을 직접 가진다.
        path: 'foods/:foodId',
        element: <FoodDetailPage />,
        handle: {
          screenId: 'F02',
          title: '음식 영양정보',
          tab: 'explore',
          focus: false,
          ownH1: true,
          domain: 'meal',
          parent: '/foods',
        } satisfies RouteHandle,
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
            // 초급 운동 추천 및 자동 설정(전체 자동 추천 / 직접 운동 선택 후 자동 설정). v5.0 80개 화면 밖의 추가 화면으로, 2026-11-16 승인되어
            // 화면 ID `W01-2`(상위 W01)와 URL `/records/exercise/plan`이 화면명세 v5.0 보완본에 정의되어 있다. 운동 이해도 beginner 회원만 쓸 수 있고 화면이 직접 권한을 확인한다
            // (URL로 들어와도 같다). v5.0 AI 운동 플랜(W12·I02)과 별개의 무료 규칙 기반 기능이다. 운동 선택 UI(W13)를 화면 안에서 재사용하므로
            // 하단 탭은 숨긴다(focus). 화면이 h1을 직접 가진다. S8-UI-1부터 조건 설정이 단계 화면(자체 이전 버튼·진행률)이라
            // 뒤로가기는 화면이 직접 그린다(bodyBack, 같은 useBackTarget 규칙).
            path: 'records/exercise/plan',
            element: <ExercisePlanPage />,
            handle: {
              screenId: 'W01-2',
              title: '초급 운동 추천',
              tab: 'records',
              focus: true,
              ownH1: true,
              bodyBack: true,
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
          {
            // W11 운동 목록 최종 검토. URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/review`, v5.0은 URL을 정의하지 않는다).
            // 회원 전용(AuthGate). W02처럼 하단 탭을 숨긴다(focus). "이전"은 W02(구성 수정)로 돌아간다.
            // 저장하면 W01로 이동한다. 운동 시작(W14)은 아직 없어 준비 중이다.
            path: 'records/exercise/review',
            element: <ExerciseReviewPage />,
            handle: {
              screenId: 'W11',
              title: '운동 목록 최종 검토',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise/compose',
            } satisfies RouteHandle,
          },
          {
            // W14 운동 진행(화면명세 W14-1 중량형 · W14-2 횟수형 · W14-3 시간형을 한 화면이 현재 세트의 기록 방식에 따라 그린다).
            // URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/session`, v5.0은 URL을 정의하지 않는다). 세션 id를 경로에 두지 않고
            // 계정당 하나뿐인 진행 중 세션을 불러온다. 회원 전용(AuthGate), 하단 탭을 숨긴다(focus). "이전"은 W01로 돌아간다.
            // 화면 ID는 한 라우트가 세 변형을 그리므로 중점으로 이어 적는다(`P11·P12` 전례).
            path: 'records/exercise/session',
            element: <ExerciseSessionPage />,
            handle: {
              screenId: 'W14-1·W14-2·W14-3',
              title: '운동 진행',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W15·W15-1 운동 결과 확인·수정·최종 저장(시간형 포함이면 W15, 시간형이 없으면 W15-1을 한 화면이 세션 스냅샷으로 판별해 그린다).
            // URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/result?session=<sessionId>`, v5.0은 URL을 정의하지 않는다).
            // 회원 전용(AuthGate), 하단 탭을 숨긴다(focus). "이전"은 W01로 돌아가며 W14로의 이동은 화면의 버튼이 맡는다.
            // 화면 ID는 한 라우트가 두 변형을 그리므로 중점으로 이어 적는다(W14·`P11·P12` 전례).
            path: 'records/exercise/result',
            element: <ExerciseResultPage />,
            handle: {
              screenId: 'W15·W15-1',
              title: '운동 결과 확인',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W10 나의 운동(오늘의 운동 상태 · 완료한 운동 기록 · 내일 계획 안내). URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/my`, v5.0은 URL을 정의하지 않는다).
            // 회원 전용(AuthGate). 하단 탭은 유지하고(focus false) 상위 화면은 운동 기록 대시보드(W01)다. 화면이 h1을 직접 가진다.
            path: 'records/exercise/my',
            element: <ExerciseMyPage />,
            handle: {
              screenId: 'W10',
              title: '나의 운동',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W16 이전 운동 리스트(지난 날짜에 구성한 운동 계획 목록, 읽기 전용). URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/previous`).
            // 회원 전용(AuthGate). 하단 탭은 유지하고(focus false) 상위 화면은 W10이다. 화면이 h1을 직접 가진다.
            path: 'records/exercise/previous',
            element: <ExercisePreviousPage />,
            handle: {
              screenId: 'W16',
              title: '이전 운동 리스트',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise/my',
            } satisfies RouteHandle,
          },
          {
            // H02 오늘의 퀴즈(운동·식단 통합, 하루 한 문제). URL `/quiz`는 사용자 승인으로 확정했다(v5.0은 URL 미정의). 회원 전용(AuthGate).
            // 홈의 퀴즈 카드에서 들어오며 상위 화면은 홈이다. 하단 탭(홈 활성)은 유지하고 화면이 h1을 직접 가진다.
            path: 'quiz',
            element: <QuizPage />,
            handle: {
              screenId: 'H02',
              title: '오늘의 퀴즈',
              tab: 'home',
              focus: false,
              ownH1: true,
              domain: 'brand',
              parent: '/home',
            } satisfies RouteHandle,
          },
          {
            // W06 내 운동 루틴. URL은 사용자 지시로 정한 임시 확정이다(`/records/exercise/routines`, v5.0은 URL 미정의). 회원 전용(AuthGate).
            // 하단 탭은 유지하고 상위 화면은 운동 기록 대시보드(W01)다. 화면이 h1을 직접 가진다.
            path: 'records/exercise/routines',
            element: <RoutineListPage />,
            handle: {
              screenId: 'W06',
              title: '내 운동 루틴',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // W08 운동 루틴 만들기. `routines/new`는 `routines/:routineId`보다 먼저 맞는 고정 경로다. 운동 선택 화면을 품고 있어
            // 하단 탭을 그리지 않고(focus), "이전"은 화면이 직접 그린다(bodyBack, 같은 useBackTarget 규칙).
            path: 'records/exercise/routines/new',
            element: <RoutineEditPage />,
            handle: {
              screenId: 'W08',
              title: '운동 루틴 만들기',
              tab: 'records',
              focus: true,
              ownH1: true,
              bodyBack: true,
              domain: 'exercise',
              parent: '/records/exercise/routines',
            } satisfies RouteHandle,
          },
          {
            // W07 운동 루틴 상세. 없는 루틴·다른 계정의 루틴은 화면이 "찾을 수 없어요"로 안내한다. 상위 화면은 W06이다.
            path: 'records/exercise/routines/:routineId',
            element: <RoutineDetailPage />,
            handle: {
              screenId: 'W07',
              title: '운동 루틴 상세',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise/routines',
            } satisfies RouteHandle,
          },
          {
            // W08 운동 루틴 수정(같은 화면을 루틴 id로 연다). 상세(W07)에서 들어오면 "이전"이 상세로 돌아온다(state.from).
            path: 'records/exercise/routines/:routineId/edit',
            element: <RoutineEditPage />,
            handle: {
              screenId: 'W08',
              title: '운동 루틴 수정',
              tab: 'records',
              focus: true,
              ownH1: true,
              bodyBack: true,
              domain: 'exercise',
              parent: '/records/exercise/routines',
            } satisfies RouteHandle,
          },
          {
            // 운동 기록 통계. 화면명세 v5.0에 없는 신규 화면이라 화면 ID는 미정(null)이고 URL `/records/exercise/stats`는 사용자 승인으로 정한 임시 확정이다.
            // 회원 전용(AuthGate). 진입은 W01의 "운동 기록 통계" 카드, 상위 화면은 W01이다. I05 주간 리포트와 연결하지 않는다. 화면이 h1을 직접 가진다.
            path: 'records/exercise/stats',
            element: <ExerciseStatsPage />,
            handle: {
              screenId: null,
              title: '운동 기록 통계',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/records/exercise',
            } satisfies RouteHandle,
          },
          {
            // I02-1 AI 운동 플랜 · 조건 선택과 추천. URL `/ai/exercise/plan`은 사용자 승인으로 확정했다. 회원 전용(AuthGate).
            // 실제 AI 호출·체험 횟수 처리 없이 시드 루틴 근거로 만든 로컬 예시 추천만 보여 준다. 상위 화면은 I02이고 화면이 h1을 직접 가진다.
            // 1차는 결과 확인까지이며 목록 등록(W02·W11 연결)은 연결하지 않았다.
            path: 'ai/exercise/plan',
            element: <AiExercisePlanPage />,
            handle: {
              screenId: 'I02-1',
              title: 'AI 운동 플랜 · 조건 선택과 추천',
              tab: 'ai',
              focus: false,
              ownH1: true,
              domain: 'exercise',
              parent: '/ai/exercise',
            } satisfies RouteHandle,
          },
          {
            // I05 주간 기록 리포트. URL `/ai/weekly-report`는 사용자 승인으로 확정했다(v5.0은 URL 미정의). 회원 전용(AuthGate).
            // 기존 운동·식단 기록 조회만 쓰며 AI·API·체험 횟수 처리는 없다. 진입은 W01 주간 카드·D01 오늘 섭취·I01이고 상위 화면은 I01이다. 화면이 h1을 직접 가진다.
            path: 'ai/weekly-report',
            element: <WeeklyReportPage />,
            handle: {
              screenId: 'I05',
              title: '주간 리포트',
              tab: 'ai',
              focus: false,
              ownH1: true,
              domain: 'brand',
              parent: '/ai',
            } satisfies RouteHandle,
          },
          {
            // I05-1 주간 기록 점수. URL `/ai/weekly-report/score`(사용자 승인). 회원 전용. 주는 ?offset=으로 받고 상위 화면은 I05다.
            path: 'ai/weekly-report/score',
            element: <WeeklyScorePage />,
            handle: {
              screenId: 'I05-1',
              title: '주간 리포트 · 기록 점수',
              tab: 'ai',
              focus: false,
              ownH1: true,
              domain: 'brand',
              parent: '/ai/weekly-report',
            } satisfies RouteHandle,
          },
          {
            // I07 식단 목표 없음 안내. URL `/ai/meal/goal-required`는 임시 후보이며 사용자 확인이 필요하다(v5.0은 URL 미정의). 회원 전용(AuthGate).
            // AI 식단 플랜(I03, 아직 구현 전)이 식단 목표가 없을 때 `replace`로 보내는 화면이다. 목표가 이미 있으면 돌아갈 곳으로 이동한다.
            // 상위 화면은 I03 대신 I01이다: I03이 목표 없음에서 이 화면으로 되돌려 보내므로 "이전"이 I03을 가리키면 두 화면이 서로 반복된다. 화면이 h1을 직접 가진다.
            path: 'ai/meal/goal-required',
            element: <MealGoalRequiredPage />,
            handle: {
              screenId: 'I07',
              title: '식단 목표 없음 안내',
              tab: 'ai',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: '/ai',
            } satisfies RouteHandle,
          },
          {
            // D01 식단 기록 대시보드. 오늘 식단 기록(IndexedDB v3 mealRecords, 개발 서버 전용)을 읽는 정식 화면이며 회원 전용(AuthGate)이다.
            // 하단 탭 대표 화면이라 parent가 없고 fade로 도착한다. 화면이 h1("식단 기록")을 직접 가진다(W01의 "운동 기록"과 같은 형식).
            path: 'records/meal',
            element: <MealDashboardPage />,
            handle: {
              screenId: 'D01',
              title: '식단 기록 대시보드',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: null,
              transition: 'fade',
            } satisfies RouteHandle,
          },
          {
            // D01-4 식단 목표 설정. URL `/records/meal/goal`은 임시 후보이며 사용자 확인이 필요하다(v5.0은 URL 미정의, 운동의 `/records/exercise/goal`과 같은 이름 규칙).
            // 회원 전용(AuthGate). PIN·신체 정보 단계는 화면 안에서 처리하고(기존 운동 목표 저장소 재사용) 계산 정책이 전문가 검증 전이라 목표는 저장할 수 없다.
            // 하단 탭은 유지하고 상위 화면은 D01이다. 들어온 화면(state.from)이 D01 또는 AI 서비스 안내면 그곳으로 돌아간다. 화면이 h1을 직접 가진다.
            path: 'records/meal/goal',
            element: <MealGoalPage />,
            handle: {
              screenId: 'D01-4',
              title: '식단 목표 설정',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal',
            } satisfies RouteHandle,
          },
          {
            // D02 오늘 식단 기록. URL `/records/meal/record`는 사용자 지시로 정한 임시 확정이다(v5.0은 URL 미정의). 양 선택 팝업을 품고 있어
            // 하단 탭을 그리지 않는다(focus). "이전"은 AppShell이 그리며 호출한 화면(state.from)이 없으면 D01로 돌아간다.
            path: 'records/meal/record',
            element: <MealRecordPage />,
            handle: {
              screenId: 'D02',
              title: '오늘 식단 기록',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal',
            } satisfies RouteHandle,
          },
          {
            // D02-1 내일 식단 계획. URL `/records/meal/plan`은 사용자 승인 URL이다. 계획 전용 저장소(mealPlans, DB v4, 개발 서버 전용)를 쓰며 실제 섭취 기록과 합산하지 않는다.
            // 회원 전용(AuthGate). D02처럼 양 선택 팝업을 품고 있어 하단 탭을 그리지 않는다(focus). 상위 화면은 D01이고 화면이 h1을 직접 가진다.
            path: 'records/meal/plan',
            element: <MealPlanPage />,
            handle: {
              screenId: 'D02-1',
              title: '내일 식단 계획',
              tab: 'records',
              focus: true,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal',
            } satisfies RouteHandle,
          },
          {
            // D03 식단 리스트(기록한 식단을 주간·날짜별로 확인). URL `/records/meal/list`는 임시 확정이다(v5.0은 URL 미정의, 운동의 `/records/exercise/previous`와 같은 이름 규칙).
            // 회원 전용(AuthGate). 하단 탭은 유지하고 상위 화면은 D01이다. 화면이 h1을 직접 가진다.
            path: 'records/meal/list',
            element: <MealListPage />,
            handle: {
              screenId: 'D03',
              title: '식단 리스트',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal',
            } satisfies RouteHandle,
          },
          {
            // D03-1 이전 식단 상세(읽기 전용). URL `/records/meal/previous/:date?`는 임시 확정이다. 날짜를 생략하면 가장 최근 지난 기록을 연다.
            // 상위 화면은 D03이고 "이전"은 호출한 D03(고른 날짜 유지, state.from)로 돌아간다. 화면이 h1을 직접 가진다.
            path: 'records/meal/previous/:date?',
            element: <MealPreviousPage />,
            handle: {
              screenId: 'D03-1',
              title: '이전 식단 상세',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal/list',
            } satisfies RouteHandle,
          },
          {
            // D01-1·D01-2·D01-3 끼니 상세(아침·점심·저녁). 세 화면이 같은 구조라 `:meal`(breakfast·lunch·dinner)로 한 페이지를 쓰며, 잘못된 끼니는 화면이 안내한다.
            // `record`는 위의 고정 경로가 먼저 맞는다. 하단 탭은 유지하고 상위 화면은 D01이다. 화면이 h1을 직접 가진다.
            path: 'records/meal/:meal',
            element: <MealDetailPage />,
            handle: {
              screenId: 'D01-1·D01-2·D01-3',
              title: '끼니 식단 상세',
              tab: 'records',
              focus: false,
              ownH1: true,
              domain: 'meal',
              parent: '/records/meal',
            } satisfies RouteHandle,
          },
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
          {
            // P08 알림 목록. 화면명세 v5.0은 URL을 정의하지 않아 `/notifications`는 사용자 지시로 정한 임시 확정이다.
            // 진입: 홈 인사 줄·마이페이지 프로필 줄의 벨 링크. 비회원은 AuthGate의 로그인 안내를 본다.
            // 하단 탭은 활성 탭이 없고(홈·마이 어디에서든 올 수 있다), 뒤로가기는 진입한 화면(state.from)이며 모르면 홈이다.
            // 화면이 보이는 제목(h1 "알림")을 직접 그린다.
            path: 'notifications',
            element: <NotificationsPage />,
            handle: {
              screenId: 'P08',
              title: '알림 목록',
              tab: null,
              focus: false,
              ownH1: true,
              domain: 'brand',
              parent: '/home',
            } satisfies RouteHandle,
          },
          {
            // P07 즐겨찾기. 화면명세 v5.0은 URL을 정의하지 않아 `/favorites`는 사용자 지시로 정한 임시 확정이다. 회원 전용(AuthGate).
            // 진입: 상세 설정(P09)의 "즐겨찾기"(진입 화면을 state.from으로 알려 "이전"이 설정으로 돌아온다). 모르면 마이페이지(P01)로 돌아간다.
            // 화면이 h1 "즐겨찾기"를 직접 가진다.
            path: 'favorites',
            element: <FavoritesPage />,
            handle: {
              screenId: 'P07',
              title: '즐겨찾기',
              tab: 'my',
              focus: false,
              ownH1: true,
              domain: 'brand',
              parent: '/mypage',
            } satisfies RouteHandle,
          },
          {
            // P15 레벨 안내. `/mypage/level`은 사용자 지시로 정한 임시 확정이다(v5.0은 URL 미정의). 회원 전용(AuthGate), 상위 화면은 P01이다.
            // 진입: 마이페이지 "나의 성장"의 "레벨 안내" 링크. 화면이 h1 "레벨 안내"를 직접 가진다.
            path: 'mypage/level',
            element: <LevelGuidePage />,
            handle: {
              screenId: 'P15',
              title: '레벨 안내',
              tab: 'my',
              focus: false,
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
      {
        // I02 AI 운동 플랜 안내. URL `/ai/exercise`는 사용자 승인으로 확정했다(v5.0은 URL 미정의). 비회원 공개(AuthGate 밖)이며 고정 예시만 보여 준다.
        // 실제 AI 추천·저장·체험 횟수 처리는 없다. 상위 화면은 I01이고 화면이 h1을 직접 가진다. 조건 선택(I02-1)은 아직 없어 CTA는 준비 중이다.
        path: 'ai/exercise',
        element: <AiExercisePage />,
        handle: {
          screenId: 'I02',
          title: 'AI 운동 플랜 안내',
          tab: 'ai',
          focus: false,
          ownH1: true,
          domain: 'brand',
          parent: '/ai',
        } satisfies RouteHandle,
      },
      {
        // I01 AI 서비스 안내(비회원 공개). 소개만 하며 실제 AI 기능·체험 횟수 처리는 없다. 화면이 h1 "AI 코칭"을 직접 가진다.
        path: 'ai',
        element: <AiPage />,
        handle: {
          screenId: 'I01',
          title: 'AI 서비스 안내',
          tab: 'ai',
          focus: false,
          ownH1: true,
          domain: 'brand',
          parent: null,
          transition: 'fade',
        } satisfies RouteHandle,
      },
      {
        // S01 공지사항(공개: 비회원도 열람). 운영 공지 API가 없어 목록은 비어 있다. 상위 화면은 상세 설정(P09)이다(명세).
        // 설정에서 들어오면 state.from, 랜딩 푸터에서 들어오면 홈으로 돌아간다. 화면이 h1 "공지사항"을 직접 가진다.
        path: 'support',
        element: <SupportPage />,
        handle: {
          screenId: 'S01',
          title: '공지사항',
          tab: 'my',
          focus: false,
          ownH1: true,
          domain: 'brand',
          parent: '/settings',
        } satisfies RouteHandle,
      },
      {
        // S01-1 공지사항 상세(공개). `/support/notices/:noticeId`는 사용자 지시로 정한 임시 확정이다. 상위 화면은 S01이며
        // 목록에서 들어오면 검색어를 유지한 목록 경로가 state.from으로 온다.
        path: 'support/notices/:noticeId',
        element: <NoticeDetailPage />,
        handle: {
          screenId: 'S01-1',
          title: '공지사항 상세',
          tab: 'my',
          focus: false,
          ownH1: true,
          domain: 'brand',
          parent: '/support',
        } satisfies RouteHandle,
      },
      {
        // S04 FAQ(공개). `/support/faq`는 사용자 지시로 정한 임시 확정이다. 상위 화면은 상세 설정(P09)이다(명세).
        path: 'support/faq',
        element: <FaqPage />,
        handle: {
          screenId: 'S04',
          title: '자주 묻는 질문',
          tab: 'my',
          focus: false,
          ownH1: true,
          domain: 'brand',
          parent: '/settings',
        } satisfies RouteHandle,
      },
      {
        // 404 임시 최소 처리. 정식 디자인은 확정 후 반영한다.
        path: '*',
        element: <NotFoundPlaceholder />,
        handle: notFoundHandle,
      },
    ],
  },
])
