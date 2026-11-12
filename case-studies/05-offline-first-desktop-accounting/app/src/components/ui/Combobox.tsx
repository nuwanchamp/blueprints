import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Input } from './Field'

export interface ComboOption {
  key: string
  label: string
  /** Smaller grey line under the label. */
  hint?: string
}

interface Props {
  value: string
  onChange: (text: string) => void
  /** Called when a suggestion is chosen (click, or arrow keys and Enter). */
  onPick: (key: string) => void
  options: ComboOption[]
  label: string
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  className?: string
  inputRef?: Ref<HTMLInputElement>
  onBlur?: () => void
  /** Enter pressed with no suggestion highlighted. */
  onEnter?: () => void
  /** The most suggestions to show at once. */
  limit?: number
}

/**
 * A text field with a list of suggestions that narrows as you type. Anything typed is accepted, so a new name
 * needs no extra step; choosing a suggestion is optional. Follows the ARIA combobox pattern.
 */
export function Combobox({ value, onChange, onPick, options, label, placeholder, disabled, maxLength, className, inputRef, onBlur, onEnter, limit = 8 }: Props) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrap = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase()
    const hits = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    // Typing an exact name that is already the only choice leaves nothing to suggest
    return (hits.length === 1 && hits[0].label.toLowerCase() === q ? [] : hits).slice(0, limit)
  }, [options, value, limit])

  useEffect(() => setActive(-1), [value, open])

  const visible = open && !disabled && shown.length > 0
  const list = useRef<HTMLUListElement>(null)

  // If the list runs past the bottom of the screen, scroll the page just enough to show all of it
  useEffect(() => {
    if (visible) list.current?.scrollIntoView({ block: 'nearest' })
  }, [visible, shown.length])

  function pick(i: number) {
    onPick(shown[i].key)
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (shown.length ? (a + 1) % shown.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (shown.length ? (a <= 0 ? shown.length - 1 : a - 1) : -1))
    } else if (e.key === 'Escape' && visible) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (visible && active >= 0) pick(active)
      else onEnter?.()
    }
  }

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <Input
        ref={inputRef}
        role="combobox"
        aria-label={label}
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
        className="px-2.5 text-[13px]"
      />
      {visible && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={`${label} — ${t('common.suggestions')}`}
          className="absolute top-full left-0 z-20 mt-1 max-h-72 min-w-64 overflow-y-auto rounded-lg border border-control bg-white py-1 shadow-lg"
        >
          {shown.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input must keep focus or the list would close before the click lands
              onMouseDown={(e) => {
                e.preventDefault()
                pick(i)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5', i === active && 'bg-tint')}
            >
              <span className="text-[13px] font-semibold">{o.label}</span>
              {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
