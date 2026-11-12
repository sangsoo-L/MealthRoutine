import { useState } from 'react'
import { getContextGreeting } from './memberGreeting.ts'

interface HomeGreetingProps {
  nickname: string
}

/**
 * 회원 홈 맨 위의 인사. 닉네임 인사와 상황별 한 줄 문구(요일·시간 기준)를 보여 준다.
 * 화면 제목(h1)은 AppShell이 보조기기용으로 넣으므로 여기는 일반 문단이다. 문구 규칙은 memberGreeting.ts에 있다.
 * 문구는 화면이 열릴 때 한 번 정한다. 열어 둔 채로 시간이 지나도 바뀌지 않는다.
 */
export default function HomeGreeting({ nickname }: HomeGreetingProps) {
  const [greeting] = useState(() => getContextGreeting(new Date(), nickname))

  return (
    <div>
      <p className="text-app-title leading-snug font-semibold text-content">
        {nickname}님, 안녕하세요.
      </p>
      <p className="mt-1 text-body leading-relaxed font-normal text-muted">
        {greeting}
      </p>
    </div>
  )
}
