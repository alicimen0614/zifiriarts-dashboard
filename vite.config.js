// Cloudflare Pages Migration Trigger
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',
    filename: 'firebase-messaging-sw.js',
    injectManifest: {
      rollupFormat: 'iife'
    },
    registerType: 'autoUpdate',
    devOptions: {
      enabled: true,
      type: 'module'
    },
    includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
    manifest: {
      name: 'ZifiriArts',
      short_name: 'ZifiriArts',
      gcm_sender_id: '339084266093',
      description: 'ZifiriArts Sipariş ve Takip Sistemi',
      theme_color: '#000000',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        {
          src: 'logo.jpg',
          sizes: '192x192',
          type: 'image/jpeg'
        },
        {
          src: 'logo.jpg',
          sizes: '512x512',
          type: 'image/jpeg'
        },
        {
          src: 'logo.jpg',
          sizes: '512x512',
          type: 'image/jpeg',
          purpose: 'any maskable'
        }
      ]
    }
  }), cloudflare()],
})