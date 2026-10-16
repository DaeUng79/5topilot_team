import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    open: '/v2/index.html',
    proxy: {
      '/v2': { target: 'http://127.0.0.1:5190', changeOrigin: false },
      '/committee-v2': { target: 'http://127.0.0.1:5190', changeOrigin: false },
      '/api/v2': { target: 'http://127.0.0.1:5190', changeOrigin: false },
      '/api': 'http://127.0.0.1:8000',
      '/document-api': 'http://127.0.0.1:8001',
    },
  },
});
