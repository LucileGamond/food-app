/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Dernier commit (numéro court et date), affiché dans l'application ; vide hors d'un dépôt git. */
function lastCommit(): { hash: string; date: string } {
  try {
    const [hash = '', date = ''] = execSync('git log -1 --format=%h%n%cI', { encoding: 'utf8' }).trim().split('\n')
    return { hash, date }
  } catch {
    return { hash: '', date: '' }
  }
}

const commit = lastCommit()

export default defineConfig({
  define: {
    'import.meta.env.VITE_COMMIT_HASH': JSON.stringify(commit.hash),
    'import.meta.env.VITE_COMMIT_DATE': JSON.stringify(commit.date),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Life',
        short_name: 'Life',
        description: 'Repas, recettes, courses et petits outils du quotidien',
        lang: 'fr',
        theme_color: '#18181b',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: '/',
        // Partage Android (menu « Partager » → Life) : le lien arrive dans la liste « À planifier ».
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
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Moteur d'arrosage partagé avec les rappels (Edge Function).
      '@watering': fileURLToPath(new URL('./supabase/functions/_shared/watering', import.meta.url)),
    },
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
      include: ['src/lib/**', 'src/services/**', 'src/api/errors.ts', 'src/hooks/**', 'src/components/**', 'src/pages/**', 'src/auth/**', 'src/app/**', 'src/App.tsx', 'src/modules/**', 'supabase/functions/**/*.ts'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/api/client.ts', 'src/lib/database.types.ts', 'src/lib/image.ts', 'src/lib/camera.ts', 'src/lib/scanStore.ts', 'src/main.tsx', 'src/components/ui/**', 'supabase/functions/**/index.ts', 'src/modules/**/api.ts'],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
})
