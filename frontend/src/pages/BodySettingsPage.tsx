import { useNavigate } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import { useBodyMeasurementStatus } from '../body-measurements/useBodyMeasurementStatus.ts'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import BodySettingsView from '../components/settings/body/BodySettingsView.tsx'

function BodyContent({
  userId,
  cancelTo,
}: {
  userId: string
  cancelTo: string
}) {
  const navigate = useNavigate()
  const { state, save, reload } = useBodyMeasurementStatus(userId)
  return (
    <BodySettingsView
      body={state}
      save={save}
      onRetry={reload}
      onCancel={() => void navigate(cancelTo)}
    />
  )
}

/**
 * P06 키·몸무게 입력(`/settings/body`, 회원 전용). 기존 신체 정보 저장소(`useBodyMeasurementStatus`)와 입력 폼(BodyInfoForm)을 재사용한다.
 * 등록 여부만 읽고 수치는 읽지도 보이지도 않는다(열람은 P05의 2차 비밀번호 확인 뒤에만). 운영 빌드(저장 수단 없음)는 폼 없이 "연결 전"만 보인다.
 * 상위 화면은 상세 설정(P09)이고, 진입한 화면(`state.from`: 마이페이지·프로필 등)이 있으면 취소·"이전"이 그곳으로 돌아간다. 화면이 h1을 직접 가진다.
 * 계정이 바뀌면 key로 새로 시작해 이전 사용자의 입력·상태가 남지 않는다.
 */
export default function BodySettingsPage() {
  const { user } = useAuth()
  usePageTitle('키·몸무게 입력')
  const cancelTo = useBackTarget('/settings') ?? '/settings'
  if (!user) return null
  return <BodyContent key={user.id} userId={user.id} cancelTo={cancelTo} />
}
