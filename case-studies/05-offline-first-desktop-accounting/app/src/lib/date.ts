// A business day is a plain 'YYYY-MM-DD' string with no time zone, so it can never shift when the clock changes.

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date on this computer's clock. */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s || !ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** "Mon, 26/10/2026" in English, "10月26日周一" in Chinese. */
export function formatDay(iso: string, lang: 'en' | 'zh'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return lang === 'zh'
    ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(dt)
    : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(dt)
}

/** "26/10/2026" in English, "2026年10月26日" in Chinese. */
export function formatDate(iso: string, lang: 'en' | 'zh'): string {
  const [y, m, d] = iso.split('-').map(Number)
  return lang === 'zh' ? `${y}年${m}月${d}日` : `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

/** A short axis or table label for a day, month or year bucket: "26 Oct", "Oct 2026", "2026". */
export function formatBucket(key: string, by: 'day' | 'month' | 'year', lang: 'en' | 'zh'): string {
  if (by === 'year') return lang === 'zh' ? `${key}年` : key
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d ?? 1))
  const locale = lang === 'zh' ? 'zh-CN' : 'en-GB'
  return by === 'month'
    ? new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(dt)
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dt)
}
