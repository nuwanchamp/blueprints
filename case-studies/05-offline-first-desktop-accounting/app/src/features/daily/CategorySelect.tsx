import { useTranslation } from 'react-i18next'
import { Select } from '@/components/ui/Field'
import type { ExpenseCategory } from '@/db/repo/expenses'

interface Props {
  id?: string
  categories: ExpenseCategory[]
  value: number | null
  onChange: (id: number | null) => void
  /** Text of the empty choice, e.g. "Uncategorised" or "Choose a category". */
  emptyLabel: string
  /** A category that stays selectable even if it has since been switched off. */
  keepId?: number | null
  invalid?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * One native select for the two-level categories. A parent with sub-categories is a group heading and cannot
 * be picked; a top-level category with none (such as Licences) is a choice of its own.
 */
export function CategorySelect({ id, categories, value, onChange, emptyLabel, keepId, invalid, disabled, className, ...rest }: Props) {
  const { i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (r: { nameEn: string; nameZh: string }) => (zh ? r.nameZh : r.nameEn)
  const keep = (c: ExpenseCategory) => c.active || c.id === keepId
  const parents = categories.filter((c) => c.parentId === null)

  return (
    <Select id={id} invalid={invalid} disabled={disabled} className={className} aria-label={rest['aria-label']} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{emptyLabel}</option>
      {parents.map((p) => {
        const allKids = categories.filter((c) => c.parentId === p.id)
        if (allKids.length > 0) {
          const kids = allKids.filter(keep)
          return kids.length ? (
            <optgroup key={p.id} label={name(p)}>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {name(k)}
                </option>
              ))}
            </optgroup>
          ) : null
        }
        return keep(p) ? (
          <option key={p.id} value={p.id}>
            {name(p)}
          </option>
        ) : null
      })}
    </Select>
  )
}
