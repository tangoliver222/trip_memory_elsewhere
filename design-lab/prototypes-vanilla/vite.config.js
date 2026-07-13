import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  define: {
    __ELSEWHERE_DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
