import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { CoreChip } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError } from '@/db/repo/expenses'
import type { Flat } from '@/db/repo/master'
import { cn } from '@/lib/cn'
import { ListCard } from '../components/ListCard'
import { FlatPanel, type FlatField, type FlatValues } from './FlatPanel'

export interface FlatColumn<R> {
  header: string
  /** CSS grid track, e.g. 'minmax(0,1fr)' */
  width: string
  cell: (r: R) => ReactNode
}

interface Props<R extends Flat> {
  /** i18n base key holding title, description, add, searchPlaceholder, addTitle, editTitle */
  base: string
  records: R[]
  columns: FlatColumn<R>[]
  fields: FlatField[]
  extrasOf: (r: R | null) => Record<string, string>
  derived?: (extras: Record<string, string>) => ReactNode
  save: (v: FlatValues & { id?: number }) => Promise<number>
  toggle: (id: number, active: boolean) => Promise<void>
  reload: () => Promise<void>
}

type Panel = { mode: 'add' } | { mode: 'edit'; id: number } | null

/** The list + edit panel used by every flat master-record section (name pair, status, a couple of chip fields). */
export function FlatList<R extends Flat>(p: Props<R>) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return p.records.filter((r) => !q || r.nameEn.toLowerCase().includes(q) || r.nameZh.includes(q))
  }, [p.records, search])
  const activeCount = p.records.filter((r) => r.active).length
  const editing = panel?.mode === 'edit' ? (p.records.find((r) => r.id === panel.id) ?? null) : null
  const grid = { gridTemplateColumns: ['minmax(0,1.6fr)', 'minmax(0,1.2fr)', ...p.columns.map((c) => c.width), '128px', '64px'].join(' ') }

  async function onToggle(r: R, next: boolean) {
    try {
      await p.toggle(r.id, next)
      setNotice(null)
      await p.reload()
    } catch (e) {
      setNotice(e instanceof RepoError ? t(e.key) : t('common.saveFailed'))
    }
  }

  const name = t(`${p.base}.title`)
  return (
    <>
      <ListCard
        title={name}
        description={t(`${p.base}.description`)}
        addLabel={t(`${p.base}.add`)}
        onAdd={() => setPanel({ mode: 'add' })}
        searchPlaceholder={t(`${p.base}.searchPlaceholder`)}
        search={search}
        onSearch={setSearch}
        activeCount={activeCount}
        inactiveCount={p.records.length - activeCount}
        notice={notice}
      >
        <div role="table" aria-label={name} className="overflow-x-auto">
          <div role="row" style={grid} className="grid min-h-11 items-center gap-x-1.5 border-y border-line bg-page px-5 text-xs font-semibold text-muted">
            <span role="columnheader">{t('common.englishName')}</span>
            <span role="columnheader">{t('common.chineseName')}</span>
            {p.columns.map((c) => (
              <span role="columnheader" key={c.header}>
                {c.header}
              </span>
            ))}
            <span role="columnheader">{t('common.status')}</span>
            <span role="columnheader" className="sr-only">
              {t('common.edit')}
            </span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t('common.noResults')}</p>}
          {rows.map((r) => (
            <div
              key={r.id}
              role="row"
              style={grid}
              className={cn(
                'grid min-h-14 items-center gap-x-1.5 border-b border-line px-5 py-1.5',
                panel?.mode === 'edit' && panel.id === r.id && 'bg-tint',
                !r.active && 'text-muted',
              )}
            >
              <span role="cell" className="flex items-center gap-1.5 font-medium">
                {r.nameEn}
                {r.core && <CoreChip label={t('common.core')} />}
              </span>
              <span role="cell" lang="zh-Hans">
                {r.nameZh}
              </span>
              {p.columns.map((c) => (
                <span role="cell" key={c.header} className="text-[13px]">
                  {c.cell(r)}
                </span>
              ))}
              <span role="cell">
                <StatusSwitch checked={r.active} locked={r.core} label={r.nameEn} onCheckedChange={(v) => void onToggle(r, v)} />
              </span>
              <span role="cell" className="flex justify-end">
                <Button variant="secondary" size="sm" aria-label={`${t('common.edit')}: ${r.nameEn}`} onClick={() => setPanel({ mode: 'edit', id: r.id })}>
                  {t('common.edit')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      </ListCard>

      {panel && (
        <FlatPanel
          key={panel.mode === 'edit' ? panel.id : 'new'}
          title={t(editing ? `${p.base}.editTitle` : `${p.base}.addTitle`)}
          initial={{
            nameEn: editing?.nameEn ?? '',
            nameZh: editing?.nameZh ?? '',
            active: editing?.active ?? true,
            extras: p.extrasOf(editing),
          }}
          fields={p.fields}
          coreLocked={editing?.core ?? false}
          derived={p.derived}
          onClose={() => setPanel(null)}
          onSubmit={async (v) => {
            await p.save({ ...v, id: editing?.id })
            setPanel(null)
            setNotice(null)
            await p.reload()
          }}
        />
      )}
    </>
  )
}
