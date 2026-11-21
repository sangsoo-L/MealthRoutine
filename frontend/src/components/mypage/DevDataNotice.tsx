/**
 * 개발용 데이터 안내. 개발 서버에서 개발용 값(임시 회원의 레벨·포인트·이해도 초기값, `?sample` 예시)이 화면에 있을 때만
 * 화면 맨 위에 한 줄로 보인다. 구역마다 배지를 반복하지 않는 대신 이 한 줄이 "실제 회원 정보가 아님"을 알린다.
 *
 * 운영 빌드에는 개발용 값이 없고 이 컴포넌트도 렌더링되지 않는다(호출하는 쪽이 import.meta.env.DEV로 거른다).
 * 운영에서 값이 없는 구역은 개발용 값으로 채우지 않고 "연결 전"·"미확인"으로 표시한다.
 */
export default function DevDataNotice() {
  return (
    <p
      role="note"
      className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-semibold text-warning"
    >
      개발용 임시 데이터가 포함돼 있어요. 실제 회원 정보가 아니에요.
    </p>
  )
}
