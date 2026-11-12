import { useState } from 'react'
import { Callout } from '@/components/ui/Callout'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Field, Input } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError, saveExpenseCategory, type ExpenseCategory, type ExpenseType } from '@/db/repo/expenses'
import { categorySchema, type CategoryForm } from '../schemas'
import { EditPanel } from './EditPanel'

interface Props {
  /** null when adding */
  category: ExpenseCategory | null
  categories: ExpenseCategory[]
  types: ExpenseType[]
  onSaved: () => void
  onClose: () => void
}

export function CategoryPanel({ category, categories, types, onSaved, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const [saving, setSaving] = useState(false)

  const form = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      nameEn: category?.nameEn ?? '',
      nameZh: category?.nameZh ?? '',
      parentId: category?.parentId ?? null,
      expenseTypeId: category?.expenseTypeId ?? null,
      active: category?.active ?? true,
    },
  })
  const { register, control, handleSubmit, setError, watch, formState } = form
  const { errors } = formState
  const parentId = watch('parentId')

  const hasChildren = category != null && categories.some((c) => c.parentId === category.id)
  const parentOptions = [
    { value: null as number | null, label: t('categories.topLevel') },
    ...categories
      .filter((c) => c.parentId === null && c.id !== category?.id && (c.active || c.id === category?.parentId))
      .map((c) => ({ value: c.id as number | null, label: zh ? c.nameZh : c.nameEn, disabled: hasChildren })),
  ]
  const typeOptions = [
    ...(parentId === null ? [{ value: null as number | null, label: t('common.none') }] : []),
    ...types
      .filter((x) => x.active || x.id === category?.expenseTypeId)
      .map((x) => ({ value: x.id as number | null, label: zh ? x.nameZh : x.nameEn })),
  ]

  const onSubmit = handleSubmit(async (v) => {
    setSaving(true)
    try {
      await saveExpenseCategory({ id: category?.id, ...v })
      onSaved()
    } catch (e) {
      if (e instanceof RepoError) setError(e.key === 'errors.duplicate' ? 'nameEn' : 'root', { message: e.key })
      else setError('root', { message: 'common.saveFailed' })
    } finally {
      setSaving(false)
    }
  })

  const msg = (m?: string) => (m ? t(m) : undefined)

  return (
    <EditPanel title={category ? t('categories.editTitle') : t('categories.addTitle')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('common.englishName')} error={msg(errors.nameEn?.message)}>
          {(id) => <Input id={id} lang="en" autoFocus invalid={!!errors.nameEn} {...register('nameEn')} />}
        </Field>
        <Field label={t('common.chineseName')} error={msg(errors.nameZh?.message)}>
          {(id) => <Input id={id} lang="zh-Hans" invalid={!!errors.nameZh} {...register('nameZh')} />}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{t('categories.fieldParent')}</span>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <ChipGroup label={t('categories.fieldParent')} options={parentOptions} value={field.value} onChange={field.onChange} />
            )}
          />
          {hasChildren && <p className="text-xs text-muted">{t('categories.hasChildrenHint')}</p>}
          {errors.parentId?.message && <p role="alert" className="text-xs font-medium text-loss">{t(errors.parentId.message)}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{t('categories.fieldType')}</span>
          <Controller
            control={control}
            name="expenseTypeId"
            render={({ field }) => (
              <ChipGroup label={t('categories.fieldType')} options={typeOptions} value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.expenseTypeId?.message && (
            <p role="alert" className="text-xs font-medium text-loss">
              {t(errors.expenseTypeId.message)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t('common.active')}</span>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <StatusSwitch checked={field.value} onCheckedChange={field.onChange} locked={category?.core} label={t('common.active')} />
            )}
          />
        </div>

        <p className="text-xs text-muted">{t('common.reportsHint')}</p>
        {errors.root?.message && (
          <Callout tone="error" role="alert">
            {t(errors.root.message)}
          </Callout>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {t('common.save')}
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </EditPanel>
  )
}
