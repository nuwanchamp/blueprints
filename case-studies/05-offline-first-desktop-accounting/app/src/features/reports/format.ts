import { formatAed } from '@/lib/money'

/** Axis ticks: 0, 500, 1K, 2.5K, 1.2M. Takes fils. */
export function compactAed(fils: number): string {
  const v = Math.abs(fils) / 100
  const sign = fils < 0 ? '−' : ''
  const trim = (x: number) => String(Math.round(x * 10) / 10).replace(/\.0$/, '')
  if (v >= 1_000_000) return `${sign}${trim(v / 1_000_000)}M`
  if (v >= 1_000) return `${sign}${trim(v / 1_000)}K`
  return `${sign}${trim(v)}`
}

/** A signed amount for profit and loss: "AED 1,200.00" or "− AED 300.00". */
export function signedAed(fils: number): string {
  return fils < 0 ? `− ${formatAed(-fils)}` : formatAed(fils)
}

/** "+12.5%" / "−3.0%" / "—" when there is nothing to compare with. */
export function formatPct(p: number | null): string {
  if (p === null) return '—'
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`
}

/**
 * Round, evenly spaced axis ticks that cover 0 and the data (values in fils): 0, 1K, 2K, 3K rather than 0, 550, 1.1K.
 * Handles losses (values below zero) too.
 */
export function niceTicks(minValue: number, maxValue: number, intervals = 4): number[] {
  const lo = Math.min(0, minValue)
  const hi = Math.max(0, maxValue)
  if (hi === lo) return [0, 100_000] // an empty chart still gets a sensible axis (AED 0 to 1K)
  const rough = (hi - lo) / intervals
  const pow = 10 ** Math.floor(Math.log10(rough))
  const f = rough / pow
  const step = Math.round((f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow)
  const first = Math.floor(lo / step) * step
  const last = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = first; v <= last; v += step) ticks.push(v)
  return ticks
}

/** Text colour for a profit/loss figure: red when it is a loss, normal otherwise. */
export const lossText = (fils: number) => (fils < 0 ? 'text-loss' : '')
