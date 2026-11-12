import { useTranslation } from 'react-i18next'
import {
  saveCashReason,
  saveDiscountReason,
  savePaidFromAccount,
  setCashReasonActive,
  setDiscountReasonActive,
  setPaidFromAccountActive,
  type AccountKind,
  type CashReason,
  type Direction,
  type DiscountReason,
  type PaidFromAccount,
} from '@/db/repo/master'
import { FlatList } from './FlatList'

interface Reload {
  reload: () => Promise<void>
}

const yn = (b: boolean) => (b ? 'yes' : 'no')

function useYesNo() {
  const { t } = useTranslation()
  return {
    show: (b: boolean) => t(b ? 'common.yes' : 'common.no'),
    options: [
      { value: 'yes', label: t('common.yes') },
      { value: 'no', label: t('common.no') },
    ],
  }
}

const KINDS: AccountKind[] = ['cash_drawer', 'petty_cash', 'bank', 'owner']

export function PaidFromView({ records, reload }: Reload & { records: PaidFromAccount[] }) {
  const { t } = useTranslation()
  const yesNo = useYesNo()
  return (
    <FlatList
      base="paidFrom"
      records={records}
      reload={reload}
      columns={[
        { header: t('paidFrom.kind'), width: 'minmax(0,1.2fr)', cell: (r) => t(`kinds.${r.kind}`) },
        { header: t('paidFrom.affectsDrawer'), width: 'minmax(0,1fr)', cell: (r) => yesNo.show(r.affectsDrawer) },
      ]}
      fields={[{ name: 'kind', label: t('paidFrom.kind'), options: KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })) }]}
      extrasOf={(r) => ({ kind: r?.kind ?? '' })}
      derived={(e) => t('paidFrom.derived', { value: e.kind ? yesNo.show(e.kind === 'cash_drawer') : '—' })}
      save={(v) => savePaidFromAccount({ id: v.id, nameEn: v.nameEn, nameZh: v.nameZh, active: v.active, kind: v.extras.kind as AccountKind })}
      toggle={setPaidFromAccountActive}
    />
  )
}

export function CashReasonsView({ records, reload }: Reload & { records: CashReason[] }) {
  const { t } = useTranslation()
  const yesNo = useYesNo()
  const dir = (d: Direction) => t(`cashReasons.${d}`)
  return (
    <FlatList
      base="cashReasons"
      records={records}
      reload={reload}
      columns={[
        { header: t('cashReasons.direction'), width: 'minmax(0,1.3fr)', cell: (r) => dir(r.direction) },
        { header: t('cashReasons.noteRequired'), width: 'minmax(0,1fr)', cell: (r) => yesNo.show(r.noteRequired) },
      ]}
      fields={[
        { name: 'direction', label: t('cashReasons.direction'), options: (['in', 'out'] as Direction[]).map((d) => ({ value: d, label: dir(d) })) },
        { name: 'noteRequired', label: t('cashReasons.noteRequired'), options: yesNo.options },
      ]}
      extrasOf={(r) => ({ direction: r?.direction ?? '', noteRequired: r ? yn(r.noteRequired) : '' })}
      save={(v) =>
        saveCashReason({
          id: v.id,
          nameEn: v.nameEn,
          nameZh: v.nameZh,
          active: v.active,
          direction: v.extras.direction as Direction,
          noteRequired: v.extras.noteRequired === 'yes',
        })
      }
      toggle={setCashReasonActive}
    />
  )
}

/** Why a discount was given. Only names and status, so there are no extra columns or chips. */
export function DiscountReasonsView({ records, reload }: Reload & { records: DiscountReason[] }) {
  return (
    <FlatList
      base="discountReasons"
      records={records}
      reload={reload}
      columns={[]}
      fields={[]}
      extrasOf={() => ({})}
      save={(v) => saveDiscountReason({ id: v.id, nameEn: v.nameEn, nameZh: v.nameZh, active: v.active })}
      toggle={setDiscountReasonActive}
    />
  )
}
