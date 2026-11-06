import { createBrowserRouter, type RouteObject } from 'react-router'
import AuthGate from '../guards/AuthGate.tsx'
import AppShell from '../layouts/AppShell.tsx'
import HomePage from '../pages/HomePage.tsx'
import IntroPage from '../pages/IntroPage.tsx'
import LoginPage from '../pages/LoginPage.tsx'
import PagePlaceholder, {
  NotFoundPlaceholder,
} from '../pages/PagePlaceholder.tsx'
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
// landing: 비회원일 때만 AppBar와 하단 탭을 숨긴다(AppShell). 회원 홈은 일반 화면이라 focus는 false다.
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
  domain: 'brand',
  parent: '/home',
}

const signupHandle: RouteHandle = {
  screenId: 'A03',
  title: '회원가입',
  tab: 'home',
  focus: true,
  domain: 'brand',
  parent: '/login',
}

const surveyHandle: RouteHandle = {
  screenId: 'A02',
  // 스토리보드 앱바의 질문 단계 제목. 최종 확인 단계의 '시작 전 확인'은 정적 handle로 바꿀 수 없어 반영하지 않았다.
  title: '나에게 맞는 시작',
  tab: 'home',
  focus: true,
  domain: 'brand',
  // 다른 화면과 연결하지 않는다. 개발용으로 주소를 직접 입력해 확인하는 화면이다.
  parent: null,
}

const notFoundHandle: RouteHandle = {
  screenId: null,
  title: '페이지를 찾을 수 없습니다',
  tab: null,
  focus: false,
  domain: 'brand',
  parent: '/home',
}

// 근거: 화면명세 v5.0(화면 ID·화면명), URL은 팀과 정한 임시 경로 (대표 경로만 정의)
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
      placeholderRoute({
        path: 'exercises',
        screenId: 'E01',
        title: '운동 탐색',
        tab: 'explore',
        focus: false,
        domain: 'exercise',
        parent: '/home',
        transition: 'fade',
      }),
      placeholderRoute({
        path: 'foods',
        screenId: 'F01',
        title: '음식 검색',
        tab: 'explore',
        focus: false,
        domain: 'meal',
        parent: '/home',
        transition: 'fade',
      }),
      {
        // 비회원 접근 정책: 기록·마이는 로그인 안내를 보여 준다(탐색·AI·고객지원은 공개).
        // 경로를 만들지 않는 레이아웃 라우트라 URL·handle(활성 탭, 앱바 제목)은 그대로 유지된다.
        // 로그인 여부는 AuthProvider의 상태를 따른다. 현재 로그인은 UI 개발용이며 실제 인증이 아니다.
        element: <AuthGate />,
        children: [
          placeholderRoute({
            path: 'records/exercise',
            screenId: 'W01',
            title: '운동 기록 대시보드',
            tab: 'records',
            focus: false,
            domain: 'exercise',
            parent: '/home',
            transition: 'fade',
          }),
          placeholderRoute({
            path: 'records/meal',
            screenId: 'D01',
            title: '식단 기록 대시보드',
            tab: 'records',
            focus: false,
            domain: 'meal',
            parent: '/home',
            transition: 'fade',
          }),
          placeholderRoute({
            path: 'mypage',
            screenId: 'P01',
            title: '마이페이지',
            tab: 'my',
            focus: false,
            domain: 'brand',
            parent: '/home',
            transition: 'fade',
          }),
        ],
      },
      placeholderRoute({
        path: 'ai',
        screenId: 'I01',
        title: 'AI 서비스 안내',
        tab: 'ai',
        focus: false,
        domain: 'brand',
        parent: '/home',
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
