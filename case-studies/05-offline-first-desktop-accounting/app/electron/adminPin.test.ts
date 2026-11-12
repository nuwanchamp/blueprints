import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AdminPin, hashPin, LOCK_MS, MAX_TRIES } from './adminPin'

const setup = (pin: string | null = 'Daybook-2026') => {
  const file = join(mkdtempSync(join(tmpdir(), 'daybook-pin-')), 'update-lock.json')
  let now = 1_000_000
  const clock = { advance: (ms: number) => (now += ms) }
  const make = () => new AdminPin(pin === null ? null : hashPin(pin), file, () => now)
  return { make, clock }
}

describe('admin PIN for updates', () => {
  it('a right PIN gives a token that download and install accept', () => {
    const pin = setup().make()
    const r = pin.unlock('Daybook-2026')
    expect(r.ok).toBe(true)
    expect(() => pin.check(r.ok ? r.token : '')).not.toThrow()
  })

  it('a wrong PIN or a made-up token is refused', () => {
    const pin = setup().make()
    expect(pin.unlock('1234')).toEqual({ ok: false, reason: 'wrong', triesLeft: MAX_TRIES - 1 })
    expect(() => pin.check('not-a-token')).toThrow()
    expect(() => pin.check(undefined)).toThrow()
  })

  it('the token runs out after ten minutes', () => {
    const { make, clock } = setup()
    const pin = make()
    const r = pin.unlock('Daybook-2026')
    clock.advance(11 * 60 * 1000)
    expect(() => pin.check(r.ok ? r.token : '')).toThrow()
  })

  it('locks after five wrong tries, even the right PIN, and the lock survives a restart', () => {
    const { make, clock } = setup()
    const pin = make()
    for (let i = 1; i < MAX_TRIES; i++) expect(pin.unlock('wrong')).toMatchObject({ reason: 'wrong', triesLeft: MAX_TRIES - i })
    expect(pin.unlock('wrong')).toMatchObject({ reason: 'locked' })
    const restarted = make()
    expect(restarted.unlock('Daybook-2026')).toMatchObject({ ok: false, reason: 'locked' })
    clock.advance(LOCK_MS + 1)
    expect(restarted.unlock('Daybook-2026').ok).toBe(true)
  })

  it('a right PIN clears the wrong tries', () => {
    const pin = setup().make()
    pin.unlock('wrong')
    pin.unlock('wrong')
    pin.unlock('Daybook-2026')
    expect(pin.unlock('wrong')).toMatchObject({ triesLeft: MAX_TRIES - 1 })
  })

  it('a build without a PIN can never unlock', () => {
    const pin = setup(null).make()
    expect(pin.enabled).toBe(false)
    expect(pin.unlock('')).toEqual({ ok: false, reason: 'noPin' })
  })
})
