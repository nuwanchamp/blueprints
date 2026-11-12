import { query, run, transaction } from '../client'
import { isValidISODate, todayISO } from '@/lib/date'
import { RepoError } from './expenses'

// One business day: opening float, sales per channel, expenses, cash movements, the drawer count and the close.
// A closed day is read-only until it is reopened.

export interface DayRow {
  date: string
  /** False for a day nobody has written to yet (nothing is stored for it). */
  exists: boolean
  openingFloatFils: number
  countedCashFils: number | null
  status: 'open' | 'closed'
  note: string
  closedAt: string | null
}
export interface SaleRow {
  channelId: number
  /** As received: for a card, the machine's total including tips */
  amountFils: number
  /** Tips inside that total (cards only) */
  tipFils: number
}
export interface ExpenseRow {
  id: number
  /** null = uncategorised: saved without a category, to be sorted out later. */
  categoryId: number | null
  paidFromId: number
  amountFils: number
  supplier: string
  reference: string
  note: string
}
export interface MovementRow {
  id: number
  reasonId: number
  amountFils: number
  note: string
}

export interface DiscountRow {
  id: number
  reasonId: number
  amountFils: number
  note: string
}

export interface DayData {
  day: DayRow
  sales: SaleRow[]
  expenses: ExpenseRow[]
  movements: MovementRow[]
  discounts: DiscountRow[]
}

const OPENING_FROM_PREVIOUS = `COALESCE((SELECT counted_cash_fils FROM daily_close
   WHERE status = 'closed' AND counted_cash_fils IS NOT NULL AND business_date < ? ORDER BY business_date DESC LIMIT 1), 0)`

/** Loads a day. A day nobody has written to yet is returned as an open day, without creating a row. */
export async function loadDay(date: string): Promise<DayData> {
  const [d] = await query('SELECT * FROM daily_close WHERE business_date = ?', [date])
  let day: DayRow
  if (d) {
    day = {
      date,
      exists: true,
      openingFloatFils: Number(d.opening_float_fils),
      countedCashFils: d.counted_cash_fils == null ? null : Number(d.counted_cash_fils),
      status: d.status === 'closed' ? 'closed' : 'open',
      note: String(d.note),
      closedAt: d.closed_at == null ? null : String(d.closed_at),
    }
  } else {
    const [o] = await query(`SELECT ${OPENING_FROM_PREVIOUS} AS v`, [date])
    day = { date, exists: false, openingFloatFils: Number(o.v), countedCashFils: null, status: 'open', note: '', closedAt: null }
  }
  const [sales, expenses, movements, discounts] = await Promise.all([
    query('SELECT channel_id, amount_fils, tip_fils FROM sale WHERE business_date = ?', [date]),
    query('SELECT * FROM expense WHERE business_date = ? ORDER BY id', [date]),
    query('SELECT * FROM cash_movement WHERE business_date = ? ORDER BY id', [date]),
    query('SELECT * FROM discount WHERE business_date = ? ORDER BY id', [date]),
  ])
  return {
    day,
    sales: sales.map((r) => ({ channelId: Number(r.channel_id), amountFils: Number(r.amount_fils), tipFils: Number(r.tip_fils) })),
    expenses: expenses.map((r) => ({
      id: Number(r.id),
      categoryId: r.category_id == null ? null : Number(r.category_id),
      paidFromId: Number(r.paid_from_id),
      amountFils: Number(r.amount_fils),
      supplier: String(r.supplier),
      reference: String(r.reference),
      note: String(r.note),
    })),
    movements: movements.map((r) => ({ id: Number(r.id), reasonId: Number(r.reason_id), amountFils: Number(r.amount_fils), note: String(r.note) })),
    discounts: discounts.map((r) => ({ id: Number(r.id), reasonId: Number(r.reason_id), amountFils: Number(r.amount_fils), note: String(r.note) })),
  }
}

async function isClosed(date: string): Promise<boolean> {
  const [d] = await query('SELECT status FROM daily_close WHERE business_date = ?', [date])
  return d?.status === 'closed'
}

async function assertOpen(date: string) {
  if (await isClosed(date)) throw new RepoError('errors.dayClosed')
}

/** Creates the day's row on first write. The opening float defaults to the last closed day's counted cash. */
async function ensureDay(date: string) {
  await run(`INSERT OR IGNORE INTO daily_close (business_date, opening_float_fils) VALUES (?, ${OPENING_FROM_PREVIOUS})`, [date, date])
}

async function openDay(date: string) {
  await assertOpen(date)
  await ensureDay(date)
}

