import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    open: '/v2/index.html',
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/document-api': 'http://127.0.0.1:8001',
    },
  },
});
