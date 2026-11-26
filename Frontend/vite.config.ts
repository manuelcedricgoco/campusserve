import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // Local development: the API runs on :4000. In production VITE_API_URL points at the deployed backend.
    proxy: { '/api': { target: process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          charts: ['chart.js', 'react-chartjs-2'],
          map: ['leaflet', 'react-leaflet'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
});
