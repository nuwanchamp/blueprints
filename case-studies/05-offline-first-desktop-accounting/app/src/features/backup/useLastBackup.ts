import { useEffect, useState } from 'react'
import { getLastBackup, type LastBackup } from '@/db/repo/backup'
import { BACKUP_EVENT, backupAgeDays } from './backup'

export type BackupHealth = 'ok' | 'old' | 'stale' | 'none'

/** The last backup on this device, kept fresh when a new one is made anywhere in the app. */
export function useLastBackup() {
  const [last, setLast] = useState<LastBackup | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const load = () => void getLastBackup().then((b) => live && setLast(b), () => live && setLast(null))
    load()
    window.addEventListener(BACKUP_EVENT, load)
    return () => {
      live = false
      window.removeEventListener(BACKUP_EVENT, load)
    }
  }, [])
  // Amber after 2 days, red after 7: the same thresholds as the recovery report
  const health: BackupHealth = !last || last.folderProblem ? (last ? 'old' : 'none') : backupAgeDays(last) > 7 ? 'stale' : backupAgeDays(last) > 2 ? 'old' : 'ok'
  return { last, health, loading: last === undefined }
}
