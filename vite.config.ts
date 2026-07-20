import { defineConfig } from 'vite';

// GitHub Pages 项目页：https://<user>.github.io/pixel-fps/
// 本地开发仍可用 / ；构建时用相对路径，便于静态托管
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
