import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui/icons'
import { FileDown, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { formatDate } from '@/lib/date'
import { PRESETS, type GroupBy, type PresetId } from '@/lib/period'
import type { PeriodState } from './usePeriod'

const GROUPS: GroupBy[] = ['day', 'month', 'year']

/** Waits until the browser has laid out and painted what was just rendered (charts measure themselves first). */
export const settle = () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 150))))

/**
 * The one row of filters above everything it controls: period first, then whether to count open days and how to
 * group. The dashboard and every report below it use exactly this slice, so their numbers always agree.
 */
export function PeriodBar({
  state,
  loading,
  pdfName,
  beforePrint,
}: {
  state: PeriodState
  loading?: boolean
  /** e.g. "dashboard", "reports" */
  pdfName: string
  /** Gets the page ready to print (the full report with its contents); returns what puts it back */
  beforePrint?: () => Promise<() => void>
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const { period } = state
  // The desktop app saves the PDF itself; a browser only has its print dialog, where "Save as PDF" is a printer
  const pdf = window.daybookNative?.pdf
  const [saved, setSaved] = useState<{ ok: true; path: string; openFailed?: boolean } | { ok: false } | null>(null)
  const openPdf = async (path: string) => {
    const problem = await pdf!.open(path).catch((e: unknown) => String(e))
    setSaved({ ok: true, path, openFailed: problem !== '' })
  }
  const [busy, setBusy] = useState(false)
  const output = async (how: 'print' | 'pdf') => {
    setSaved(null)
    setBusy(true)
    // Charts size themselves to the screen; on paper they must fit the page, or the whole printout is shrunk
    document.documentElement.classList.add('printing')
    await settle()
    const restore = await beforePrint?.()
    try {
      if (how === 'print') window.print()
      else {
        const path = await pdf!.save(`daybook-${pdfName}-${period.from}_${period.to}.pdf`, t('period.savePdf'))
        if (path) setSaved({ ok: true, path })
      }
    } catch {
      setSaved({ ok: false })
    } finally {
      restore?.()
      document.documentElement.classList.remove('printing')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 print:hidden" aria-busy={loading || undefined}>
      {busy && (
        <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 text-sm font-semibold">
          {t('period.preparing')}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup<string>
          size="sm"
          label={t('period.label')}
          value={state.range}
          onChange={(v) => state.setRange(v as PresetId)}
          options={PRESETS.map((p) => ({ value: p, label: t(`period.${p}`) }))}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={busy || loading} onClick={() => void output('print')}>
            <Icon icon={Printer} size={16} />
            {pdf ? t('period.printOnly') : t('period.print')}
          </Button>
          {pdf && (
            <Button variant="secondary" size="sm" disabled={busy || loading} onClick={() => void output('pdf')}>
              <Icon icon={FileDown} size={16} />
              {t('period.savePdf')}
            </Button>
          )}
        </div>
      </div>

      {saved?.ok && (
        <Callout tone="ok" role="status">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="break-all">{t('period.pdfSaved', { path: saved.path })}</span>
            <button type="button" className="cursor-pointer font-semibold underline underline-offset-2" onClick={() => void openPdf(saved.path)}>
              {t('period.openPdf')}
            </button>
          </span>
          {saved.openFailed && <span className="mt-1 block text-loss">{t('period.openFailed')}</span>}
        </Callout>
      )}
      {saved && !saved.ok && (
        <Callout tone="error" role="alert">
          {t('period.pdfFailed')}
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {state.range === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              {t('period.from')}
              <input
                type="date"
                value={period.from}
                onChange={(e) => e.target.value && state.setCustom({ from: e.target.value })}
                className="h-11 rounded-lg border border-control bg-white px-3 text-sm font-normal"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              {t('period.to')}
              <input
                type="date"
                value={period.to}
                onChange={(e) => e.target.value && state.setCustom({ to: e.target.value })}
                className="h-11 rounded-lg border border-control bg-white px-3 text-sm font-normal"
              />
            </label>
          </div>
        )}
        <p className="text-sm font-semibold" data-testid="period-text">
          {formatDate(period.from, lang)} – {formatDate(period.to, lang)}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-medium">
          <input type="checkbox" checked={state.includeOpen} onChange={(e) => state.setIncludeOpen(e.target.checked)} className="size-5 accent-ink" />
          {t('period.includeOpen')}
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{t('period.groupBy')}</span>
          <ChipGroup<string>
            size="sm"
            label={t('period.groupBy')}
            value={state.groupBy}
            onChange={(v) => state.setGroupBy(v as GroupBy)}
            options={GROUPS.map((g) => ({
              value: g,
              label: t(`period.by.${g}`),
            }))}
          />
        </div>
      </div>
    </div>
  )
}

/** Shown only on paper: the screen has the filter row, a printout needs to say which period it covers. */
export function PrintHeader({ title, state }: { title: string; state: PeriodState }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  return (
    <div className="mb-2 hidden print:block">
      <p className="text-sm font-semibold">
        Daybook · {title} · {formatDate(state.period.from, lang)} – {formatDate(state.period.to, lang)}
        {state.includeOpen ? ` · ${t('period.includeOpen')}` : ` · ${t('period.closedOnly')}`}
      </p>
    </div>
  )
}
