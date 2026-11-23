import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/authContext.ts'
import type { DevAnalysisPreview } from './devPhotoAnalysis.ts'
import {
  IDLE_ANALYSIS,
  PhotoAnalysisQuotaError,
  createPhotoAnalysisSource,
  type AnalysisState,
  type PhotoAnalysisSource,
} from './photoAnalysisContract.ts'
import {
  PhotoAnalysisFlowContext,
  type PhotoAnalysisFlowValue,
  type PickedPhoto,
} from './photoAnalysisFlowContext.ts'
import {
  validatePhotoFile,
  type PhotoRejection,
} from './photoAnalysisPolicy.ts'

/**
 * 음식 사진 분석(I04·I04-1)이 공유하는 선택 사진과 분석 요청 상태를 가진 앱 수준 Provider.
 * 두 화면이 별도 라우트이고 경로가 바뀌면 화면이 다시 마운트되므로(RouteTransition의 key) 상태는 화면 밖에 둔다(MealPlanFlowProvider와 같은 방식).
 *
 * - **메모리에만 둔다.** 사진 파일은 ref에, 미리보기는 blob 주소로만 들고 있으며 URL·router state·localStorage·sessionStorage·IndexedDB에 쓰지 않는다.
 *   새로고침하면 사라지고 분석 화면은 I04로 돌려보낸다.
 * - 사진 분석 화면을 모두 떠나면(`enter`가 돌려준 해제 호출이 끝나 보이는 화면이 없으면) 진행 중 요청을 취소하고 사진·미리보기 주소를 버린다.
 *   사용자가 바뀌어도(로그아웃·계정 전환) 지난 사용자의 사진을 렌더 중에 바로 버린다.
 * - 분석은 서버 연결(`PhotoAnalysisSource`)이 있을 때만 요청한다. 연결이 없으면 요청하지 않고 "연결 전"으로 둔다(가짜 결과를 만들지 않는다).
 *   개발 서버에서만 주소의 `?devAnalysis=`가 있으면 검증용 연결로 바꾼다(devPhotoAnalysis.ts).
 * - 진행 중 요청은 번호로 식별한다: 취소·사진 변경·이탈이면 번호가 무효가 되어 늦게 도착한 결과는 버려진다. 체험 횟수는 다루지 않는다.
 */
