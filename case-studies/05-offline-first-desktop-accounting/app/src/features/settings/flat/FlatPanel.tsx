import { useState, type ReactNode } from 'react'
import { Callout } from '@/components/ui/Callout'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { ChipGroup, type ChipOption } from '@/components/ui/ChipGroup'
import { Field, Input } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError } from '@/db/repo/expenses'
import { EditPanel } from '../components/EditPanel'

/** A chip picker for a section-specific field. Values are strings; booleans use 'yes' / 'no'. */
export interface FlatField {
  name: string
  label: string
  options: ChipOption<string>[]
}

export interface FlatValues {
  nameEn: string
  nameZh: string
  active: boolean
  extras: Record<string, string>
}

const schema = z.object({
  nameEn: z.string().trim().min(1, 'errors.required').max(60, 'errors.tooLong'),
  nameZh: z.string().trim().min(1, 'errors.required').max(30, 'errors.tooLong'),
  active: z.boolean(),
  extras: z.record(z.string(), z.string().min(1, 'errors.chooseOne')),
})

interface Props {
  title: string
  initial: FlatValues
  fields: FlatField[]
  coreLocked: boolean
  /** Read-only line derived from the chosen options, e.g. "Counts in drawer: Yes". */
  derived?: (extras: Record<string, string>) => ReactNode
  onSubmit: (v: FlatValues) => Promise<void>
  onClose: () => void
}

export function FlatPanel({ title, initial, fields, coreLocked, derived, onSubmit, onClose }: Props) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const { register, control, handleSubmit, setError, watch, formState } = useForm<FlatValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  })
  const { errors } = formState
  const extras = watch('extras')
  const msg = (m?: string) => (m ? t(m) : undefined)

  const submit = handleSubmit(async (v) => {
    setSaving(true)
    try {
      await onSubmit(v)
    } catch (e) {
      if (e instanceof RepoError) setError(e.key === 'errors.duplicate' ? 'nameEn' : 'root', { message: e.key })
      else setError('root', { message: 'common.saveFailed' })
    } finally {
      setSaving(false)
    }
  })

  return (
    <EditPanel title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('common.englishName')} error={msg(errors.nameEn?.message)}>
          {(id) => <Input id={id} lang="en" autoFocus invalid={!!errors.nameEn} {...register('nameEn')} />}
        </Field>
        <Field label={t('common.chineseName')} error={msg(errors.nameZh?.message)}>
          {(id) => <Input id={id} lang="zh-Hans" invalid={!!errors.nameZh} {...register('nameZh')} />}
        </Field>

        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{f.label}</span>
            <Controller
              control={control}
              name={`extras.${f.name}`}
              render={({ field }) => <ChipGroup label={f.label} options={f.options} value={field.value} onChange={field.onChange} />}
            />
            {errors.extras?.[f.name]?.message && (
              <p role="alert" className="text-xs font-medium text-loss">
                {t(errors.extras[f.name]!.message!)}
              </p>
            )}
          </div>
        ))}
        {derived && <p className="rounded-lg bg-tint px-3 py-2 text-[13px] font-medium">{derived(extras ?? {})}</p>}

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t('common.active')}</span>
          <Controller
            control={control}
            name="active"
            render={({ field }) => <StatusSwitch checked={field.value} onCheckedChange={field.onChange} locked={coreLocked} label={t('common.active')} />}
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
