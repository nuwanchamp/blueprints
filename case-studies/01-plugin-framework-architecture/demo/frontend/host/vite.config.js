import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const apiPort = process.env.API_PORT ?? '8000';
const platformModule = fileURLToPath(new URL('../shared/platform.jsx', import.meta.url));

export default defineConfig({
  root,
  base: '/',
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: {
      '@platform': platformModule,
    },
  },
  build: {
    target: 'esnext',
    outDir: '../../public/app',
    emptyOutDir: true,
    modulePreload: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
      '/plugins': `http://127.0.0.1:${apiPort}`,
    },
  },
});
