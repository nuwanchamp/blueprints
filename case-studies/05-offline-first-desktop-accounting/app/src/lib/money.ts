// Money is stored and calculated as integer fils (1 AED = 100 fils), never as floating point.

/**
 * Parses what a person types into fils. Accepts "450", "450.5", "1,234.50", ".5" and a leading "AED".
 * Returns null for anything else (negative, letters, more than 2 decimals, empty).
 */
export function parseFils(input: string): number | null {
  const s = input.replace(/^\s*AED\s*/i, '').replace(/[,\s]/g, '')
  const m = /^(\d{0,9})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m || (m[1] === '' && m[2] === undefined)) return null
  const whole = m[1] === '' ? 0 : Number(m[1])
  const frac = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'))
  return whole * 100 + frac
}

/** 123456 -> "1,234.56". Negative values keep a minus sign. */
export function formatFils(fils: number): string {
  const sign = fils < 0 ? '−' : ''
  const abs = Math.abs(fils)
  const whole = Math.floor(abs / 100).toLocaleString('en-US')
  return `${sign}${whole}.${String(abs % 100).padStart(2, '0')}`
}

export const formatAed = (fils: number) => `AED ${formatFils(fils)}`
