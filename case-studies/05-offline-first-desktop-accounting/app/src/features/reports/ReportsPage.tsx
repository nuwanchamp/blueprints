import { useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Callout } from '@/components/ui/Callout'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/date'
import { ChartDefs } from './charts'
import { PeriodBar, PrintHeader, settle } from './PeriodBar'
import { ReportCover } from './ReportCover'
import { DaysTab, ExpensesTab, SalesTab, SummaryTab } from './tabs'
import { usePeriod } from './usePeriod'
import { useReport } from './useReport'

const TABS = ['summary', 'sales', 'expenses', 'days'] as const
type Tab = (typeof TABS)[number]


export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const state = usePeriod()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'summary'
  const { data, loading, error } = useReport(state.period, state.includeOpen, true)
  // Print and Save as PDF always give the whole report: a contents page, then every section on its own pages.
  // In the desktop app the contents shows the page each section starts on, read from a first layout of the PDF.
  const [full, setFull] = useState<Record<string, number | null> | null>(null)
  const heading = (id: Tab, i: number) => `${i + 1}. ${t(`reports.tabs.${id}`)}`
  const beforePrint = async () => {
    flushSync(() => setFull({}))
    await settle()
    const pdf = window.daybookNative?.pdf
    if (pdf) {
      const pages = await pdf.pages(TABS.map(heading)).catch(() => ({}))
      flushSync(() => setFull(pages))
      await settle()
    }
    return () => setFull(null)
  }

  const choose = (next: Tab) => {
    const p = new URLSearchParams(params)
    p.set('tab', next)
    setParams(p, { replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <ChartDefs />
      {/* On paper the cover takes the title's place */}
      <header className={cn(full && 'print:hidden')}>
        <h1 className="font-serif text-[28px] leading-tight font-semibold">{t('reports.title')}</h1>
        <p className="mt-1.5 text-sm text-muted print:hidden">{t('reports.description')}</p>
      </header>

      <PeriodBar state={state} loading={loading} pdfName="report" beforePrint={beforePrint} />
      {!full && <PrintHeader title={t('reports.title')} state={state} />}

      <div role="tablist" aria-label={t('reports.title')} className="flex flex-wrap gap-2 print:hidden">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => choose(id)}
            className={cn(
              'h-11 cursor-pointer rounded-lg border px-4 text-sm font-semibold',
              tab === id ? 'border-ink bg-ink text-white' : 'border-control bg-white hover:bg-tint',
            )}
          >
            {t(`reports.tabs.${id}`)}
          </button>
        ))}
      </div>

      {error && (
        <Callout tone="error" role="alert" className="text-sm">
          {error}
        </Callout>
      )}
      {!data && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}
      {full && (
        <>
          <ReportCover
            period={`Daybook · ${t('reports.title')} · ${formatDate(state.period.from, lang)} – ${formatDate(state.period.to, lang)} · ${state.includeOpen ? t('period.includeOpen') : t('period.closedOnly')}`}
            sections={TABS.map((id, i) => ({ title: heading(id, i), page: full[heading(id, i)] ?? null }))}
          />
        </>
      )}
      {data && full && (
        <>
          {data.health.openDays > 0 && (
            <Callout tone="warn" role="status" className="px-4 py-2.5 text-sm font-semibold">
              {t('dashboard.openDays', { count: data.health.openDays })}
            </Callout>
          )}
          {TABS.map((id, i) => (
            <section key={id} className="flex flex-col gap-4 print:break-before-page">
              <h2 className="font-serif text-2xl font-semibold">{heading(id, i)}</h2>
              {id === 'summary' && <SummaryTab data={data} state={state} />}
              {id === 'sales' && <SalesTab data={data} state={state} />}
              {id === 'expenses' && <ExpensesTab data={data} state={state} />}
              {id === 'days' && <DaysTab data={data} state={state} />}
            </section>
          ))}
        </>
      )}
      {data && !full && (
        <div role="tabpanel" aria-label={t(`reports.tabs.${tab}`)} className={cn('transition-opacity', loading && 'opacity-60')}>
          {data.health.openDays > 0 && (
            <Callout tone="warn" role="status" className="mb-4 px-4 py-2.5 text-sm font-semibold">
              {t('dashboard.openDays', { count: data.health.openDays })}
            </Callout>
          )}
          {tab === 'summary' && <SummaryTab data={data} state={state} />}
          {tab === 'sales' && <SalesTab data={data} state={state} />}
          {tab === 'expenses' && <ExpensesTab data={data} state={state} />}
          {tab === 'days' && <DaysTab data={data} state={state} />}
        </div>
      )}
    </div>
  )
}
