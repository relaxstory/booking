import { defineConfig } from 'vite';

// 網址 https://relaxstory.github.io/booking/（前台 index.html、後台 admin.html）
// ⚠️ 2026-11-19 起預約系統搬到 /booking/ 子路徑（repo 改名為 relaxstory/booking），
//    根網址改由官網（repo relaxstory/relaxstory.github.io）使用。請勿把 base 改回 '/'。
export default defineConfig({
  base: '/booking/',
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
