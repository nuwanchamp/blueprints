import { useSearchParams } from 'react-router-dom'
import { isValidISODate, todayISO } from '@/lib/date'
import { defaultGroupBy, PRESETS, presetPeriod, type GroupBy, type Period, type PresetId } from '@/lib/period'

const GROUPS: GroupBy[] = ['day', 'month', 'year']

export interface PeriodState {
  range: PresetId
  period: Period
  /** Count days that are still open, not just closed ones. */
  includeOpen: boolean
  groupBy: GroupBy
  setRange: (id: PresetId) => void
  setCustom: (patch: Partial<Period>) => void
  setIncludeOpen: (v: boolean) => void
  setGroupBy: (g: GroupBy) => void
}

/**
 * The period, grouping and open-days choice live in the address, so a report can be bookmarked or shared
 * and the dashboard and the reports always agree.
 */
export function usePeriod(): PeriodState {
  const [params, setParams] = useSearchParams()
  const today = todayISO()

  const rangeParam = params.get('range') as PresetId | null
  const range: PresetId = rangeParam && PRESETS.includes(rangeParam) ? rangeParam : 'thisMonth'

  let period: Period
  if (range === 'custom') {
    const f = params.get('from')
    const t = params.get('to')
    period = isValidISODate(f) && isValidISODate(t) && f <= t ? { from: f, to: t } : presetPeriod('thisMonth', today)
  } else {
    period = presetPeriod(range, today)
  }

  const byParam = params.get('by') as GroupBy | null
  const groupBy: GroupBy = byParam && GROUPS.includes(byParam) ? byParam : defaultGroupBy(period)

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v)
    setParams(next, { replace: true })
  }

  return {
    range,
    period,
    includeOpen: params.get('open') === '1',
    groupBy,
    // a new range drops any manual grouping so the sensible default applies again
    setRange: (id) => update(id === 'custom' ? { range: id, from: period.from, to: period.to, by: null } : { range: id, from: null, to: null, by: null }),
    // Moving one end past the other drags the other end along, so the range always stays valid
    setCustom: (patch) => {
      let from = patch.from ?? period.from
      let to = patch.to ?? period.to
      if (from > to) {
        if (patch.from) to = from
        else from = to
      }
      update({ range: 'custom', from, to, by: null })
    },
    setIncludeOpen: (v) => update({ open: v ? '1' : null }),
    setGroupBy: (g) => update({ by: g }),
  }
}
