import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchJson, Panel, PluginEyebrow, ThemeProvider } from '@platform';
import { getFederationShareScope } from './federationShareScope.js';
import './styles.css';

function PluginBoundary({ children }) {
  return (
    <Suspense
      fallback={
        <Panel className="remote-panel">
          <h2>Federated plugin</h2>
          <p className="muted">Loading remote plugin...</p>
        </Panel>
      }
    >
      {children}
    </Suspense>
  );
}

function PluginLoadError({ plugin, message }) {
  return (
    <Panel className="remote-panel error">
      <PluginEyebrow>Plugin load failed</PluginEyebrow>
      <h3>{plugin.label}</h3>
      <p>{message}</p>
      <p className="muted">{plugin.remoteEntry}</p>
    </Panel>
  );
}

class PluginErrorBoundary extends React.Component {
  state = { message: '' };

  static getDerivedStateFromError(error) {
    return { message: error.message || 'Unable to load plugin remote.' };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.plugin.name !== this.props.plugin.name && this.state.message) {
      this.setState({ message: '' });
    }
  }

  render() {
    if (this.state.message) {
      return <PluginLoadError plugin={this.props.plugin} message={this.state.message} />;
    }

    return this.props.children;
  }
}

function createRemoteComponent(plugin) {
  return React.lazy(async () => {
    const remote = await import(/* @vite-ignore */ plugin.remoteEntry);
    remote.init?.(getFederationShareScope());

    const factory = await remote.get(plugin.exposedModule);
    const remoteModule = await factory();
    const Component = remoteModule.default ?? remoteModule;

    return { default: Component };
  });
}

function DynamicPlugin({ plugin, snapshot }) {
  const RemoteComponent = useMemo(
    () => createRemoteComponent(plugin),
    [plugin.name, plugin.remoteEntry, plugin.exposedModule]
  );

  return (
    <PluginErrorBoundary plugin={plugin}>
      <PluginBoundary>
        <RemoteComponent
          snapshot={snapshot}
          plugin={plugin}
        />
      </PluginBoundary>
    </PluginErrorBoundary>
  );
}

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [activeRoute, setActiveRoute] = useState(window.location.pathname);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson('/api/dashboard', 'API')
      .then(setSnapshot)
      .catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => {
    fetchJson('/api/extensions', 'Extension registry')
      .then((payload) => setExtensions(payload.extensions ?? []))
      .catch(() => setExtensions([]));
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveRoute(window.location.pathname);

    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (routePath) => {
    window.history.pushState({}, '', routePath);
    setActiveRoute(routePath);
  };

  if (error) {
    return (
      <main className="shell">
        <section className="status-panel error">
          <h1>Symfony API unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <section className="status-panel">
          <h1>Loading monitoring timeline</h1>
        </section>
      </main>
    );
  }

  const activeExtension = extensions.find((extension) => extension.routePath === activeRoute);
  const isDashboard = activeExtension === undefined;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="eyebrow">Registered extensions</p>
          <h1>Blueprints</h1>
        </div>
        <nav className="nav-list" aria-label="Plugin navigation">
          <button className={isDashboard ? 'active' : ''} type="button" onClick={() => navigate('/')}>
            Dashboard
          </button>
          {extensions.map((extension) => (
            <button
              className={activeRoute === extension.routePath ? 'active' : ''}
              key={extension.name}
              type="button"
              onClick={() => navigate(extension.routePath)}
            >
              {extension.navigationLabel}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">Symfony API + federated React frontend</p>
            <h2>{activeExtension ? activeExtension.label : 'Monitoring extension dashboard'}</h2>
          </div>
          <div className="summary">
            <span>{snapshot.summary.healthy} healthy</span>
            <strong>{snapshot.summary.unreachable} unreachable</strong>
          </div>
        </header>

        {isDashboard ? (
          <section className="layout">
            <aside className="panel">
              <h3>Core services</h3>
              <div className="service-list">
                {snapshot.services.map((service) => (
                  <span key={service}>{service}</span>
                ))}
              </div>
            </aside>

            <section className="panel timeline">
              <h3>Event timeline</h3>
              {snapshot.timeline.map((entry) => (
                <article className="timeline-item" key={entry.device}>
                  <div className="timeline-heading">
                    <span>{entry.event}</span>
                    <strong className={entry.status}>{entry.device}</strong>
                  </div>
                  <div className="event-list">
                    {entry.events.map((event) => (
                      <div className={`event ${event.severity}`} key={`${entry.device}-${event.source}`}>
                        <span>{event.source}</span>
                        <p>{event.message}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </section>
        ) : (
          <DynamicPlugin
            plugin={activeExtension}
            snapshot={snapshot}
          />
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>
);
