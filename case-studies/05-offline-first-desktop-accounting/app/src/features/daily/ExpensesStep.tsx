import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Input, Select } from '@/components/ui/Field'
import { NoteIcon, TrashIcon } from '@/components/ui/icons'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { categoriseExpense, deleteExpense, saveExpense, type ExpenseRow } from '@/db/repo/daily'
import { cn } from '@/lib/cn'
import { formatAed } from '@/lib/money'
import { CategorySelect } from './CategorySelect'
import { Notice, StepCard, StepNav, TotalLine, errorText, type StepId } from './components'
import { ColumnsMenu, gridColumns, useExpenseColumns, type ShownColumns } from './expenseColumns'
import type { DailyCtx } from './useDailyData'

// Slightly tighter controls inside the table, so names are not cut off at laptop widths
const CELL = 'px-2.5 text-[13px]'
const ROW = 'grid items-center gap-x-2 gap-y-1 px-5 py-2'

/** The entry row is a form so the Add button in the card header can submit it. */
const FORM_ID = 'new-expense-form'

type Run = (fn: () => Promise<unknown>) => Promise<boolean>

/** Solid ink pill, so an expense that still needs a category is the first thing the eye lands on. */
export function UncategorisedBadge({ label }: { label: string }) {
  return <span className="inline-flex w-fit items-center rounded-full bg-warn px-2.5 py-0.5 text-xs font-bold text-white">{label}</span>
}

/** A text cell that saves when you leave it (or press Enter) and follows the saved value otherwise. */
function TextCell({ value, label, placeholder, disabled, maxLength, onCommit }: { value: string; label: string; placeholder?: string; disabled?: boolean; maxLength: number; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <Input
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onCommit(text)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()}
      className={cn(CELL, disabled && 'bg-tint')}
    />
  )
}

