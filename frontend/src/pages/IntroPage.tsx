import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import SplitLogo from '../components/brand/SplitLogo.tsx'

/** 인트로 표시 시간(ms). global.css의 인트로 애니메이션 전체 길이(3s)와 같아야 한다. */
const INTRO_DURATION_MS = 3000
/** 로고 이미지를 기다리는 최대 시간(ms). 넘으면 로고 없이 시작한다. (로고 파일이 크므로 느린 네트워크를 고려해 넉넉하게 둔다) */
const LOGO_WAIT_MS = 4000

type LogoStatus = 'loading' | 'ready' | 'failed'

/**
 * 앱 최초 진입 인트로. 공식 로고의 두 조각이 결합하고 서비스명과 슬로건이 나타난 뒤,
 * 약 3초 뒤 홈 화면으로 자동 이동한다.
 * 모든 움직임은 CSS 애니메이션이 맡고, 이동은 타이머가 맡는다.
 * 로고가 준비되거나 실패한 시점부터 애니메이션과 타이머를 함께 시작해 둘의 시간을 맞춘다.
 */
export default function IntroPage() {
  const navigate = useNavigate()
  const [logoStatus, setLogoStatus] = useState<LogoStatus>('loading')
  const started = logoStatus !== 'loading'

  const handleLogoReady = () =>
    setLogoStatus((status) => (status === 'loading' ? 'ready' : status))
  const handleLogoFailed = () => setLogoStatus('failed')

  // 로고 로딩이 오래 걸리면 기다리지 않고 로고 없이 시작한다.
  useEffect(() => {
    const waitId = window.setTimeout(() => {
      setLogoStatus((status) => (status === 'loading' ? 'failed' : status))
    }, LOGO_WAIT_MS)
    return () => window.clearTimeout(waitId)
  }, [])

  useEffect(() => {
    if (!started) return
    // cleanup으로 Strict Mode 재실행과 언마운트에서 타이머를 제거한다.
    const timerId = window.setTimeout(() => {
      // replace: 뒤로가기로 인트로에 다시 들어오지 않도록 현재 기록을 대체한다.
      navigate('/home', { replace: true })
    }, INTRO_DURATION_MS)
    return () => window.clearTimeout(timerId)
  }, [started, navigate])

  return (
    <div
      className={`flex flex-col items-center text-center ${started ? 'animate-intro-out motion-reduce:animate-none' : ''}`}
    >
      {logoStatus === 'failed' ? null : (
        <SplitLogo
          animate={started}
          onLoad={handleLogoReady}
          onError={handleLogoFailed}
        />
      )}
      <h1
        className={`mt-3 text-metric leading-tight font-semibold text-content ${started ? 'animate-intro-name motion-reduce:animate-none' : 'invisible'}`}
      >
        밀스루틴
      </h1>
      <p
        className={`mt-2 text-body font-normal text-muted ${started ? 'animate-intro-slogan motion-reduce:animate-none' : 'invisible'}`}
      >
        운동과 식단, 건강한 습관의 시작
      </p>
    </div>
  )
}
