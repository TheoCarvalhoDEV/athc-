import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons.svg', 'logo.png'],
      manifest: {
        name: 'Atchêi - A cena acontece aqui',
        short_name: 'Atchêi',
        description: 'Descubra e crie os melhores eventos, festas e encontros na sua região.',
        theme_color: '#6B1D1D',
        background_color: '#F5EDE3',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'apple-touch-icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
})
