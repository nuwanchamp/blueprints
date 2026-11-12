// The admin PIN that unlocks installing an update. Only a salted hash ships in the app (put in by the release build
// from the DAYBOOK_ADMIN_PIN secret); staff can't set or change it. Wrong guesses lock it for a while, across restarts.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import type { UnlockResult } from '../src/native'

export interface PinHash {
  salt: string
  hash: string
}

/** Replaced by scripts/build-electron.mjs: the hash from DAYBOOK_ADMIN_PIN, or null when the build had no PIN. */
declare const __DAYBOOK_ADMIN_PIN__: PinHash | null
export const BUILT_IN_PIN: PinHash | null = typeof __DAYBOOK_ADMIN_PIN__ === 'undefined' ? null : __DAYBOOK_ADMIN_PIN__

export const MAX_TRIES = 5
export const LOCK_MS = 15 * 60 * 1000
const TOKEN_MS = 10 * 60 * 1000

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')): PinHash {
  return { salt, hash: scryptSync(pin, salt, 64).toString('hex') }
}

export class AdminPin {
  private tokens = new Map<string, number>()

  constructor(
    private readonly pin: PinHash | null,
    /** Remembers wrong guesses and the lock, so closing the app doesn't reset them. */
    private readonly stateFile: string,
    private readonly now = () => Date.now(),
  ) {}

  get enabled() {
    return this.pin !== null
  }

  private read(): { wrong: number; lockedUntil: number } {
    try {
      const s = JSON.parse(readFileSync(this.stateFile, 'utf8')) as { wrong?: number; lockedUntil?: number }
      return { wrong: Number(s.wrong) || 0, lockedUntil: Number(s.lockedUntil) || 0 }
    } catch {
      return { wrong: 0, lockedUntil: 0 }
    }
  }

  private write(s: { wrong: number; lockedUntil: number }) {
    writeFileSync(this.stateFile, JSON.stringify(s, null, 2))
  }

  /** A right PIN gives a short-lived token; downloading and installing need one. */
  unlock(pin: string): UnlockResult {
    if (!this.pin) return { ok: false, reason: 'noPin' }
    const s = this.read()
    if (s.lockedUntil > this.now()) return { ok: false, reason: 'locked', lockedUntil: s.lockedUntil }
    const want = Buffer.from(this.pin.hash, 'hex')
    const got = scryptSync(String(pin), this.pin.salt, want.length)
    if (timingSafeEqual(want, got)) {
      this.write({ wrong: 0, lockedUntil: 0 })
      const token = randomBytes(24).toString('hex')
      this.tokens.set(token, this.now() + TOKEN_MS)
      return { ok: true, token }
    }
    const wrong = s.wrong + 1
    if (wrong >= MAX_TRIES) {
      const lockedUntil = this.now() + LOCK_MS
      this.write({ wrong: 0, lockedUntil })
      return { ok: false, reason: 'locked', lockedUntil }
    }
    this.write({ wrong, lockedUntil: 0 })
    return { ok: false, reason: 'wrong', triesLeft: MAX_TRIES - wrong }
  }

  /** Throws unless the token came from a right PIN in the last few minutes. */
  check(token: unknown) {
    const until = typeof token === 'string' ? this.tokens.get(token) : undefined
    if (!until || until < this.now()) throw new Error('Admin PIN needed')
  }
}
