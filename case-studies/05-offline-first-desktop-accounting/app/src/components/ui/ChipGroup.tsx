import { cn } from '@/lib/cn'

export interface ChipOption<V extends string | number | null> {
  value: V
  label: string
  disabled?: boolean
}

interface Props<V extends string | number | null> {
  options: ChipOption<V>[]
  value: V
  onChange: (value: V) => void
  label: string
  size?: 'md' | 'sm'
}

/** Chip-style single-choice picker (a radio group). */
export function ChipGroup<V extends string | number | null>({ options, value, onChange, label, size = 'md' }: Props<V>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex cursor-pointer items-center rounded-full border font-medium transition-colors',
              size === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-11 px-4 text-sm',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected ? 'border-ink bg-ink text-white' : 'border-control bg-white text-ink hover:bg-tint',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
