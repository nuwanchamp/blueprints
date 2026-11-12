import { Fragment, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Callout } from '@/components/ui/Callout'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Banknote, CalendarArrowUp, ClipboardCheck, Equal, Lock, Minus, Plus, Receipt, ShoppingBasket } from 'lucide-react'
import { CheckIcon, Icon } from '@/components/ui/icons'
import { RepoError } from '@/db/repo/expenses'
import { cn } from '@/lib/cn'
import { addDays, formatDay, isValidISODate, todayISO } from '@/lib/date'
import { formatAed } from '@/lib/money'
import type { DailyCtx } from './useDailyData'

export type StepId = 'sales' | 'expenses' | 'cash' | 'review'
export const STEPS: StepId[] = ['sales', 'expenses', 'cash', 'review']
const STEP_ICONS = { sales: Receipt, expenses: ShoppingBasket, cash: Banknote, review: ClipboardCheck }

/** Message for a failed save: a rule violation from the repo, or a generic one. */
export function errorText(e: unknown, t: (k: string) => string) {
  return e instanceof RepoError ? t(e.key) : t('common.saveFailed')
}

export function StatusPill({ closed }: { closed: boolean }) {
  const { t } = useTranslation()
  return (
    <Badge tone={closed ? 'done' : 'warn'} icon={closed ? Lock : undefined} dot={!closed}>
      {closed ? t('daily.status.closed') : t('daily.status.open')}
    </Badge>
  )
}

export function DateBar({ date, closed, onChange, onMove }: { date: string; closed: boolean; onChange: (d: string) => void; onMove?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const today = todayISO()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3">
      <Button variant="secondary" size="sm" aria-label={t('daily.date.prev')} onClick={() => onChange(addDays(date, -1))}>
        ‹
      </Button>
      <label className="flex items-center gap-2">
        <span className="sr-only">{t('daily.date.label')}</span>
        <input
          type="date"
          lang={lang === 'zh' ? 'zh-Hans' : 'en-GB'}
          value={date}
          onChange={(e) => isValidISODate(e.target.value) && onChange(e.target.value)}
          className="h-11 rounded-lg border border-control bg-white px-3 text-sm"
        />
      </label>
      <Button variant="secondary" size="sm" aria-label={t('daily.date.next')} onClick={() => onChange(addDays(date, 1))}>
        ›
      </Button>
      {date !== today && (
        <Button variant="secondary" size="sm" onClick={() => onChange(today)}>
          {t('daily.date.today')}
        </Button>
      )}
      <span className="ml-1 text-sm font-semibold">{formatDay(date, lang)}</span>
      <span className="ml-auto flex items-center gap-3">
        {onMove && (
          <Button variant="secondary" size="sm" onClick={onMove}>
            <Icon icon={CalendarArrowUp} size={16} />
            {t('daily.move.button')}
          </Button>
        )}
        <StatusPill closed={closed} />
      </span>
    </div>
  )
}

