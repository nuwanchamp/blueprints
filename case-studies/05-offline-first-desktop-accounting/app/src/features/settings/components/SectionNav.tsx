import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Banknote, Receipt, ShoppingBasket, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { Icon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { SECTION_GROUPS } from '../sections'

/**
 * One icon and one hue per group, the same icons the Daily close steps use, so each area is recognised at a glance.
 * The hue marks the area only; the group name always says it in words.
 */
const GROUPS: Record<string, { icon: LucideIcon; chip: string; edge: string; pill: string }> = {
  income: { icon: Receipt, chip: 'bg-area-income-tint text-area-income', edge: 'border-area-income', pill: 'border-area-income bg-area-income text-white' },
  expenses: { icon: ShoppingBasket, chip: 'bg-area-expenses-tint text-area-expenses', edge: 'border-area-expenses', pill: 'border-area-expenses bg-area-expenses text-white' },
  drawer: { icon: Banknote, chip: 'bg-area-drawer-tint text-area-drawer', edge: 'border-area-drawer', pill: 'border-area-drawer bg-area-drawer text-white' },
  general: { icon: SlidersHorizontal, chip: 'bg-area-general-tint text-area-general', edge: 'border-area-general', pill: 'border-area-general bg-area-general text-white' },
}

function GroupChip({ group }: { group: string }) {
  const g = GROUPS[group]
  return (
    <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', g.chip)}>
      <Icon icon={g.icon} size={14} strokeWidth={2} />
    </span>
  )
}

/** Section key -> record count, for the sections that are built. */
export type Counts = Record<string, number | undefined>

/**
 * Left section list on desktop. Below 1280px the same links become rows of pills above the table, one row per group.
 */
export function SectionNav({ counts }: { counts: Counts }) {
  const { t } = useTranslation()
  const count = (key: string) => counts[key]

  return (
    <>
      <nav aria-label={t('settings.title')} className="hidden w-52 shrink-0 flex-col gap-0.5 rounded-xl border border-line bg-white p-3 xl:flex">
        {SECTION_GROUPS.map((g, i) => (
          <div key={g.key} className={cn('flex flex-col gap-0.5', i > 0 && 'mt-2 border-t border-line pt-2')}>
            <p className="flex items-center gap-2 px-3 pt-2 pb-1.5 text-[11px] font-bold tracking-wider text-ink uppercase">
              <GroupChip group={g.key} />
              {t(`settings.groups.${g.key}`)}
            </p>
            {g.sections.map((s) => (
              <NavLink
                key={s.path}
                to={`/settings/${s.path}`}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                    isActive ? cn('border-l-[3px] bg-tint pl-[9px] font-semibold', GROUPS[g.key].edge) : 'font-medium hover:bg-tint',
                  )
                }
              >
                <span>{t(`settings.sections.${s.key}`)}</span>
                <span className="text-[13px] font-medium text-muted">{s.built ? count(s.key) : t('settings.soon')}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* one row per group, names in a column on the left, so the rows line up at any width */}
      <nav aria-label={t('settings.title')} className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-5 gap-y-2.5 rounded-xl border border-line bg-white p-4 xl:hidden">
        {SECTION_GROUPS.map((g) => (
          <div key={g.key} className="contents">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-ink uppercase">
              <GroupChip group={g.key} />
              {t(`settings.groups.${g.key}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {g.sections.map((s) => (
                <NavLink
                  key={s.path}
                  to={`/settings/${s.path}`}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium',
                      isActive ? GROUPS[g.key].pill : 'border-control bg-white hover:bg-tint',
                    )
                  }
                >
                  {t(`settings.sections.${s.key}`)}
                  {s.built && count(s.key) != null ? ` · ${count(s.key)}` : ''}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  )
}
