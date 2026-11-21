import Icon from '../icons/Icon.tsx'
import { focusRing } from '../mypage/myStyles.ts'

/**
 * 공지·FAQ 검색 입력(돋보기 + 둥근 입력 + 검색어 지우기). 보이는 이름은 호출하는 쪽의 label이 맡는다.
 * text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다.
 * 지우기 버튼은 값이 있을 때만 그린다(44px 터치 영역).
 */
export default function SupportSearchInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
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
        maxLength={50}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-full border border-muted/75 bg-surface pr-12 pl-12 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted hover:border-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value !== '' ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onChange('')}
          className={`absolute top-1/2 right-1 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted hover:text-content ${focusRing}`}
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </div>
  )
}
