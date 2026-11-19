import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import type { BodyMeasurementStatus } from '../body-measurements/bodyTypes.ts'
import { useBodyMeasurementStatus } from '../body-measurements/useBodyMeasurementStatus.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { useTodayQuizCompleted } from '../quiz/useDailyQuiz.ts'
import BodyInfoPrompt from '../components/body-measurements/BodyInfoPrompt.tsx'
import BodyInfoSheet from '../components/body-measurements/BodyInfoSheet.tsx'
import NotificationBellLink from '../components/notifications/NotificationBellLink.tsx'
import HomeBodyInfoCard, {
  HomeBodyInfoRetry,
} from '../components/home/HomeBodyInfoCard.tsx'
import WeightNotificationSyncNotice from '../components/weight-log/WeightNotificationSyncNotice.tsx'
import HomeWeightCheckCard, {
  HomeWeightCheckRetry,
} from '../components/home/HomeWeightCheckCard.tsx'
import HomeDiscovery from '../components/home/HomeDiscovery.tsx'
import HomeGreeting from '../components/home/HomeGreeting.tsx'
import HomeNotices from '../components/home/HomeNotices.tsx'
import HomeQuizCard from '../components/home/HomeQuizCard.tsx'
import HomeRecommendationBanner from '../components/home/HomeRecommendationBanner.tsx'
import HomeShortcuts from '../components/home/HomeShortcuts.tsx'
import HomeTodayRecords from '../components/home/HomeTodayRecords.tsx'
import { HOME_GUIDE_TEXT } from '../components/home/homeContent.ts'
import { selectHomeBodyInfoView } from '../components/home/homeBodyInfo.ts'
import {
  selectHomeWeightRetry,
  selectHomeWeightView,
} from '../components/home/homeWeightCheck.ts'
import WeightLogSheet from '../components/weight-log/WeightLogSheet.tsx'
import {
  markWeightCardDismissed,
  readWeightCardDismissal,
} from '../weight-log/weightCardDismissal.ts'
import { useWeightCheck } from '../weight-log/useWeightCheck.ts'

