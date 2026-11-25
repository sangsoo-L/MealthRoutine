import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  describeUploadRejection,
  isResendPending,
  type UploadRejectionView,
} from './api/recordUpload.ts'
import {
  readRecordUploadMarks,
  recordUploadMarksVersion,
  requestRecordRetry,
  requestRecordUpload,
  subscribeRecordUploads,
} from './recordUploadSource.ts'

export type RecordUploadRetryState =
  /** 다시 보내는 중이다. */
  | 'sending'
  /** 다시 보낸 기록을 서버가 저장했다. */
  | 'saved'
  /** 다시 보냈지만 나중에 될 수 있는 실패로 멈췄다. 다음에 운동 기록을 열 때 다시 보낸다. */
  | 'later'

export interface RecordUploadStatus {
  /** 서버가 받지 않은 기록이면 그 이유. 아니면(올렸음·아직 보내지 않음·개발 서버) null. */
  rejection: UploadRejectionView | null
  /**
   * 고쳐 보내기를 골랐지만 서버 저장을 아직 확인하지 못했다(다시 보내던 중 네트워크 오류·시간 초과 등). 표시에서 읽으므로
   * 새로고침해도 남는다. sendFixed는 같은 requestId·같은 본문으로 다시 보낸다.
   */
  resendPending: boolean
  /** "완료한 운동만 다시 보내기"를 누른 뒤의 상태. 누르지 않았으면 null. */
  retry: RecordUploadRetryState | null
  /** 고칠 수 있는 거절이나 resendPending일 때만 쓴다. 같은 requestId로 다시 보낸다. 보내는 중이면 무시한다. */
  sendFixed: () => void
}

const NONE: ReadonlySet<string> = new Set()

/**
 * W01 "최근 운동 기록"에 "서버에 저장되지 않았어요"를 붙일 기록 id(서버가 받지 않은 기록과, 고쳐 다시 보내다 멈춘 기록).
 * 이유와 다시 보내기는 W15에서 한다.
 * 업로드 실행이 끝날 때마다 다시 읽는다.
 */
export function useRejectedRecordIds(
  userId: string | null,
): ReadonlySet<string> {
  useSyncExternalStore(
    subscribeRecordUploads,
    recordUploadMarksVersion,
    recordUploadMarksVersion,
  )
  if (!userId) return NONE
  const marks = readRecordUploadMarks(userId)
  const ids = new Set(marks.rejected.keys())
  for (const id of marks.omitEmpty) {
    if (isResendPending(marks, id)) ids.add(id)
  }
  return ids.size === 0 ? NONE : ids
}

/**
 * W15(이미 저장된 운동 기록)의 서버 업로드 상태. 업로드 표시(localStorage)에서 이 기록의 거절 이유를 읽는다.
 * 업로드 실행이 끝날 때마다(recordUploadSource의 구독) 다시 읽어서, 다시 보내기의 결과도 화면에 바로 반영된다.
 * 기록을 열면 업로드를 한 번 요청한다. 대시보드를 거치지 않고 기록 상세를 바로 열어도 올리지 못한 기록(다시 보내다 멈춘 기록 포함)을 보낸다.
 */
export function useRecordUploadStatus(
  userId: string | null,
  recordId: string | null,
): RecordUploadStatus {
  // 업로드 실행이 끝나면 다시 그려서 아래에서 표시를 새로 읽는다(표시는 작은 JSON 하나라 그릴 때마다 읽어도 된다).
  useSyncExternalStore(
    subscribeRecordUploads,
    recordUploadMarksVersion,
    recordUploadMarksVersion,
  )
  const [retry, setRetry] = useState<RecordUploadRetryState | null>(null)
  const marks = userId ? readRecordUploadMarks(userId) : null
  const code = recordId ? (marks?.rejected.get(recordId) ?? null) : null
  const uploaded = recordId ? (marks?.uploaded.has(recordId) ?? false) : false
  const rejection = code === null ? null : describeUploadRejection(code)
  const resendPending =
    recordId !== null && marks !== null && isResendPending(marks, recordId)

  useEffect(() => {
    if (userId && recordId) requestRecordUpload(userId)
  }, [userId, recordId])

  const sendFixed = useCallback(() => {
    if (!userId || !recordId || retry === 'sending') return
    setRetry('sending')
    void requestRecordRetry(userId, recordId).then(() => {
      const after = readRecordUploadMarks(userId)
      // 다시 거절되면 거절 이유가 다시 보이므로 retry는 비운다.
      setRetry(
        after.uploaded.has(recordId)
          ? 'saved'
          : after.rejected.has(recordId)
            ? null
            : 'later',
      )
    })
  }, [userId, recordId, retry])

  return {
    rejection: uploaded ? null : rejection,
    resendPending,
    retry,
    sendFixed,
  }
}
