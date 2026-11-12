import type { IncomeChannel } from '@/db/repo/master'
import { countedTip } from '@/lib/calc'
import { buildTree, type TreeNode } from '@/lib/tree'

export interface SalesRow {
  channel: IncomeChannel
  depth: number
  /** group: a heading with a subtotal. entry: an amount field. earlier: an amount entered before the channel was split. */
  kind: 'group' | 'entry' | 'earlier'
  /** Sales after card tips, for this row and everything under it */
  subtotalFils: number
  /** The amount entered on this channel itself, as received (a card total includes tips); null if none. */
  ownFils: number | null
}

/**
 * The income channels as rows for one day, parents before their children.
 * Switched-off channels are left out unless they have sales on this day, so history stays visible.
 */
export function salesRows(channels: IncomeChannel[], sales: { channelId: number; amountFils: number; tipFils?: number }[]): SalesRow[] {
  const own = new Map(sales.map((s) => [s.channelId, s.amountFils]))
  const net = new Map(sales.map((s) => [s.channelId, s.amountFils - countedTip(s.amountFils, s.tipFils)]))
  const total = (n: TreeNode<IncomeChannel>): number => (net.get(n.item.id) ?? 0) + n.children.reduce((t, c) => t + total(c), 0)
  const hasSale = (n: TreeNode<IncomeChannel>): boolean => own.has(n.item.id) || n.children.some(hasSale)
  const visible = (n: TreeNode<IncomeChannel>) => n.item.active || hasSale(n)

  const out: SalesRow[] = []
  const walk = (n: TreeNode<IncomeChannel>) => {
    if (!visible(n)) return
    const ownFils = own.get(n.item.id) ?? null
    if (n.children.length === 0) {
      out.push({ channel: n.item, depth: n.depth, kind: 'entry', subtotalFils: net.get(n.item.id) ?? 0, ownFils })
      return
    }
    const kids = n.children.filter(visible)
    if (kids.length === 0 && ownFils === null) return
    out.push({ channel: n.item, depth: n.depth, kind: 'group', subtotalFils: total(n), ownFils: null })
    // A channel that was split after sales were entered on it keeps that entry, so past figures never disappear
    if (ownFils !== null) out.push({ channel: n.item, depth: n.depth + 1, kind: 'earlier', subtotalFils: net.get(n.item.id) ?? 0, ownFils })
    kids.forEach(walk)
  }
  buildTree(channels).forEach(walk)
  return out
}