export default function PhotoAnalysisFlowProvider({
  source: injectedSource,
  children,
}: {
  /** 서버 연결. 생략하면 `createPhotoAnalysisSource()`(지금은 연결 전). 시험에서만 값을 넣는다. */
  source?: PhotoAnalysisSource | null
  children: ReactNode
}) {
  const { status: authStatus, user } = useAuth()
  const userId = authStatus === 'authenticated' && user ? user.id : null
  const [defaultSource] = useState(() => createPhotoAnalysisSource())
  const source = injectedSource !== undefined ? injectedSource : defaultSource

  const [owner, setOwner] = useState<string | null>(userId)
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [rejection, setRejection] = useState<PhotoRejection | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisState>(IDLE_ANALYSIS)

  const fileRef = useRef<File | null>(null)
  const urlRef = useRef<string | null>(null)
  const activeRef = useRef<{ id: number; controller: AbortController } | null>(
    null,
  )
  const counterRef = useRef(0)
  const selectRef = useRef(0)
  const visibleRef = useRef(0)
  const analysisVisibleRef = useRef(0)

  const abortActive = useCallback(() => {
    activeRef.current?.controller.abort()
    activeRef.current = null
    counterRef.current += 1
  }, [])

  const releasePhoto = useCallback(() => {
    if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    fileRef.current = null
  }, [])

  const discard = useCallback(() => {
    selectRef.current += 1
    abortActive()
    releasePhoto()
    setPhoto(null)
    setRejection(null)
    setAnalysis(IDLE_ANALYSIS)
  }, [abortActive, releasePhoto])

  // 사용자가 바뀌면 지난 사용자의 사진·분석을 렌더 중에 바로 버린다(React가 곧바로 다시 그려 지난 값이 보이지 않는다).
  if (owner !== userId) {
    setOwner(userId)
    setPhoto(null)
    setRejection(null)
    setAnalysis(IDLE_ANALYSIS)
  }
  useEffect(() => {
    // 위에서 상태는 이미 비웠으므로 여기서는 진행 중 요청과 미리보기 주소만 정리한다.
    return () => {
      selectRef.current += 1
      activeRef.current?.controller.abort()
      if (urlRef.current !== null) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      fileRef.current = null
    }
  }, [userId])

  const select = useCallback(
    async (file: File) => {
      const token = (selectRef.current += 1)
      const result = await validatePhotoFile(file)
      // 검사하는 동안 다른 선택·해제·이탈이 있었으면 이 결과는 버린다.
      if (token !== selectRef.current) return
      if (!result.ok) {
        setRejection(result.reason)
        return
      }
      abortActive()
      releasePhoto()
      const url = URL.createObjectURL(file)
      urlRef.current = url
      fileRef.current = file
      setPhoto({ name: file.name, size: file.size, url })
      setRejection(null)
      setAnalysis(IDLE_ANALYSIS)
    },
    [abortActive, releasePhoto],
  )

  const start = useCallback(
    (devPreview: DevAnalysisPreview | null) => {
      const file = fileRef.current
      if (file === null) return
      abortActive()
      const controller = new AbortController()
      const id = counterRef.current
      activeRef.current = { id, controller }
      const isCurrent = () =>
        activeRef.current?.id === id && !controller.signal.aborted

      const useDev = import.meta.env.DEV && devPreview !== null
      if (!useDev && source === null) {
        activeRef.current = null
        setAnalysis({ status: 'unavailable' })
        return
      }
      setAnalysis({ status: 'analyzing' })

      void (async () => {
        try {
          let active: PhotoAnalysisSource | null = source
          if (import.meta.env.DEV && devPreview !== null) {
            const dev = await import('./devPhotoAnalysis.ts')
            active = dev.devAnalysisSource(devPreview)
          }
          if (active === null || !isCurrent()) return
          const result = await active.analyze(file, controller.signal)
          if (!isCurrent()) return
          setAnalysis(
            result === null || result.foods.length === 0
              ? { status: 'empty' }
              : { status: 'ready', result },
          )
        } catch (error) {
          // 취소·이탈·사진 변경으로 무효가 된 요청의 실패는 화면에 반영하지 않는다.
          if (!isCurrent()) return
          // 서버가 사용 횟수 소진으로 거절했으면 일반 실패와 구분한다(다시 시도 대신 멤버십 안내). 사용량은 화면이 판정하지 않는다.
          setAnalysis(
            error instanceof PhotoAnalysisQuotaError
              ? { status: 'exhausted' }
              : { status: 'error' },
          )
        } finally {
          if (activeRef.current?.id === id) activeRef.current = null
        }
      })()
    },
    [abortActive, source],
  )

  const cancel = useCallback(() => {
    abortActive()
    setAnalysis(IDLE_ANALYSIS)
  }, [abortActive])

  const resetAnalysis = useCallback(() => {
    abortActive()
    setAnalysis(IDLE_ANALYSIS)
  }, [abortActive])

  const clear = useCallback(() => {
    discard()
  }, [discard])

  const enter = useCallback(
    (screen: 'upload' | 'analysis') => {
      visibleRef.current += 1
      if (screen === 'analysis') analysisVisibleRef.current += 1
      return () => {
        visibleRef.current -= 1
        if (screen === 'analysis') analysisVisibleRef.current -= 1
        // 두 화면 사이 이동은 같은 커밋에서 해제와 등록이 이어지므로, 다음 틱에 보이는 화면이 없을 때만 정리한다
        // (StrictMode의 개발용 이중 실행도 같은 이유로 안전하다).
        window.setTimeout(() => {
          if (visibleRef.current === 0) {
            discard()
          } else if (
            screen === 'analysis' &&
            analysisVisibleRef.current === 0
          ) {
            // 분석 화면만 떠났다(I04로 돌아감): 진행 중인 분석은 정리하고 사진은 남긴다. 끝난 결과·실패도 비워 다음 시작을 새로 한다.
            abortActive()
            setAnalysis(IDLE_ANALYSIS)
          }
        }, 0)
      }
    },
    [discard, abortActive],
  )

  const value = useMemo<PhotoAnalysisFlowValue>(
    () => ({
      photo,
      rejection,
      analysis,
      connected: source !== null,
      select,
      clear,
      start,
      cancel,
      resetAnalysis,
      enter,
    }),
    [
      photo,
      rejection,
      analysis,
      source,
      select,
      clear,
      start,
      cancel,
      resetAnalysis,
      enter,
    ],
  )

  return (
    <PhotoAnalysisFlowContext.Provider value={value}>
      {children}
    </PhotoAnalysisFlowContext.Provider>
  )
}
