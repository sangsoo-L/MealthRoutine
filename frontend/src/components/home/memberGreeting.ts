/**
 * 회원 홈의 상황별 한 줄 인사. 문구와 선택 규칙은 스토리보드 v5.0 H01의 인사 규칙을 옮긴 것이다.
 *
 * - 시간대(새벽 6시 전·오전·오후·저녁)별 문구에 요일 문구(주말, 월요일)를 더한 목록에서 하나를 고른다.
 * - 같은 시간대에는 같은 문구가 유지되도록 회원 구분값·날짜·시각으로 정해지는 값을 쓴다(무작위가 아니다).
 * - 날씨 조건 문구는 쓰지 않는다. 스토리보드의 날씨는 시안 상태값일 뿐이고 실제 날씨 API·위치 연동이 없으며,
 *   날씨를 알 수 없으면 요일·시간 인사만 쓰는 것이 규칙이다.
 */

const NIGHT = ['늦은 시간엔 충분히 쉬어가요.', '오늘의 마무리도 편안하게.']
const MORNING = [
  '가벼운 움직임으로 아침을 열어봐요.',
  '오늘도 나만의 속도로 시작해요.',
]
const AFTERNOON = [
  '잠깐 몸을 펴고 오후를 이어가요.',
  '오늘의 작은 실천을 만나볼까요?',
]
const EVENING = ['하루의 끝, 나의 루틴을 돌아봐요.', '편안한 저녁 보내세요.']

const WEEKEND = '주말에도 나만의 리듬으로.'
const MONDAY = '새로운 한 주도 가볍게 시작해요.'

/** 문자열을 0 이상의 정수로 바꾸는 간단한 해시. 같은 입력이면 항상 같은 값이다. */
function hashString(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

/** 현재 시각(브라우저 기준)에 맞는 인사 후보 목록 */
function greetingCandidates(now: Date): string[] {
  const day = now.getDay()
  const hour = now.getHours()
  let lines =
    hour < 6 ? NIGHT : hour < 12 ? MORNING : hour < 18 ? AFTERNOON : EVENING
  if (day === 0 || day === 6) lines = [...lines, WEEKEND]
  if (day === 1 && hour >= 6) lines = [...lines, MONDAY]
  return lines
}

/**
 * 인사 한 줄을 고른다. `seed`는 회원을 구분하는 값(예: 닉네임)이며, 같은 회원이 같은 날 같은 시각에 열면 같은 문구가 나온다.
 */
export function getContextGreeting(now: Date, seed: string): string {
  const lines = greetingCandidates(now)
  const key = `${seed}|${now.toDateString()}|${now.getHours()}`
  return lines[hashString(key) % lines.length]
}
