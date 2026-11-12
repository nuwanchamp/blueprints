import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listExpenseCategories, listExpenseTypes } from '@/db/repo/expenses'
import { listCashReasons, listDiscountReasons, listIncomeChannels, listPaidFromAccounts } from '@/db/repo/master'
import { useAsyncData } from '@/lib/useAsyncData'
import { BackupView } from '@/features/backup/BackupView'
import { UpdatesView } from '@/features/update/UpdatesView'
import { SectionNav } from './components/SectionNav'
import { ExpenseCategoriesView } from './ExpenseCategoriesView'
import { ExpenseTypesView } from './ExpenseTypesView'
import { CashReasonsView, DiscountReasonsView, PaidFromView } from './flat/FlatSections'
import { IncomeChannelsView } from './IncomeChannelsView'
import { DEFAULT_SECTION, SECTION_GROUPS } from './sections'

export function SettingsPage() {
  const { t } = useTranslation()
  const { section } = useParams()
  const categories = useAsyncData(listExpenseCategories)
  const types = useAsyncData(listExpenseTypes)
  const channels = useAsyncData(listIncomeChannels)
  const accounts = useAsyncData(listPaidFromAccounts)
  const reasons = useAsyncData(listCashReasons)
  const discounts = useAsyncData(listDiscountReasons)

  const def = SECTION_GROUPS.flatMap((g) => g.sections).find((s) => s.path === section)
  if (!def) return <Navigate to={`/settings/${DEFAULT_SECTION}`} replace />

  // One reload refreshes every list, because the lists depend on each other (types -> channels -> counts)
  const reload = async () => {
    await Promise.all([categories, types, channels, accounts, reasons, discounts].map((x) => x.reload()))
  }
  const c = { categories: categories.data, types: types.data, channels: channels.data, accounts: accounts.data, reasons: reasons.data, discounts: discounts.data }
  const loaded = Object.values(c).every(Boolean)

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-serif text-[28px] leading-tight font-semibold">{t('settings.title')}</h1>
        <p className="mt-1.5 text-sm text-muted">{t('settings.description')}</p>
      </header>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <SectionNav
          counts={{
            incomeChannels: c.channels?.length,
            expenseCategories: c.categories?.length,
            expenseTypes: c.types?.length,
            paidFrom: c.accounts?.length,
            cashReasons: c.reasons?.length,
            discountReasons: c.discounts?.length,
          }}
        />

        {!def.built && (
          <section className="min-w-0 flex-1 rounded-xl border border-line bg-white p-5">
            <h2 className="font-serif text-xl font-semibold">{t(`settings.sections.${def.key}`)}</h2>
            <p className="mt-2 text-sm text-muted">{t('settings.comingNext')}</p>
          </section>
        )}

        {def.key === 'backup' && <BackupView />}
        {def.key === 'updates' && <UpdatesView />}
        {def.built && def.key !== 'backup' && def.key !== 'updates' && !loaded && <p className="p-5 text-sm text-muted">{t('common.loading')}</p>}

        {def.built && loaded && def.key === 'incomeChannels' && <IncomeChannelsView channels={c.channels!} reload={reload} />}
        {def.built && loaded && def.key === 'expenseCategories' && <ExpenseCategoriesView categories={c.categories!} types={c.types!} reload={reload} />}
        {def.built && loaded && def.key === 'expenseTypes' && <ExpenseTypesView types={c.types!} reload={reload} />}
        {def.built && loaded && def.key === 'paidFrom' && <PaidFromView records={c.accounts!} reload={reload} />}
        {def.built && loaded && def.key === 'cashReasons' && <CashReasonsView records={c.reasons!} reload={reload} />}
        {def.built && loaded && def.key === 'discountReasons' && <DiscountReasonsView records={c.discounts!} reload={reload} />}
      </div>
    </div>
  )
}
