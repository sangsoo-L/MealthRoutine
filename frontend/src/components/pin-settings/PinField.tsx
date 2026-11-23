import { inputClass, labelClass } from '../auth/authStyles.ts'
import Icon from '../icons/Icon.tsx'

interface PinFieldProps {
  id: string
  name: string
  label: string
  value: string
  visible: boolean
  onChange: (value: string) => void
  onToggleVisible: () => void
  /** 처리 중에는 읽기 전용이다(포커스는 유지된다). */
  readOnly: boolean
  disabled: boolean
  invalid: boolean
  describedBy?: string
}

/**
 * 숫자 6자리 2차 비밀번호 입력칸. 기본은 마스킹이고 눈 모양 버튼으로 이 칸만 보이게 바꾼다(aria-pressed).
 * - 자동완성은 끈다(autoComplete="off"). 브라우저가 이 설정을 무시할 수 있어 PIN 노출을 완전히 막는다고 가정하지 않는다.
 * - 값은 부모의 화면 상태에만 있고 입력 이름·URL·저장소에 쓰이지 않는다.
 * - 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지).
 */
export default function PinField({
  id,
  name,
  label,
  value,
  visible,
  onChange,
  onToggleVisible,
  readOnly,
  disabled,
  invalid,
  describedBy,
}: PinFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={6}
          enterKeyHint="done"
          placeholder="숫자 6자리"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${inputClass} pr-14 tracking-widest placeholder:tracking-normal disabled:cursor-not-allowed disabled:bg-page disabled:text-muted`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-pressed={visible}
          aria-label={`${label} 보기`}
          disabled={disabled}
          className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-control text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
    </div>
  )
}
