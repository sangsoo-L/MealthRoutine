import { useState } from 'react'
import {
  hasMissingBodyInfo,
  type BodyMeasurementInput,
  type BodyMeasurementState,
  type BodyMeasurementStatus,
} from '../../body-measurements/bodyTypes.ts'
import BodyInfoSheet from './BodyInfoSheet.tsx'

/**
 * 홈 화면의 신체 정보 안내 팝업(모바일은 바텀시트). 로그인한 회원이 홈에 들어왔을 때 키·몸무게 중 하나라도 누락되어 있으면 띄운다.
 *
 * 띄우는 조건은 "조회를 마친 상태에서 키 또는 몸무게가 누락됨"뿐이다. 첫 로그인 여부는 조건이 아니다. 조회 중·조회 실패·API 미연결(unavailable)은
 * 누락이 아니라서 띄우지 않는다.
 *
 * 닫기: "나중에 입력하기"(또는 Esc·배경·닫기 버튼)로 닫으면 **이 홈 화면에 머무는 동안**만 다시 띄우지 않는다. 닫힘 표시는 이 컴포넌트의 상태에만 있고
 * 어디에도 저장하지 않는다. 그래서 다른 화면에 갔다가 홈으로 돌아오거나 새로고침하면(화면이 다시 마운트되면) 여전히 누락인 한 다시 안내한다.
 * 같은 화면 안의 리렌더링·등록 여부 재조회(다시 확인)는 이 상태를 지우지 않으므로 팝업이 반복해서 열리지 않는다.
 * 닫았다고 입력한 것으로 처리하지 않는다(카드는 남는다). 저장이 끝나면 등록 여부가 갱신되어 이후에는 띄우지 않는다.
 * 계정이 바뀌면 부모가 key로 이 화면을 새로 시작한다.
 *
 * 등록 여부 상태와 저장은 부모(MemberHomePage)가 한 번만 조회해 넘긴다. 홈의 입력 유도 카드와 같은 상태를 공유해, 어느 쪽에서 저장해도 함께 갱신된다.
 *
 * 시트를 열 때의 등록 여부를 기억해 넘긴다. 저장 직후 등록 여부가 바뀌어도 닫히는 동안 시트의 입력란이 갑자기 바뀌거나 사라지지 않는다.
 */
export default function BodyInfoPrompt({
  state,
  save,
}: {
  state: BodyMeasurementState
  save: (input: BodyMeasurementInput) => Promise<void>
}) {
  // 이 홈 화면에서 닫았는지. 저장하지 않는다(화면이 다시 마운트되면 처음 상태로 돌아간다).
  const [dismissed, setDismissed] = useState(false)
  const [sheetStatus, setSheetStatus] = useState<BodyMeasurementStatus | null>(
    null,
  )

  // 렌더 중 파생 상태 갱신: 조건이 처음 충족된 이번 렌더에서 곧바로 연다.
  if (
    sheetStatus === null &&
    !dismissed &&
    state.status === 'ready' &&
    hasMissingBodyInfo(state)
  ) {
    setSheetStatus(state.value)
  }

  if (sheetStatus === null) return null

  return (
    <BodyInfoSheet
      variant="home"
      status={sheetStatus}
      save={save}
      onClose={() => {
        setDismissed(true)
        setSheetStatus(null)
      }}
    />
  )
}
