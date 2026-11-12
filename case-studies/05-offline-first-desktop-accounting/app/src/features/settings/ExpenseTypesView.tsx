import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { CoreChip } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError, setExpenseTypeActive, type ExpenseType } from '@/db/repo/expenses'
import { cn } from '@/lib/cn'
import { ListCard } from './components/ListCard'
import { TypePanel } from './components/TypePanel'

interface Props {
  types: ExpenseType[]
  reload: () => Promise<void>
}

type Panel = { mode: 'add' } | { mode: 'edit'; id: number } | null

const COLS = 'grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_128px_64px]'

export function ExpenseTypesView({ types, reload }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return types.filter((x) => !q || x.nameEn.toLowerCase().includes(q) || x.nameZh.includes(q))
  }, [types, search])
  const activeCount = types.filter((x) => x.active).length
  const editing = panel?.mode === 'edit' ? (types.find((x) => x.id === panel.id) ?? null) : null

  async function toggle(x: ExpenseType, next: boolean) {
    try {
      await setExpenseTypeActive(x.id, next)
      setNotice(null)
      await reload()
    } catch (e) {
      setNotice(e instanceof RepoError ? t(e.key) : t('common.saveFailed'))
    }
  }

  return (
    <>
      <ListCard
        title={t('types.title')}
        description={t('types.description')}
        addLabel={t('types.add')}
        onAdd={() => setPanel({ mode: 'add' })}
        searchPlaceholder={t('types.searchPlaceholder')}
        search={search}
        onSearch={setSearch}
        activeCount={activeCount}
        inactiveCount={types.length - activeCount}
        notice={notice}
      >
        <div role="table" aria-label={t('types.title')} className="overflow-x-auto">
          <div role="row" className={cn('grid min-h-11 items-center gap-x-1.5 border-y border-line bg-page px-5 text-xs font-semibold text-muted', COLS)}>
            <span role="columnheader">{t('common.englishName')}</span>
            <span role="columnheader">{t('common.chineseName')}</span>
            <span role="columnheader">{t('types.categoriesCount')}</span>
            <span role="columnheader">{t('common.status')}</span>
            <span role="columnheader" className="sr-only">
              {t('common.edit')}
            </span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t('common.noResults')}</p>}
          {rows.map((x) => (
            <div
              key={x.id}
              role="row"
              className={cn(
                'grid min-h-14 items-center gap-x-1.5 border-b border-line px-5 py-1.5',
                COLS,
                panel?.mode === 'edit' && panel.id === x.id && 'bg-tint',
                !x.active && 'text-muted',
              )}
            >
              <span role="cell" className="flex items-center gap-1.5 font-medium">
                {x.nameEn}
                {x.core && <CoreChip label={t('common.core')} />}
              </span>
              <span role="cell" lang="zh-Hans">
                {x.nameZh}
              </span>
              <span role="cell" className="text-[13px]">
                {x.categoryCount}
              </span>
              <span role="cell">
                <StatusSwitch checked={x.active} locked={x.core} label={x.nameEn} onCheckedChange={(v) => void toggle(x, v)} />
              </span>
              <span role="cell" className="flex justify-end">
                <Button variant="secondary" size="sm" aria-label={`${t('common.edit')}: ${x.nameEn}`} onClick={() => setPanel({ mode: 'edit', id: x.id })}>
                  {t('common.edit')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      </ListCard>

      {panel && (
        <TypePanel
          key={panel.mode === 'edit' ? panel.id : 'new'}
          type={editing}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null)
            setNotice(null)
            void reload()
          }}
        />
      )}
    </>
  )
}