/** Markets used before, as suggestions: each shows the category and account it was last given. */
function useSupplierOptions(ctx: DailyCtx) {
  const { i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const categoryLabel = (id: number | null) => {
    const c = id === null ? undefined : ctx.by.category.get(id)
    if (!c) return ''
    const parent = c.parentId === null ? undefined : ctx.by.category.get(c.parentId)
    return parent ? `${name(parent)} › ${name(c)}` : name(c)
  }
  const accountLabel = (id: number | null) => {
    const a = id === null ? undefined : ctx.by.account.get(id)
    return a ? name(a) : ''
  }
  const options = ctx.suppliers.map((s) => ({ key: s.name, label: s.name, hint: [categoryLabel(s.categoryId), accountLabel(s.paidFromId)].filter(Boolean).join(' · ') }))
  return { options, categoryLabel, accountLabel }
}

/** A category can take an expense if it is switched on and has no sub-categories. */
function usableCategory(ctx: DailyCtx, id: number | null): id is number {
  if (id === null) return false
  const c = ctx.by.category.get(id)
  return !!c && c.active && !ctx.master.categories.some((k) => k.parentId === id)
}

/** The market cell of a saved row: search the markets used before, or type a new one. Saves when you pick or leave. */
function SupplierCell({ ctx, e, label, disabled, save }: { ctx: DailyCtx; e: ExpenseRow; label: string; disabled: boolean; save: (patch: Partial<ExpenseRow>) => Promise<boolean> }) {
  const [text, setText] = useState(e.supplier)
  const saved = useRef(e.supplier)
  const input = useRef<HTMLInputElement>(null)
  const { options } = useSupplierOptions(ctx)
  useEffect(() => {
    setText(e.supplier)
    saved.current = e.supplier
  }, [e.supplier])

  return (
    <Combobox
      inputRef={input}
      label={label}
      value={text}
      onChange={setText}
      options={options}
      disabled={disabled}
      maxLength={80}
      onPick={(key) => {
        setText(key)
        saved.current = key // the blur that follows must not save a second time with stale values
        const known = ctx.suppliers.find((s) => s.name === key)
        // An expense still waiting for a category takes the one this market usually has
        const patch: Partial<ExpenseRow> = { supplier: key }
        if (e.categoryId === null && usableCategory(ctx, known?.categoryId ?? null)) patch.categoryId = known!.categoryId
        void save(patch)
      }}
      onBlur={() => {
        if (text.trim() !== saved.current) {
          saved.current = text.trim()
          void save({ supplier: text })
        }
      }}
      onEnter={() => input.current?.blur()}
    />
  )
}

function ExpenseTableRow({ ctx, e, run, show }: { ctx: DailyCtx; e: ExpenseRow; run: Run; show: ShownColumns }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const { master, by, closed, date } = ctx
  const [confirming, setConfirming] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)

  const cat = e.categoryId === null ? undefined : by.category.get(e.categoryId)
  const uncategorised = e.categoryId === null
  const rowLabel = e.supplier || (cat ? name(cat) : t('daily.expenses.uncategorised'))
  const showNote = noteOpen || e.note !== ''

  const save = (patch: Partial<ExpenseRow>) => run(() => saveExpense({ ...e, ...patch, id: e.id, date }))

  return (
    <li className={cn('row-group border-b border-line hover:bg-page', uncategorised && 'bg-warn-tint shadow-[inset_6px_0_0_0_var(--color-warn-line)] hover:bg-warn-tint')}>
      <div className={ROW} style={{ gridTemplateColumns: gridColumns(show) }}>
        {!closed &&
          (confirming ? (
            <div className="flex gap-1" role="group" aria-label={t('daily.expenses.confirmDelete')}>
              <Button
                size="sm"
                className="px-2"
                aria-label={`${t('daily.expenses.confirmYes')}: ${rowLabel}`}
                onClick={() => void run(() => deleteExpense(date, e.id))}
              >
                {t('common.yes')}
              </Button>
              <Button size="sm" variant="secondary" className="px-2" aria-label={t('daily.expenses.keep')} onClick={() => setConfirming(false)}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <div className="row-actions flex">
              <Button
                size="icon"
                variant="ghost"
                aria-expanded={showNote}
                aria-label={`${showNote ? t('daily.expenses.hideNote') : t('daily.expenses.addNote')}: ${rowLabel}`}
                title={showNote ? t('daily.expenses.hideNote') : t('daily.expenses.addNote')}
                onClick={() => setNoteOpen((o) => !o)}
              >
                <NoteIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-[#b3261e] hover:bg-[#fbeae8]"
                aria-label={`${t('daily.expenses.delete')}: ${rowLabel}`}
                title={t('daily.expenses.delete')}
                onClick={() => setConfirming(true)}
              >
                <TrashIcon />
              </Button>
            </div>
          ))}
        {closed && <span />}
        <SupplierCell ctx={ctx} e={e} label={`${t('daily.expenses.supplier')}: ${rowLabel}`} disabled={closed} save={save} />
        {show.category && (
        <div className="flex flex-col gap-1">
          {uncategorised && <UncategorisedBadge label={t('daily.expenses.uncategorised')} />}
          <CategorySelect
            aria-label={`${t('daily.expenses.category')}: ${rowLabel}`}
            categories={master.categories}
            value={e.categoryId}
            keepId={e.categoryId}
            // A closed day is locked, except that an expense with no category can still be given one
            disabled={closed && !uncategorised}
            className={cn(CELL, uncategorised && 'border-2 border-warn-line! font-semibold')}
            emptyLabel={t('daily.expenses.uncategorisedOption')}
            onChange={(id) => {
              if (closed) {
                if (id !== null) void run(() => categoriseExpense(e.id, id))
              } else void save({ categoryId: id })
            }}
          />
        </div>
        )}
        {show.paidFrom && (
        <Select
          className={CELL}
          aria-label={`${t('daily.expenses.paidFrom')}: ${rowLabel}`}
          disabled={closed}
          value={e.paidFromId}
          onChange={(ev) => void save({ paidFromId: Number(ev.target.value) })}
        >
          {master.accounts
            .filter((a) => a.active || a.id === e.paidFromId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {name(a)}
              </option>
            ))}
        </Select>
        )}
        {show.reference && (
        <TextCell
          label={`${t('daily.expenses.referenceShort')}: ${rowLabel}`}
          value={e.reference}
          maxLength={40}
          disabled={closed}
          onCommit={(v) => void save({ reference: v })}
        />
        )}
        <MoneyInput
          label={`${t('daily.expenses.amount')}: ${rowLabel}`}
          value={e.amountFils}
          disabled={closed}
          // An amount must stay above zero, so an empty field just goes back to the saved value
          onCommit={(v) => {
            if (v !== null && v > 0) void save({ amountFils: v })
          }}
        />
      </div>
      {showNote && (
        <div className="px-5 pb-2">
          <TextCell
            label={`${t('daily.expenses.note')}: ${rowLabel}`}
            placeholder={t('daily.expenses.notePlaceholder')}
            value={e.note}
            maxLength={200}
            disabled={closed}
            onCommit={(v) => void save({ note: v })}
          />
        </div>
      )}
    </li>
  )
}