export async function setOpeningFloat(date: string, fils: number) {
  await openDay(date)
  await run('UPDATE daily_close SET opening_float_fils = ? WHERE business_date = ?', [fils, date])
}

export async function setCountedCash(date: string, fils: number | null) {
  await openDay(date)
  await run('UPDATE daily_close SET counted_cash_fils = ? WHERE business_date = ?', [fils, date])
}

export async function setDayNote(date: string, note: string) {
  await openDay(date)
  await run('UPDATE daily_close SET note = ? WHERE business_date = ?', [note.trim(), date])
}

export async function saveSale(date: string, channelId: number, fils: number) {
  await openDay(date)
  // Sales go on the channels at the bottom of the tree (Visa, not Card). An entry made before a channel was split stays editable.
  const [ch] = await query('SELECT (SELECT COUNT(*) FROM income_channel k WHERE k.parent_id = c.id) AS kids FROM income_channel c WHERE c.id = ?', [channelId])
  if (!ch) throw new RepoError('errors.channelInvalid')
  if (Number(ch.kids) > 0) {
    const [own] = await query('SELECT 1 FROM sale WHERE business_date = ? AND channel_id = ?', [date, channelId])
    if (!own) throw new RepoError('errors.channelInvalid')
  }
  if (fils === 0) {
    await run('DELETE FROM sale WHERE business_date = ? AND channel_id = ?', [date, channelId])
    return
  }
  await run(
    `INSERT INTO sale (business_date, channel_id, amount_fils) VALUES (?, ?, ?)
     ON CONFLICT (business_date, channel_id) DO UPDATE SET amount_fils = excluded.amount_fils`,
    [date, channelId, fils],
  )
}

/**
 * A Visa or Mastercard entry: the machine's total and the tips inside it, saved together (typed as "3000-100").
 * Tips can't be more than the total; both zero removes the entry.
 */
export async function saveCardSale(date: string, channelId: number, totalFils: number, tipFils: number) {
  await openDay(date)
  const [ch] = await query('SELECT takes_tips FROM income_channel WHERE id = ?', [channelId])
  if (!ch || Number(ch.takes_tips) !== 1) throw new RepoError('errors.channelInvalid')
  if (tipFils > totalFils) throw new RepoError('errors.tipOverTotal')
  if (totalFils === 0) {
    await run('DELETE FROM sale WHERE business_date = ? AND channel_id = ?', [date, channelId])
    return
  }
  await run(
    `INSERT INTO sale (business_date, channel_id, amount_fils, tip_fils) VALUES (?, ?, ?, ?)
     ON CONFLICT (business_date, channel_id) DO UPDATE SET amount_fils = excluded.amount_fils, tip_fils = excluded.tip_fils`,
    [date, channelId, totalFils, tipFils],
  )
}

export interface ExpenseInput {
  id?: number
  date: string
  /** null saves the expense as uncategorised. */
  categoryId: number | null
  paidFromId: number
  amountFils: number
  supplier: string
  reference: string
  note: string
}

export async function saveExpense(i: ExpenseInput): Promise<number> {
  await openDay(i.date)
  if (!Number.isInteger(i.amountFils) || i.amountFils <= 0) throw new RepoError('errors.amountInvalid')
  // Only a category with no sub-categories can hold an expense, and it must be active (unless this expense already uses it)
  const cat = i.categoryId === null ? null : await validCategory(i.categoryId)
  const [acct] = await query('SELECT active FROM paid_from_account WHERE id = ?', [i.paidFromId])
  if (!acct) throw new RepoError('errors.accountInvalid')
  if (i.id == null) {
    if (cat && !cat.active) throw new RepoError('errors.categoryInvalid')
    if (Number(acct.active) !== 1) throw new RepoError('errors.accountInvalid')
    return run(
      'INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils, supplier, reference, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [i.date, i.categoryId, i.paidFromId, i.amountFils, i.supplier.trim(), i.reference.trim(), i.note.trim()],
    )
  }
  const [before] = await query('SELECT category_id FROM expense WHERE id = ?', [i.id])
  if (cat && !cat.active && Number(before?.category_id) !== i.categoryId) throw new RepoError('errors.categoryInvalid')
  await run('UPDATE expense SET category_id = ?, paid_from_id = ?, amount_fils = ?, supplier = ?, reference = ?, note = ? WHERE id = ? AND business_date = ?', [
    i.categoryId,
    i.paidFromId,
    i.amountFils,
    i.supplier.trim(),
    i.reference.trim(),
    i.note.trim(),
    i.id,
    i.date,
  ])
  return i.id
}

