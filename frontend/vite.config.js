import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// 브라우저는 같은 출처(개발 서버)로만 /api를 호출하고, 개발 서버가 백엔드로 전달한다.
// 그래서 CORS 설정이 필요 없고 refresh 쿠키(Path /api/v1/auth)가 그대로 오간다.
// preview.proxy는 따로 적지 않으면 server.proxy를 그대로 쓴다(npm run preview에서도 같은 전달).
const BACKEND_ORIGIN = 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: BACKEND_ORIGIN },
    },
  },
})
