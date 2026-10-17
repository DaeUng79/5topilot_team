import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const mainScreen = '/src/screens/dept-admin/PM-01-projects/';
const proxy = {
  '/api': 'http://127.0.0.1:8000',
  '/document-api': 'http://127.0.0.1:8001',
  '/rfp-api': 'http://127.0.0.1:8001',
};

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
    open: mainScreen,
    proxy,
    watch: { ignored: ['**/*.sqlite*', '**/*.db', '**/*.db-*', '**/.tests/**'] },
    fs: {
      // DB는 사용자 지정 위치에 보관하되 정적 파일로 노출하지 않는다.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.sqlite*', '**/*.db', '**/*.db-*'],
    },
  },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        projects: fileURLToPath(new URL(`.${mainScreen}index.html`, import.meta.url)),
        evaluatorRfp: fileURLToPath(new URL('./src/screens/evaluator/EV-03-rfp/index.html', import.meta.url)),
      },
    },
  },
});
