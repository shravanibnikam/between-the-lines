import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@fonts': path.resolve(import.meta.dirname, '../core/assets/fonts'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: ['..'] },
  },
})
