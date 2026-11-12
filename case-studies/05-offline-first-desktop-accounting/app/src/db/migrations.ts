// Schema versions, applied in order inside the worker. PRAGMA user_version tracks the last one applied.
// Money is always stored as integer fils (1 AED = 100 fils). Business days are plain 'YYYY-MM-DD' strings.

type Bind = (string | number | null)[]

/** What a migration's data step may do: run SQL, read rows, and insert rows while learning the new id. */
export interface SeedApi {
  insert: (sql: string, bind: Bind) => number
  run: (sql: string, bind?: Bind) => void
  rows: (sql: string, bind?: Bind) => Record<string, unknown>[]
}

/** The slice of an sqlite-wasm database that migrations need (shared by the worker and the tests). */
export interface MigrationDb {
  exec: (opts: string | Record<string, unknown>) => unknown
  selectValue: (sql: string) => unknown
  selectObjects: (sql: string, bind?: unknown[]) => Record<string, unknown>[]
}

export function seedApiFor(db: MigrationDb): SeedApi {
  return {
    insert: (sql, bind) => {
      db.exec({ sql, bind })
      return Number(db.selectValue('SELECT last_insert_rowid()'))
    },
    run: (sql, bind) => void db.exec(bind ? { sql, bind } : sql),
    rows: (sql, bind) => db.selectObjects(sql, bind),
  }
}

export interface Migration {
  statements: string[]
  seed?: (api: SeedApi) => void
  /**
   * Replaces a table that other tables point at. SQLite only allows that with foreign-key checking switched off,
   * so the runner turns it off for this migration and verifies every link before committing.
   */
  rebuildsTables?: boolean
}

const flat = (extra: string) => `
  id      INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  ${extra}
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  core    INTEGER NOT NULL DEFAULT 0 CHECK (core IN (0, 1)),
  sort    INTEGER NOT NULL DEFAULT 0`

// ---- v1 seed: expense types and categories ----
// The Fixed/Variable assignment per category is a placeholder until the restaurant confirms it.
const SEED_EXPENSE_TYPES: [string, string][] = [
  ['Fixed', '固定成本'],
  ['Variable', '变动成本'],
  ['One-off', '一次性支出'],
]

type SeedCategory = { en: string; zh: string; type?: string; children?: { en: string; zh: string; type: string }[] }

const SEED_EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    en: 'Food & beverage',
    zh: '食材饮品',
    children: [
      { en: 'Meat & seafood', zh: '肉类海鲜', type: 'Variable' },
      { en: 'Vegetables & fruit', zh: '蔬果', type: 'Variable' },
      { en: 'Dry goods & sauces', zh: '干货调料', type: 'Variable' },
      { en: 'Beverages', zh: '饮品', type: 'Variable' },
    ],
  },
  {
    en: 'Staff',
    zh: '员工',
    children: [
      { en: 'Salaries', zh: '薪资', type: 'Fixed' },
      { en: 'Staff meals', zh: '员工餐', type: 'Variable' },
      { en: 'Accommodation', zh: '住宿', type: 'Fixed' },
    ],
  },
  {
    en: 'Premises',
    zh: '场地',
    children: [
      { en: 'Rent', zh: '租金', type: 'Fixed' },
      { en: 'Utilities', zh: '水电费', type: 'Variable' },
      { en: 'Repairs & maintenance', zh: '维修保养', type: 'Variable' },
    ],
  },
  {
    en: 'Operations',
    zh: '运营',
    children: [
      { en: 'Packaging', zh: '包装', type: 'Variable' },
      { en: 'Cleaning', zh: '清洁', type: 'Variable' },
      { en: 'Delivery platform commission', zh: '平台佣金', type: 'Variable' },
    ],
  },
  { en: 'Licences & government fees', zh: '执照及政府费用', type: 'Fixed' },
]

