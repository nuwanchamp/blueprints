import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { TriangleAlert } from 'lucide-react'
import { Callout } from '@/components/ui/Callout'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { isValidISODate, todayISO } from '@/lib/date'
import { CashStep } from './CashStep'
import { DateBar, STEPS, Stepper, SummaryCard, type StepId } from './components'
import { ExpensesStep } from './ExpensesStep'
import { MoveDay } from './MoveDay'
import { ReviewStep } from './ReviewStep'
import { SalesStep } from './SalesStep'
import { UncategorisedPanel } from './Uncategorised'
import { useDailyData } from './useDailyData'

export function DailyPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  // The date and step live in the URL, so a day can be bookmarked and the back button works
  const dateParam = params.get('date')
  const date = isValidISODate(dateParam) ? dateParam : todayISO()
  const stepParam = params.get('step') as StepId | null
  const step: StepId = stepParam && STEPS.includes(stepParam) ? stepParam : 'sales'

  const go = (patch: { date?: string; step?: StepId }) => {
    const next = new URLSearchParams(params)
    if (patch.date) next.set('date', patch.date)
    if (patch.step) next.set('step', patch.step)
    setParams(next, { replace: false })
  }

  const { ctx, error } = useDailyData(date)
  const [showUncat, setShowUncat] = useState(false)
  const [moving, setMoving] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-serif text-[28px] leading-tight font-semibold">{t('daily.title')}</h1>
        <p className="mt-1.5 text-sm text-muted">{t('daily.description')}</p>
      </header>

      {error && (
        <Callout tone="error" role="alert" className="text-sm">
          {error}
        </Callout>
      )}
      {!ctx && !error && <p className="text-sm text-muted">{t('common.loading')}</p>}

      {ctx && (
        <>
          <DateBar
            date={date}
            closed={ctx.closed}
            onChange={(d) => {
              setMoving(false)
              go({ date: d })
            }}
            // Only a day that has something stored can be moved
            onMove={ctx.data.day.exists ? () => setMoving((m) => !m) : undefined}
          />
          {moving && (
            <MoveDay
              date={date}
              closed={ctx.closed}
              onCancel={() => setMoving(false)}
              onMoved={(to) => {
                setMoving(false)
                go({ date: to })
              }}
            />
          )}
          {ctx.uncategorised.length > 0 && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-line bg-warn-tint px-4 py-2.5 text-warn">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Icon icon={TriangleAlert} />
                {t('daily.uncat.banner', { count: ctx.uncategorised.length })}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setShowUncat(true)}>
                {t('daily.uncat.show')}
              </Button>
            </div>
          )}
          {showUncat && (
            <UncategorisedPanel
              ctx={ctx}
              onClose={() => setShowUncat(false)}
              onOpenDay={(d) => {
                setShowUncat(false)
                go({ date: d, step: 'expenses' })
              }}
            />
          )}
          {ctx.closed && (
            <Callout tone="locked" role="status" className="px-4 py-2.5 text-sm font-semibold">
              {t('daily.closedBanner')}
            </Callout>
          )}
          <Stepper ctx={ctx} step={step} onStep={(s) => go({ step: s })} />
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            {step === 'sales' && <SalesStep ctx={ctx} onStep={(s) => go({ step: s })} />}
            {step === 'expenses' && <ExpensesStep ctx={ctx} onStep={(s) => go({ step: s })} />}
            {step === 'cash' && <CashStep ctx={ctx} onStep={(s) => go({ step: s })} />}
            {step === 'review' && <ReviewStep ctx={ctx} onStep={(s) => go({ step: s })} />}
            <SummaryCard ctx={ctx} />
          </div>
        </>
      )}
    </div>
  )
}
