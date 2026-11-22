import { useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import MealDetailView, {
  MealNotFound,
} from '../components/food/MealDetailView.tsx'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import { toLocalDate } from '../exercise/workoutModel.ts'
import {
  mealTypeFromParam,
  type MealRecord,
  type MealType,
} from '../food/mealModel.ts'
import { createMealRecordRepository } from '../food/mealSource.ts'
import { useMealRecords } from '../food/useMealRecords.ts'

function MealDetailBody({ meal }: { meal: MealType }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [localDate] = useState(() => toLocalDate(new Date()))
  const records = useMealRecords(userId, localDate)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const busyRef = useRef(false)

  async function confirmDelete(record: MealRecord) {
    const repository = userId ? createMealRecordRepository(userId) : null
    if (!repository || busyRef.current) return
    busyRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await repository.delete(record.id, { expectedRevision: record.revision })
      setNotice(`“${record.foodName}” 기록을 삭제했어요.`)
      setDeleteTargetId(null)
      records.reload()
    } catch (error) {
      if (isWorkoutStoreError(error) && error.reason === 'notFound') {
        setNotice(`“${record.foodName}” 기록은 이미 삭제되어 있어요.`)
        setDeleteTargetId(null)
        records.reload()
      } else if (
        isWorkoutStoreError(error) &&
        error.code === 'revisionMismatch'
      ) {
        setDeleteError(
          '다른 곳에서 이 기록이 바뀌어 삭제하지 않았어요. 화면을 새로 열어 다시 시도해 주세요.',
        )
      } else {
        setDeleteError('기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      busyRef.current = false
      setDeleting(false)
    }
  }

  return (
    <MealDetailView
      meal={meal}
      localDate={localDate}
      records={records.state}
      deleteTargetId={deleteTargetId}
      deleting={deleting}
      deleteError={deleteError}
      notice={notice}
      onAskDelete={(record) => {
        setNotice(null)
        setDeleteError(null)
        setDeleteTargetId(record.id)
      }}
      onConfirmDelete={(record) => void confirmDelete(record)}
      onCancelDelete={() => {
        setDeleteTargetId(null)
        setDeleteError(null)
      }}
      onRetry={records.reload}
    />
  )
}

/**
 * D01-1·D01-2·D01-3 끼니 상세(`/records/meal/:meal`, meal = breakfast·lunch·dinner). 세 화면이 같은 구조라 하나의 페이지가 끼니 코드로 나눠 보여 준다.
 * 끼니 코드가 올바르지 않으면 없는 끼니 안내를 보인다. 끼니가 바뀌면 key로 본체를 다시 만들어 삭제 확인 상태가 남지 않게 한다.
 */
export default function MealDetailPage() {
  const { meal: param } = useParams()
  const meal = mealTypeFromParam(param)
  if (!meal) return <MealNotFound />
  return <MealDetailBody key={meal} meal={meal} />
}
