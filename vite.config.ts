import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/Hex-Web-/' : '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['**/*.{spec,test}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 50,
        lines: 45,
      },
    },
  },
});
