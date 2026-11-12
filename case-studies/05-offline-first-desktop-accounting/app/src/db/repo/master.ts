import { query, run, transaction } from '../client'
import { RepoError } from './expenses'

// Channel types, income channels, paid-from accounts and cash movement reasons.
// Rule shared by all of them: nothing is deleted, only switched inactive, and Core records stay on.

export interface Flat {
  id: number
  nameEn: string
  nameZh: string
  active: boolean
  core: boolean
}

/** Income channels form a tree: Dine in > Card > Visa. Sales are entered on the channels at the bottom. */
export interface IncomeChannel extends Flat {
  parentId: number | null
  /** Only meaningful for a channel that has no sub-channels: its sales are cash in the drawer. */
  countsInDrawer: boolean
  /** Visa and Mastercard: the card total includes tips, entered beside it and taken off the sales */
  takesTips: boolean
}
export type AccountKind = 'cash_drawer' | 'petty_cash' | 'bank' | 'owner'
export interface PaidFromAccount extends Flat {
  kind: AccountKind
  affectsDrawer: boolean
}
export type Direction = 'in' | 'out'
export interface CashReason extends Flat {
  direction: Direction
  noteRequired: boolean
}

const flag = (v: unknown) => Number(v) === 1
const flatOf = (r: Record<string, unknown>): Flat => ({
  id: Number(r.id),
  nameEn: String(r.name_en),
  nameZh: String(r.name_zh),
  active: flag(r.active),
  core: flag(r.core),
})

type Table = 'income_channel' | 'paid_from_account' | 'cash_movement_reason' | 'discount_reason'

async function assertUniqueName(table: Table, nameEn: string, id: number | undefined) {
  const dup = await query(`SELECT id FROM ${table} WHERE lower(name_en) = lower(?) AND id != ?`, [nameEn, id ?? 0])
  if (dup.length) throw new RepoError('errors.duplicate')
}

async function assertCanSwitch(table: Table, id: number, active: boolean) {
  const [cur] = await query(`SELECT core FROM ${table} WHERE id = ?`, [id])
  if (cur && flag(cur.core) && !active) throw new RepoError('errors.coreLocked')
}

async function setActive(table: Table, id: number, active: boolean) {
  await assertCanSwitch(table, id, active)
  await run(`UPDATE ${table} SET active = ? WHERE id = ?`, [active ? 1 : 0, id])
}

// ---- income channels (a tree, up to three levels) ----

/** Top-level group, channel, variation: Dine in > Card > Visa. */
const MAX_DEPTH = 2

export async function listIncomeChannels(): Promise<IncomeChannel[]> {
  const rows = await query('SELECT * FROM income_channel ORDER BY sort, id')
  return rows.map((r) => ({
    ...flatOf(r),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    countsInDrawer: flag(r.counts_in_drawer),
    takesTips: flag(r.takes_tips),
  }))
}

export interface IncomeChannelInput {
  id?: number
  parentId: number | null
  nameEn: string
  nameZh: string
  countsInDrawer: boolean
  active: boolean
}

function descendantsOf(all: IncomeChannel[], id: number): IncomeChannel[] {
  const kids = all.filter((c) => c.parentId === id)
  return kids.flatMap((k) => [k, ...descendantsOf(all, k.id)])
}

