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
      'core-saas': path.resolve(__dirname, '../core-saas'),
      // Forzamos a que las dependencias de la carpeta externa se busquen aquí
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
      '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query')
    }
  },
  build: {
    rollupOptions: {
      // Forzamos a que las dependencias de core-saas se resuelvan
      // desde el node_modules de esta aplicación durante el build.
      external: []
    }
  }
})