async function validCategory(id: number): Promise<{ active: boolean }> {
  const [cat] = await query(
    `SELECT c.active, (SELECT COUNT(*) FROM expense_category k WHERE k.parent_id = c.id) AS kids FROM expense_category c WHERE c.id = ?`,
    [id],
  )
  if (!cat || Number(cat.kids) > 0) throw new RepoError('errors.categoryInvalid')
  return { active: Number(cat.active) === 1 }
}

export interface UncategorisedExpense {
  id: number
  date: string
  paidFromId: number
  amountFils: number
  supplier: string
  reference: string
  note: string
}

/** Every uncategorised expense on every day, oldest first. */
export async function listUncategorised(): Promise<UncategorisedExpense[]> {
  const rows = await query('SELECT * FROM expense WHERE category_id IS NULL ORDER BY business_date, id')
  return rows.map((r) => ({
    id: Number(r.id),
    date: String(r.business_date),
    paidFromId: Number(r.paid_from_id),
    amountFils: Number(r.amount_fils),
    supplier: String(r.supplier),
    reference: String(r.reference),
    note: String(r.note),
  }))
}

/**
 * Gives an uncategorised expense its category. This is allowed on closed days too: a category never
 * changes the cash reconciliation, and only an expense that has none can be filled in this way.
 */
export async function categoriseExpense(id: number, categoryId: number): Promise<void> {
  const cat = await validCategory(categoryId)
  if (!cat.active) throw new RepoError('errors.categoryInvalid')
  await run('UPDATE expense SET category_id = ? WHERE id = ? AND category_id IS NULL', [categoryId, id])
}

export async function deleteExpense(date: string, id: number) {
  await assertOpen(date)
  await run('DELETE FROM expense WHERE id = ? AND business_date = ?', [id, date])
}

export interface MovementInput {
  id?: number
  date: string
  reasonId: number
  amountFils: number
  note: string
}

export async function saveMovement(i: MovementInput): Promise<number> {
  await openDay(i.date)
  if (!Number.isInteger(i.amountFils) || i.amountFils <= 0) throw new RepoError('errors.amountInvalid')
  const [reason] = await query('SELECT active, note_required FROM cash_movement_reason WHERE id = ?', [i.reasonId])
  if (!reason) throw new RepoError('errors.reasonInvalid')
  if (i.id == null && Number(reason.active) !== 1) throw new RepoError('errors.reasonInvalid')
  if (Number(reason.note_required) === 1 && !i.note.trim()) throw new RepoError('errors.noteRequired')
  if (i.id == null) {
    return run('INSERT INTO cash_movement (business_date, reason_id, amount_fils, note) VALUES (?, ?, ?, ?)', [i.date, i.reasonId, i.amountFils, i.note.trim()])
  }
  await run('UPDATE cash_movement SET reason_id = ?, amount_fils = ?, note = ? WHERE id = ? AND business_date = ?', [i.reasonId, i.amountFils, i.note.trim(), i.id, i.date])
  return i.id
}

export async function deleteMovement(date: string, id: number) {
  await assertOpen(date)
  await run('DELETE FROM cash_movement WHERE id = ? AND business_date = ?', [id, date])
}

export interface DiscountInput {
  id?: number
  date: string
  reasonId: number
  amountFils: number
  note: string
}

/** A discount is a memo: it is recorded beside the sales and never changes the expected cash. */
export async function saveDiscount(i: DiscountInput): Promise<number> {
  await openDay(i.date)
  if (!Number.isInteger(i.amountFils) || i.amountFils <= 0) throw new RepoError('errors.amountInvalid')
  const [reason] = await query('SELECT active FROM discount_reason WHERE id = ?', [i.reasonId])
  if (!reason || (i.id == null && Number(reason.active) !== 1)) throw new RepoError('errors.reasonInvalid')
  if (i.id == null) {
    return run('INSERT INTO discount (business_date, reason_id, amount_fils, note) VALUES (?, ?, ?, ?)', [i.date, i.reasonId, i.amountFils, i.note.trim()])
  }
  await run('UPDATE discount SET reason_id = ?, amount_fils = ?, note = ? WHERE id = ? AND business_date = ?', [i.reasonId, i.amountFils, i.note.trim(), i.id, i.date])
  return i.id
}

export async function deleteDiscount(date: string, id: number) {
  await assertOpen(date)
  await run('DELETE FROM discount WHERE id = ? AND business_date = ?', [id, date])
}

