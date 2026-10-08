import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // S15 (ADR-039) — PWA via vite-plugin-pwa generateSW mode. Dev/test runs
    // never see a service worker (devOptions off; registration also PROD-gated).
    VitePWA({
      registerType: 'prompt',
      // ADR-039: registration is explicit and PROD-gated in src/main.jsx;
      // the plugin must not inject its own unconditional register script.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'HomeHunt — Find Your Ideal Home',
        short_name: 'HomeHunt',
        description: 'Search homes, compare listings, and get alerts on matching properties.',
        theme_color: '#4f46e5',
        background_color: '#f9fafb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The precached shell (index.html) answers ANY offline navigation;
        // the SPA then renders /offline or cached views. A client-side route
        // cannot be a static navigateFallback target (ADR-039 note).
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // Fail-closed allow-list (ADR-039): ONLY these five public reads are
          // ever stored in CacheStorage. Everything else stays NetworkOnly by
          // never matching a rule.
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              (
                url.pathname === '/api/properties' ||
                /^\/api\/properties\/[0-9a-f]{24}$/.test(url.pathname) ||
                url.pathname === '/api/properties/compare' ||
                /^\/api\/properties\/[0-9a-f]{24}\/neighborhood$/.test(url.pathname) ||
                url.pathname === '/api/analytics/market'
              ),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-public-reads',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 3600 },
            },
          },
          // OSM tiles (subdomains a/b/c).
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Listing imagery (seed = unsplash; S13 uploads = cloudinary).
          {
            urlPattern: /^https:\/\/(images\.unsplash\.com|res\.cloudinary\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'listing-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // ADR-040 vendor split. Rolldown requires the function form of
        // manualChunks (the object map form throws "manualChunks is not
        // a function" under Vite 8 — spike finding, recorded in ADR-040).
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'vendor-leaflet';
            if (id.includes('lucide-react')) return 'vendor-lucide';
            // Form stack is used only by the lazily-loaded ListingForm.
            if (id.includes('yup') || id.includes('react-hook-form') || id.includes('@hookform')) return 'vendor-forms';
            if (
              id.includes('react-router') ||
              /node_modules\/(react|react-dom|scheduler)\//.test(id)
            ) return 'vendor-react';
            if (id.includes('@reduxjs') || id.includes('react-redux') || id.includes('redux') || id.includes('reselect') || id.includes('immer')) return 'vendor-redux';
            if (id.includes('socket.io')) return 'vendor-socket';
            return 'vendor';
          }
          return null;
        },
      },
    },
  },
})
