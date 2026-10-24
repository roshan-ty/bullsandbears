import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages serves this project at /bullsandbears/, not the domain root.
  // Keep local development rooted at / while emitting repository-aware asset
  // and data URLs for the production artifact.
  base: mode === 'production' ? '/bullsandbears/' : '/',
  build: {
    sourcemap: false,
    target: 'es2022',
  },
}))
