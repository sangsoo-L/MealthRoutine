import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import FoodRequestForm from '../components/food/request/FoodRequestForm.tsx'
import {
  PATH_MY_FOOD_REQUESTS,
  createFoodRequestSource,
} from '../food-request/foodRequest.ts'
import { Link } from 'react-router'

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createFoodRequestSource()

/**
 * F03 음식 등록 요청(`/foods/request`, 회원 전용). 검색에 없는 음식을 요청한다. 요청 접수·저장·음식 DB 반영은 서버 담당이며
 * 서버 연결 전에는 요청을 보내지 않고 "접수되지 않았어요"를 알린다. 입력은 이 화면에서만 유지하고 저장하지 않는다.
 * 상위 화면은 음식 검색(F01)이고, 화면이 h1을 직접 가진다.
 */
export default function FoodRequestPage() {
  usePageTitle('음식 등록 요청')
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          찾는 음식이 없었나요?
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          정확한 음식명이나 제품명을 적어 주세요. 영양표가 있다면 함께 첨부할 수
          있어요.
        </p>
      </header>
      <FoodRequestForm source={SOURCE} />
      <Link
        to={PATH_MY_FOOD_REQUESTS}
        data-request-history-link=""
        className="flex min-h-11 items-center justify-center rounded-control text-body font-semibold text-meal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal"
      >
        내 요청 내역 보기
      </Link>
    </div>
  )
}
