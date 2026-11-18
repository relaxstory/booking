import { defineConfig } from 'vite';

// 根網址 https://relaxstory.github.io/（前台 index.html、後台 admin.html）
export default defineConfig({
  base: '/',
  build: {
    rolldownOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
  server: {
    // 開發用後台 mock 會載入 ../backend 的原始碼
    fs: { allow: ['..'] },
  },
});
