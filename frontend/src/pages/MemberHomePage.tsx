import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import type { BodyMeasurementStatus } from '../body-measurements/bodyTypes.ts'
import { useBodyMeasurementStatus } from '../body-measurements/useBodyMeasurementStatus.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { buildRecentActivity } from '../home-activity/homeActivity.ts'
import { useHomeActivity } from '../home-activity/useHomeActivity.ts'
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
import HomeGreeting from '../components/home/HomeGreeting.tsx'
import HomeNotices from '../components/home/HomeNotices.tsx'
import HomeQuizCard from '../components/home/HomeQuizCard.tsx'
import HomeShortcuts from '../components/home/HomeShortcuts.tsx'
import HomeRecentActivity from '../components/home/HomeRecentActivity.tsx'
import HomeTodayRecords from '../components/home/HomeTodayRecords.tsx'
import HomeWeeklyActivity from '../components/home/HomeWeeklyActivity.tsx'
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
 * 로그인한 회원의 홈(H01). 같은 /home 경로에서 HomePage가 로그인 상태일 때 보여 준다. 나의 건강관리 현황을 확인하는 대시보드다.
 *
 * 구성과 순서(사용자 지시로 정리, 토스식 정보 우선순위): 인사·알림 → (필수 안내 카드) → 이번 주 나의 활동 → 빠른 실행 → 오늘의 기록
 * → 최근 활동 → 퀴즈 → 공지. 각 영역은 밝은 배경 위의 독립된 흰 카드다(homeCard).
 * 이전의 "오늘의 추천" 배너와 "처음이라면 여기부터"(검색 사용법 소개)는 홈에서 뺐다. 검색 사용법 소개는 비회원 랜딩(H01)의 "가입 없이 둘러보기"로
 * 옮겼고, 운동·음식 검색 자체는 빠른 실행에서 계속 쓸 수 있다. 추천 정책·조회 모듈(homeRecommendation*·home-recommendation/)은 지금 홈이 쓰지 않지만
 * 다시 쓸 수 있게 남겨 두었다(홈은 추천을 위한 기록 조회를 하지 않는다).
 * 계정 정보·회원 유형·AI 이용 권한·로그아웃은 홈의 주요 콘텐츠가 아니라서 마이페이지(MyAccountPanel)로 옮겼다. 화면 제목(h1)은 AppShell이 보조기기용으로 넣는다.
 *
 * 기록 데이터: 운동·식단 기록은 이 화면이 한 번씩만 읽어(useHomeActivity) 이번 주 나의 활동·오늘의 기록·최근 활동이 나눠 쓴다(집계 기준은 home-activity/homeActivity.ts).
 * 읽는 중·저장 수단 없음·조회 실패는 "기록 없음"(0일)이 아니며 영역별로 따로 안내한다. 가짜 기록이나 수치를 만들지 않는다.
 * 퀴즈 카드와 커뮤니티 바로가기는 각각 오늘의 퀴즈와 준비 중 표시가 있는 비대화형 요소다.
 *
 * 신체 정보: 등록 여부는 이 화면이 한 번만 조회해(useBodyMeasurementStatus) 아래 둘이 같은 상태를 공유한다.
 * - 안내 팝업(BodyInfoPrompt): 키·몸무게 중 하나라도 누락되면 바텀시트로 한 번 안내한다(입력은 같은 시트에서 한다. 닫으면 이 홈 화면에 머무는 동안만 다시 띄우지 않고, 홈에 다시 들어오거나 새로고침하면 누락인 한 다시 띄운다).
 * - 필수 안내 카드(selectHomeBodyInfoView): 누락이면 이번 주 나의 활동 위에 입력 유도 카드가 먼저 보인다. 팝업을 닫아도 카드는 남고, 저장이 끝나면 사라진다.
 *   조회 중·API 미연결은 카드를 만들지 않고(미연결을 등록 완료로 보지 않는다), 조회 실패는 재시도 안내를 보인다.
 *
 * 알림: 인사 줄 오른쪽의 벨(NotificationBellLink)이 읽지 않은 알림 수를 보이고 알림 목록(P08, /notifications)으로 간다.
 *
 * 월간 몸무게 확인: 신체 정보가 모두 등록된 뒤에만 평가한다(selectHomeWeightView). 몸무게 기록 상태 조회가 실패하면 재시도 안내를 보인다(selectHomeWeightRetry, 신체 정보 조회 실패 안내가 우선).
 * 우선순위는 신체 정보 입력 카드 → 기록 불일치 카드 → 월간 확인 카드이며 하나의 주요 카드만 보인다. "나중에 하기"는 서울 기준 그날만 카드를 숨기고(weightCardDismissal.ts) 기록 완료·알림 읽음이 아니다.
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
  const today = useLocalToday()
  const quizCompleted = useTodayQuizCompleted(userId, today)
  // 운동·식단 기록은 한 번만 읽어 이번 주 활동·오늘의 기록·최근 활동이 나눠 쓴다.
  const activity = useHomeActivity(userId, today)
  const recent = useMemo(
    () => buildRecentActivity(activity.exercise, activity.meal),
    [activity.exercise, activity.meal],
  )
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
  const topAreaRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const retryFocus = useRef(false)

  // 저장에 성공하거나 "나중에 하기"를 누르면 카드가 사라져 시트·버튼이 돌려줄 포커스 대상이 없어진다.
  // 포커스가 문서 처음으로 빠지면 맨 위 영역으로 옮긴다.
  useEffect(() => {
    if (cardSheet !== null || weightSheet !== null || !restoreFocus.current)
      return
    restoreFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) {
      topAreaRef.current?.focus()
    }
  }, [cardSheet, weightSheet, dismissal])

  // "다시 확인"의 결과가 나와 안내가 사라지면 포커스가 문서 처음으로 빠지지 않게 맨 위 영역으로 옮긴다(실패해 안내가 남으면 버튼이 포커스를 유지한다).
  const weightStatus = weight.state.status
  useEffect(() => {
    if (!retryFocus.current || weightStatus === 'loading') return
    retryFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) {
      topAreaRef.current?.focus()
    }
  }, [weightStatus])

  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      {/* 인사 줄 오른쪽의 알림 벨(P08 진입). 폭이 모자라면(글자 확대) 벨이 아래 줄로 내려가고 인사가 한 글자씩 쌓이지 않는다. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <HomeGreeting nickname={nickname} />
        </div>
        <NotificationBellLink userId={userId} from="/home" />
      </div>
      <div
        ref={topAreaRef}
        tabIndex={-1}
        className="flex flex-col gap-3 outline-none"
      >
        {/* 필수 안내 카드(키·몸무게 입력 → 기록 불일치 → 월간 확인)가 있으면 이번 주 나의 활동보다 먼저 보인다. */}
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
        ) : null}
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
        <HomeWeeklyActivity
          today={today}
          exercise={activity.exercise}
          meal={activity.meal}
          onRetryExercise={activity.reloadExercise}
          onRetryMeal={activity.reloadMeal}
        />
      </div>
      <HomeShortcuts />
      <HomeTodayRecords exercise={activity.exercise} meal={activity.meal} />
      <HomeRecentActivity
        view={recent}
        onRetry={() => {
          activity.reloadExercise()
          activity.reloadMeal()
        }}
      />
      {quizCompleted ? null : <HomeQuizCard />}
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
