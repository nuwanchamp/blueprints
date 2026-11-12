import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { Input } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { BACKUP_EVENT } from './backup'
import { MIN_RETENTION, type RetentionPolicy } from './retention'

const FIELDS = ['keepAllDays', 'dailyDays', 'weeklyDays', 'monthlyMonths'] as const
type FieldKey = (typeof FIELDS)[number]

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)

/**
 * Backup & restore → how long old backups are kept (desktop app only). Anyone can see it; changing it needs the
 * admin PIN, because keeping fewer deletes old backups straight away.
 */
export function RetentionCard() {
  const { t } = useTranslation()
  const native = window.daybookNative
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null)
  const [asking, setAsking] = useState(false)
  const [pin, setPin] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<FieldKey, string> | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = async () => {
    if (!native) return
    setPolicy(await native.backup.getRetention())
    setUsage(await native.backup.usage().catch(() => null))
  }
  useEffect(() => {
    void load()
    window.addEventListener(BACKUP_EVENT, load)
    return () => window.removeEventListener(BACKUP_EVENT, load)
  }, [])

  if (!native || !policy) return null

  const edit = (p: RetentionPolicy) => setDraft(Object.fromEntries(FIELDS.map((f) => [f, String(p[f])])) as Record<FieldKey, string>)
  const close = () => {
    setAsking(false)
    setDraft(null)
    setPin('')
  }

  const change = () => {
    setMessage(null)
    if (token) edit(policy)
    else setAsking(true)
  }

  const unlock = async (e: FormEvent) => {
    e.preventDefault()
    const r = await native.update.unlock(pin)
    setPin('')
    if (r.ok) {
      setToken(r.token)
      setAsking(false)
      setMessage(null)
      edit(policy)
    } else {
      setMessage({ tone: 'error', text: r.reason === 'noPin' ? t('updates.noPinInBuild') : r.reason === 'locked' ? t('retention.locked') : t('retention.wrongPin') })
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft || !token) return
    try {
      const next = await native.backup.setRetention(token, Object.fromEntries(FIELDS.map((f) => [f, Number(draft[f])])))
      setPolicy(next)
      close()
      setMessage({ tone: 'ok', text: t('retention.saved') })
      setUsage(await native.backup.usage().catch(() => null))
    } catch {
      // The approval ran out: ask for the PIN again
      setToken(null)
      close()
      setMessage({ tone: 'error', text: t('retention.pinAgain') })
    }
  }

  /** 14 → "14 days", 730 → "2 years", 0 months → "for ever" */
  const span = (f: FieldKey, v: number) => {
    if (f === 'monthlyMonths') return v === 0 ? t('retention.forever') : v % 12 === 0 ? t('retention.years', { count: v / 12 }) : t('retention.months', { count: v })
    return v >= 365 && v % 365 === 0 ? t('retention.years', { count: v / 365 }) : t('retention.days', { count: v })
  }

  return (
    <section aria-label={t('retention.title')} className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold">{t('retention.title')}</h2>
          {usage && <p className="text-[13px] text-muted">{t('retention.usage', { count: usage.count, size: mb(usage.bytes) })}</p>}
        </div>
        {!asking && !draft && (
          <Button variant="secondary" size="sm" onClick={change}>
            <Icon icon={KeyRound} size={15} />
            {t('retention.change')}
          </Button>
        )}
      </div>

      <form onSubmit={(e) => void save(e)}>
        <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {FIELDS.map((f) => (
            <div key={f} className="flex flex-col gap-0.5 rounded-lg border border-line bg-page px-3 py-2.5">
              <dt className="text-xs font-semibold text-muted">{t(`retention.tiers.${f}`)}</dt>
              <dd className="text-sm font-semibold">
                {draft ? (
                  <label className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={f === 'monthlyMonths' ? 0 : MIN_RETENTION[f]}
                      value={draft[f]}
                      onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                      aria-label={t(`retention.tiers.${f}`)}
                      className="h-9 w-20 px-2"
                    />
                    <span className="text-[13px] font-medium text-muted">{f === 'monthlyMonths' ? t('retention.unitMonths') : t('retention.unitDays')}</span>
                  </label>
                ) : (
                  span(f, policy[f])
                )}
              </dd>
            </div>
          ))}
        </dl>

        {draft && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              {t('retention.save')}
            </Button>
            <Button variant="ghost" size="sm" onClick={close}>
              {t('common.cancel')}
            </Button>
            <span className="text-xs text-muted">{t('retention.saveHint')}</span>
          </div>
        )}
      </form>

      {asking && (
        <form onSubmit={(e) => void unlock(e)} className="mt-3 flex flex-wrap items-center gap-2">
          <Input type="password" autoComplete="off" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} aria-label={t('updates.pinLabel')} placeholder={t('updates.pinLabel')} className="w-56" />
          <Button type="submit" size="sm" disabled={!pin}>
            {t('updates.unlock')}
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>
            {t('common.cancel')}
          </Button>
        </form>
      )}

      {message && (
        <Callout tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'} className="mt-3">
          {message.text}
        </Callout>
      )}

      <p className="mt-3 text-xs text-muted">{t('retention.ruleSafe')}</p>
    </section>
  )
}