export const MIGRATIONS: Migration[] = [
  // v1: expense types and two-level expense categories
  {
    statements: [
      `CREATE TABLE expense_type (
         id      INTEGER PRIMARY KEY,
         name_en TEXT NOT NULL UNIQUE,
         name_zh TEXT NOT NULL,
         active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
         core    INTEGER NOT NULL DEFAULT 0 CHECK (core IN (0, 1)),
         sort    INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE TABLE expense_category (
         id              INTEGER PRIMARY KEY,
         parent_id       INTEGER REFERENCES expense_category(id),
         name_en         TEXT NOT NULL,
         name_zh         TEXT NOT NULL,
         expense_type_id INTEGER REFERENCES expense_type(id),
         active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
         core            INTEGER NOT NULL DEFAULT 0 CHECK (core IN (0, 1)),
         sort            INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE INDEX idx_expense_category_parent ON expense_category(parent_id)`,
    ],
    seed: ({ insert }) => {
      const typeIds = new Map<string, number>()
      SEED_EXPENSE_TYPES.forEach(([en, zh], i) => {
        typeIds.set(en, insert('INSERT INTO expense_type (name_en, name_zh, sort) VALUES (?, ?, ?)', [en, zh, i]))
      })
      const add = (en: string, zh: string, parent: number | null, type: string | undefined, sort: number) =>
        insert('INSERT INTO expense_category (parent_id, name_en, name_zh, expense_type_id, sort) VALUES (?, ?, ?, ?, ?)', [
          parent,
          en,
          zh,
          type ? (typeIds.get(type) ?? null) : null,
          sort,
        ])
      SEED_EXPENSE_CATEGORIES.forEach((p, i) => {
        const parentId = add(p.en, p.zh, null, p.type, i)
        p.children?.forEach((c, j) => add(c.en, c.zh, parentId, c.type, j))
      })
    },
  },

  // v2: income channels, paid-from accounts, cash movement reasons, app settings
  {
    statements: [
      `CREATE TABLE channel_type (${flat('counts_in_drawer INTEGER NOT NULL DEFAULT 0 CHECK (counts_in_drawer IN (0, 1)),')})`,
      `CREATE TABLE income_channel (${flat('type_id INTEGER NOT NULL REFERENCES channel_type(id),')})`,
      `CREATE TABLE paid_from_account (${flat(
        "kind TEXT NOT NULL CHECK (kind IN ('cash_drawer', 'petty_cash', 'bank', 'owner')), affects_drawer INTEGER NOT NULL DEFAULT 0 CHECK (affects_drawer IN (0, 1)),",
      )})`,
      `CREATE TABLE cash_movement_reason (${flat(
        "direction TEXT NOT NULL CHECK (direction IN ('in', 'out')), note_required INTEGER NOT NULL DEFAULT 0 CHECK (note_required IN (0, 1)),",
      )})`,
      `CREATE TABLE app_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    ],
    seed: ({ insert }) => {
      const type = (en: string, zh: string, drawer: number, core: number, sort: number) =>
        insert('INSERT INTO channel_type (name_en, name_zh, counts_in_drawer, core, sort) VALUES (?, ?, ?, ?, ?)', [en, zh, drawer, core, sort])
      const cash = type('Cash', '现金', 1, 1, 0)
      const card = type('Card', '银行卡', 0, 0, 1)
      const delivery = type('Delivery platform', '外卖平台', 0, 0, 2)
      const other = type('Other', '其他', 0, 0, 3)

      // The plan gives no Chinese names for the delivery brands; they reuse the English brand name for now.
      const ch = (en: string, zh: string, typeId: number, core: number, active: number, sort: number) =>
        insert('INSERT INTO income_channel (name_en, name_zh, type_id, core, active, sort) VALUES (?, ?, ?, ?, ?, ?)', [en, zh, typeId, core, active, sort])
      ch('Cash', '现金', cash, 1, 1, 0)
      ch('Card', '银行卡', card, 0, 1, 1)
      ch('Talabat', 'Talabat', delivery, 0, 1, 2)
      ch('Deliveroo', 'Deliveroo', delivery, 0, 1, 3)
      ch('Noon Food', 'Noon Food', delivery, 0, 1, 4)
      ch('Careem Food', 'Careem Food', delivery, 0, 0, 5)
      ch('Catering', '外烩', other, 0, 1, 6)

      const acct = (en: string, zh: string, kind: string, core: number, sort: number) =>
        insert('INSERT INTO paid_from_account (name_en, name_zh, kind, affects_drawer, core, sort) VALUES (?, ?, ?, ?, ?, ?)', [
          en,
          zh,
          kind,
          kind === 'cash_drawer' ? 1 : 0,
          core,
          sort,
        ])
      acct('Cash drawer', '收银抽屉', 'cash_drawer', 1, 0)
      acct('Petty cash', '备用金', 'petty_cash', 0, 1)
      acct('Bank account', '银行账户', 'bank', 0, 2)
      acct('Owner-paid', '股东垫付', 'owner', 0, 3)

      const reason = (en: string, zh: string, dir: string, noteRequired: number, sort: number) =>
        insert('INSERT INTO cash_movement_reason (name_en, name_zh, direction, note_required, sort) VALUES (?, ?, ?, ?, ?)', [en, zh, dir, noteRequired, sort])
      reason('Float top-up', '补充零钱', 'in', 0, 0)
      reason('Change from bank', '银行换零', 'in', 0, 1)
      reason('Bank deposit', '存入银行', 'out', 0, 2)
      reason('Owner withdrawal', '股东提取', 'out', 1, 3)

      insert('INSERT INTO app_setting (key, value) VALUES (?, ?)', ['currency', 'AED'])
      // Counted cash may differ from expected by this much before the day is flagged (AED 20.00)
      insert('INSERT INTO app_setting (key, value) VALUES (?, ?)', ['cash_variance_alert_fils', '2000'])
    },
  },

  // v3: the daily close — one row per business day, plus its sales, expenses and cash movements
  {
    statements: [
      `CREATE TABLE daily_close (
         business_date      TEXT PRIMARY KEY,
         opening_float_fils INTEGER NOT NULL DEFAULT 0 CHECK (opening_float_fils >= 0),
         counted_cash_fils  INTEGER CHECK (counted_cash_fils >= 0),
         status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
         note               TEXT NOT NULL DEFAULT '',
         closed_at          TEXT
       )`,
      `CREATE TABLE sale (
         id            INTEGER PRIMARY KEY,
         business_date TEXT NOT NULL REFERENCES daily_close(business_date),
         channel_id    INTEGER NOT NULL REFERENCES income_channel(id),
         amount_fils   INTEGER NOT NULL CHECK (amount_fils >= 0),
         UNIQUE (business_date, channel_id)
       )`,
      `CREATE TABLE expense (
         id            INTEGER PRIMARY KEY,
         business_date TEXT NOT NULL REFERENCES daily_close(business_date),
         category_id   INTEGER NOT NULL REFERENCES expense_category(id),
         paid_from_id  INTEGER NOT NULL REFERENCES paid_from_account(id),
         amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0),
         supplier      TEXT NOT NULL DEFAULT '',
         reference     TEXT NOT NULL DEFAULT '',
         note          TEXT NOT NULL DEFAULT ''
       )`,
      `CREATE INDEX idx_expense_date ON expense(business_date)`,
      `CREATE TABLE cash_movement (
         id            INTEGER PRIMARY KEY,
         business_date TEXT NOT NULL REFERENCES daily_close(business_date),
         reason_id     INTEGER NOT NULL REFERENCES cash_movement_reason(id),
         amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0),
         note          TEXT NOT NULL DEFAULT ''
       )`,
      `CREATE INDEX idx_cash_movement_date ON cash_movement(business_date)`,
    ],
  },

  // v4: an expense may be saved without a category ("uncategorised") and sorted out later.
  // SQLite cannot drop a NOT NULL, so the table is rebuilt.
  {
    statements: [
      `CREATE TABLE expense_new (
         id            INTEGER PRIMARY KEY,
         business_date TEXT NOT NULL REFERENCES daily_close(business_date),
         category_id   INTEGER REFERENCES expense_category(id),
         paid_from_id  INTEGER NOT NULL REFERENCES paid_from_account(id),
         amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0),
         supplier      TEXT NOT NULL DEFAULT '',
         reference     TEXT NOT NULL DEFAULT '',
         note          TEXT NOT NULL DEFAULT ''
       )`,
      `INSERT INTO expense_new SELECT id, business_date, category_id, paid_from_id, amount_fils, supplier, reference, note FROM expense`,
      `DROP TABLE expense`,
      `ALTER TABLE expense_new RENAME TO expense`,
      `CREATE INDEX idx_expense_date ON expense(business_date)`,
      `CREATE INDEX idx_expense_uncategorised ON expense(business_date) WHERE category_id IS NULL`,
    ],
  },

  // v5: income channels become a tree (Dine in / Delivery, then channels, then variations such as Card > Visa).
  // The separate "channel type" is gone: each channel says for itself whether its sales are cash in the drawer.
  // Existing channels keep their ids, so sales already entered stay attached to them.
  {
    statements: [],
    rebuildsTables: true,
    seed: ({ insert, run, rows }) => {
      const old = rows(
        `SELECT c.id, c.name_en, c.name_zh, c.active, c.core, c.sort, t.name_en AS type, t.counts_in_drawer AS drawer
           FROM income_channel c JOIN channel_type t ON t.id = c.type_id`,
      )
      const used = new Set(rows('SELECT DISTINCT channel_id AS id FROM sale').map((r) => Number(r.id)))
      run(`CREATE TABLE income_channel_new (
             id              INTEGER PRIMARY KEY,
             parent_id       INTEGER REFERENCES income_channel_new(id),
             name_en         TEXT NOT NULL,
             name_zh         TEXT NOT NULL,
             counts_in_drawer INTEGER NOT NULL DEFAULT 0 CHECK (counts_in_drawer IN (0, 1)),
             active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
             core            INTEGER NOT NULL DEFAULT 0 CHECK (core IN (0, 1)),
             sort            INTEGER NOT NULL DEFAULT 0
           )`)

      // Channels from the plan's sample list that were never used are not part of the real structure, so they go.
      const SAMPLE_ONLY = new Set(['Noon Food', 'Careem Food', 'Catering'])
      const groupOf = (type: string) => (type === 'Delivery platform' ? 'Delivery' : type === 'Other' ? 'Other' : 'Dine in')
      const kept = old.filter((r) => !(SAMPLE_ONLY.has(String(r.name_en)) && !used.has(Number(r.id))))
      for (const r of kept) {
        // A sample channel that was used stays for history, but switched off
        const active = SAMPLE_ONLY.has(String(r.name_en)) ? 0 : Number(r.active)
        run('INSERT INTO income_channel_new (id, name_en, name_zh, counts_in_drawer, active, core, sort) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          Number(r.id),
          String(r.name_en),
          String(r.name_zh),
          Number(r.drawer),
          active,
          Number(r.core),
          100 + Number(r.sort),
        ])
      }

      const find = (en: string, parent: number | null) =>
        rows('SELECT id FROM income_channel_new WHERE lower(name_en) = lower(?) AND COALESCE(parent_id, 0) = COALESCE(?, 0)', [en, parent])[0]
      const add = (en: string, zh: string, parent: number | null, drawer: number, sort: number) => {
        const hit = find(en, parent)
        if (hit) {
          run('UPDATE income_channel_new SET sort = ? WHERE id = ?', [sort, Number(hit.id)])
          return Number(hit.id)
        }
        return insert('INSERT INTO income_channel_new (parent_id, name_en, name_zh, counts_in_drawer, sort) VALUES (?, ?, ?, ?, ?)', [parent, en, zh, drawer, sort])
      }

      const dineIn = add('Dine in', '堂食', null, 0, 0)
      const delivery = add('Delivery', '外卖', null, 0, 1)
      const groups: Record<string, number> = { 'Dine in': dineIn, Delivery: delivery }
      for (const r of kept) {
        const g = groupOf(String(r.type))
        groups[g] ??= add(g, g === 'Other' ? '其他' : g, null, 0, 2)
        run('UPDATE income_channel_new SET parent_id = ? WHERE id = ?', [groups[g], Number(r.id)])
      }

      // The structure the restaurant described. Existing rows with the same name are moved into place, not duplicated.
      const card = add('Card', '银行卡', dineIn, 0, 0)
      add('Visa', 'Visa', card, 0, 0)
      add('Mastercard', 'Mastercard', card, 0, 1)
      add('Cash', '现金', dineIn, 1, 1)
      add('Member pay', '会员支付', dineIn, 0, 2)
      add('Alipay', '支付宝', dineIn, 0, 3)
      add('WeChat', '微信支付', dineIn, 0, 4)
      add('Careem Dineout', 'Careem Dineout', dineIn, 0, 5)
      add('Bank transfer', '银行转账', dineIn, 0, 6)
      add('Keeta', 'Keeta', delivery, 0, 0)
      add('Talabat', 'Talabat', delivery, 0, 1)
      add('Deliveroo', 'Deliveroo', delivery, 0, 2)

      run('DROP TABLE income_channel')
      run('DROP TABLE channel_type')
      run('ALTER TABLE income_channel_new RENAME TO income_channel')
      run('CREATE INDEX idx_income_channel_parent ON income_channel(parent_id)')
    },
  },

  // v6: discounts given. A memo beside the sales: sales stay as received, so a discount never changes expected cash.
  {
    statements: [
      `CREATE TABLE discount_reason (${flat('')})`,
      `CREATE TABLE discount (
         id            INTEGER PRIMARY KEY,
         business_date TEXT NOT NULL REFERENCES daily_close(business_date),
         reason_id     INTEGER NOT NULL REFERENCES discount_reason(id),
         amount_fils   INTEGER NOT NULL CHECK (amount_fils > 0),
         note          TEXT NOT NULL DEFAULT ''
       )`,
      `CREATE INDEX idx_discount_date ON discount(business_date)`,
    ],
    seed: ({ insert }) => {
      // Starter reasons; the restaurant edits this list in Settings
      const reasons: [string, string][] = [
        ['Member discount', '会员折扣'],
        ['Promotion', '促销优惠'],
        ['Staff discount', '员工折扣'],
        ['Manager discount', '经理折扣'],
      ]
      reasons.forEach(([en, zh], i) => insert('INSERT INTO discount_reason (name_en, name_zh, sort) VALUES (?, ?, ?)', [en, zh, i]))
    },
  },

  // v7: card tips. The Visa and Mastercard totals from the card machine include the tips; the tips are entered
  // beside them and taken off, so sales are what the restaurant earned. Tips are paid with salary, never from the drawer.
  {
    statements: [
      `ALTER TABLE income_channel ADD COLUMN takes_tips INTEGER NOT NULL DEFAULT 0 CHECK (takes_tips IN (0, 1))`,
      `ALTER TABLE sale ADD COLUMN tip_fils INTEGER NOT NULL DEFAULT 0 CHECK (tip_fils >= 0)`,
      `UPDATE income_channel SET takes_tips = 1
        WHERE lower(name_en) IN ('visa', 'mastercard') AND NOT EXISTS (SELECT 1 FROM income_channel k WHERE k.parent_id = income_channel.id)`,
    ],
  },
]

/**
 * Brings a database from schema version `from` up to `to`. Each migration is one transaction, so a failure
 * leaves the previous version untouched.
 */
export function applyMigrations(db: MigrationDb, from: number, to: number = MIGRATIONS.length) {
  for (let v = from; v < to; v++) {
    const m = MIGRATIONS[v]
    if (m.rebuildsTables) db.exec('PRAGMA foreign_keys = OFF') // has no effect inside a transaction, so it comes first
    db.exec('BEGIN')
    try {
      for (const sql of m.statements) db.exec(sql)
      m.seed?.(seedApiFor(db))
      if (m.rebuildsTables && db.selectObjects('PRAGMA foreign_key_check').length > 0) {
        throw new Error(`Migration ${v + 1} would leave broken links between tables`)
      }
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    } finally {
      if (m.rebuildsTables) db.exec('PRAGMA foreign_keys = ON')
    }
  }
}
