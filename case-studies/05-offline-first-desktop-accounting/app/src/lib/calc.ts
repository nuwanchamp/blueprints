// The cash reconciliation. Pure functions over integer fils, so every figure can be tested.

export interface SaleLine {
  /** As received: a card total includes its tips */
  amountFils: number
  /** Tips inside amountFils (Visa, Mastercard). Paid with salary, so they never touch the drawer. */
  tipFils?: number
  /** Cash sales go into the drawer; card and delivery-platform sales do not. */
  countsInDrawer: boolean
}

export interface ExpenseLine {
  amountFils: number
  /** True when the money left the cash drawer. */
  affectsDrawer: boolean
}

export interface MovementLine {
  amountFils: number
  direction: 'in' | 'out'
}

export interface DiscountLine {
  amountFils: number
}

export type VarianceStatus = 'uncounted' | 'balanced' | 'within' | 'alert'

export interface Reconciliation {
  /** Sales: what was received minus card tips. Discounts are not taken off again (sales are entered as received). */
  totalSalesFils: number
  /** Card tips inside the card totals; shown on their own and owed to staff */
  tipsFils: number
  /** Everything received, tips included */
  receivedFils: number
  /** Discounts given. A memo: it never changes the expected cash. */
  discountsFils: number
  /** Sales before discounts: received + discounts. */
  grossSalesFils: number
  cashSalesFils: number
  /** Card and other non-cash sales, after tips */
  otherSalesFils: number
  totalExpensesFils: number
  drawerExpensesFils: number
  otherExpensesFils: number
  cashInFils: number
  cashOutFils: number
  /** What the drawer should hold before anything is taken out: opening float + cash sales + cash added. */
  availableFils: number
  /** What the drawer should hold: opening float + cash sales + cash in - drawer expenses - cash out. */
  expectedCashFils: number
  /** Counted minus expected; negative means cash is missing. Null until the drawer has been counted. */
  varianceFils: number | null
  status: VarianceStatus
}

export interface ReconcileInput {
  openingFloatFils: number
  sales: SaleLine[]
  expenses: ExpenseLine[]
  movements: MovementLine[]
  discounts: DiscountLine[]
  countedCashFils: number | null
  /** A variance beyond this (either direction) is flagged. */
  alertFils: number
}

const sum = (xs: { amountFils: number }[]) => xs.reduce((t, x) => t + x.amountFils, 0)

/**
 * The part of a card's tips that counts. Tips can be typed before the total, so until the total is at least the
 * tips they count as nothing: a half-entered card never pushes sales below zero. (A day can't close like that.)
 */
export const countedTip = (amountFils: number, tipFils = 0) => (tipFils <= amountFils ? tipFils : 0)

export function reconcile(i: ReconcileInput): Reconciliation {
  const cashSalesFils = sum(i.sales.filter((s) => s.countsInDrawer))
  const receivedFils = sum(i.sales)
  const tipsFils = i.sales.reduce((t, s) => t + countedTip(s.amountFils, s.tipFils), 0)
  const totalSalesFils = receivedFils - tipsFils
  const discountsFils = sum(i.discounts)
  const drawerExpensesFils = sum(i.expenses.filter((e) => e.affectsDrawer))
  const totalExpensesFils = sum(i.expenses)
  const cashInFils = sum(i.movements.filter((m) => m.direction === 'in'))
  const cashOutFils = sum(i.movements.filter((m) => m.direction === 'out'))

  const availableFils = i.openingFloatFils + cashSalesFils + cashInFils
  const expectedCashFils = availableFils - drawerExpensesFils - cashOutFils
  const varianceFils = i.countedCashFils === null ? null : i.countedCashFils - expectedCashFils

  let status: VarianceStatus
  if (varianceFils === null) status = 'uncounted'
  else if (varianceFils === 0) status = 'balanced'
  else status = Math.abs(varianceFils) <= i.alertFils ? 'within' : 'alert'

  return {
    totalSalesFils,
    tipsFils,
    receivedFils,
    discountsFils,
    grossSalesFils: totalSalesFils + discountsFils,
    cashSalesFils,
    otherSalesFils: totalSalesFils - cashSalesFils,
    totalExpensesFils,
    drawerExpensesFils,
    otherExpensesFils: totalExpensesFils - drawerExpensesFils,
    cashInFils,
    cashOutFils,
    availableFils,
    expectedCashFils,
    varianceFils,
    status,
  }
}
