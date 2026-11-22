/**
 * FAQ(S04)의 질문·답변. 지금 구현되어 있거나 정책이 확정된 내용만 적는다.
 * 멤버십·결제·AI 기능·포인트 지급 기준처럼 정책이 확정되지 않은 내용은 안내하지 않는다.
 * 각 답변의 근거: 라우터의 접근 정책(공개: 탐색·고객지원, 로그인: 기록·마이), 운동 탐색(E01)·운동 상세(E02)·즐겨찾기(P07)·알림(P08)·레벨 안내(P15) 화면.
 * 분류는 화면명세 v5.0(S04)의 분류 중 이 답변들이 속하는 것만 쓴다.
 */
export type FaqCategory = '운동' | '음식' | '계정'

export interface FaqItem {
  id: string
  category: FaqCategory
  question: string
  answer: string
  /** 관련 화면. 앱 안에 이미 있는 경로만 쓴다. */
  related?: { label: string; to: string }
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'find-exercise',
    category: '운동',
    question: '운동은 어떻게 찾나요?',
    answer:
      '운동 탐색에서 운동 이름으로 검색하거나 난이도·운동 부위·운동 도구 조건으로 찾을 수 있어요. 가입하지 않아도 이용할 수 있어요.',
    related: { label: '운동 탐색으로 이동', to: '/exercises' },
  },
  {
    id: 'exercise-detail',
    category: '운동',
    question: '운동 상세에서는 무엇을 볼 수 있나요?',
    answer:
      '운동 방법과 주의사항 같은 운동 안내를 볼 수 있어요. 운동 탐색 결과에서 운동을 선택하면 열려요.',
    related: { label: '운동 탐색으로 이동', to: '/exercises' },
  },
  {
    id: 'exercise-favorite',
    category: '운동',
    question: '운동 즐겨찾기는 어떻게 하나요?',
    answer:
      '로그인한 회원은 운동 상세 화면의 별 버튼으로 즐겨찾기에 추가하거나 해제할 수 있어요. 추가한 운동은 즐겨찾기 화면에서 모아 볼 수 있어요.',
    related: { label: '즐겨찾기로 이동', to: '/favorites' },
  },
  {
    id: 'find-food',
    category: '음식',
    question: '음식은 어떻게 찾나요?',
    answer:
      '음식 검색 화면에서 음식 종류와 영양 조건으로 찾도록 준비된 화면이에요. 검색 결과를 불러오는 기능은 아직 연결되지 않아 일부는 이용할 수 없어요.',
    related: { label: '음식 검색으로 이동', to: '/foods' },
  },
  {
    id: 'guest-access',
    category: '계정',
    question: '가입하지 않아도 쓸 수 있나요?',
    answer:
      '운동 탐색·음식 검색·공지사항·FAQ는 가입 없이 볼 수 있어요. 기록과 마이페이지는 로그인이 필요해요.',
    related: { label: '로그인으로 이동', to: '/login' },
  },
  {
    id: 'notifications',
    category: '계정',
    question: '알림은 어디에서 확인하나요?',
    answer:
      '홈 인사 줄과 마이페이지의 벨 아이콘, 또는 상세 설정의 알림 목록에서 확인할 수 있어요. 로그인한 회원에게 보여요.',
    related: { label: '알림 목록으로 이동', to: '/notifications' },
  },
  {
    id: 'level-points',
    category: '계정',
    question: '레벨·경험치·포인트는 무엇인가요?',
    answer:
      '마이페이지의 활동 레벨, 경험치(EXP), 포인트는 서로 다른 값이에요. 차이는 레벨 안내에서 볼 수 있어요. 경험치 적립과 포인트 지급 기준은 아직 정해지지 않았어요.',
    related: { label: '레벨 안내로 이동', to: '/mypage/level' },
  },
]

/** 질문·답변에서 검색어를 찾는다(대소문자·앞뒤 공백 무시). 검색어가 비어 있으면 전체를 돌려준다. */
export function filterFaq(
  items: readonly FaqItem[],
  query: string,
): readonly FaqItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return items
  return items.filter(
    (item) =>
      item.question.toLowerCase().includes(q) ||
      item.answer.toLowerCase().includes(q),
  )
}
