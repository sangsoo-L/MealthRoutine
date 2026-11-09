import type { ReactNode } from 'react'
import type { IconName } from './iconTypes.ts'

/**
 * 아이콘별 SVG 도형. home을 제외하면 스토리보드의 SVG 경로를 그대로 옮긴 것이다.
 * home은 원본의 좌우 비대칭을 바로잡아 사용자 승인에 따라 둥근형(B안)으로 교체했다.
 * 규격(viewBox, 획 두께, 선 끝 모양, 색)은 Icon 컴포넌트가 정하므로 여기에는 도형만 둔다.
 *
 * 모듈 로드 시 한 번만 만들어지는 정적 요소라서 렌더할 때마다 다시 생성하지 않는다.
 * home 외에는 원본 경로를 바꾸지 말 것: clipboard의 rx=2와 clipboard-check·clipboard-plus의 rx=3 차이도 원본 그대로다.
 */
export const ICON_NODES: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 10.2a2 2 0 0 1 .72-1.54l6-5a2 2 0 0 1 2.56 0l6 5a2 2 0 0 1 .72 1.54V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M9.5 21v-6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v4H9zM9 12h6M9 16h4" />
    </>
  ),
  sparkle: (
    <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" />
    </>
  ),
  'chevron-down': <path d="m7 10 5 5 5-5" />,
  'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'chevron-right': <path d="m10 7 5 5-5 5" />,
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  utensils: (
    <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 7v3H17" />
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="m3 3 18 18" />
    </>
  ),
  'clipboard-check': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 3h6v4H9zM8.5 14l2 2 5-5" />
    </>
  ),
  'calendar-plus': (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18m-9 3v5m-2.5-2.5h5" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.7 6.3.9-4.55 4.45 1.07 6.28L12 17.36l-5.62 2.97 1.07-6.28L2.9 9.6l6.3-.9Z" />
  ),
  'clipboard-plus': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 3h6v4H9zM12 11v6m-3-3h6" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
}
