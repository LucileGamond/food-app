/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Food App',
        short_name: 'Food',
        description: 'Planning des repas et recettes',
        lang: 'fr',
        theme_color: '#18181b',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        // Partage Android (menu « Partager » → Food) : le lien arrive dans la liste « À planifier ».
        // Liens (liste « À planifier ») et photos de recettes : POST multipart, trié par public/share-sw.js.
        share_target: {
          action: '/partage',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'photos', accept: ['image/*'] }] },
        },
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Notifications Web Push (listes de courses) et cible de partage (liens, photos)
        importScripts: ['push-sw.js', 'share-sw.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  // Le bundle principal (React, Supabase, composants) fait ~200 Ko gzip : acceptable pour une PWA mise en cache.
  build: { chunkSizeWarningLimit: 750 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    // Les écrans chargés à la demande peuvent dépasser 5 s quand toute la suite tourne en parallèle sur une machine chargée.
    testTimeout: 10_000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/api/errors.ts', 'src/hooks/**', 'src/components/**', 'src/pages/**', 'src/auth/**', 'src/app/**', 'src/App.tsx', 'supabase/functions/**/*.ts'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/lib/supabase.ts', 'src/lib/database.types.ts', 'src/lib/image.ts', 'src/main.tsx', 'src/components/ui/**', 'supabase/functions/**/index.ts'],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
})
