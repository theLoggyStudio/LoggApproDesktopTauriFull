/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

// Obfuscation activée pour les builds (exécutable/installateur). Désactiver avec VITE_OBFUSCATE=false
const useObfuscator = process.env.VITE_OBFUSCATE !== 'false'

// Base relative pour Tauri : les assets doivent charger correctement depuis le protocole asset://
const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: isTauri ? './' : '/',
  plugins: [
    react(),
    ...(useObfuscator ? [obfuscatorPlugin({
      apply: 'build',
      exclude: [/node_modules/, /\.nuxt/],
      options: {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: false,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        splitStrings: false,
        stringArray: true,
        stringArrayCallsTransform: false,
        stringArrayEncoding: [],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 0,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 2,
        stringArrayWrappersType: 'variable',
        stringArrayThreshold: 0.75,
        unicodeEscapeSequence: false,
      },
    })] : []),
  ],
  server: {
    port: 7061,
    host: '0.0.0.0', // Accessible via http://<ip_pc>:7061 sur le réseau local
    strictPort: true,
    // CORS : autoriser l'accès depuis le réseau local (192.168.x.x, 10.x.x.x)
    cors: {
      origin: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/,
      credentials: true,
    },
    // HMR : clientPort pour que le WebSocket utilise le même port que la page (accès réseau)
    hmr: { clientPort: 7061 },
  },
  preview: {
    port: 7061,
    host: '0.0.0.0',
  },
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      // bcryptjs utilise require("crypto") - polyfill pour le navigateur
      crypto: 'crypto-browserify',
    },
  },
  optimizeDeps: {
    exclude: ['crypto-browserify'],
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/react-router-dom')) {
            return 'router';
          }
          if (id.includes('node_modules/react-bootstrap') || id.includes('node_modules/bootstrap')) {
            return 'bootstrap';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'date-fns';
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts'],
    },
  },
}))
