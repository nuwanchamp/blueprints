import { fileURLToPath, URL } from 'node:url';
import federation from '@originjs/vite-plugin-federation';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const deviceStatusPlugin = fileURLToPath(new URL('./src/DeviceStatusPlugin.jsx', import.meta.url));
const platformModule = fileURLToPath(new URL('../../shared/platform.jsx', import.meta.url));

const sharedPackages = {
  react: { singleton: true, requiredVersion: '^19.0.0' },
  'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
  'react-dom/client': { singleton: true, requiredVersion: '^19.0.0' },
  'react/jsx-runtime': { singleton: true, requiredVersion: '^19.0.0' },
};

export default defineConfig({
  root,
  base: '/plugins/device-status/',
  plugins: [
    react(),
    federation({
      name: 'device_status',
      filename: 'remoteEntry.js',
      exposes: {
        './DeviceStatusPlugin': deviceStatusPlugin,
      },
      shared: sharedPackages,
    }),
  ],
  publicDir: false,
  resolve: {
    alias: {
      '@platform': platformModule,
    },
  },
  build: {
    target: 'esnext',
    outDir: '../../../public/plugins/device-status',
    emptyOutDir: true,
    modulePreload: false,
  },
});