export async function saveIncomeChannel(i: IncomeChannelInput): Promise<number> {
  const all = await listIncomeChannels()
  const byId = new Map(all.map((c) => [c.id, c]))
  const depthOf = (id: number | null): number => (id === null ? -1 : 1 + depthOf(byId.get(id)?.parentId ?? null))

  if (i.parentId !== null) {
    const parent = byId.get(i.parentId)
    if (!parent) throw new RepoError('errors.parentInvalid')
    if (i.id != null) {
      // A channel cannot move under itself or under one of its own sub-channels
      if (i.parentId === i.id || descendantsOf(all, i.id).some((d) => d.id === i.parentId)) throw new RepoError('errors.channelCycle')
    }
    const below = i.id == null ? 0 : Math.max(0, ...descendantsOf(all, i.id).map((d) => depthOf(d.id) - depthOf(i.id!)))
    if (depthOf(i.parentId) + 1 + below > MAX_DEPTH) throw new RepoError('errors.channelTooDeep')
    if (i.active && !parent.active) throw new RepoError('errors.parentInactive')
  }

  const dup = await query(
    'SELECT id FROM income_channel WHERE lower(name_en) = lower(?) AND COALESCE(parent_id, 0) = COALESCE(?, 0) AND id != ?',
    [i.nameEn, i.parentId, i.id ?? 0],
  )
  if (dup.length) throw new RepoError('errors.duplicate')

  if (i.id == null) {
    return run(
      `INSERT INTO income_channel (parent_id, name_en, name_zh, counts_in_drawer, active, sort)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM income_channel WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)))`,
      [i.parentId, i.nameEn, i.nameZh, i.countsInDrawer ? 1 : 0, i.active ? 1 : 0, i.parentId],
    )
  }

  const cur = byId.get(i.id)
  if (!cur) throw new RepoError('errors.parentInvalid')
  if (cur.core && (!i.active || !i.countsInDrawer)) throw new RepoError('errors.coreLocked')
  if (!i.active && descendantsOf(all, i.id).some((d) => d.core)) throw new RepoError('errors.coreLocked')
  if (cur.countsInDrawer !== i.countsInDrawer) {
    // Changing this would silently change the expected cash of days that are already closed
    const used = await query(
      `SELECT 1 FROM sale s JOIN daily_close d ON d.business_date = s.business_date WHERE s.channel_id = ? AND d.status = 'closed' LIMIT 1`,
      [i.id],
    )
    if (used.length) throw new RepoError('errors.usedByClosedDays')
  }

  const stmts = [
    {
      sql: 'UPDATE income_channel SET parent_id = ?, name_en = ?, name_zh = ?, counts_in_drawer = ?, active = ? WHERE id = ?',
      bind: [i.parentId, i.nameEn, i.nameZh, i.countsInDrawer ? 1 : 0, i.active ? 1 : 0, i.id],
    },
  ]
  // Switching a group or channel off also switches off everything under it
  if (!i.active) stmts.push(...deactivateBelow(i.id))
  await transaction(stmts)
  return i.id
}

function deactivateBelow(id: number) {
  return [
    {
      sql: `WITH RECURSIVE d(id) AS (
              SELECT id FROM income_channel WHERE parent_id = ?
              UNION ALL SELECT c.id FROM income_channel c JOIN d ON c.parent_id = d.id)
            UPDATE income_channel SET active = 0 WHERE id IN (SELECT id FROM d)`,
      bind: [id],
    },
  ]
}

export async function setIncomeChannelActive(id: number, active: boolean): Promise<void> {
  const all = await listIncomeChannels()
  const cur = all.find((c) => c.id === id)
  if (!cur) return
  if (!active && (cur.core || descendantsOf(all, id).some((d) => d.core))) throw new RepoError('errors.coreLocked')
  if (active && cur.parentId !== null && !all.find((c) => c.id === cur.parentId)?.active) throw new RepoError('errors.parentInactive')
  const stmts = [{ sql: 'UPDATE income_channel SET active = ? WHERE id = ?', bind: [active ? 1 : 0, id] }]
  if (!active) stmts.push(...deactivateBelow(id))
  await transaction(stmts)
}

/**
 * Moves a channel one place up or down among the channels with the same parent. This is the order the Daily
 * close lists them in. Every sibling is renumbered first, so channels that shared a position still swap cleanly.
 */
export async function moveIncomeChannel(id: number, direction: 'up' | 'down'): Promise<void> {
  const all = await listIncomeChannels()
  const cur = all.find((c) => c.id === id)
  if (!cur) return
  const sibs = all.filter((c) => c.parentId === cur.parentId) // already in sort, id order
  const i = sibs.findIndex((c) => c.id === id)
  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= sibs.length) return
  ;[sibs[i], sibs[j]] = [sibs[j], sibs[i]]
  await transaction(sibs.map((c, n) => ({ sql: 'UPDATE income_channel SET sort = ? WHERE id = ?', bind: [n, c.id] })))
}

// ---- paid-from accounts ----

export async function listPaidFromAccounts(): Promise<PaidFromAccount[]> {
  const rows = await query('SELECT * FROM paid_from_account ORDER BY sort, id')
  return rows.map((r) => ({ ...flatOf(r), kind: String(r.kind) as AccountKind, affectsDrawer: flag(r.affects_drawer) }))
}

export interface PaidFromInput {
  id?: number
  nameEn: string
  nameZh: string
  kind: AccountKind
  active: boolean
}

