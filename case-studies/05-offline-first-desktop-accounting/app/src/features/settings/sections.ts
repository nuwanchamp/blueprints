export interface SectionDef {
  /** URL segment, e.g. /settings/expense-categories */
  path: string
  /** key under settings.sections */
  key: string
  /** false until the section is built */
  built: boolean
}

export interface SectionGroup {
  /** key under settings.groups */
  key: string
  sections: SectionDef[]
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    key: 'income',
    sections: [
      { path: 'income-channels', key: 'incomeChannels', built: true },
      { path: 'discount-reasons', key: 'discountReasons', built: true },
    ],
  },
  {
    key: 'expenses',
    sections: [
      { path: 'expense-categories', key: 'expenseCategories', built: true },
      { path: 'expense-types', key: 'expenseTypes', built: true },
    ],
  },
  {
    key: 'drawer',
    sections: [
      { path: 'paid-from-accounts', key: 'paidFrom', built: true },
      { path: 'cash-movement-reasons', key: 'cashReasons', built: true },
    ],
  },
  {
    key: 'general',
    sections: [
      { path: 'backup', key: 'backup', built: true },
      { path: 'updates', key: 'updates', built: true },
      { path: 'general-settings', key: 'general', built: false },
    ],
  },
]

export const DEFAULT_SECTION = 'expense-categories'
