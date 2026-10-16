import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
  server: {
    // Overridable so a second copy (e.g. against a test database) can run beside the usual one.
    port: Number(process.env.ELECIO_WEB_PORT) || 5180,
    fs: { allow: ['..'] },
    proxy: { '/api': `http://localhost:${Number(process.env.ELECIO_API_PORT) || 4600}` },
  },
});
