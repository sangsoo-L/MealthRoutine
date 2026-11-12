import { useState } from 'react'
import {
  hasMissingBodyInfo,
  type BodyMeasurementStatus,
} from '../../body-measurements/bodyTypes.ts'
import {
  isBodyPromptDismissed,
  markBodyPromptDismissed,
} from '../../body-measurements/promptDismissal.ts'
import { useBodyMeasurementStatus } from '../../body-measurements/useBodyMeasurementStatus.ts'
import BodyInfoSheet from './BodyInfoSheet.tsx'

/**
 * 홈 화면의 신체 정보 안내 팝업(모바일은 바텀시트). 로그인한 회원이 홈에 들어왔을 때 키·몸무게 중 하나라도 누락되어 있으면 한 번 띄운다.
 *
 * 띄우는 조건은 "조회를 마친 상태에서 키 또는 몸무게가 누락됨"뿐이다. 첫 로그인 여부는 조건이 아니다(첫 로그인이라는 이유만으로 다시
 * 요구하지 않는다. 첫 로그인 정보는 아직 없어, 생기면 안내 시점을 고르는 보조 정보로만 쓴다). 조회 중·조회 실패·API 미연결(unavailable)은
 * 누락이 아니라서 띄우지 않는다.
 *
 * 닫기: "나중에 입력하기"(또는 Esc·배경·닫기 버튼)로 닫으면 같은 로그인 세션에서는 다시 띄우지 않는다(promptDismissal.ts). 다음 로그인에서도
 * 여전히 누락이면 다시 안내한다. 닫았다고 입력한 것으로 처리하지 않는다. 저장이 끝나면 등록 여부가 갱신되어 이후에는 띄우지 않는다.
 *
 * 시트를 열 때의 등록 여부를 기억해 넘긴다. 저장 직후 등록 여부가 바뀌어도 닫히는 동안 시트의 입력란이 갑자기 바뀌거나 사라지지 않는다.
 */
export default function BodyInfoPrompt({ userId }: { userId: string }) {
  const { state, save } = useBodyMeasurementStatus(userId)
  const [dismissed, setDismissed] = useState(() =>
    isBodyPromptDismissed(userId),
  )
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
        markBodyPromptDismissed(userId)
        setDismissed(true)
        setSheetStatus(null)
      }}
    />
  )
}
