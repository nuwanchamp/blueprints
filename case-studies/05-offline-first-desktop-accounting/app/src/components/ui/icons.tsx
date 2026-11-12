import { ArrowDown, ArrowUp, Check, ChevronRight, NotebookPen, Settings, Trash2, type LucideIcon, type LucideProps } from 'lucide-react'
import { cn } from '@/lib/cn'

// Every icon in the app is a Lucide line icon: same 24px grid, same stroke, so they read as one set.
// Icons are decoration beside a word or an aria-label, never the only way something is named.

/** Lucide defaults for this app: thin ink lines, hidden from screen readers. */
export function Icon({ icon: I, size = 18, className, ...props }: LucideProps & { icon: LucideIcon }) {
  return <I size={size} strokeWidth={1.9} aria-hidden="true" className={cn('shrink-0', className)} {...props} />
}

/** A pen on a notebook: add or edit the note. */
export const NoteIcon = (props: LucideProps) => <Icon icon={NotebookPen} {...props} />

export const TrashIcon = (props: LucideProps) => <Icon icon={Trash2} {...props} />

/** A small arrow that points right, and turns to point down when `open`. */
export function ChevronIcon({ open, className, ...props }: LucideProps & { open?: boolean }) {
  return <Icon icon={ChevronRight} size={16} className={cn('transition-transform', open && 'rotate-90', className)} {...props} />
}

export const ArrowIcon = ({ dir, ...props }: LucideProps & { dir: 'up' | 'down' }) => <Icon icon={dir === 'up' ? ArrowUp : ArrowDown} size={16} {...props} />

export const CogIcon = (props: LucideProps) => <Icon icon={Settings} size={20} strokeWidth={1.6} {...props} />

export const CheckIcon = (props: LucideProps) => <Icon icon={Check} strokeWidth={2.75} {...props} />
