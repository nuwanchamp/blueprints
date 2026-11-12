import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CogIcon } from '@/components/ui/icons'

/** The columns a person may hide. Market and amount are always shown. */
export const OPTIONAL_COLUMNS = ['category', 'paidFrom', 'reference'] as const
export type ColumnId = (typeof OPTIONAL_COLUMNS)[number]
export type ShownColumns = Record<ColumnId, boolean>

const KEY = 'daybook.expenseColumns'
const ALL: ShownColumns = { category: true, paidFrom: true, reference: true }

function load(): ShownColumns {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...ALL, ...Object.fromEntries(OPTIONAL_COLUMNS.filter((c) => typeof saved[c] === 'boolean').map((c) => [c, saved[c]])) }
  } catch {
    return ALL
  }
}

/** Which optional columns the expenses table shows. Kept in this browser, so it is the same next time. */
export function useExpenseColumns() {
  const [shown, setShown] = useState<ShownColumns>(load)
  const toggle = (c: ColumnId) =>
    setShown((s) => {
      const next = { ...s, [c]: !s[c] }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* a private window cannot remember it; the choice still applies until the page closes */
      }
      return next
    })
  return { shown, toggle }
}

/** actions | market | category | paid from | receipt no. | amount, leaving out what is hidden. */
export function gridColumns(s: ShownColumns): string {
  return ['92px', 'minmax(0,1.2fr)', s.category && 'minmax(0,1.5fr)', s.paidFrom && 'minmax(0,1.5fr)', s.reference && 'minmax(0,0.7fr)', '124px'].filter(Boolean).join(' ')
}

/** A small cog in the table header; it opens a list of columns to tick on or off. */
export function ColumnsMenu({ shown, toggle }: { shown: ShownColumns; toggle: (c: ColumnId) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('daily.expenses.columns')}
        title={t('daily.expenses.columns')}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-tint hover:text-ink"
      >
        <CogIcon />
      </button>
      {open && (
        <div role="group" aria-label={t('daily.expenses.columns')} className="absolute top-full left-0 z-30 mt-1 w-56 rounded-lg border border-control bg-white p-2 text-[13px] font-medium text-ink shadow-lg">
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted">{t('daily.expenses.columnsShow')}</p>
          {OPTIONAL_COLUMNS.map((c) => (
            <label key={c} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-tint">
              <input type="checkbox" className="size-4 accent-[#151413]" checked={shown[c]} onChange={() => toggle(c)} />
              {t(c === 'category' ? 'daily.expenses.category' : c === 'paidFrom' ? 'daily.expenses.paidFrom' : 'daily.expenses.referenceShort')}
            </label>
          ))}
          <p className="px-2 pt-1.5 pb-1 text-xs font-normal text-muted">{t('daily.expenses.columnsNote')}</p>
        </div>
      )}
    </div>
  )
}
