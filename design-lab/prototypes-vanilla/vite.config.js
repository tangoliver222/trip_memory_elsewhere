import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  const apiProxy = process.env.ELSEWHERE_API_PROXY_TARGET || 'http://127.0.0.1:8787';
  return ({
    base: './',
    server: {
      host: '127.0.0.1',
      port: 4174,
      proxy: {
        '/v1': apiProxy,
        '/demo': 'http://127.0.0.1:8787',
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    define: {
      __ELSEWHERE_DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      __ELSEWHERE_APP_CHECK_DEBUG_TOKEN__: JSON.stringify(
        command === 'serve' ? process.env.ELSEWHERE_APP_CHECK_DEBUG_TOKEN || null : null,
      ),
    },
  });
});
