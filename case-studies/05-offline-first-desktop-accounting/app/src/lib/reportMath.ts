import type { DaySummary } from '@/db/repo/reports'
import { bucketKey, type GroupBy } from './period'
import { buildTree, type TreeNode } from './tree'

export interface Totals {
  /** What was received after card tips (sales are entered as received, so discounts are already taken off). */
  salesFils: number
  /** Card tips: owed to staff, so not part of sales or profit */
  tipsFils: number
  discountsFils: number
  /** Sales before discounts. */
  grossFils: number
  expensesFils: number
  /** Sales received minus all expenses, whatever account paid them. Negative is a loss. */
  profitFils: number
  /** Profit as a percentage of sales, one decimal; null when there were no sales. */
  marginPct: number | null
  days: number
}

export function totalsOf(days: DaySummary[]): Totals {
  const sum = (f: (d: DaySummary) => number) => days.reduce((t, d) => t + f(d), 0)
  const salesFils = sum((d) => d.salesFils)
  const expensesFils = sum((d) => d.expensesFils)
  const discountsFils = sum((d) => d.discountsFils)
  const tipsFils = sum((d) => d.tipsFils)
  const profitFils = salesFils - expensesFils
  return {
    salesFils,
    tipsFils,
    discountsFils,
    grossFils: salesFils + discountsFils,
    expensesFils,
    profitFils,
    marginPct: salesFils > 0 ? Math.round((profitFils / salesFils) * 1000) / 10 : null,
    days: days.length,
  }
}

export interface Bucket extends Totals {
  key: string
}

/** Groups days into days, months or years, oldest first. Only periods that have days are listed. */
export function bucketize(days: DaySummary[], by: GroupBy): Bucket[] {
  const groups = new Map<string, DaySummary[]>()
  for (const d of days) {
    const k = bucketKey(d.date, by)
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, ds]) => ({ key, ...totalsOf(ds) }))
}

/** How much cash the drawer should have held at the end of the day. */
export function expectedCash(d: DaySummary): number {
  return d.openingFils + d.cashSalesFils + d.cashInFils - d.drawerExpensesFils - d.cashOutFils
}

/** Counted minus expected; null if the drawer was not counted. Negative means cash is missing. */
export function cashVariance(d: DaySummary): number | null {
  return d.countedFils === null ? null : d.countedFils - expectedCash(d)
}

/** Change from `previous` to `current` as a percentage with one decimal; null when there is nothing to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
}

export interface RolledNode<T> {
  item: T
  depth: number
  /** This item's own amount plus everything under it. */
  totalFils: number
  /** This item's own amount, before adding what is under it. */
  ownFils: number
  children: RolledNode<T>[]
}

/** A tree of items with each branch's amounts added up, hiding branches with nothing in them. */
export function rollUp<T extends { id: number; parentId: number | null }>(items: T[], amounts: Map<number, number>): RolledNode<T>[] {
  const roll = (n: TreeNode<T>): RolledNode<T> | null => {
    const kids = n.children.map(roll).filter((k): k is RolledNode<T> => k !== null)
    const ownFils = amounts.get(n.item.id) ?? 0
    const totalFils = ownFils + kids.reduce((t, k) => t + k.totalFils, 0)
    return totalFils === 0 && !amounts.has(n.item.id) ? null : { item: n.item, depth: n.depth, totalFils, ownFils, children: kids }
  }
  return buildTree(items)
    .map(roll)
    .filter((n): n is RolledNode<T> => n !== null)
}

export function flattenRolled<T>(nodes: RolledNode<T>[]): RolledNode<T>[] {
  return nodes.flatMap((n) => [n, ...flattenRolled(n.children)])
}

/** A share as a percentage with one decimal ("12.5"), or "0.0" when the whole is zero. */
export function sharePct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}
