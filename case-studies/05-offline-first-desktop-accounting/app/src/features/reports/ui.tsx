import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/icons'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { downloadCsv, type Cell } from '@/lib/csv'
import { downloadXlsx } from '@/lib/xlsx'
import { cn } from '@/lib/cn'
import { formatPct } from './format'

/** A card with a serif title and room for actions (such as Export CSV) on the right. */
export function SectionCard({ title, subtitle, actions, children, className, id }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    // On paper a card may run over a page (a long table carries on, its header row repeated); its title stays with it
    <section id={id} aria-label={title} className={cn('min-w-0 rounded-xl border border-line bg-white p-5', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 print:break-after-avoid">
        <div>
          <h2 className="font-serif text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2 print:hidden">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

/** "+12.5% vs previous 31 days", or a plain note when there is nothing earlier to compare with. */
export function DeltaText({ pct, days }: { pct: number | null; days: number }) {
  const { t } = useTranslation()
  return <p className="mt-1 text-xs text-muted">{pct === null ? t('dashboard.noPrevious') : `${formatPct(pct)} ${t('dashboard.vsPrevious', { count: days })}`}</p>
}

/** A headline number with a label and a quiet note beneath. Values use proportional figures. */
export function StatTile({ label, value, children, testId }: { label: string; value: string; children?: ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white p-5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 text-[28px] leading-tight font-semibold" data-testid={testId}>
        {value}
      </p>
      {children}
    </div>
  )
}

/** The one number the dashboard leads with: at least 48px, same sans as everything else. */
export function HeroTile({ label, value, children, testId, loss }: { label: string; value: string; children?: ReactNode; testId?: string; loss?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border-2 bg-white p-6', loss ? 'border-loss' : 'border-ink')}>
      <p className={cn('text-sm font-semibold', loss ? 'text-loss' : 'text-muted')}>{label}</p>
      <p className={cn('mt-1 text-[48px] leading-none font-semibold', loss && 'text-loss')} data-testid={testId}>
        {value}
      </p>
      {children}
    </div>
  )
}

/** CSV and Excel downloads of the same rows. `filename` ends in .csv; the Excel file takes the same name with .xlsx. */
export function CsvButton({ filename, rows }: { filename: string; rows: Cell[][] }) {
  const { t } = useTranslation()
  return (
    <span className="flex gap-2">
      <Button size="sm" variant="secondary" onClick={() => downloadCsv(filename, rows)}>
        <Icon icon={FileText} size={16} />
        {t('reports.exportCsv')}
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void downloadXlsx(filename.replace(/\.csv$/, '.xlsx'), rows)}>
        <Icon icon={FileSpreadsheet} size={16} />
        {t('reports.exportXlsx')}
      </Button>
    </span>
  )
}

// ---- table pieces ----

export function Table({ children, label }: { children: ReactNode; label: string }) {
  return (
    // On screen a wide table scrolls; on paper (Print, Save as PDF) it fits the page width instead
    <div className="-mx-1 overflow-x-auto px-1 print:mx-0 print:overflow-visible print:px-0">
      <table aria-label={label} className="w-full min-w-max text-sm print:min-w-0">
        {children}
      </table>
    </div>
  )
}

export function Th({ children, num, className }: { children?: ReactNode; num?: boolean; className?: string }) {
  return (
    <th scope="col" className={cn('border-b border-line px-2 py-2 text-xs font-semibold whitespace-nowrap text-muted print:px-1 print:whitespace-normal', num ? 'text-right' : 'text-left', className)}>
      {children}
    </th>
  )
}

export function Td({ children, num, strong, className, colSpan, ...rest }: { children?: ReactNode; num?: boolean; strong?: boolean; className?: string; colSpan?: number; 'data-testid'?: string }) {
  return (
    <td {...rest} colSpan={colSpan} className={cn('border-b border-line px-2 py-2 print:px-1', num && 'text-right whitespace-nowrap tabular-nums print:whitespace-normal', strong && 'font-semibold', className)}>
      {children}
    </td>
  )
}