/** Closing needs the drawer to have been counted. */
export async function closeDay(date: string) {
  await assertOpen(date)
  await ensureDay(date)
  const [d] = await query('SELECT counted_cash_fils FROM daily_close WHERE business_date = ?', [date])
  if (d.counted_cash_fils == null) throw new RepoError('errors.countRequired')
  const [over] = await query('SELECT 1 FROM sale WHERE business_date = ? AND tip_fils > amount_fils LIMIT 1', [date])
  if (over) throw new RepoError('errors.tipOverTotal')
  await run("UPDATE daily_close SET status = 'closed', closed_at = datetime('now', 'localtime') WHERE business_date = ?", [date])
}

export async function reopenDay(date: string) {
  await transaction([{ sql: "UPDATE daily_close SET status = 'open', closed_at = NULL WHERE business_date = ?", bind: [date] }])
}

export async function getAlertFils(): Promise<number> {
  const [r] = await query("SELECT value FROM app_setting WHERE key = 'cash_variance_alert_fils'")
  const n = r ? Number(r.value) : 2000
  return Number.isFinite(n) ? n : 2000
}

const CHILD_TABLES = ['sale', 'expense', 'cash_movement', 'discount'] as const

/**
 * Moves everything entered for one business day (sales, expenses, cash movements, discounts, the count and the note)
 * to another date, for a day that was filled in under the wrong date.
 *
 * The day must be open, and the new date must have nothing entered, so nothing can be overwritten or merged by accident.
 */
export async function moveDay(from: string, to: string): Promise<void> {
  if (!isValidISODate(from) || !isValidISODate(to)) throw new RepoError('errors.dateInvalid')
  if (from === to) throw new RepoError('errors.sameDate')
  if (to > todayISO()) throw new RepoError('errors.dateFuture')

  const [src] = await query('SELECT status FROM daily_close WHERE business_date = ?', [from])
  if (!src) throw new RepoError('errors.dayEmpty')
  if (src.status === 'closed') throw new RepoError('errors.dayClosedMove')

  // The new date must hold nothing but, at most, an untouched row (for example just an opening float)
  for (const table of CHILD_TABLES) {
    const used = await query(`SELECT 1 FROM ${table} WHERE business_date = ? LIMIT 1`, [to])
    if (used.length) throw new RepoError('errors.targetNotEmpty')
  }
  const [dst] = await query('SELECT counted_cash_fils, note, status FROM daily_close WHERE business_date = ?', [to])
  if (dst && (dst.counted_cash_fils != null || String(dst.note) !== '' || dst.status === 'closed')) throw new RepoError('errors.targetNotEmpty')

  // One transaction: the day appears under the new date, its entries follow, and only then the old row goes
  await transaction([
    { sql: 'DELETE FROM daily_close WHERE business_date = ?', bind: [to] },
    {
      sql: `INSERT INTO daily_close (business_date, opening_float_fils, counted_cash_fils, status, note, closed_at)
            SELECT ?, opening_float_fils, counted_cash_fils, status, note, closed_at FROM daily_close WHERE business_date = ?`,
      bind: [to, from],
    },
    ...CHILD_TABLES.map((table) => ({ sql: `UPDATE ${table} SET business_date = ? WHERE business_date = ?`, bind: [to, from] })),
    { sql: 'DELETE FROM daily_close WHERE business_date = ?', bind: [from] },
  ])
}

export interface SupplierSuggestion {
  name: string
  /** How many expenses have used this name. */
  uses: number
  /** The category it was last given (null if it has only ever been uncategorised). */
  categoryId: number | null
  /** The account it was last paid from. */
  paidFromId: number | null
}

/**
 * Every market or supplier name used on any day, so it can be offered when typing.
 * Names that differ only by upper/lower case count as one. Most used first.
 */
export async function listSuppliers(): Promise<SupplierSuggestion[]> {
  const rows = await query(
    `SELECT s.name, s.n,
            (SELECT x.category_id FROM expense x WHERE lower(x.supplier) = s.k AND x.category_id IS NOT NULL ORDER BY x.id DESC LIMIT 1) AS category_id,
            (SELECT x.paid_from_id FROM expense x WHERE lower(x.supplier) = s.k ORDER BY x.id DESC LIMIT 1) AS paid_from_id
       FROM (SELECT lower(supplier) AS k,
                    (SELECT y.supplier FROM expense y WHERE lower(y.supplier) = lower(e.supplier) ORDER BY y.id DESC LIMIT 1) AS name,
                    COUNT(*) AS n
               FROM expense e WHERE trim(supplier) != '' GROUP BY lower(supplier)) s
      ORDER BY s.n DESC, s.name`,
  )
  return rows.map((r) => ({
    name: String(r.name),
    uses: Number(r.n),
    categoryId: r.category_id == null ? null : Number(r.category_id),
    paidFromId: r.paid_from_id == null ? null : Number(r.paid_from_id),
  }))
}
