import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface Props {
  title: string
  onClose: () => void
  /** Always slide over the page, even on wide screens (for pages with no spare column). */
  drawer?: boolean
  children: ReactNode
}

/** Right-hand edit card on desktop; slides over the page as a drawer at tablet width. */
export function EditPanel({ title, onClose, drawer, children }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className={cn('fixed inset-0 z-20 bg-ink/40', !drawer && 'xl:hidden')} onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={title}
        className={cn(
          'fixed inset-y-0 right-0 z-30 flex w-[360px] max-w-full flex-col gap-4 overflow-y-auto bg-white p-5 shadow-xl',
          !drawer && 'xl:static xl:z-auto xl:w-76 xl:shrink-0 xl:rounded-xl xl:border xl:border-line xl:shadow-none',
          drawer && 'sm:w-[420px]',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-serif text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={cn('-mt-2 -mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-xl text-muted hover:bg-tint', !drawer && 'xl:hidden')}
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
