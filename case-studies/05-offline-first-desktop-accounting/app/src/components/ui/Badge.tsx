import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Icon } from './icons'

export type BadgeTone = 'neutral' | 'warn' | 'done'

const TONE: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-tint text-ink', dot: 'bg-control' },
  warn: { box: 'bg-warn-tint text-warn', dot: 'bg-warn-line' },
  done: { box: 'bg-tint text-ink', dot: 'bg-ok' },
}

/**
 * A label that tells, never a control: a flat tinted fill with no border, squarer corners and a dot or small icon,
 * so it can't be mistaken for a button (buttons are white, outlined and 44px tall).
 */
export function Badge({ tone = 'neutral', icon, dot, className, children }: { tone?: BadgeTone; icon?: LucideIcon; dot?: boolean; className?: string; children: ReactNode }) {
  const s = TONE[tone]
  return (
    <span className={cn('inline-flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold select-none', s.box, className)}>
      {icon ? <Icon icon={icon} size={14} /> : dot && <span aria-hidden className={cn('size-2 rounded-full', s.dot)} />}
      {children}
    </span>
  )
}
