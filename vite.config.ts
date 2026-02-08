import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  plugins: [],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  base: './',
});
