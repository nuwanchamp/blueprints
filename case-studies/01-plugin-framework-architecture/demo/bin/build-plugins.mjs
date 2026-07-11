#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginsDir = join(root, 'frontend/plugins');
const viteBin = join(root, 'node_modules/.bin/vite');

function pluginManifests() {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pluginsDir, entry.name, 'manifest.json'))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    .filter((plugin) => plugin.enabled !== false)
    .sort((left, right) => left.name.localeCompare(right.name));
}

for (const plugin of pluginManifests()) {
  if (!plugin.viteConfig) {
    throw new Error(`${plugin.name} is missing viteConfig in manifest.json`);
  }

  console.log(`Building plugin: ${plugin.name}`);

  const result = spawnSync(
    viteBin,
    ['build', '--config', join(root, plugin.viteConfig)],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
