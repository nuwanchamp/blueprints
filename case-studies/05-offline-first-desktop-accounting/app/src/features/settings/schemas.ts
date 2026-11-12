import { z } from 'zod'

// Messages are i18n keys; the form translates them when it shows them.
const nameEn = z.string().trim().min(1, 'errors.required').max(60, 'errors.tooLong')
const nameZh = z.string().trim().min(1, 'errors.required').max(30, 'errors.tooLong')

export const categorySchema = z
  .object({
    nameEn,
    nameZh,
    parentId: z.number().nullable(),
    expenseTypeId: z.number().nullable(),
    active: z.boolean(),
  })
  // A sub-category needs a type; a top-level category may leave it empty
  .refine((v) => v.parentId === null || v.expenseTypeId !== null, { path: ['expenseTypeId'], message: 'errors.typeRequired' })

export type CategoryForm = z.infer<typeof categorySchema>

export const typeSchema = z.object({ nameEn, nameZh, active: z.boolean() })
export type TypeForm = z.infer<typeof typeSchema>

export const channelSchema = z.object({
  nameEn,
  nameZh,
  parentId: z.number().nullable(),
  countsInDrawer: z.boolean(),
  active: z.boolean(),
})
export type ChannelForm = z.infer<typeof channelSchema>
