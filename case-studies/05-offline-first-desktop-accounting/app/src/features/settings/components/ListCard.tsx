import type { ReactNode } from 'react'
import { Callout } from '@/components/ui/Callout'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'

interface Props {
  title: string
  description: string
  addLabel: string
  onAdd: () => void
  searchPlaceholder: string
  search: string
  onSearch: (v: string) => void
  activeCount: number
  inactiveCount: number
  /** Short message after a failed switch, e.g. "Core records cannot be switched off". */
  notice?: string | null
  footnote?: ReactNode
  children: ReactNode
}

/** The centre card shared by every master-record section. */
export function ListCard(p: Props) {
  const { t } = useTranslation()
  return (
    <section className="min-w-0 flex-1 rounded-xl border border-line bg-white">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl font-semibold">{p.title}</h2>
            <p className="mt-1 text-[13px] text-muted">{p.description}</p>
          </div>
          <Button onClick={p.onAdd}>{p.addLabel}</Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Input
            type="search"
            aria-label={p.searchPlaceholder}
            placeholder={p.searchPlaceholder}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="max-w-70"
          />
          <p className="text-[13px] font-medium">{t('common.summary', { active: p.activeCount, inactive: p.inactiveCount })}</p>
        </div>
        {p.notice && (
          <Callout tone="error" role="status">
            {p.notice}
          </Callout>
        )}
      </div>
      {p.children}
      <p className="px-5 py-3.5 text-xs text-muted">{p.footnote ?? t('common.footnote')}</p>
    </section>
  )
}
