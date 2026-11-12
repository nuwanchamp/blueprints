import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { CoreChip } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError, setExpenseCategoryActive, type ExpenseCategory, type ExpenseType } from '@/db/repo/expenses'
import { cn } from '@/lib/cn'
import { CategoryPanel } from './components/CategoryPanel'
import { ListCard } from './components/ListCard'

interface Props {
  categories: ExpenseCategory[]
  types: ExpenseType[]
  reload: () => Promise<void>
}

type Panel = { mode: 'add' } | { mode: 'edit'; id: number } | null

const COLS = 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_128px_64px]'

export function ExpenseCategoriesView({ categories, types, reload }: Props) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const typeById = useMemo(() => new Map(types.map((x) => [x.id, x])), [types])
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)

  // Parents first, each followed by its sub-categories. A match on a parent keeps all its children visible.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hit = (c: ExpenseCategory) => !q || c.nameEn.toLowerCase().includes(q) || c.nameZh.includes(q)
    const out: ExpenseCategory[] = []
    for (const p of categories.filter((c) => c.parentId === null)) {
      const kids = categories.filter((c) => c.parentId === p.id)
      if (hit(p)) out.push(p, ...kids)
      else {
        const matching = kids.filter(hit)
        if (matching.length) out.push(p, ...matching)
      }
    }
    return out
  }, [categories, search])

  const activeCount = categories.filter((c) => c.active).length

  async function toggle(c: ExpenseCategory, next: boolean) {
    try {
      await setExpenseCategoryActive(c.id, next)
      setNotice(null)
      await reload()
    } catch (e) {
      setNotice(e instanceof RepoError ? t(e.key) : t('common.saveFailed'))
    }
  }

  const editing = panel?.mode === 'edit' ? (byId.get(panel.id) ?? null) : null

  return (
    <>
      <ListCard
        title={t('categories.title')}
        description={t('categories.description')}
        addLabel={t('categories.add')}
        onAdd={() => setPanel({ mode: 'add' })}
        searchPlaceholder={t('categories.searchPlaceholder')}
        search={search}
        onSearch={setSearch}
        activeCount={activeCount}
        inactiveCount={categories.length - activeCount}
        notice={notice}
        footnote={`${t('common.footnote')} ${t('categories.parentFootnote')}`}
      >
        <div role="table" aria-label={t('categories.title')} className="overflow-x-auto">
          <div role="row" className={cn('grid min-h-11 items-center gap-x-1.5 border-y border-line bg-page px-5 text-xs font-semibold text-muted', COLS)}>
            <span role="columnheader">{t('common.englishName')}</span>
            <span role="columnheader">{t('common.chineseName')}</span>
            <span role="columnheader">{t('categories.parentCategory')}</span>
            <span role="columnheader">{t('categories.expenseType')}</span>
            <span role="columnheader">{t('common.status')}</span>
            <span role="columnheader" className="sr-only">
              {t('common.edit')}
            </span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t('common.noResults')}</p>}
          {rows.map((c) => {
            const parent = c.parentId === null
            const type = c.expenseTypeId == null ? null : typeById.get(c.expenseTypeId)
            return (
              <div
                key={c.id}
                role="row"
                className={cn(
                  'grid min-h-14 items-center gap-x-1.5 border-b border-line px-5 py-1.5',
                  COLS,
                  (parent || (panel?.mode === 'edit' && panel.id === c.id)) && 'bg-tint',
                  !c.active && 'text-muted',
                )}
              >
                <span role="cell" className={cn('flex items-center gap-1.5', parent ? 'font-bold' : 'pl-[18px] font-medium')}>
                  {c.nameEn}
                  {c.core && <CoreChip label={t('common.core')} />}
                </span>
                <span role="cell" lang="zh-Hans" className={parent ? 'font-bold' : undefined}>
                  {c.nameZh}
                </span>
                <span role="cell" className="text-[13px]">
                  {parent ? '—' : name(byId.get(c.parentId!)!)}
                </span>
                <span role="cell" className="text-[13px]">
                  {type ? name(type) : '—'}
                </span>
                <span role="cell">
                  <StatusSwitch checked={c.active} locked={c.core} label={c.nameEn} onCheckedChange={(v) => void toggle(c, v)} />
                </span>
                <span role="cell" className="flex justify-end">
                  <Button variant="secondary" size="sm" aria-label={`${t('common.edit')}: ${name(c)}`} onClick={() => setPanel({ mode: 'edit', id: c.id })}>
                    {t('common.edit')}
                  </Button>
                </span>
              </div>
            )
          })}
        </div>
      </ListCard>

      {panel && (
        <CategoryPanel
          key={panel.mode === 'edit' ? panel.id : 'new'}
          category={editing}
          categories={categories}
          types={types}
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
