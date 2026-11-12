import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { moveDay } from '@/db/repo/daily'
import { addDays, formatDay, isValidISODate, todayISO } from '@/lib/date'
import { errorText } from './components'

/**
 * Moves a whole day's entries to another date. It is an inline card, not a popup, and it explains the rules
 * before anything happens: the day must be open and the new date must be empty.
 */
export function MoveDay({ date, closed, onMoved, onCancel }: { date: string; closed: boolean; onMoved: (to: string) => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const [to, setTo] = useState(addDays(date, -1))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!isValidISODate(to)) {
      setError(t('errors.dateInvalid'))
      return
    }
    setBusy(true)
    try {
      await moveDay(date, to)
      onMoved(to)
    } catch (e) {
      setError(errorText(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label={t('daily.move.title')} className="rounded-xl border-2 border-ink bg-white p-4">
      <h2 className="text-sm font-semibold">{t('daily.move.title')}</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">{t('daily.move.hint', { date: formatDay(date, lang) })}</p>
      {closed && <p className="mt-2 rounded-lg bg-tint px-3 py-2 text-[13px] font-semibold">{t('errors.dayClosedMove')}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{t('daily.move.newDate')}</span>
          <input
            type="date"
            value={to}
            max={todayISO()}
            disabled={closed}
            onChange={(e) => {
              setTo(e.target.value)
              setError(null)
            }}
            className="h-11 rounded-lg border border-control bg-white px-3 text-sm disabled:bg-tint"
          />
        </label>
        {isValidISODate(to) && <span className="pb-3 text-sm font-semibold">{formatDay(to, lang)}</span>}
        <Button disabled={closed || busy} onClick={() => void submit()}>
          {t('daily.move.confirm')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-loss">
          {error}
        </p>
      )}
    </section>
  )
}
