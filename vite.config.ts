import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  const hasClerkKey = !!env.VITE_CLERK_PUBLISHABLE_KEY;

  const alias: Record<string, string> = {
    '@': path.resolve(__dirname, './src'),
  };

  if (!hasClerkKey) {
    console.log('\x1b[33m%s\x1b[0m', '⚠️  No Clerk Publishable Key found in environment. Enabling Clerk auth mock bypass.');
    alias['@clerk/clerk-react'] = path.resolve(__dirname, './src/services/clerk-mock.tsx');
  }

  return {
    base: './',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon-192x192.png', 
          'icon-512x512.png', 
          'favicon.ico', 
          'screenshots/discovery.png', 
          'screenshots/mobile.png'
        ],
        manifest: {
          name: 'SalesFlow',
          short_name: 'SalesFlow',
          description: 'Intelligent Field Prospecting & CRM PWA',
          theme_color: '#1d2021',
          background_color: '#1d2021',
          display: 'standalone',
          start_url: './index.html',
          id: './index.html',
          orientation: 'portrait-primary',
          categories: ['productivity', 'utilities', 'business'],
          icons: [
            {
              src: 'icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ],
          screenshots: [
            {
              src: 'screenshots/discovery.png',
              sizes: '475x1009',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'SalesFlow Discovery and Swipe Interface'
            },
            {
              src: 'screenshots/mobile.png',
              sizes: '480x1011',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'SalesFlow CRM Pipeline View'
            }
          ]
        }
      })
    ],
    resolve: {
      alias,
    },
  };
})

