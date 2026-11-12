import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { CoreChip } from '@/components/ui/Field'
import { ArrowIcon } from '@/components/ui/icons'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError } from '@/db/repo/expenses'
import { moveIncomeChannel, setIncomeChannelActive, type IncomeChannel } from '@/db/repo/master'
import { cn } from '@/lib/cn'
import { buildTree, filterTree, flatten } from '@/lib/tree'
import { ChannelPanel } from './components/ChannelPanel'
import { ListCard } from './components/ListCard'

interface Props {
  channels: IncomeChannel[]
  reload: () => Promise<void>
}

type Panel = { mode: 'add' } | { mode: 'edit'; id: number } | null

const COLS = 'grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1fr)_128px_64px_96px]'

export function IncomeChannelsView({ channels, reload }: Props) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (c: Pick<IncomeChannel, 'nameEn' | 'nameZh'>) => (zh ? c.nameZh : c.nameEn)
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const byId = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels])
  const hasChildren = useMemo(() => new Set(channels.map((c) => c.parentId).filter((x): x is number => x !== null)), [channels])
  const pathOf = (c: IncomeChannel): string => (c.parentId === null ? '' : [pathOf(byId.get(c.parentId)!), name(byId.get(c.parentId)!)].filter(Boolean).join(' › '))

  // Groups first, each followed by what is under it. A match keeps its whole branch; a match deeper down keeps the way to it.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const tree = buildTree(channels)
    return flatten(q ? filterTree(tree, (c) => c.nameEn.toLowerCase().includes(q) || c.nameZh.includes(search.trim())) : tree)
  }, [channels, search])

  const activeCount = channels.filter((c) => c.active).length
  const editing = panel?.mode === 'edit' ? (byId.get(panel.id) ?? null) : null

  async function toggle(c: IncomeChannel, next: boolean) {
    try {
      await setIncomeChannelActive(c.id, next)
      setNotice(null)
      await reload()
    } catch (e) {
      setNotice(e instanceof RepoError ? t(e.key) : t('common.saveFailed'))
    }
  }

  async function move(c: IncomeChannel, direction: 'up' | 'down') {
    try {
      await moveIncomeChannel(c.id, direction)
      setNotice(null)
      await reload()
    } catch (e) {
      setNotice(e instanceof RepoError ? t(e.key) : t('common.saveFailed'))
    }
  }
  // Position among the channels under the same parent; moving is off while a search hides some of them
  const siblings = (c: IncomeChannel) => channels.filter((x) => x.parentId === c.parentId)
  const canMove = search.trim() === ''

  return (
    <>
      <ListCard
        title={t('incomeChannels.title')}
        description={t('incomeChannels.description')}
        addLabel={t('incomeChannels.add')}
        onAdd={() => setPanel({ mode: 'add' })}
        searchPlaceholder={t('incomeChannels.searchPlaceholder')}
        search={search}
        onSearch={setSearch}
        activeCount={activeCount}
        inactiveCount={channels.length - activeCount}
        notice={notice}
        footnote={`${t('common.footnote')} ${t('incomeChannels.parentFootnote')}`}
      >
        <div role="table" aria-label={t('incomeChannels.title')} className="overflow-x-auto">
          <div role="row" className={cn('grid min-h-11 items-center gap-x-1.5 border-y border-line bg-page px-5 text-xs font-semibold text-muted', COLS)}>
            <span role="columnheader">{t('common.englishName')}</span>
            <span role="columnheader">{t('common.chineseName')}</span>
            <span role="columnheader">{t('incomeChannels.parent')}</span>
            <span role="columnheader">{t('common.countsInDrawer')}</span>
            <span role="columnheader">{t('common.status')}</span>
            <span role="columnheader" className="sr-only">
              {t('common.edit')}
            </span>
            <span role="columnheader">{t('incomeChannels.order')}</span>
          </div>
          {rows.length === 0 && <p className="px-5 py-6 text-sm text-muted">{t('common.noResults')}</p>}
          {rows.map(({ item: c, depth }) => (
            <div
              key={c.id}
              role="row"
              className={cn(
                'grid min-h-14 items-center gap-x-1.5 border-b border-line px-5 py-1.5',
                COLS,
                (depth === 0 || (panel?.mode === 'edit' && panel.id === c.id)) && 'bg-tint',
                !c.active && 'text-muted',
              )}
            >
              <span role="cell" className={cn('flex items-center gap-1.5', depth === 0 ? 'font-bold' : 'font-medium')} style={{ paddingLeft: depth * 18 }}>
                {c.nameEn}
                {c.core && <CoreChip label={t('common.core')} />}
              </span>
              <span role="cell" lang="zh-Hans" className={depth === 0 ? 'font-bold' : undefined}>
                {c.nameZh}
              </span>
              <span role="cell" className="text-[13px]">
                {pathOf(c) || '—'}
              </span>
              <span role="cell" className="text-[13px]">
                {hasChildren.has(c.id) ? '—' : c.countsInDrawer ? t('common.yes') : t('common.no')}
              </span>
              <span role="cell">
                <StatusSwitch checked={c.active} locked={c.core} label={c.nameEn} onCheckedChange={(v) => void toggle(c, v)} />
              </span>
              <span role="cell" className="flex justify-end">
                <Button variant="secondary" size="sm" aria-label={`${t('common.edit')}: ${c.nameEn}`} onClick={() => setPanel({ mode: 'edit', id: c.id })}>
                  {t('common.edit')}
                </Button>
              </span>
              <span role="cell" className="flex gap-1">
                {canMove &&
                  (['up', 'down'] as const).map((dir) => {
                    const sibs = siblings(c)
                    const i = sibs.findIndex((x) => x.id === c.id)
                    const disabled = dir === 'up' ? i === 0 : i === sibs.length - 1
                    return (
                      <button
                        key={dir}
                        type="button"
                        disabled={disabled}
                        aria-label={`${t(dir === 'up' ? 'incomeChannels.moveUp' : 'incomeChannels.moveDown')}: ${c.nameEn}`}
                        onClick={() => void move(c, dir)}
                        className="inline-flex size-11 items-center justify-center rounded-lg border border-control bg-white hover:bg-tint disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white"
                      >
                        <ArrowIcon dir={dir} />
                      </button>
                    )
                  })}
              </span>
            </div>
          ))}
        </div>
      </ListCard>

      {panel && (
        <ChannelPanel
          key={panel.mode === 'edit' ? panel.id : 'new'}
          channel={editing}
          channels={channels}
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
