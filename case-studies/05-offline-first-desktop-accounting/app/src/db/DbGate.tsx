import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DbLockedError, openDb } from './client'
import type { StorageMode } from './protocol'

type State = { status: 'opening' } | { status: 'ready'; storage: StorageMode } | { status: 'locked' } | { status: 'failed'; message: string }

/** Opens the local database before the app renders, and explains the two ways that can go wrong. */
export function DbGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ status: 'opening' })

  useEffect(() => {
    openDb().then(
      (storage) => {
        setState({ status: 'ready', storage })
        // Ask the browser not to clear this data when the disk runs low (it may still say no)
        void navigator.storage?.persist?.().catch(() => false)
      },
      (e: unknown) => setState(e instanceof DbLockedError ? { status: 'locked' } : { status: 'failed', message: String(e) }),
    )
  }, [])

  if (state.status === 'opening') {
    return <p className="p-10 text-sm text-muted">{t('db.opening')}</p>
  }
  if (state.status === 'locked' || state.status === 'failed') {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl border border-line bg-white p-8" role="alert">
        <h1 className="font-serif text-xl font-semibold">{state.status === 'locked' ? t('db.lockedTitle') : t('db.failedTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{state.status === 'locked' ? t('db.lockedBody') : state.message}</p>
      </div>
    )
  }
  return (
    <>
      {state.storage === 'memory' && (
        <p role="status" className="bg-ink px-6 py-2 text-center text-[13px] font-medium text-white">
          {t('db.memoryWarning')}
        </p>
      )}
      {children}
    </>
  )
}
