import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: './',
  build: {
    // three.js alone is ~550 kB minified; one chunk is fine for a static sim.
    chunkSizeWarningLimit: 800,
    // index.html is the yakrobot.com-themed host page; sim.html is the simulator it frames
    rollupOptions: { input: { index: 'index.html', sim: 'sim.html' } },
  },
  // MuJoCo locates its .wasm via import.meta.url; pre-bundling would break that
  optimizeDeps: { exclude: ['@mujoco/mujoco'] },
  // Browser builds only: vitest runs MuJoCo under Node and needs the real builtin
  resolve: command === 'build' ? { alias: { module: '/src/shims/node-module.ts' } } : {},
}));
