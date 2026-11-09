/**
 * 홈에 쓰는 이미지 슬롯. 한 곳에서 관리해, 이미지가 없어도 각 섹션이 정상 동작하게 한다(없으면 해당 자리를 그리지 않는다).
 *
 * - 일러스트는 화면에서 두 번만 쓴다. 기록 방법 섹션 머리(hero)와 퀴즈 소개 배너(quiz)이고, 크기와 배치는 각 섹션이 정한다.
 * - 모두 ChatGPT가 제작한 투명 배경 PNG 원본에서 투명 여백만 잘라 만든 표시용 WebP다. 폭은 최대 표시 폭의 3배(hero 576px, quiz 720px)다.
 *   원본·규격·해시는 assets/images/landing/README.md. 옆의 제목과 글이 내용을 전달하므로 장식(alt="")이다.
 * - hero 슬롯은 이름이 hero일 뿐 지금은 "기록 방법" 섹션에 쓴다. 첫 화면은 "운동도 식단도, 한곳에" 카드가 맡는다.
 * - ai 슬롯은 비워 둔다. 제공 예정 기능의 시각적 비중을 낮추기 위해서다(파일은 그대로 보존).
 */
import heroUrl from '../../assets/images/landing/mealthroutine-landing-hero-illustration.webp'
import quizUrl from '../../assets/images/landing/mealthroutine-landing-quiz-illustration.webp'

export interface LandingImage {
  src: string
  width: number
  height: number
  /** 의미를 설명하는 대체 텍스트. 장식이면 빈 문자열 */
  alt: string
}

export const LANDING_IMAGES: {
  hero: LandingImage | null
  quiz: LandingImage | null
  ai: LandingImage | null
} = {
  hero: { src: heroUrl, width: 576, height: 457, alt: '' },
  quiz: { src: quizUrl, width: 720, height: 455, alt: '' },
  ai: null,
}
