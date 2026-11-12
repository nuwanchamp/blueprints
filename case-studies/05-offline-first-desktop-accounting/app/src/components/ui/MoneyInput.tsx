import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatFils, parseFils } from '@/lib/money'
import { cn } from '@/lib/cn'

interface Props {
  /** Current value in fils; null when empty. */
  value: number | null
  /** Called when the person leaves the field with a valid amount (or empty). */
  onCommit: (fils: number | null) => void | Promise<void>
  label: string
  disabled?: boolean
  /** What an empty field means: no amount at all (null) or zero. */
  emptyAs?: 'null' | 'zero'
  big?: boolean
  className?: string
  /** Called when Enter is pressed, with the amount that was typed (null if empty or invalid). */
  onEnter?: (fils: number | null) => void
}

/**
 * An AED amount field. It keeps what the person typed until they leave the field, then checks it and
 * rewrites it as 1,234.50. A mistyped amount shows an error and is never saved.
 */
export function MoneyInput({ value, onCommit, label, disabled, emptyAs = 'null', big, className, onEnter }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState(value === null ? '' : formatFils(value))
  const [error, setError] = useState(false)
  const focused = useRef(false)

  // Follow the saved value (another step, a reload) unless the person is typing.
  // This runs only when the value changes, so a rejected entry stays on screen with its error.
  useEffect(() => {
    if (!focused.current) {
      setText(value === null ? '' : formatFils(value))
      setError(false)
    }
  }, [value])

  function commit() {
    focused.current = false
    const trimmed = text.trim()
    if (trimmed === '') {
      setError(false)
      void onCommit(emptyAs === 'zero' ? 0 : null)
      return
    }
    const fils = parseFils(trimmed)
    if (fils === null) {
      setError(true)
      return
    }
    setError(false)
    setText(formatFils(fils))
    if (fils !== value) void onCommit(fils)
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-white px-3 focus-within:outline-2 focus-within:outline-offset-2',
          error ? 'focus-within:outline-loss' : 'focus-within:outline-ink',
          big ? 'h-14' : 'h-11',
          error ? 'border-2 border-loss' : 'border-control',
          disabled && 'bg-tint',
        )}
      >
        <span className={cn('font-medium text-muted', big ? 'text-base' : 'text-sm')} aria-hidden>
          AED
        </span>
        <input
          id={id}
          aria-label={label}
          aria-invalid={error || undefined}
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const typed = parseFils(text)
            e.currentTarget.blur()
            onEnter?.(typed)
          }}
          className={cn('min-w-0 flex-1 bg-transparent text-right outline-none placeholder:text-muted', big ? 'text-xl font-semibold' : 'text-sm')}
          placeholder="0.00"
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-loss">
          {t('errors.amountInvalid')}
        </p>
      )}
    </div>
  )
}
