import { useNavigate } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import InquiryForm from '../components/support/InquiryForm.tsx'
import { PATH_MY_INQUIRIES, createInquirySource } from '../inquiry/inquiry.ts'

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createInquirySource()

/**
 * S02 문의 작성(`/support/inquiry`, 회원 전용). 문의 유형·제목·내용을 작성해 등록한다. 문의 접수·저장·답변은 서버 담당이며
 * 서버 연결 전에는 제출 버튼을 비활성으로 두고 "접수되지도 저장되지도 않아요"를 알린다(접수 성공 화면을 만들지 않는다).
 * 서버가 접수 응답을 주면 내 문의(P13)로 이동한다. 입력은 이 화면에서만 유지하고 저장하지 않는다.
 * 상위 화면은 공지사항(S01)이고, 진입한 화면(`state.from`: 상세 설정·내 문의·공지·FAQ)이 있으면 "이전"·취소가 그곳으로 돌아간다. 화면이 h1을 직접 가진다.
 */
export default function InquiryPage() {
  usePageTitle('문의하기')
  const navigate = useNavigate()
  const cancelTo = useBackTarget('/support') ?? '/support'
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          문의하기
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          기록 이용, 계정, 멤버십, 음식 요청에 대한 문의를 남겨 주세요.
        </p>
      </header>
      <InquiryForm
        source={SOURCE}
        cancelTo={cancelTo}
        onSubmitted={() => void navigate(PATH_MY_INQUIRIES, { replace: true })}
      />
    </div>
  )
}
