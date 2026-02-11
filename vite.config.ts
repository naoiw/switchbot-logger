import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages は https://<user>.github.io/<repo>/ で配信される
export default defineConfig({
  plugins: [react()],
  base: '/switchbot-logger/',
})
