// QA-only wrapper around the admin Vite config: serves the admin app on
// 127.0.0.1:5174 and proxies /api to the QA API instance on 127.0.0.1:5055.
import { defineConfig } from 'vite';
import baseConfig from '../../vite.admin.config';

export default defineConfig((environment) => {
  const base = typeof baseConfig === 'function' ? baseConfig(environment as never) : baseConfig;
  return {
    ...base,
    root: process.cwd(),
    server: {
      ...base.server,
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5055',
          changeOrigin: true,
        },
      },
    },
  };
});