/** The always-open top row: type a market and an amount, press Enter, and it joins the list. */
function NewExpenseRow({ ctx, run, show }: { ctx: DailyCtx; run: Run; show: ShownColumns }) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const { master, date } = ctx
  const cashDrawer = master.accounts.find((a) => a.kind === 'cash_drawer' && a.active)?.id ?? master.accounts.find((a) => a.active)?.id ?? 0

  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [supplier, setSupplier] = useState('')
  const [paidFromId, setPaidFromId] = useState(cashDrawer)
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [error, setError] = useState(false)
  const [filledFrom, setFilledFrom] = useState<{ name: string; what: string } | null>(null)
  const supplierRef = useRef<HTMLInputElement>(null)
  const { options: supplierOptions, categoryLabel, accountLabel } = useSupplierOptions(ctx)

  const account = master.accounts.find((a) => a.id === paidFromId)

  /** Choosing a known market brings its usual category and account along; both can still be changed. */
  function pickSupplier(key: string) {
    setSupplier(key)
    const known = ctx.suppliers.find((s) => s.name === key)
    if (!known) return
    const what: string[] = []
    if (categoryId === null && usableCategory(ctx, known.categoryId)) {
      setCategoryId(known.categoryId)
      what.push(categoryLabel(known.categoryId))
    }
    if (known.paidFromId !== null && master.accounts.some((a) => a.id === known.paidFromId && a.active)) {
      setPaidFromId(known.paidFromId)
      what.push(accountLabel(known.paidFromId))
    }
    setFilledFrom(what.length ? { name: key, what: what.join(' · ') } : null)
  }

  async function submit(typedAmount: number | null = amount) {
    if (typedAmount === null || typedAmount <= 0) {
      setError(true)
      return
    }
    setError(false)
    const ok = await run(() => saveExpense({ date, categoryId, paidFromId, amountFils: typedAmount, supplier, reference, note }))
    if (ok) {
      // Keep the paid-from choice (a run of cash purchases is common), clear the rest, and be ready for the next one
      setCategoryId(null)
      setSupplier('')
      setFilledFrom(null)
      setReference('')
      setAmount(null)
      setNote('')
      setNoteOpen(false)
      supplierRef.current?.focus()
    }
  }
  const enter = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      void submit()
    }
  }

  return (
    <li className="border-b border-line border-t-ink bg-page" aria-label={t('daily.expenses.newRow')}>
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          void submit()
        }}
      >
      <div className={ROW} style={{ gridTemplateColumns: gridColumns(show) }}>
        <div className="flex justify-start gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-expanded={noteOpen}
            aria-label={noteOpen ? t('daily.expenses.hideNote') : t('daily.expenses.addNote')}
            title={noteOpen ? t('daily.expenses.hideNote') : t('daily.expenses.addNote')}
            onClick={() => setNoteOpen((o) => !o)}
          >
            <NoteIcon />
          </Button>
        </div>
        <Combobox
          inputRef={supplierRef}
          label={t('daily.expenses.supplier')}
          placeholder={t('daily.expenses.supplierPlaceholder')}
          maxLength={80}
          value={supplier}
          onChange={(v) => {
            setSupplier(v)
            setFilledFrom(null)
          }}
          options={supplierOptions}
          onPick={pickSupplier}
          onEnter={() => void submit()}
        />
        {show.category && (
        <CategorySelect
          aria-label={t('daily.expenses.category')}
          categories={master.categories}
          value={categoryId}
          onChange={setCategoryId}
          className={CELL}
          emptyLabel={t('daily.expenses.uncategorisedOption')}
        />
        )}
        {show.paidFrom && (
        <Select className={CELL} aria-label={t('daily.expenses.paidFrom')} value={paidFromId} onChange={(e) => setPaidFromId(Number(e.target.value))}>
          {master.accounts
            .filter((a) => a.active)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {name(a)}
              </option>
            ))}
        </Select>
        )}
        {show.reference && <Input className={CELL} aria-label={t('daily.expenses.referenceShort')} maxLength={40} value={reference} onChange={(e) => setReference(e.target.value)} onKeyDown={enter} />}
        <MoneyInput
          label={t('daily.expenses.amount')}
          value={amount}
          onCommit={(v) => {
            setAmount(v)
            if (v && v > 0) setError(false)
          }}
          onEnter={(v) => void submit(v)}
        />
      </div>
      {noteOpen && (
        <div className="px-5 pb-2">
          <Input aria-label={t('daily.expenses.note')} placeholder={t('daily.expenses.notePlaceholder')} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enter} />
        </div>
      )}
      {filledFrom && (
        <p className="px-5 pb-1 text-xs font-medium" data-testid="filled-from">
          {t('daily.expenses.filledFrom', { name: filledFrom.name, what: filledFrom.what })}
        </p>
      )}
      {(error || (account && amount)) && (
        <p role={error ? 'alert' : undefined} className="px-5 pb-2 text-xs font-medium">
          {error
            ? t('errors.amountInvalid')
            : account!.affectsDrawer
              ? t('daily.expenses.drawerNote', { amount: formatAed(amount ?? 0) })
              : t('daily.expenses.otherNote')}
        </p>
      )}
      </form>
    </li>
  )
}

