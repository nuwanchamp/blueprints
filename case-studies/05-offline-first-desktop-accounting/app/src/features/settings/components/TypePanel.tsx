import { useState } from 'react'
import { Callout } from '@/components/ui/Callout'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError, saveExpenseType, type ExpenseType } from '@/db/repo/expenses'
import { typeSchema, type TypeForm } from '../schemas'
import { EditPanel } from './EditPanel'

interface Props {
  /** null when adding */
  type: ExpenseType | null
  onSaved: () => void
  onClose: () => void
}

export function TypePanel({ type, onSaved, onClose }: Props) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const { register, control, handleSubmit, setError, formState } = useForm<TypeForm>({
    resolver: zodResolver(typeSchema),
    defaultValues: { nameEn: type?.nameEn ?? '', nameZh: type?.nameZh ?? '', active: type?.active ?? true },
  })
  const { errors } = formState
  const msg = (m?: string) => (m ? t(m) : undefined)

  const onSubmit = handleSubmit(async (v) => {
    setSaving(true)
    try {
      await saveExpenseType({ id: type?.id, ...v })
      onSaved()
    } catch (e) {
      if (e instanceof RepoError) setError(e.key === 'errors.duplicate' ? 'nameEn' : 'root', { message: e.key })
      else setError('root', { message: 'common.saveFailed' })
    } finally {
      setSaving(false)
    }
  })

  return (
    <EditPanel title={type ? t('types.editTitle') : t('types.addTitle')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('common.englishName')} error={msg(errors.nameEn?.message)}>
          {(id) => <Input id={id} lang="en" autoFocus invalid={!!errors.nameEn} {...register('nameEn')} />}
        </Field>
        <Field label={t('common.chineseName')} error={msg(errors.nameZh?.message)}>
          {(id) => <Input id={id} lang="zh-Hans" invalid={!!errors.nameZh} {...register('nameZh')} />}
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t('common.active')}</span>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <StatusSwitch checked={field.value} onCheckedChange={field.onChange} locked={type?.core} label={t('common.active')} />
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
