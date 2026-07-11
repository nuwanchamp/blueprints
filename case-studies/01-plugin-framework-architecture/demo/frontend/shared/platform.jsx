import { createContext, useContext } from 'react';

const aquaTheme = {
  name: 'aqua',
  colors: {
    text: '#1e2528',
    textMuted: '#637274',
    textSubtle: '#58706f',
    background: '#f5f7f8',
    surface: '#ffffff',
    surfaceMuted: '#fbfcfc',
    border: '#d7dedc',
    borderMuted: '#e4e9e8',
    primary: '#0891b2',
    primaryHover: '#0e7490',
    primarySoft: '#e0f7fb',
    primaryBorder: '#9adce7',
    success: '#24745c',
    warning: '#9a3412',
    warningSoft: '#fff7ed',
    danger: '#b43d12',
    dangerSoft: '#fff1f0',
    dangerBorder: '#f2b8a2',
  },
  shadows: {
    panel: '0 18px 40px rgba(30, 37, 40, 0.08)',
  },
};

const ThemeContext = createContext(aquaTheme);

export function ThemeProvider({ children, theme = aquaTheme }) {
  const themeStyle = {
    '--color-text': theme.colors.text,
    '--color-text-muted': theme.colors.textMuted,
    '--color-text-subtle': theme.colors.textSubtle,
    '--color-background': theme.colors.background,
    '--color-surface': theme.colors.surface,
    '--color-surface-muted': theme.colors.surfaceMuted,
    '--color-border': theme.colors.border,
    '--color-border-muted': theme.colors.borderMuted,
    '--color-primary': theme.colors.primary,
    '--color-primary-hover': theme.colors.primaryHover,
    '--color-primary-soft': theme.colors.primarySoft,
    '--color-primary-border': theme.colors.primaryBorder,
    '--color-success': theme.colors.success,
    '--color-warning': theme.colors.warning,
    '--color-warning-soft': theme.colors.warningSoft,
    '--color-danger': theme.colors.danger,
    '--color-danger-soft': theme.colors.dangerSoft,
    '--color-danger-border': theme.colors.dangerBorder,
    '--shadow-panel': theme.shadows.panel,
    minHeight: '100vh',
    color: 'var(--color-text)',
    background: 'var(--color-background)',
  };

  return (
    <ThemeContext.Provider value={theme}>
      <div className="theme-root" data-theme={theme.name} style={themeStyle}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function buildPluginUrl(plugin, path, fallbackApiBasePath) {
  const apiBasePath = plugin?.apiBasePath ?? fallbackApiBasePath;

  return `${apiBasePath.replace(/\/$/, '')}${path}`;
}

export async function fetchJson(url, label = 'Request') {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${label} responded with ${response.status}`);
  }

  return response.json();
}

export function Panel({ children, className = '' }) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  );
}

export function PluginEyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}

export function MetricGrid({ children }) {
  return <div className="remote-grid">{children}</div>;
}

export function MetricCard({ label, value }) {
  return (
    <div className="remote-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function RemoteStatus({ children }) {
  return <p className="remote-status">{children}</p>;
}
