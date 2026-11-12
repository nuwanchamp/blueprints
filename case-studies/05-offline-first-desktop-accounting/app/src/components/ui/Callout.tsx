import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, Lock, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Icon } from './icons'

export type CalloutTone = 'error' | 'warn' | 'info' | 'ok' | 'locked'

const STYLE: Record<CalloutTone, { icon: LucideIcon; box: string }> = {
  error: { icon: CircleAlert, box: 'border-loss bg-loss-tint text-loss' },
  warn: { icon: TriangleAlert, box: 'border-warn-line bg-warn-tint text-warn' },
  info: { icon: Info, box: 'border-line bg-page text-ink' },
  ok: { icon: CircleCheck, box: 'border-line bg-page text-ink' },
  locked: { icon: Lock, box: 'border-2 border-ink bg-white text-ink' },
}

/** A message box: the tone sets the colour and the icon, the words carry the meaning. */
export function Callout({ tone, role, className, children }: { tone: CalloutTone; role?: 'alert' | 'status'; className?: string; children: ReactNode }) {
  const s = STYLE[tone]
  return (
    <div role={role} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium', s.box, className)}>
      <Icon icon={s.icon} size={16} className="mt-[2px]" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
