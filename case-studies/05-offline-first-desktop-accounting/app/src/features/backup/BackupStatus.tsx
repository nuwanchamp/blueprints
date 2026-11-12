import { useTranslation } from 'react-i18next'
import type { LastBackup } from '@/db/repo/backup'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/date'
import type { BackupHealth } from './useLastBackup'

/** "Last backup: 28/10/2026 21:30 · to Daybook Backups", amber when old or missing, red when a week old. */
export function BackupStatus({ last, health, compact }: { last: LastBackup | null | undefined; health: BackupHealth; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  if (last === undefined) return null
  const when = last ? `${formatDate(last.at.slice(0, 10), lang)} ${last.at.slice(11, 16)}` : null
  const where = last ? (last.folderProblem ? t('backup.whereProblem') : last.where === 'folder' ? t('backup.whereFolder', { folder: last.folder }) : t('backup.whereDownload')) : null
  return (
    <p
      data-testid="backup-status"
      data-health={health}
      className={cn(
        'rounded-lg',
        compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-[13px]',
        health === 'ok' && 'bg-page',
        (health === 'old' || health === 'none') && 'bg-warn-tint font-semibold text-warn',
        health === 'stale' && 'bg-loss-tint font-semibold text-loss',
      )}
    >
      {last ? (
        <>
          {t('backup.lastBackup')} <span className={cn('font-semibold whitespace-nowrap tabular-nums', compact && 'block')}>{when}</span>
          {!compact && <span> · {where}</span>}
        </>
      ) : (
        t('backup.never')
      )}
    </p>
  )
}