export function ExpensesStep({ ctx, onStep }: { ctx: DailyCtx; onStep: (s: StepId) => void }) {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  const { data, rec, closed } = ctx
  const { shown, toggle } = useExpenseColumns()

  /** Runs a save, shows a rule violation if there is one, and refreshes the day either way. */
  const run: Run = async (fn) => {
    let ok = true
    try {
      await fn()
      setNotice(null)
    } catch (e) {
      setNotice(errorText(e, t))
      ok = false
    }
    await ctx.reload()
    return ok
  }

  return (
    <StepCard
      title={t('daily.expenses.title')}
      description={t('daily.expenses.description')}
      action={
        !closed && (
          // The entry row is at the bottom of the list, so bring it into view (its error message appears there too)
          <Button type="submit" form={FORM_ID} onClick={() => document.getElementById(FORM_ID)?.scrollIntoView({ block: 'nearest' })}>
            {t('daily.expenses.add')}
          </Button>
        )
      }
    >
      {notice && <Notice>{notice}</Notice>}

      <div role="list" aria-label={t('daily.expenses.title')} className="border-t border-line">
        <div className="grid min-h-11 items-center gap-x-2 border-b border-line bg-page px-5 text-xs font-semibold text-muted" style={{ gridTemplateColumns: gridColumns(shown) }}>
          <ColumnsMenu shown={shown} toggle={toggle} />
          <span aria-hidden>{t('daily.expenses.supplier')}</span>
          {shown.category && <span aria-hidden>{t('daily.expenses.category')}</span>}
          {shown.paidFrom && <span aria-hidden>{t('daily.expenses.paidFrom')}</span>}
          {shown.reference && <span aria-hidden>{t('daily.expenses.referenceShort')}</span>}
          <span aria-hidden className="pr-[13px] text-right">{t('daily.expenses.amount')}</span>
        </div>
        <ul>
          {/* In the order they were entered; the entry row waits at the bottom */}
          {data.expenses.map((e) => (
            <ExpenseTableRow key={e.id} ctx={ctx} e={e} run={run} show={shown} />
          ))}
          {!closed && <NewExpenseRow ctx={ctx} run={run} show={shown} />}
        </ul>
        {data.expenses.length === 0 && <p className="px-5 py-5 text-sm text-muted">{t('daily.expenses.empty')}</p>}
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
      <dl className="flex flex-col gap-1.5 pr-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('daily.summary.drawerExpenses')}</dt>
          <dd className="font-medium tabular-nums">{formatAed(rec.drawerExpensesFils)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{t('daily.summary.otherExpenses')}</dt>
          <dd className="font-medium tabular-nums">{formatAed(rec.otherExpensesFils)}</dd>
        </div>
      </dl>
      <TotalLine label={t('daily.expenses.total')} value={formatAed(rec.totalExpensesFils)} testId="total-expenses" />
      </div>
      <StepNav step="expenses" onStep={onStep} />
    </StepCard>
  )
}
