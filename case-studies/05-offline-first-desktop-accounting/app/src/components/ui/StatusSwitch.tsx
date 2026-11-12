import * as Switch from '@radix-ui/react-switch'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface Props {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Core records feed the cash reconciliation, so they stay on. */
  locked?: boolean
  /** Name of the record, for screen readers. */
  label: string
  /** Hide the Active / Inactive word (used where a label sits next to it). */
  hideWord?: boolean
}

export function StatusSwitch({ checked, onCheckedChange, locked, label, hideWord }: Props) {
  const { t } = useTranslation()
  return (
    <label className={cn('inline-flex min-h-11 items-center gap-2.5', locked ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <Switch.Root
        checked={checked}
        disabled={locked}
        onCheckedChange={onCheckedChange}
        aria-label={`${label}: ${checked ? t('common.active') : t('common.inactive')}`}
        title={locked ? t('common.coreHint') : undefined}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full p-[3px] transition-colors',
          checked ? 'bg-ink' : 'bg-control',
        )}
      >
        <Switch.Thumb className="block size-[18px] rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
      </Switch.Root>
      {!hideWord && (
        <span className={cn('text-[13px] font-medium', checked ? 'text-ink' : 'text-muted')}>
          {checked ? t('common.active') : t('common.inactive')}
        </span>
      )}
    </label>
  )
}
