// QA-only wrapper around the project Vite config: serves the public app on
// 127.0.0.1:5173 and proxies /api to the QA API instance on 127.0.0.1:5055,
// because ports 5000/8080 are already used by another local project.
import { defineConfig } from 'vite';
import baseConfig from '../../vite.config';

export default defineConfig((environment) => {
  const base = typeof baseConfig === 'function' ? baseConfig(environment as never) : baseConfig;
  return {
    ...base,
    root: process.cwd(),
    server: {
      ...base.server,
      host: '127.0.0.1',
      port: 5173,
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
