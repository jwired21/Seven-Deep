import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath or any static host.
  base: './',
  plugins: [
    react(),
    VitePWA({
      // A new version installs in the background and takes over on the next visit.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Seven Deep · 7-on-7 play designer',
        short_name: 'Seven Deep',
        description: 'Design 7-on-7 flag football plays and print playbooks and wrist coach sheets.',
        // Relative, so the app installs correctly from a subfolder such as GitHub Pages.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#12161C',
        theme_color: '#12161C',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs is saved on the device at install: the code, the fonts,
        // the icons, and the PDF library, so printing works with no signal too.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
