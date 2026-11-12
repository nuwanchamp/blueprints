import { useState } from 'react'
import { Callout } from '@/components/ui/Callout'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { ChipGroup } from '@/components/ui/ChipGroup'
import { Field, Input } from '@/components/ui/Field'
import { StatusSwitch } from '@/components/ui/StatusSwitch'
import { RepoError } from '@/db/repo/expenses'
import { saveIncomeChannel, type IncomeChannel } from '@/db/repo/master'
import { buildTree, flatten } from '@/lib/tree'
import { channelSchema, type ChannelForm } from '../schemas'
import { EditPanel } from './EditPanel'

interface Props {
  /** null when adding */
  channel: IncomeChannel | null
  channels: IncomeChannel[]
  onSaved: () => void
  onClose: () => void
}

/** A channel may sit at most three levels deep: Dine in > Card > Visa. */
const MAX_DEPTH = 2

export function ChannelPanel({ channel, channels, onSaved, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const zh = i18n.language === 'zh'
  const name = (c: Pick<IncomeChannel, 'nameEn' | 'nameZh'>) => (zh ? c.nameZh : c.nameEn)
  const [saving, setSaving] = useState(false)

  const { register, control, handleSubmit, setError, formState } = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    defaultValues: {
      nameEn: channel?.nameEn ?? '',
      nameZh: channel?.nameZh ?? '',
      parentId: channel?.parentId ?? null,
      countsInDrawer: channel?.countsInDrawer ?? false,
      active: channel?.active ?? true,
    },
  })
  const { errors } = formState

  const tree = buildTree(channels)
  const nodes = flatten(tree)
  const self = channel ? nodes.find((n) => n.item.id === channel.id) : undefined
  const selfAndBelow = new Set(self ? flatten([self]).map((n) => n.item.id) : [])
  // How many levels this channel carries underneath it, which decides where it may be moved
  const below = self ? Math.max(0, ...flatten([self]).map((n) => n.depth - self.depth)) : 0
  const hasChildren = !!self && self.children.length > 0
  const pathOf = (id: number): string => {
    const c = channels.find((x) => x.id === id)!
    return c.parentId === null ? name(c) : `${pathOf(c.parentId)} › ${name(c)}`
  }

  const parentOptions = [
    { value: null as number | null, label: t('categories.topLevel'), disabled: false },
    ...nodes.map((n) => ({
      value: n.item.id as number | null,
      label: pathOf(n.item.id),
      // not under itself, not too deep, and not under a switched-off parent (unless it already is)
      disabled: selfAndBelow.has(n.item.id) || n.depth + 1 + below > MAX_DEPTH || (!n.item.active && n.item.id !== channel?.parentId),
    })),
  ]

  const onSubmit = handleSubmit(async (v) => {
    setSaving(true)
    try {
      await saveIncomeChannel({ id: channel?.id, ...v })
      onSaved()
    } catch (e) {
      if (e instanceof RepoError) setError(e.key === 'errors.duplicate' ? 'nameEn' : 'root', { message: e.key })
      else setError('root', { message: 'common.saveFailed' })
    } finally {
      setSaving(false)
    }
  })

  const msg = (m?: string) => (m ? t(m) : undefined)
  const yesNo = [
    { value: 'yes', label: t('common.yes') },
    { value: 'no', label: t('common.no') },
  ]

  return (
    <EditPanel title={channel ? t('incomeChannels.editTitle') : t('incomeChannels.addTitle')} onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('common.englishName')} error={msg(errors.nameEn?.message)}>
          {(id) => <Input id={id} lang="en" autoFocus invalid={!!errors.nameEn} {...register('nameEn')} />}
        </Field>
        <Field label={t('common.chineseName')} error={msg(errors.nameZh?.message)}>
          {(id) => <Input id={id} lang="zh-Hans" invalid={!!errors.nameZh} {...register('nameZh')} />}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{t('incomeChannels.parent')}</span>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => <ChipGroup label={t('incomeChannels.parent')} options={parentOptions} value={field.value} onChange={field.onChange} />}
          />
        </div>

        {hasChildren ? (
          <p className="rounded-lg bg-tint px-3 py-2 text-[13px] font-medium">{t('incomeChannels.hasChildrenHint')}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">{t('common.countsInDrawer')}</span>
            <Controller
              control={control}
              name="countsInDrawer"
              render={({ field }) => (
                <ChipGroup
                  label={t('common.countsInDrawer')}
                  options={yesNo}
                  value={field.value ? 'yes' : 'no'}
                  onChange={(v) => field.onChange(v === 'yes')}
                />
              )}
            />
            <p className="text-xs text-muted">{t('incomeChannels.countsHint')}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold">{t('common.active')}</span>
          <Controller
            control={control}
            name="active"
            render={({ field }) => <StatusSwitch checked={field.value} onCheckedChange={field.onChange} locked={channel?.core} label={t('common.active')} />}
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
