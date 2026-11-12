import { ChartColumn, ClipboardList, LayoutDashboard, Settings, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { persistLang, type Lang } from '@/i18n'
import { Icon } from '@/components/ui/icons'
import { Badge } from '@/components/ui/Badge'
import { Callout } from '@/components/ui/Callout'
import { BackupStatus } from '@/features/backup/BackupStatus'
import { useUpdateStatus } from '@/features/update/useUpdateStatus'
import { useLastBackup, type BackupHealth } from '@/features/backup/useLastBackup'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/daily', key: 'nav.daily', icon: ClipboardList },
  { to: '/reports', key: 'nav.reports', icon: ChartColumn },
  { to: '/settings', key: 'nav.settings', icon: Settings },
]

/** A coloured dot for the narrow sidebar: the backup's health at a glance, the full wording in its tooltip. */
function BackupDot({ health }: { health: BackupHealth }) {
  const { t } = useTranslation()
  return (
    <span className="flex h-11 items-center justify-center rounded-lg bg-page">
      <span
        aria-hidden
        className={cn('size-3 rounded-full', health === 'ok' ? 'bg-ok' : health === 'stale' ? 'bg-loss' : 'bg-warn-line')}
      />
      <span className="sr-only">{health === 'none' ? t('backup.never') : t('backup.lastBackup')}</span>
    </span>
  )
}

/** Full width with labels from 1280px; below that a narrow strip of icons, so small POS screens keep room for the page. */
function Sidebar() {
  const { t } = useTranslation()
  const { last, health } = useLastBackup()
  return (
    <aside className="sticky top-0 flex h-screen w-18 shrink-0 flex-col overflow-y-auto border-r border-line bg-white px-2.5 py-4 xl:w-54 xl:px-4 xl:py-6 print:hidden">
      <div className="flex justify-center">
        <img src="/assets/white-logo.jpg" alt="Daybook" width={120} height={120} className="size-12 xl:size-30" />
      </div>
      <nav aria-label="Main" className="mt-4 flex flex-col gap-1 xl:mt-6">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={t(n.key)}
            className={({ isActive }) =>
              cn(
                'flex h-11 items-center justify-center gap-3 rounded-lg text-sm xl:justify-start xl:px-3.5',
                isActive ? 'bg-ink font-semibold text-white' : 'font-medium hover:bg-tint',
              )
            }
          >
            <Icon icon={n.icon} />
            <span className="sr-only xl:not-sr-only">{t(n.key)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
        <NavLink to="/settings/backup" aria-label={t('backup.statusLink')} title={t('backup.statusLink')} className="block rounded-lg hover:opacity-80">
          <span className="hidden xl:block">
            <BackupStatus last={last} health={health} compact />
          </span>
          {last !== undefined && (
            <span className="xl:hidden">
              <BackupDot health={health} />
            </span>
          )}
        </NavLink>
        <p className="hidden text-xs text-muted xl:block">{t('offlineNote')}</p>
      </div>
    </aside>
  )
}

function LanguageToggle() {
  const { i18n } = useTranslation()
  const set = (lang: Lang) => {
    void i18n.changeLanguage(lang)
    persistLang(lang)
  }
  const seg = (lang: Lang, label: string) => (
    <button
      type="button"
      onClick={() => set(lang)}
      aria-pressed={i18n.language === lang}
      className={cn(
        'h-9 w-[52px] cursor-pointer rounded-[7px] text-[13px] font-semibold',
        i18n.language === lang ? 'bg-ink text-white' : 'text-ink hover:bg-tint',
      )}
    >
      {label}
    </button>
  )
  return (
    <div role="group" aria-label="Language" className="flex h-11 items-center gap-1 rounded-[10px] border border-control bg-white p-1">
      {seg('en', 'EN')}
      {seg('zh', '中文')}
    </div>
  )
}

export function TopBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [first, second] = pathname.startsWith('/daily')
    ? [t('nav.daily'), t('daily.title')]
    : pathname.startsWith('/dashboard')
      ? [t('nav.dashboard'), null]
      : pathname.startsWith('/reports')
        ? [t('nav.reports'), null]
        : [t('topbar.settings'), t('topbar.master')]
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4 lg:px-6 print:hidden">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        {second ? (
          <>
            <span className="text-muted">{first}</span>
            <span className="text-muted">/</span>
            <span className="font-medium">{second}</span>
          </>
        ) : (
          <span className="font-medium">{first}</span>
        )}
      </nav>
      <div className="flex items-center gap-3 lg:gap-4">
        <LanguageToggle />
        <Badge icon={UserRound}>{t('topbar.role')}</Badge>
      </div>
    </header>
  )
}

/** A quiet line on every page while a new version waits for the admin. It never blocks the work. */
function UpdateBanner() {
  const { t } = useTranslation()
  const status = useUpdateStatus()
  const { pathname } = useLocation()
  if (!status?.version || !['available', 'downloading', 'ready'].includes(status.state) || pathname === '/settings/updates') return null
  return (
    <Callout tone="info" role="status" className="mb-4 print:hidden">
      {t('updates.banner', { version: status.version })}{' '}
      <Link to="/settings/updates" className="font-semibold underline underline-offset-2">
        {t('updates.bannerLink')}
      </Link>
    </Callout>
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-4 lg:p-6">
          <UpdateBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
