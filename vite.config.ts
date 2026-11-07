import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, writeFileSync } from 'node:fs'

export default defineConfig({
  plugins: [react(), { name: 'pages-files', closeBundle() {
    copyFileSync('dist/index.html', 'dist/404.html')
    writeFileSync('dist/.nojekyll', '')
  } }],
  base: '/bullsandbears/',
  build: { sourcemap: false, target: 'es2022' },
})
