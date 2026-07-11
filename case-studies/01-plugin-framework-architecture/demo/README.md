# Symfony + React Extension Demo

This demo accompanies the [Plugin Framework Architecture case study](../README.md): read that first for the problem and impact. This file covers how to run it and what to look at.

A minimal Symfony API with a React frontend illustrating the extension boundary described in that case study. This is an original clean room sample written for this portfolio, not proprietary production code, and intentionally differs from the exact versions and implementation details used in production.

## Prerequisites

- PHP 8.4+ with the `pdo_sqlite` extension (bundled by default in most PHP installs)
- Node.js 18+ (required by Vite 7)
- Composer

## Run

Install the PHP and JavaScript dependencies:

```
composer install
npm install
```

Restart the full demo stack with one command:

```
npm run restart:all
```

This discovers plugin manifests, seeds `var/data/plugins.sqlite`, rebuilds plugin remotes into `public/plugins/`, then starts:

- Symfony API on `http://127.0.0.1:8000`, or `8010+` if `8000` is already in use
- React host on `http://127.0.0.1:5173`
- plugin remotes served by Symfony under `/plugins/<plugin-name>/assets/remoteEntry.js`

Logs are written to `var/log/`. Stop or inspect the stack with:

```
npm run stop:all
npm run status:all
```

You can still run each service manually when debugging:

```
composer run dev:api
npm run build:plugins
npm run dev:host
```

Open `http://127.0.0.1:5173`.

## What it shows

- Symfony owns HTTP routing and serves `/api/dashboard`.
- Plugin manifests under `frontend/plugins/*/manifest.json` seed `var/data/plugins.sqlite`.
- Registered plugins are loaded from SQLite and exposed through `/api/extensions`.
- The host sidebar is built from the registered plugin navigation records.
- Backend extensions are integrated Symfony modules loaded into the same service container, not isolated PHP apps.
- `DeviceStatusSummary` injects the existing `MonitoringDashboard` service and exposes `/api/extensions/device-status/summary`.
- `AlertTriageSummary` injects the same core service and exposes `/api/extensions/alert-triage/summary`.
- The React host loads the selected remote from the database `remote_entry` and `exposed_module` values.
- The host initializes a federation share scope for React, ReactDOM, and JSX runtime so plugins can consume the same runtime packages.
- Shared platform helpers and UI primitives live in `frontend/shared/platform.jsx`; plugins import that contract through `@platform` instead of reaching into host internals.
- `ThemeProvider` defines the aqua primary theme as CSS variables. Host loaded remotes inherit those variables from the host wrapper, and standalone plugin pages use their own provider wrapper.
- Symfony serves built plugin frontend assets from `public/plugins/`, so the normal workflow does not require one npm command or dev server per plugin.

## Request flow

```
manifest.json (per plugin)
      │  npm run setup:plugins
      ▼
plugins.sqlite (registry: nav entry + remote_entry + exposed_module)
      │  GET /api/extensions
      ▼
React host reads registry → builds sidebar → picks a plugin
      │  dynamic import via module federation share scope
      ▼
remoteEntry.js served from public/plugins/<plugin>/assets/
      │  plugin calls its own backend route
      ▼
Symfony extension controller (e.g. DeviceStatusController)
      │  injects existing core service
      ▼
MonitoringDashboard (shared core service, reused not duplicated)
```

## Code tour

Read in this order to see the pattern end to end:

1. [`src/Extension/ExtensionRegistry.php`](src/Extension/ExtensionRegistry.php) — the contract: how a plugin registers into the platform.
2. [`src/Service/PluginDatabase.php`](src/Service/PluginDatabase.php) — the SQLite-backed registry the manifests seed and the host reads.
3. [`src/Extension/DeviceStatus/Service/DeviceStatusSummary.php`](src/Extension/DeviceStatus/Service/DeviceStatusSummary.php) — a plugin backend reusing the existing `MonitoringDashboard` core service instead of duplicating logic.
4. [`frontend/shared/platform.jsx`](frontend/shared/platform.jsx) — the shared `@platform` contract plugins import instead of reaching into host internals.
5. [`frontend/host/src/main.jsx`](frontend/host/src/main.jsx) — the host: federation share scope, `ThemeProvider`, and how it resolves `/api/extensions` into a loaded remote.

## Tests

> This demo is deliberately test free : it's a clean room sample meant to be read and run in under a minute, not a production codebase, so no `tests/` directory or test runner is included. The production system this pattern is drawn from is covered by PHPUnit/Pest and Cypress (see the [case study's tech stack](../README.md#tech-stack) and the [skills matrix](../../../README.md#skills)).
