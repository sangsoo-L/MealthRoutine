import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ENTITLEMENT_LABEL } from '../../auth/entitlements.ts'
import type { Entitlement } from '../../auth/authTypes.ts'
import { MY_DESTINATIONS, MY_PAGE_PATH } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import { focusRing } from './myStyles.ts'

interface ProfileHeaderProps {
  nickname: string
  entitlement: Entitlement
  /** 설정 버튼 옆에 놓을 아이콘 링크(알림 벨). 없으면 설정 버튼만 보인다. */
  actions?: ReactNode
}

/**
 * P01 섹션 1. 프로필 머리글: 기본 프로필 이미지, 닉네임, 회원 유형, 한 줄 소개, 설정 버튼. 카드 없이 바탕 위에 놓는다.
 *
 * - 닉네임이 가장 큰 글자(22/600)이고 회원 유형은 그 아래 작은 보조 글자다. 배지(알약) 대신 글자색으로만 구분한다:
 *   멤버십 회원은 브랜드 파랑 + 굵게, 일반 회원은 흐린 글자. 라벨은 기존 ENTITLEMENT_LABEL을 그대로 쓴다.
 * - 프로필 사진은 저장·업로드 수단이 없어 기본 이미지(사람 아이콘)만 보인다. 본인인증·나이·성별은 표시하지 않는다(v5.0).
 * - 상세 설정(P09)은 오른쪽의 아이콘 버튼(링크, `/settings`)이다. 테두리 없이 아이콘만 두어 시각적 비중을 줄였고,
 *   이름은 aria-label "상세 설정", 터치 영역은 44px 이상이다.
 */
export default function ProfileHeader({
  nickname,
  entitlement,
  actions,
}: ProfileHeaderProps) {
  const paid = entitlement !== 'free'

  return (
    // 폭이 모자라면(글자 확대) 설정 버튼이 아래 줄로 내려가고, 이름이 한 글자씩 쌓이지 않는다. basis-40(10rem)이 프로필 묶음의 기준 폭이다.
    <section
      aria-label="프로필"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
    >
      {/* 프로필(아바타·이름)은 P02 프로필과 개인정보 설정으로 가는 링크다. 설정 버튼(P09)은 그대로 오른쪽에 있다. 진입한 곳(P01)으로 돌아오게 알린다. */}
      <Link
        to={MY_DESTINATIONS.profile.to}
        state={{ from: MY_PAGE_PATH }}
        data-profile-link=""
        className={`flex min-h-12 min-w-0 flex-1 basis-40 items-center gap-3 rounded-control ${focusRing}`}
      >
        <span
          role="img"
          aria-label="기본 프로필 이미지"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <Icon name="user" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-app-title leading-snug font-semibold text-content">
            {nickname}님
          </p>
          <p className="text-support leading-snug font-normal text-muted">
            <span
              className={paid ? 'font-semibold text-brand' : 'font-semibold'}
            >
              {ENTITLEMENT_LABEL[entitlement]}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>기록과 목표를 한곳에서
          </p>
        </div>
        <Icon name="chevron-right" size={18} className="shrink-0 text-muted" />
        <span className="sr-only">프로필과 개인정보 설정</span>
      </Link>
      <div className="flex shrink-0 items-center">
        {actions}
        <Link
          to={MY_DESTINATIONS.settings.to}
          aria-label="상세 설정"
          className={`flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-brand motion-reduce:transition-none ${focusRing}`}
        >
          <Icon name="settings" />
        </Link>
      </div>
    </section>
  )
}
