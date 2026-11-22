import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, ['API_PROXY_TARGET', 'SERVER_PORT']);
  const proxy = {
    '/api': env.API_PROXY_TARGET || `http://127.0.0.1:${env.SERVER_PORT || '3000'}`,
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'FoodShare',
          short_name: 'FoodShare',
          lang: 'ru',
          theme_color: '#1d4a32',
          background_color: '#f8faf6',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,webp}'],
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        },
      }),
    ],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', proxy },
  };
});
