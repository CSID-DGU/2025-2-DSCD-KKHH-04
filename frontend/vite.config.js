// vite.config.js
// vite.config.js

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,      // 🔥 포트 5174로 고정
    strictPort: true, // 🔥 이미 사용 중이면 에러 내고 종료
  },
});
