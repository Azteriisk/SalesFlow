import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
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
    alias: {
      '@': '/src',
    },
  },
})
