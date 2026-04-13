import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    fs: {
      // Permitir que Vite acceda a la carpeta del Core compartida fuera de la raíz
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      // Alias opcional por si acaso, aunque ya usamos file:
      'core-saas': path.resolve(__dirname, '../core-saas')
    }
  }
})
