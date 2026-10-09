import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: './',
  // three.js alone is ~550 kB minified; one chunk is fine for a static sim.
  build: { chunkSizeWarningLimit: 800 },
  // MuJoCo locates its .wasm via import.meta.url; pre-bundling would break that
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  // Browser builds only: vitest runs MuJoCo under Node and needs the real builtin
  resolve: command === 'build' ? { alias: { module: '/src/shims/node-module.ts' } } : {},
}));
