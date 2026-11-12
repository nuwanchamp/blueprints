import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icons'
import { FileUp, FolderOpen, HardDriveDownload, KeyRound, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { BackupFileError, inspectBackup, restoreDb } from '@/db/client'
import type { BackupInfo } from '@/db/protocol'
import { getDayExcelOn, setDayExcelOn, setLastBackup } from '@/db/repo/backup'
import { formatDate } from '@/lib/date'
import { canUseFolder, chooseFolder, folderPermission, forgetFolder, getFolder, listFolderBackups, makeBackup } from './backup'
import { catchUpDayExcel } from './afterClose'
import { BackupStatus } from './BackupStatus'
import { RetentionCard } from './RetentionCard'
import { useLastBackup } from './useLastBackup'

type Folder = Awaited<ReturnType<typeof getFolder>>
type Picked = { name: string; bytes: Uint8Array; info: BackupInfo }

const RESTORED_KEY = 'daybook.restored'

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      <p className="mt-1 text-[13px] text-muted">{description}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Message({ tone, children }: { tone: 'ok' | 'warn' | 'error'; children: ReactNode }) {
  return (
    <Callout tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </Callout>
  )
}

/** Settings → Backup & restore: where backups go, a backup on demand, and putting a backup back. */
export function BackupView() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'zh' ? 'zh' : 'en'
  const { last, health } = useLastBackup()
  const [folder, setFolder] = useState<Folder>(null)
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [inFolder, setInFolder] = useState<Awaited<ReturnType<typeof listFolderBackups>>>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restored, setRestored] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [dayExcel, setDayExcel] = useState(true)
  const [dataFile, setDataFile] = useState<string | null>(null)

  const refresh = async () => {
    const h = await getFolder()
    setFolder(h)
    const p = h ? await folderPermission(h, false) : 'prompt'
    setPermission(p)
    setInFolder(h && p === 'granted' ? await listFolderBackups(h) : [])
  }

  useEffect(() => {
    void refresh()
    void getDayExcelOn().then(setDayExcel, () => undefined)
    void window.daybookNative?.dataFile().then(setDataFile, () => undefined)
    // A restore reloads the app; say what came back once it has
    try {
      const msg = sessionStorage.getItem(RESTORED_KEY)
      if (msg) {
        setRestored(msg)
        sessionStorage.removeItem(RESTORED_KEY)
      }
    } catch {
      // storage blocked: the restore still happened
    }
  }, [])

  const day = (iso: string | null) => (iso ? formatDate(iso, lang) : '—')
  const errorText = (e: unknown) => (e instanceof BackupFileError ? t(`backup.errors.${e.code}`) : t('backup.errors.failed'))

  const backupNow = async () => {
    setBusy(true)
    setDone(null)
    try {
      const b = await makeBackup('manual', { ask: true })
      const excel = b.where === 'folder' ? await catchUpDayExcel(t, lang).catch(() => 0) : 0
      const saved = b.where === 'folder' ? t('backup.savedToFolder', { file: b.file, folder: b.folder }) : b.folderProblem ? t('backup.folderBroken', { file: b.file }) : t('backup.downloaded', { file: b.file })
      setDone({ tone: b.where === 'folder' ? 'ok' : 'warn', text: excel > 0 ? `${saved} ${t('backup.excelAdded', { count: excel })}` : saved })
      await refresh()
    } catch (e) {
      setDone({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const pick = async () => {
    await chooseFolder()
    await refresh()
  }

  const allow = async () => {
    if (folder) setPermission(await folderPermission(folder, true))
    await refresh()
  }

  const open = async (name: string, file: Blob) => {
    setRestoreError(null)
    setPicked(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      setPicked({ name, bytes, info: await inspectBackup(bytes) })
    } catch (e) {
      setRestoreError(errorText(e))
    }
  }

  const restore = async () => {
    if (!picked) return
    setBusy(true)
    setRestoreError(null)
    try {
      // The data on this computer now is saved first, so a wrong restore can be undone
      const safety = await makeBackup('beforeRestore', { ask: true })
      const info = await restoreDb(picked.bytes)
      // The restored data carries its own "last backup"; the safety copy is the newest one
      await setLastBackup({ at: safety.at, where: safety.where, folder: safety.folder, file: safety.file, reason: safety.reason })
      try {
        sessionStorage.setItem(RESTORED_KEY, t('backup.restoredBody', { file: picked.name, day: day(info.lastClosedDay), safety: safety.file }))
      } catch {
        // the message is a courtesy
      }
      window.location.reload()
    } catch (e) {
      setRestoreError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      {restored && <Message tone="ok">{restored}</Message>}

      <Card title={t('backup.folderTitle')} description={t('backup.folderHint')}>
        {!canUseFolder() ? (
          <Message tone="warn">{t('backup.noFolderSupport')}</Message>
        ) : folder ? (
          <>
            <p className="text-sm">
              {t('backup.savingTo')} <strong data-testid="backup-folder">{folder.name}</strong>
            </p>
            {last?.folderProblem && <Message tone="error">{t('backup.folderBrokenHint')}</Message>}
            {permission !== 'granted' && (
              <div className="flex flex-wrap items-center gap-3">
                <Message tone="warn">{t('backup.needsPermission')}</Message>
                <Button size="sm" onClick={() => void allow()}>
                  <Icon icon={KeyRound} size={16} />
                  {t('backup.allow')}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void pick()}>
                <Icon icon={FolderOpen} size={16} />
                {t('backup.changeFolder')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void forgetFolder().then(refresh)
                }}
              >
                {t('backup.forgetFolder')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{t('backup.noFolder')}</p>
            <div>
              <Button onClick={() => void pick()}><Icon icon={FolderOpen} size={16} />
{t('backup.chooseFolder')}</Button>
            </div>
          </>
        )}
      </Card>

      <Card title={t('backup.backupsTitle')} description={t('backup.backupsHint')}>
        <BackupStatus last={last} health={health} />
        {dataFile && (
          <p className="text-[13px] text-muted">
            {t('backup.dataFile')} <span className="font-medium break-all text-ink" data-testid="data-file">{dataFile}</span>
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={dayExcel}
            onChange={(e) => {
              const on = e.target.checked
              setDayExcel(on)
              void setDayExcelOn(on)
            }}
            className="mt-0.5 size-5 shrink-0 accent-ink"
          />
          <span>
            <span className="font-medium">{t('backup.dayExcel')}</span>
            <span className="block text-[13px] text-muted">{t('backup.dayExcelHint')}</span>
          </span>
        </label>
        <div>
          <Button disabled={busy} onClick={() => void backupNow()}>
            <Icon icon={HardDriveDownload} size={16} />
            {t('backup.backupNow')}
          </Button>
        </div>
        {done && <Message tone={done.tone}>{done.text}</Message>}
      </Card>

      <RetentionCard />

      <Card title={t('backup.restoreTitle')} description={t('backup.restoreHint')}>
        {inFolder.length > 0 && (
          <ul aria-label={t('backup.inFolder')} className="flex flex-col">
            {inFolder.slice(0, 10).map((f) => (
              <li key={f.name} className="flex min-h-12 items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
                <span className="truncate tabular-nums">{f.name}</span>
                <Button size="sm" variant="secondary" aria-label={`${t('backup.check')}: ${f.name}`} onClick={() => void f.file().then((file) => open(f.name, file))}>
                  {t('backup.check')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Icon icon={FileUp} size={16} />
            {t('backup.chooseFile')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".sqlite3,.sqlite,.db,application/vnd.sqlite3,application/x-sqlite3"
            aria-label={t('backup.chooseFile')}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void open(f.name, f)
            }}
          />
        </div>
        {restoreError && <Message tone="error">{restoreError}</Message>}
        {picked && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-page p-4" data-testid="restore-preview">
            <p className="text-sm font-semibold">{picked.name}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13px]">
              <dt className="text-muted">{t('backup.lastClosedDay')}</dt>
              <dd className="font-semibold">{day(picked.info.lastClosedDay)}</dd>
              <dt className="text-muted">{t('backup.daysCovered')}</dt>
              <dd>
                {picked.info.firstDay ? `${day(picked.info.firstDay)} – ` : ''}
                {t('backup.dayCount', { count: picked.info.days })}
              </dd>
              <dt className="text-muted">{t('backup.entries')}</dt>
              <dd>{t('backup.entryCounts', { sales: picked.info.sales, expenses: picked.info.expenses, cash: picked.info.cashMovements })}</dd>
            </dl>
            <Message tone="warn">{t('backup.replaceWarning')}</Message>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void restore()}>
                <Icon icon={RotateCcw} size={16} />
                {t('backup.restoreThis')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setPicked(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
