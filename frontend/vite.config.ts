import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('react')) {
            return 'react-core'
          }

          if (
            id.includes('antd/es/table') ||
            id.includes('antd/lib/table') ||
            id.includes('rc-table') ||
            id.includes('rc-pagination') ||
            id.includes('rc-resize-observer')
          ) {
            return 'antd-table'
          }

          if (
            id.includes('antd/es/date-picker') ||
            id.includes('antd/lib/date-picker') ||
            id.includes('rc-picker') ||
            id.includes('rc-calendar')
          ) {
            return 'antd-date'
          }

          if (
            id.includes('antd/es/form') ||
            id.includes('antd/lib/form') ||
            id.includes('rc-field-form') ||
            id.includes('async-validator')
          ) {
            return 'antd-form'
          }

          if (id.includes('@ant-design/icons')) {
            return 'antd-icons'
          }

          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) {
            return 'antd-core'
          }

          if (id.includes('dayjs')) {
            return 'dayjs'
          }

          if (id.includes('axios')) {
            return 'network'
          }

          if (id.includes('zustand')) {
            return 'state'
          }

          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/user': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/organization': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/leave': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/course': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/grade': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/attendance': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/announcement': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/notification': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/log': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/login': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
