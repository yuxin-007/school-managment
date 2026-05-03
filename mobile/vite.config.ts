import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiTarget = 'http://127.0.0.1:5000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3100,
    proxy: {
      '/auth': { target: apiTarget, changeOrigin: true },
      '/api': { target: apiTarget, changeOrigin: true },
      '/user/api': { target: apiTarget, changeOrigin: true },
      '/course/api': { target: apiTarget, changeOrigin: true },
      '/assignment/api': { target: apiTarget, changeOrigin: true },
      '/grade/api': { target: apiTarget, changeOrigin: true },
      '/attendance/api': { target: apiTarget, changeOrigin: true },
      '/leave/api': { target: apiTarget, changeOrigin: true },
      '/notification/api': { target: apiTarget, changeOrigin: true },
    },
  },
})
