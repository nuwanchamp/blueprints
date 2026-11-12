import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS, applyMigrations } from './migrations'

type Db = { exec: (o: string | Record<string, unknown>) => unknown; selectValue: (sql: string) => unknown; selectObjects: (sql: string, bind?: unknown[]) => Record<string, unknown>[] }

async function freshDb(): Promise<Db> {
  const sqlite3 = await sqlite3InitModule()
  const db = new sqlite3.oo1.DB(':memory:', 'c') as unknown as Db
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const apply = (db: Db, from: number, to: number) => applyMigrations(db, from, to)

describe('migrations', () => {
  it('build the whole schema and seed from nothing', async () => {
    const db = await freshDb()
    apply(db, 0, MIGRATIONS.length)
    expect(Number(db.selectValue('PRAGMA user_version'))).toBe(MIGRATIONS.length)
    expect(Number(db.selectValue('SELECT COUNT(*) FROM expense_category'))).toBe(18)
    // Dine in, Delivery, Card, Visa, Mastercard, Cash, Member pay, Alipay, WeChat, Careem Dineout, Bank transfer, Keeta, Talabat, Deliveroo
    expect(Number(db.selectValue('SELECT COUNT(*) FROM income_channel'))).toBe(14)
    expect(Number(db.selectValue('SELECT COUNT(*) FROM paid_from_account WHERE core = 1'))).toBe(1)
    expect(String(db.selectValue("SELECT value FROM app_setting WHERE key = 'cash_variance_alert_fils'"))).toBe('2000')
    expect(Number(db.selectValue('SELECT COUNT(*) FROM discount_reason'))).toBe(4)
  })

  it('v7 gives Visa and Mastercard a tips field and keeps sales already entered', async () => {
    const db = await freshDb()
    apply(db, 0, 6)
    const visa = Number(db.selectValue("SELECT id FROM income_channel WHERE name_en = 'Visa'"))
    db.exec("INSERT INTO daily_close (business_date) VALUES ('2026-10-26')")
    db.exec({ sql: "INSERT INTO sale (business_date, channel_id, amount_fils) VALUES ('2026-10-26', ?, 520000)", bind: [visa] })
    apply(db, 6, 7)
    expect(db.selectObjects('SELECT name_en FROM income_channel WHERE takes_tips = 1 ORDER BY name_en').map((r) => r.name_en)).toEqual(['Mastercard', 'Visa'])
    expect(db.selectObjects('SELECT amount_fils, tip_fils FROM sale')).toEqual([{ amount_fils: 520000, tip_fils: 0 }])
    expect(() => db.exec('UPDATE sale SET tip_fils = -1')).toThrow()
  })

  it('v4 keeps existing expenses and lets a category be empty', async () => {
    const db = await freshDb()
    apply(db, 0, 3) // a database as it was before uncategorised expenses existed
    const cat = Number(db.selectValue("SELECT id FROM expense_category WHERE name_en = 'Rent'"))
    const acct = Number(db.selectValue('SELECT id FROM paid_from_account ORDER BY id LIMIT 1'))
    db.exec("INSERT INTO daily_close (business_date) VALUES ('2026-10-26')")
    db.exec({
      sql: "INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils, supplier, reference, note) VALUES ('2026-10-26', ?, ?, 450000, 'Landlord', 'R-1', 'October')",
      bind: [cat, acct],
    })

    // before v4 an empty category is refused
    expect(() => db.exec({ sql: "INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils) VALUES ('2026-10-26', NULL, ?, 100)", bind: [acct] })).toThrow()

    apply(db, 3, 4)
    const [kept] = db.selectObjects('SELECT * FROM expense')
    expect(kept).toMatchObject({ category_id: cat, paid_from_id: acct, amount_fils: 450000, supplier: 'Landlord', reference: 'R-1', note: 'October' })

    db.exec({ sql: "INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils, supplier) VALUES ('2026-10-26', NULL, ?, 15000, 'Al Barsha Market')", bind: [acct] })
    expect(db.selectObjects('SELECT supplier FROM expense WHERE category_id IS NULL')).toEqual([{ supplier: 'Al Barsha Market' }])
    // foreign keys still hold for a category that does not exist
    expect(() => db.exec({ sql: "INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils) VALUES ('2026-10-26', 9999, ?, 100)", bind: [acct] })).toThrow()
    // and the amount rule is still enforced
    expect(() => db.exec({ sql: "INSERT INTO expense (business_date, category_id, paid_from_id, amount_fils) VALUES ('2026-10-26', NULL, ?, 0)", bind: [acct] })).toThrow()
  })

  it('v5 turns channels into a tree and keeps the ids that sales point at', async () => {
    const db = await freshDb()
    apply(db, 0, 4) // as it was before the tree: flat channels with a channel type
    const id = (name: string) => Number(db.selectValue(`SELECT id FROM income_channel WHERE name_en = '${name}'`))
    const [cash, card, talabat, noon] = [id('Cash'), id('Card'), id('Talabat'), id('Noon Food')]
    db.exec("INSERT INTO daily_close (business_date, status, counted_cash_fils) VALUES ('2026-10-20', 'closed', 100000)")
    for (const [ch, fils] of [[cash, 250000], [card, 400000], [talabat, 90000], [noon, 12000]]) {
      db.exec({ sql: "INSERT INTO sale (business_date, channel_id, amount_fils) VALUES ('2026-10-20', ?, ?)", bind: [ch, fils] })
    }

    apply(db, 4, 5)

    const tree = db.selectObjects(`SELECT c.id, c.name_en, c.counts_in_drawer, c.active, p.name_en AS parent
                                     FROM income_channel c LEFT JOIN income_channel p ON p.id = c.parent_id`)
    const by = (n: string) => tree.find((r) => r.name_en === n)!
    // the structure the restaurant described
    expect(by('Dine in').parent).toBeNull()
    expect(by('Delivery').parent).toBeNull()
    for (const n of ['Card', 'Cash', 'Member pay', 'Alipay', 'WeChat', 'Careem Dineout', 'Bank transfer']) expect(by(n).parent).toBe('Dine in')
    expect(by('Visa').parent).toBe('Card')
    expect(by('Mastercard').parent).toBe('Card')
    for (const n of ['Keeta', 'Talabat', 'Deliveroo']) expect(by(n).parent).toBe('Delivery')
    // only cash is cash in the drawer
    expect(tree.filter((r) => r.counts_in_drawer === 1).map((r) => r.name_en)).toEqual(['Cash'])
    // channels that already existed keep their ids, so their sales still point at them
    expect([by('Cash').id, by('Card').id, by('Talabat').id]).toEqual([cash, card, talabat])
    const sales = db.selectObjects('SELECT channel_id, amount_fils FROM sale ORDER BY channel_id')
    expect(sales).toHaveLength(4)
    expect(sales.reduce((t, r) => t + Number(r.amount_fils), 0)).toBe(752000)
    // a sample channel that had sales stays (switched off) so history is not lost; unused ones are gone
    expect(by('Noon Food')).toMatchObject({ id: noon, active: 0, parent: 'Delivery' })
    expect(tree.some((r) => r.name_en === 'Catering')).toBe(false)
    expect(tree.some((r) => r.name_en === 'Careem Food')).toBe(false)
    // nothing dangles, and the old table is gone
    expect(db.selectObjects('PRAGMA foreign_key_check')).toEqual([])
    expect(Number(db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE name = 'channel_type'"))).toBe(0)
    expect(Number(db.selectValue('PRAGMA user_version'))).toBe(5)

    // v6 adds discounts on top without touching anything that was there
    apply(db, 5, 6)
    expect(Number(db.selectValue('SELECT COUNT(*) FROM sale'))).toBe(4)
    expect(Number(db.selectValue('SELECT COUNT(*) FROM discount_reason'))).toBe(4)
    db.exec("INSERT INTO discount (business_date, reason_id, amount_fils) VALUES ('2026-10-20', 1, 1000)")
    expect(() => db.exec("INSERT INTO discount (business_date, reason_id, amount_fils) VALUES ('2026-10-20', 1, 0)")).toThrow()
    expect(db.selectObjects('PRAGMA foreign_key_check')).toEqual([])
  })
})