export function Stepper({ ctx, step, onStep }: { ctx: DailyCtx; step: StepId; onStep: (s: StepId) => void }) {
  const { t } = useTranslation()
  const { rec, data } = ctx
  const note: Record<StepId, string> = {
    sales: data.sales.length ? formatAed(rec.totalSalesFils) : t('daily.stepNote.empty'),
    expenses: data.expenses.length ? t('daily.stepNote.items', { count: data.expenses.length }) : t('daily.stepNote.empty'),
    cash: data.day.countedCashFils === null ? t('daily.stepNote.notCounted') : t('daily.stepNote.counted'),
    review: ctx.closed ? t('daily.status.closed') : t('daily.status.open'),
  }
  // A step is complete once its work is in: sales entered, expenses entered, cash counted, day closed
  const done: Record<StepId, boolean> = {
    sales: data.sales.length > 0,
    expenses: data.expenses.length > 0,
    cash: data.day.countedCashFils !== null,
    review: ctx.closed,
  }
  return (
    <nav aria-label={t('daily.title')} className="flex shrink-0 items-stretch overflow-x-auto">
      {STEPS.map((s, i) => {
        const active = s === step
        return (
          <Fragment key={s}>
            {i > 0 && (
              <span
                aria-hidden
                data-testid="step-link"
                data-done={done[STEPS[i - 1]] || undefined}
                className={cn('h-0.5 w-3 shrink-0 self-center lg:w-8', done[STEPS[i - 1]] ? 'bg-ok' : 'bg-control/40')}
              />
            )}
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onStep(s)}
              className={cn(
                'flex min-h-14 min-w-36 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left',
                active ? 'border-ink bg-tint' : 'border-line bg-white hover:bg-tint',
              )}
            >
              <span
                data-done={done[s] || undefined}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold',
                  done[s] ? 'border-ok bg-ok text-white' : active ? 'border-ink bg-ink text-white' : 'border-control',
                )}
              >
                {/* the step's own icon until it is done, then a tick; the number stays for screen readers */}
                {done[s] ? <CheckIcon size={15} /> : <Icon icon={STEP_ICONS[s]} size={15} />}
                <span className="sr-only">{i + 1}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn('text-sm', active ? 'font-semibold' : 'font-medium')}>{t(`daily.steps.${s}`)}</span>
                <span className="truncate text-xs text-muted">
                  {done[s] && <span className="sr-only">{t('daily.stepDone')} </span>}
                  {note[s]}
                </span>
              </span>
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}

function Line({ label, value, strong, top }: { label: string; value: string; strong?: boolean; top?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', top && 'border-t border-ink pt-3')}>
      <span className={cn('text-[13px]', strong ? 'font-semibold' : 'text-muted')}>{label}</span>
      <span className={cn('shrink-0 whitespace-nowrap tabular-nums', strong ? 'text-[15px] font-bold' : 'text-[13px] font-medium')}>{value}</span>
    </div>
  )
}

/** A line of the drawer summary that matters most: a little bolder, on a light background. */
function KeyLine({ label, value, size, loss, testId }: { label: string; value: string; size: 'md' | 'lg'; loss?: boolean; testId?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 rounded-lg px-3 py-2', loss ? 'bg-loss-tint text-loss' : 'bg-page')}>
      <p className="text-[13px] font-semibold">{label}</p>
      <p className={cn('whitespace-nowrap tabular-nums font-bold', size === 'lg' ? 'text-lg' : 'text-base')} data-testid={testId}>
        {value}
      </p>
    </div>
  )
}

type Op = 'start' | 'plus' | 'minus' | 'equals'
const OP_ICON = { plus: Plus, minus: Minus, equals: Equal }

/** One stop on the drawer's flow: a small +, − or = on the rail at the left says what this line does to the cash. */
function FlowStep({ op, children }: { op: Op; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5" data-op={op}>
      <span
        aria-hidden
        className={cn(
          'relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border',
          op === 'equals' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted',
        )}
      >
        {op === 'start' ? <span className="size-1.5 rounded-full bg-control" /> : <Icon icon={OP_ICON[op]} size={12} strokeWidth={2.5} />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function SummaryCard({ ctx }: { ctx: DailyCtx }) {
  const { t } = useTranslation()
  const { rec, data } = ctx
  const signed = (fils: number) => (fils === 0 ? formatAed(0) : `${fils > 0 ? '+' : '−'} ${formatAed(Math.abs(fils))}`)
  return (
    <aside aria-label={t('daily.summary.title')} className="flex w-full shrink-0 flex-col gap-3 rounded-xl border border-line bg-white p-5 xl:w-80">
      <h2 className="font-serif text-base font-semibold">{t('daily.summary.title')}</h2>
      {/* how the expected cash is reached, top to bottom, on one rail */}
      <div className="relative flex flex-col gap-3">
        <span aria-hidden className="absolute top-3 bottom-5 left-[9.5px] w-px bg-line" />
        <FlowStep op="start">
          <Line label={t('daily.summary.opening')} value={formatAed(data.day.openingFloatFils)} />
        </FlowStep>
        <FlowStep op="plus">
          <Line label={t('daily.summary.cashSales')} value={signed(rec.cashSalesFils)} />
        </FlowStep>
        <FlowStep op="plus">
          <Line label={t('daily.summary.cashIn')} value={signed(rec.cashInFils)} />
        </FlowStep>
        <FlowStep op="equals">
          <KeyLine label={t('daily.summary.available')} value={formatAed(rec.availableFils)} size="md" />
        </FlowStep>
        <FlowStep op="minus">
          <Line label={t('daily.summary.drawerExpenses')} value={signed(-rec.drawerExpensesFils)} />
        </FlowStep>
        <FlowStep op="minus">
          <Line label={t('daily.summary.cashOut')} value={signed(-rec.cashOutFils)} />
        </FlowStep>
        <FlowStep op="equals">
          <KeyLine label={t('daily.summary.expected')} value={formatAed(rec.expectedCashFils)} size="lg" />
        </FlowStep>
      </div>
      {data.day.countedCashFils !== null && (
        <>
          <Line label={t('daily.summary.counted')} value={formatAed(data.day.countedCashFils)} />
          <KeyLine label={t('daily.summary.variance')} value={signed(rec.varianceFils ?? 0)} size="md" loss={rec.status === 'alert'} />
        </>
      )}
      <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
        <Line label={t('daily.summary.otherSales')} value={formatAed(rec.otherSalesFils)} />
        {rec.tipsFils > 0 && <Line label={t('daily.summary.cardTips')} value={formatAed(rec.tipsFils)} />}
        <Line label={t('daily.summary.otherExpenses')} value={formatAed(rec.otherExpensesFils)} />
      </div>
    </aside>
  )
}

export function StepCard({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 flex-1 rounded-xl border border-line bg-white">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-[13px] text-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function StepNav({ step, onStep }: { step: StepId; onStep: (s: StepId) => void }) {
  const { t } = useTranslation()
  const i = STEPS.indexOf(step)
  return (
    <div className="flex justify-between gap-3 border-t border-line p-5">
      {i > 0 ? (
        <Button variant="secondary" onClick={() => onStep(STEPS[i - 1])}>
          {t('daily.back')}
        </Button>
      ) : (
        <span />
      )}
      {i < STEPS.length - 1 && <Button onClick={() => onStep(STEPS[i + 1])}>{t('daily.next')}</Button>}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <Callout tone="error" role="status" className="mx-5 mb-4">
      {children}
    </Callout>
  )
}

/** A section total: bigger and set on a tinted strip with an ink edge, so it stands out from the lines above it. */
export function TotalLine({ label, value, testId, className }: { label: string; value: string; testId?: string; className?: string }) {
  return (
    <dl className={cn('rounded-lg bg-tint px-4 py-3 shadow-[inset_4px_0_0_0_var(--color-ink)]', className)}>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-base font-bold">{label}</dt>
        <dd className="text-2xl font-bold tabular-nums" data-testid={testId}>
          {value}
        </dd>
      </div>
    </dl>
  )
}
