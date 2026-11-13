import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

const adminHtmlFallback: Plugin = {
  name: 'admin-html-fallback',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const requestPath = request.url?.split('?')[0] || '';
      const isHtmlNavigation = request.method === 'GET' &&
        request.headers.accept?.includes('text/html') &&
        !requestPath.startsWith('/api/') &&
        !requestPath.startsWith('/@') &&
        !/\.[^/]+$/.test(requestPath);

      if (isHtmlNavigation && requestPath !== '/index.admin.html') {
        const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
        request.url = `/index.admin.html${query}`;
      }
      next();
    });
  }
};

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_TARGET': JSON.stringify('admin')
  },
  root: process.cwd(),
  server: {
    host: '::',
    port: 8081,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      }
    }
  },
  plugins: [react(), adminHtmlFallback],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.admin.html')
    }
  }
});