/**
 * 로그인한 회원의 홈. 같은 /home 경로에서 HomePage가 로그인 상태일 때 보여 준다.
 *
 * 구성과 순서는 스토리보드 v5.0 H01의 회원 화면을 따르고, 사용자 지시로 인사 아래에 규칙 기반 "오늘의 추천" 배너를 더했다(스토리보드에는 없는 구성):
 * 인사 → 오늘의 추천 → 핵심 기능 바로가기 6개 → 오늘의 기록 → 퀴즈 → 처음이라면 여기부터 → 공지.
 * 계정 정보·회원 유형·AI 이용 권한·로그아웃은 홈의 주요 콘텐츠가 아니라서 마이페이지(MyAccountPanel)로 옮겼다. 화면 제목(h1)은 AppBar가 가진다.
 *
 * 섹션 구분: 섹션 사이는 모두 같은 간격(gap-10 = 40px)이고, 오늘의 기록과 처음이라면 여기부터만 흰 밴드(sectionBand)로 감싼다.
 * 그래서 페이지 배경 → 흰 밴드 → 페이지 배경 → 흰 밴드 → 페이지 배경 순으로 면이 번갈아 나온다. 인사와 추천은 한 덩어리(gap-5)다.
 * 공지사항과 하단 탭 사이 여백은 AppShell 본문 하단 패딩(20px)과 BottomNav 위쪽의 완충 영역(16px)이 만든다(합 36px). 이 화면이 따로 더하지 않는다.
 * 스크롤 중 본문이 하단 탭 뒤로 지나갈 때의 경계도 그 완충 영역이 맡는다(화면별 여백으로는 해결되지 않는다).
 *
 * 연결된 API와 기록 기능이 없어서 오늘의 기록은 "아직 기록이 없어요" 상태만 보여 주고, 가짜 기록이나 수치를 만들지 않는다.
 * 퀴즈 카드와 커뮤니티 바로가기는 이동할 화면이 없어 "준비 중" 표시가 있는 비대화형 요소다.
 *
 * 신체 정보: 등록 여부는 이 화면이 한 번만 조회해(useBodyMeasurementStatus) 아래 둘이 같은 상태를 공유한다.
 * - 안내 팝업(BodyInfoPrompt): 키·몸무게 중 하나라도 누락되면 바텀시트로 한 번 안내한다(입력은 같은 시트에서 한다. 닫으면 이 홈 화면에 머무는 동안만 다시 띄우지 않고, 홈에 다시 들어오거나 새로고침하면 누락인 한 다시 띄운다).
 * - 추천 영역(selectHomeBodyInfoView): 누락이면 기존 추천 배너를 입력 유도 카드로 대체한다. 팝업을 닫아도 카드는 남고, 저장이 끝나면 기존 추천으로 돌아간다.
 *   조회 중·API 미연결은 기존 배너를 유지하고(미연결을 등록 완료로 보지 않는다), 조회 실패는 기존 배너에 재시도 안내를 붙인다.
 *
 * 알림: 인사 줄 오른쪽의 벨(NotificationBellLink)이 읽지 않은 알림 수를 보이고 알림 목록(P08, /notifications)으로 간다.
 *
 * 월간 몸무게 확인: 신체 정보가 모두 등록된 뒤에만 평가한다(selectHomeWeightView). 몸무게 기록 상태 조회가 실패하면 기존 추천 아래에 재시도 안내를 붙인다(selectHomeWeightRetry, 신체 정보 조회 실패 안내가 우선). 우선순위는 신체 정보 입력 카드 → 기록 불일치 카드 → 월간 확인 카드 → 기존 추천이며
 * 하나의 주요 카드만 보인다. "나중에 하기"는 서울 기준 그날만 카드를 숨기고(weightCardDismissal.ts) 기록 완료·알림 읽음이 아니다.
 *
 * 보류(스토리보드에는 있으나 선행 조건이 없는 부분): 등록 완료 시 루틴 탐색 배너, 날씨 조건 인사(실제 날씨 연동 없음).
 */
export default function MemberHomePage() {
  const { user } = useAuth()

  // HomePage가 로그인 상태에서만 이 화면을 렌더링하므로 사용자가 없는 경우는 도달하지 않는다.
  if (!user) return null

  // key: 계정이 바뀌면 팝업·시트 상태까지 새로 시작한다(이전 계정의 닫힘 표시나 열린 시트가 남지 않게).
  return <MemberHome key={user.id} userId={user.id} nickname={user.nickname} />
}

