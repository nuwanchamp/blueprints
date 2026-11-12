import { query, run, transaction } from '../client'

/** Thrown for rule violations. `key` is an i18n key the UI can show as-is. */
export class RepoError extends Error {
  constructor(public key: string) {
    super(key)
  }
}

export interface ExpenseType {
  id: number
  nameEn: string
  nameZh: string
  active: boolean
  core: boolean
  categoryCount: number
}

export interface ExpenseCategory {
  id: number
  parentId: number | null
  nameEn: string
  nameZh: string
  expenseTypeId: number | null
  active: boolean
  core: boolean
}

export interface ExpenseTypeInput {
  id?: number
  nameEn: string
  nameZh: string
  active: boolean
}

export interface ExpenseCategoryInput {
  id?: number
  parentId: number | null
  nameEn: string
  nameZh: string
  expenseTypeId: number | null
  active: boolean
}

const flag = (v: unknown) => Number(v) === 1

// ---- expense types ----

export async function listExpenseTypes(): Promise<ExpenseType[]> {
  const rows = await query(
    `SELECT t.*, (SELECT COUNT(*) FROM expense_category c WHERE c.expense_type_id = t.id) AS n
       FROM expense_type t ORDER BY t.sort, t.id`,
  )
  return rows.map((r) => ({
    id: Number(r.id),
    nameEn: String(r.name_en),
    nameZh: String(r.name_zh),
    active: flag(r.active),
    core: flag(r.core),
    categoryCount: Number(r.n),
  }))
}

export async function saveExpenseType(input: ExpenseTypeInput): Promise<number> {
  const dup = await query('SELECT id FROM expense_type WHERE lower(name_en) = lower(?) AND id != ?', [input.nameEn, input.id ?? 0])
  if (dup.length) throw new RepoError('errors.duplicate')
  if (input.id == null) {
    return run(
      'INSERT INTO expense_type (name_en, name_zh, active, sort) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM expense_type))',
      [input.nameEn, input.nameZh, input.active ? 1 : 0],
    )
  }
  const [cur] = await query('SELECT core FROM expense_type WHERE id = ?', [input.id])
  if (cur && flag(cur.core) && !input.active) throw new RepoError('errors.coreLocked')
  await run('UPDATE expense_type SET name_en = ?, name_zh = ?, active = ? WHERE id = ?', [input.nameEn, input.nameZh, input.active ? 1 : 0, input.id])
  return input.id
}

export async function setExpenseTypeActive(id: number, active: boolean): Promise<void> {
  const [cur] = await query('SELECT core FROM expense_type WHERE id = ?', [id])
  if (cur && flag(cur.core) && !active) throw new RepoError('errors.coreLocked')
  await run('UPDATE expense_type SET active = ? WHERE id = ?', [active ? 1 : 0, id])
}

// ---- expense categories (two levels) ----

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const rows = await query('SELECT * FROM expense_category ORDER BY sort, id')
  return rows.map((r) => ({
    id: Number(r.id),
    parentId: r.parent_id == null ? null : Number(r.parent_id),
    nameEn: String(r.name_en),
    nameZh: String(r.name_zh),
    expenseTypeId: r.expense_type_id == null ? null : Number(r.expense_type_id),
    active: flag(r.active),
    core: flag(r.core),
  }))
}

export async function saveExpenseCategory(input: ExpenseCategoryInput): Promise<number> {
  if (input.parentId !== null) {
    const [parent] = await query('SELECT parent_id, active FROM expense_category WHERE id = ?', [input.parentId])
    if (!parent || parent.parent_id != null) throw new RepoError('errors.parentInvalid')
    if (input.active && !flag(parent.active)) throw new RepoError('errors.parentInactive')
  }
  const dup = await query(
    'SELECT id FROM expense_category WHERE lower(name_en) = lower(?) AND COALESCE(parent_id, 0) = COALESCE(?, 0) AND id != ?',
    [input.nameEn, input.parentId, input.id ?? 0],
  )
  if (dup.length) throw new RepoError('errors.duplicate')

  if (input.id == null) {
    return run(
      `INSERT INTO expense_category (parent_id, name_en, name_zh, expense_type_id, active, sort)
       VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM expense_category WHERE COALESCE(parent_id, 0) = COALESCE(?, 0)))`,
      [input.parentId, input.nameEn, input.nameZh, input.expenseTypeId, input.active ? 1 : 0, input.parentId],
    )
  }
  const [cur] = await query('SELECT core, parent_id FROM expense_category WHERE id = ?', [input.id])
  if (cur && flag(cur.core) && !input.active) throw new RepoError('errors.coreLocked')
  const kids = await query('SELECT COUNT(*) AS n FROM expense_category WHERE parent_id = ?', [input.id])
  if (input.parentId !== null && Number(kids[0].n) > 0) throw new RepoError('errors.hasChildren')

  const stmts = [
    {
      sql: 'UPDATE expense_category SET parent_id = ?, name_en = ?, name_zh = ?, expense_type_id = ?, active = ? WHERE id = ?',
      bind: [input.parentId, input.nameEn, input.nameZh, input.expenseTypeId, input.active ? 1 : 0, input.id],
    },
  ]
  // Switching a parent off also switches its sub-categories off
  if (!input.active) stmts.push({ sql: 'UPDATE expense_category SET active = 0 WHERE parent_id = ? AND core = 0', bind: [input.id] })
  await transaction(stmts)
  return input.id
}

export async function setExpenseCategoryActive(id: number, active: boolean): Promise<void> {
  const [cur] = await query('SELECT core, parent_id FROM expense_category WHERE id = ?', [id])
  if (!cur) return
  if (flag(cur.core) && !active) throw new RepoError('errors.coreLocked')
  if (active && cur.parent_id != null) {
    const [parent] = await query('SELECT active FROM expense_category WHERE id = ?', [Number(cur.parent_id)])
    if (parent && !flag(parent.active)) throw new RepoError('errors.parentInactive')
  }
  const stmts = [{ sql: 'UPDATE expense_category SET active = ? WHERE id = ?', bind: [active ? 1 : 0, id] }]
  if (!active && cur.parent_id == null) stmts.push({ sql: 'UPDATE expense_category SET active = 0 WHERE parent_id = ? AND core = 0', bind: [id] })
  await transaction(stmts)
}
