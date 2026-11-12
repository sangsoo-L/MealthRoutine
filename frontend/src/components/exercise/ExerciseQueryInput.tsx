import Icon from '../icons/Icon.tsx'
import { MAX_EXERCISE_QUERY } from '../../exercise/exerciseFilters.ts'

interface ExerciseQueryInputProps {
  /** 입력창 id. 호출하는 쪽의 label이 htmlFor로 가리킨다. */
  id: string
  value: string
  onChange: (value: string) => void
  /** 입력 안내 문구. 없으면 운동 탐색(E01)의 기본 문구다. 운동 선택(W13)처럼 검색 범위가 다른 화면이 바꿔 쓴다. */
  placeholder?: string
  /** 입력창에 덧붙일 클래스. 호출하는 화면이 스크롤 여백처럼 자기 레이아웃에 필요한 값을 더한다(없으면 E01과 같다). */
  inputClassName?: string
}

/**
 * 운동 이름 검색 입력창(돋보기 아이콘 + 둥근 입력). 검색 전 화면과 결과 화면의 조건 수정 시트가 같은 모양·규칙(최대 길이)을 쓰도록 한곳에 둔다.
 * label은 호출하는 쪽이 맡는다(검색 전 화면은 화면에 보이지 않는 이름, 조건 수정 시트는 보이는 이름).
 * text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(placeholder는 본문 크기).
 */
export default function ExerciseQueryInput({
  id,
  value,
  onChange,
  placeholder = '운동 이름을 검색해 보세요',
  inputClassName = '',
}: ExerciseQueryInputProps) {
  return (
    <div className="relative">
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
      />
      <input
        id={id}
        name="q"
        type="search"
        autoComplete="off"
        spellCheck={false}
        maxLength={MAX_EXERCISE_QUERY}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-12 w-full rounded-full border border-muted/75 bg-surface pr-4 pl-12 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis hover:border-muted focus-visible:border-exercise focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-exercise motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none ${inputClassName}`}
      />
    </div>
  )
}