function MemberHome({
  userId,
  nickname,
}: {
  userId: string
  nickname: string
}) {
  const { state, save, reload } = useBodyMeasurementStatus(userId)
  // 오늘의 퀴즈를 이미 마쳤으면 홈의 퀴즈 카드를 숨긴다(마친 퀴즈는 /quiz에서 다시 볼 수 있다).
  const quizCompleted = useTodayQuizCompleted(userId, useLocalToday())
  const view = selectHomeBodyInfoView(state)
  // 카드의 "지금 입력하기"로 연 시트. 열 때의 등록 여부를 기억해 닫히는 동안 입력란이 바뀌지 않게 한다.
  const [cardSheet, setCardSheet] = useState<BodyMeasurementStatus | null>(null)
  // 월간 몸무게 확인: 기록 상태, "나중에 하기"(오늘만), 카드에서 연 입력 시트
  const weight = useWeightCheck(userId)
  const [dismissal, setDismissal] = useState(() =>
    readWeightCardDismissal(userId),
  )
  const [weightSheet, setWeightSheet] = useState<'due' | 'mismatch' | null>(
    null,
  )
  const weightView = selectHomeWeightView({
    body: state,
    weight: weight.state,
    dismissal,
  })
  const weightRetry = selectHomeWeightRetry({
    body: state,
    weight: weight.state,
    retrying: weight.retrying,
  })
  const recommendationRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const retryFocus = useRef(false)

  // 저장에 성공하거나 "나중에 하기"를 누르면 카드가 사라져 시트·버튼이 돌려줄 포커스 대상이 없어진다.
  // 포커스가 문서 처음으로 빠지면 추천 영역으로 옮긴다.
  useEffect(() => {
    if (cardSheet !== null || weightSheet !== null || !restoreFocus.current)
      return
    restoreFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) {
      recommendationRef.current?.focus()
    }
  }, [cardSheet, weightSheet, dismissal])

  // "다시 확인"의 결과가 나와 안내가 사라지면 포커스가 문서 처음으로 빠지지 않게 추천 영역으로 옮긴다(실패해 안내가 남으면 버튼이 포커스를 유지한다).
  const weightStatus = weight.state.status
  useEffect(() => {
    if (!retryFocus.current || weightStatus === 'loading') return
    retryFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) {
      recommendationRef.current?.focus()
    }
  }, [weightStatus])

  return (
    <div className="flex flex-col gap-10 break-keep wrap-anywhere">
      <div className="flex flex-col gap-5">
        {/* 인사 줄 오른쪽의 알림 벨(P08 진입). 폭이 모자라면(글자 확대) 벨이 아래 줄로 내려가고 인사가 한 글자씩 쌓이지 않는다. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-48">
            <HomeGreeting nickname={nickname} />
          </div>
          <NotificationBellLink userId={userId} from="/home" />
        </div>
        <div
          ref={recommendationRef}
          tabIndex={-1}
          className="flex flex-col gap-3 outline-none"
        >
          {view.kind === 'card' ? (
            <HomeBodyInfoCard
              missing={view.missing}
              onOpen={() => {
                if (state.status === 'ready') setCardSheet(state.value)
              }}
            />
          ) : weightView.kind === 'card' ? (
            <HomeWeightCheckCard
              variant={weightView.variant}
              onRecord={() => setWeightSheet(weightView.variant)}
              onLater={() => {
                if (weight.state.status !== 'ready') return
                restoreFocus.current = true
                setDismissal(
                  markWeightCardDismissed(userId, weight.state.value.today),
                )
              }}
            />
          ) : (
            <HomeRecommendationBanner />
          )}
          {view.kind === 'banner-with-retry' ? (
            <HomeBodyInfoRetry
              onRetry={() => {
                reload()
                // 몸무게 기록 상태도 실패한 상태라면(신체 정보를 함께 읽는 조회가 같이 실패한다) 한 번의 "다시 확인"으로 함께 다시 조회한다.
                if (weight.state.status === 'error') weight.reload()
              }}
            />
          ) : weightRetry !== 'none' ? (
            // 신체 정보 조회 실패 안내가 먼저다(둘이 함께 실패하면 몸무게 안내는 보이지 않는다).
            <HomeWeightCheckRetry
              busy={weightRetry === 'retrying'}
              onRetry={() => {
                retryFocus.current = true
                weight.reload()
              }}
            />
          ) : null}
          {weight.notificationSync !== 'idle' ? (
            // 몸무게 기록은 성공했고 알림 완료 처리만 실패한 상태. 기록을 다시 하지 않고 알림 처리만 다시 시도한다.
            <WeightNotificationSyncNotice
              busy={weight.notificationSync === 'retrying'}
              onRetry={weight.retryNotificationSync}
            />
          ) : null}
        </div>
      </div>
      <HomeShortcuts />
      <HomeTodayRecords />
      {quizCompleted ? null : <HomeQuizCard />}
      <HomeDiscovery note={HOME_GUIDE_TEXT.memberNote} />
      <HomeNotices />
      <BodyInfoPrompt state={state} save={save} />
      {cardSheet ? (
        <BodyInfoSheet
          variant="home"
          status={cardSheet}
          save={save}
          onClose={() => {
            restoreFocus.current = true
            setCardSheet(null)
          }}
        />
      ) : null}
      {weightSheet ? (
        <WeightLogSheet
          variant={weightSheet}
          log={weight.log}
          onClose={() => {
            restoreFocus.current = true
            setWeightSheet(null)
          }}
        />
      ) : null}
    </div>
  )
}
