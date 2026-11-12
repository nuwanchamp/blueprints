import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import '@/i18n'
import './index.css'
import { AppShell } from '@/components/layout/AppShell'
import { DbGate } from '@/db/DbGate'
import { DailyPage } from '@/features/daily/DailyPage'
import { DashboardPage } from '@/features/reports/DashboardPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { DEFAULT_SECTION } from '@/features/settings/sections'
import { SettingsPage } from '@/features/settings/SettingsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DbGate>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to={`/settings/${DEFAULT_SECTION}`} replace />} />
            <Route path="settings" element={<Navigate to={`/settings/${DEFAULT_SECTION}`} replace />} />
            <Route path="settings/:section" element={<SettingsPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="daily" element={<DailyPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DbGate>
  </StrictMode>,
)
