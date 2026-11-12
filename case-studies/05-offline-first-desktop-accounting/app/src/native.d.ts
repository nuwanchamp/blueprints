// What the desktop app (Electron preload) hands the page. Absent in a plain browser.

import type { Request, Response } from './db/protocol'
import type { RetentionPolicy } from './features/backup/retention'

export interface NativeFolder {
  name: string
  path: string
}

/** Where the app is with updates. Checking is open to anyone; downloading and installing need the admin PIN. */
export interface UpdateStatus {
  state: 'off' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  /** The version running now */
  current: string
  /** False when this build has no admin PIN, so updates can't be installed from it */
  canInstall: boolean
  /** The newer version, once one is found */
  version?: string
  /** Release notes as plain text */
  notes?: string
  percent?: number
  /** When the last check finished (ISO time) */
  checkedAt?: string
  error?: string
}

export type UnlockResult = { ok: true; token: string } | { ok: false; reason: 'noPin' | 'wrong' | 'locked'; triesLeft?: number; lockedUntil?: number }

export interface DaybookNative {
  /** Runs one database request in the main process, against the SQLite file on disk. */
  db: (req: Request) => Promise<Response>
  backup: {
    getFolder: () => Promise<NativeFolder | null>
    chooseFolder: (title: string) => Promise<NativeFolder | null>
    forgetFolder: () => Promise<void>
    /** Writes into database/ or excel/ under the backup folder (whole file, then renamed into place). */
    write: (sub: string, name: string, bytes: Uint8Array) => Promise<void>
    read: (sub: string, name: string) => Promise<Uint8Array>
    list: (sub: string) => Promise<string[]>
    /** Deletes the old database backups the retention rules no longer keep; returns their names. */
    prune: () => Promise<string[]>
    usage: () => Promise<{ count: number; bytes: number }>
    getRetention: () => Promise<RetentionPolicy>
    /** Needs a token from update.unlock (the admin PIN). Values below the minimum are raised to it. */
    setRetention: (token: string, policy: Partial<RetentionPolicy>) => Promise<RetentionPolicy>
  }
  /** Where the live database file is, for the Backup page. */
  dataFile: () => Promise<string>
  pdf: {
    /** Saves the page as it prints to a PDF; asks where (Documents by default). The path, or null if cancelled. */
    save: (name: string, title: string) => Promise<string | null>
    /** Lays the page out as it would print and says which page each heading starts on (null if not found) */
    pages: (headings: string[]) => Promise<Record<string, number | null>>
    /** Opens a PDF saved by save() in the computer's PDF viewer; '' when it opened, otherwise what went wrong */
    open: (path: string) => Promise<string>
  }
  /** Why the database didn't open this time (the app then shows startup-error.html), or null */
  startError: () => Promise<{ code: 'newer' | 'upgradeFailed' | 'openFailed'; detail: string } | null>
  update: {
    getStatus: () => Promise<UpdateStatus>
    check: () => Promise<UpdateStatus>
    /** Checks the admin PIN in the main process; a right one gives a token for download and install. */
    unlock: (pin: string) => Promise<UnlockResult>
    download: (token: string) => Promise<void>
    /** Makes a backup, closes the app and runs the installer, which opens Daybook again. */
    install: (token: string) => Promise<void>
    /** Calls back on every status change; returns a function that stops listening. */
    onStatus: (cb: (s: UpdateStatus) => void) => () => void
  }
}

declare global {
  interface Window {
    daybookNative?: DaybookNative
  }
}
