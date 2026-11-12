import { useState, type FormEvent } from 'react'
import { Download, KeyRound, RefreshCw, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Field, Input } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import type { UnlockResult } from '@/native'
import { useUpdateStatus } from './useUpdateStatus'

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Settings → Updates: anyone can check; the admin PIN downloads and installs. */
export function UpdatesView() {
  const { t } = useTranslation()
  const status = useUpdateStatus()
  const update = window.daybookNative?.update
  const [asking, setAsking] = useState(false)
  const [pin, setPin] = useState('')
  const [refused, setRefused] = useState<Extract<UnlockResult, { ok: false }> | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setFailed(null)
    try {
      await job()
    } catch {
      setFailed(t('updates.failed'))
    } finally {
      setBusy(false)
    }
  }

  const unlock = (e: FormEvent) => {
    e.preventDefault()
    if (!update || !pin) return
    void run(async () => {
      const r = await update.unlock(pin)
      setPin('')
      if (!r.ok) return setRefused(r)
      setRefused(null)
      setAsking(false)
      setToken(r.token)
      // Already downloaded earlier (an approval ran out): only the install is left
      if (status?.state === 'available') await update.download(r.token)
    })
  }

  const install = () => {
    if (!update || !token) return
    void run(async () => {
      try {
        await update.install(token)
      } catch (e) {
        // The approval lasts a few minutes; after that the PIN is asked again
        setToken(null)
        setAsking(true)
        throw e
      }
    })
  }

  return (
    <section aria-label={t('updates.title')} className="min-w-0 flex-1 rounded-xl border border-line bg-white p-5">
      <h2 className="font-serif text-xl font-semibold">{t('updates.title')}</h2>
      <p className="mt-1 text-[13px] text-muted">{t('updates.hint')}</p>

      {!update || !status ? (
        <div className="mt-4">
          <Callout tone="info">{t('updates.desktopOnly')}</Callout>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            {t('updates.current')} <span className="font-semibold">{status.current}</span>
          </p>
          {status.checkedAt && <p className="text-[13px] text-muted">{t('updates.checkedAt', { time: time(Date.parse(status.checkedAt)) })}</p>}

          {status.state === 'off' && <Callout tone="info">{t('updates.off')}</Callout>}
          {status.state === 'none' && <Callout tone="ok" role="status">{t('updates.upToDate')}</Callout>}
          {status.state === 'error' && <Callout tone="warn" role="status">{t('updates.checkFailed')}</Callout>}

          {status.version && ['available', 'downloading', 'ready'].includes(status.state) && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-page p-4">
              <p className="text-sm font-semibold">{t('updates.newVersion', { version: status.version })}</p>
              {status.notes && <p className="text-[13px] whitespace-pre-line text-muted">{status.notes}</p>}
            </div>
          )}

          {status.state === 'available' && !status.canInstall && <Callout tone="warn">{t('updates.noPinInBuild')}</Callout>}

          {status.state === 'downloading' && (
            <div role="status" className="flex flex-col gap-1.5">
              <p className="text-[13px] font-medium">{t('updates.downloading', { percent: status.percent ?? 0 })}</p>
              <div className="h-2 overflow-hidden rounded-full bg-tint">
                <div className="h-full bg-ink transition-[width]" style={{ width: `${status.percent ?? 0}%` }} />
              </div>
            </div>
          )}

          {status.state === 'ready' && token && <Callout tone="info">{t('updates.readyHint')}</Callout>}

          {asking && (
            <form onSubmit={unlock} className="flex flex-col gap-3 rounded-lg border border-line p-4" aria-label={t('updates.pinTitle')}>
              <Field
                label={t('updates.pinLabel')}
                hint={t('updates.pinHint')}
                error={
                  refused?.reason === 'locked'
                    ? t('updates.locked', { time: time(refused.lockedUntil ?? Date.now()) })
                    : refused?.reason === 'wrong'
                      ? t('updates.wrongPin', { count: refused.triesLeft ?? 0 })
                      : undefined
                }
              >
                {(id) => <Input id={id} type="password" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} invalid={Boolean(refused)} className="max-w-64" />}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !pin}>
                  <Icon icon={KeyRound} size={16} />
                  {t('updates.unlock')}
                </Button>
                <Button variant="ghost" onClick={() => setAsking(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          )}

          {failed && <Callout tone="error" role="alert">{failed}</Callout>}

          <div className="flex flex-wrap gap-2">
            {status.state !== 'off' && (
              <Button variant="secondary" disabled={busy || ['checking', 'downloading'].includes(status.state)} onClick={() => void run(() => update.check())}>
                <Icon icon={RefreshCw} size={16} />
                {status.state === 'checking' ? t('updates.checking') : t('updates.check')}
              </Button>
            )}
            {(status.state === 'available' || (status.state === 'ready' && !token)) && status.canInstall && !asking && (
              <Button onClick={() => setAsking(true)}>
                <Icon icon={Download} size={16} />
                {t('updates.install')}
              </Button>
            )}
            {status.state === 'ready' && token && (
              <Button disabled={busy} onClick={install}>
                <Icon icon={RotateCcw} size={16} />
                {t('updates.restart')}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
