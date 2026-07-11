import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@platform';
import AlertTriagePlugin from './AlertTriagePlugin.jsx';
import './standalone.css';

function StandalonePluginApp() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/dashboard')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Dashboard API responded with ${response.status}`);
        }

        return response.json();
      })
      .then(setSnapshot)
      .catch(() =>
        setError('Unable to reach the Symfony API at http://127.0.0.1:8000. Start it with composer run dev:api.')
      );
  }, []);

  if (error) {
    return (
      <main className="plugin-shell">
        <section className="panel">
          <h1>Alert triage plugin</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="plugin-shell">
        <section className="panel">
          <h1>Loading alert triage</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="plugin-shell">
      <AlertTriagePlugin
        snapshot={snapshot}
        plugin={{ apiBasePath: 'http://127.0.0.1:8000/api/extensions/alert-triage' }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <StandalonePluginApp />
  </ThemeProvider>
);
