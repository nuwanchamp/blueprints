import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { categoriseExpense } from '@/db/repo/daily'
import { EditPanel } from '@/features/settings/components/EditPanel'
import { formatDay } from '@/lib/date'
import { formatAed } from '@/lib/money'
import { CategorySelect } from './CategorySelect'
import { UncategorisedBadge } from './ExpensesStep'
import { errorText } from './components'
import type { DailyCtx } from './useDailyData'

interface Item {
  id: number
  paidFromId: number
  amountFils: number
  supplier: string
  reference: string
  note: string
}

/** One uncategorised expense with a select to give it a category on the spot. */
export function CategoriseRow({ ctx, item, heading }: { ctx: DailyCtx; item: Item; heading?: string }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const [error, setError] = useState<string | null>(null)
  const account = ctx.by.account.get(item.paidFromId)
  const label = [item.supplier, item.reference, account && (zh ? account.nameZh : account.nameEn)].filter(Boolean).join(' · ')

  async function choose(id: number | null) {
    if (id === null) return
    try {
      await categoriseExpense(item.id, id)
      setError(null)
    } catch (e) {
      setError(errorText(e, t))
    }
    await ctx.reload()
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-l-[6px] border-b-line border-l-warn-line bg-warn-tint px-3 py-3">
      <div className="min-w-40 flex-1">
        <UncategorisedBadge label={t('daily.expenses.uncategorised')} />
        {heading && <p className="text-xs font-semibold text-muted">{heading}</p>}
        <p className="mt-1 text-sm font-semibold">{label || formatAed(item.amountFils)}</p>
        {item.note && <p className="text-xs text-muted">{item.note}</p>}
        {error && (
          <p role="alert" className="text-xs font-medium text-loss">
            {error}
          </p>
        )}
      </div>
      <p className="w-28 text-right text-sm font-semibold tabular-nums">{formatAed(item.amountFils)}</p>
      <div className="w-full sm:w-56">
        <CategorySelect
          aria-label={`${t('daily.expenses.categorise')}: ${label || formatAed(item.amountFils)}`}
          categories={ctx.master.categories}
          value={null}
          onChange={(id) => void choose(id)}
          emptyLabel={t('daily.expenses.chooseToCategorise')}
          className="border-2 border-warn-line! font-semibold"
        />
      </div>
    </li>
  )
}

/** Every uncategorised expense across all days, so nothing is forgotten after a day is closed. */
export function UncategorisedPanel({ ctx, onClose, onOpenDay }: { ctx: DailyCtx; onClose: () => void; onOpenDay: (date: string) => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  return (
    <EditPanel drawer title={t('daily.uncat.title')} onClose={onClose}>
      <p className="text-[13px] text-muted">{t('daily.uncat.description')}</p>
      {ctx.uncategorised.length === 0 ? (
        <p className="text-sm font-medium">{t('daily.uncat.empty')}</p>
      ) : (
        <ul>
          {ctx.uncategorised.map((u) => (
            <div key={u.id}>
              <CategoriseRow ctx={ctx} item={u} heading={formatDay(u.date, lang)} />
              <div className="-mt-1 mb-1 flex justify-end">
                <Button size="sm" variant="secondary" onClick={() => onOpenDay(u.date)}>
                  {t('daily.uncat.openDay')}
                </Button>
              </div>
            </div>
          ))}
        </ul>
      )}
    </EditPanel>
  )
}