export async function savePaidFromAccount(i: PaidFromInput): Promise<number> {
  await assertUniqueName('paid_from_account', i.nameEn, i.id)
  const affects = i.kind === 'cash_drawer' ? 1 : 0
  if (i.id == null) {
    return run(
      'INSERT INTO paid_from_account (name_en, name_zh, kind, affects_drawer, active, sort) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM paid_from_account))',
      [i.nameEn, i.nameZh, i.kind, affects, i.active ? 1 : 0],
    )
  }
  const [cur] = await query('SELECT core, affects_drawer FROM paid_from_account WHERE id = ?', [i.id])
  if (cur && flag(cur.core) && (!i.active || i.kind !== 'cash_drawer')) throw new RepoError('errors.coreLocked')
  if (cur && Number(cur.affects_drawer) !== affects) {
    const used = await query(
      `SELECT 1 FROM expense e JOIN daily_close d ON d.business_date = e.business_date WHERE e.paid_from_id = ? AND d.status = 'closed' LIMIT 1`,
      [i.id],
    )
    if (used.length) throw new RepoError('errors.usedByClosedDays')
  }
  await run('UPDATE paid_from_account SET name_en = ?, name_zh = ?, kind = ?, affects_drawer = ?, active = ? WHERE id = ?', [
    i.nameEn,
    i.nameZh,
    i.kind,
    affects,
    i.active ? 1 : 0,
    i.id,
  ])
  return i.id
}

export const setPaidFromAccountActive = (id: number, active: boolean) => setActive('paid_from_account', id, active)

// ---- cash movement reasons ----

export async function listCashReasons(): Promise<CashReason[]> {
  const rows = await query('SELECT * FROM cash_movement_reason ORDER BY sort, id')
  return rows.map((r) => ({ ...flatOf(r), direction: String(r.direction) as Direction, noteRequired: flag(r.note_required) }))
}

export interface CashReasonInput {
  id?: number
  nameEn: string
  nameZh: string
  direction: Direction
  noteRequired: boolean
  active: boolean
}

export async function saveCashReason(i: CashReasonInput): Promise<number> {
  await assertUniqueName('cash_movement_reason', i.nameEn, i.id)
  if (i.id == null) {
    return run(
      'INSERT INTO cash_movement_reason (name_en, name_zh, direction, note_required, active, sort) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM cash_movement_reason))',
      [i.nameEn, i.nameZh, i.direction, i.noteRequired ? 1 : 0, i.active ? 1 : 0],
    )
  }
  const [cur] = await query('SELECT core, direction FROM cash_movement_reason WHERE id = ?', [i.id])
  if (cur && flag(cur.core) && !i.active) throw new RepoError('errors.coreLocked')
  if (cur && String(cur.direction) !== i.direction) {
    const used = await query(
      `SELECT 1 FROM cash_movement m JOIN daily_close d ON d.business_date = m.business_date WHERE m.reason_id = ? AND d.status = 'closed' LIMIT 1`,
      [i.id],
    )
    if (used.length) throw new RepoError('errors.usedByClosedDays')
  }
  await run('UPDATE cash_movement_reason SET name_en = ?, name_zh = ?, direction = ?, note_required = ?, active = ? WHERE id = ?', [
    i.nameEn,
    i.nameZh,
    i.direction,
    i.noteRequired ? 1 : 0,
    i.active ? 1 : 0,
    i.id,
  ])
  return i.id
}

export const setCashReasonActive = (id: number, active: boolean) => setActive('cash_movement_reason', id, active)

// ---- discount reasons ----

export type DiscountReason = Flat

export async function listDiscountReasons(): Promise<DiscountReason[]> {
  const rows = await query('SELECT * FROM discount_reason ORDER BY sort, id')
  return rows.map(flatOf)
}

export interface DiscountReasonInput {
  id?: number
  nameEn: string
  nameZh: string
  active: boolean
}

export async function saveDiscountReason(i: DiscountReasonInput): Promise<number> {
  await assertUniqueName('discount_reason', i.nameEn, i.id)
  if (i.id == null) {
    return run(
      'INSERT INTO discount_reason (name_en, name_zh, active, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM discount_reason))',
      [i.nameEn, i.nameZh, i.active ? 1 : 0],
    )
  }
  await assertCanSwitch('discount_reason', i.id, i.active)
  await run('UPDATE discount_reason SET name_en = ?, name_zh = ?, active = ? WHERE id = ?', [i.nameEn, i.nameZh, i.active ? 1 : 0, i.id])
  return i.id
}

export const setDiscountReasonActive = (id: number, active: boolean) => setActive('discount_reason', id, active)
