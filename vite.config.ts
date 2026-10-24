import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'split-research-archive',
    apply: 'build',
    closeBundle() {
      const path = 'dist/data/snapshot.json'
      const snapshot = JSON.parse(readFileSync(path, 'utf8'))
      const archive = { history: snapshot.history, cotHistory: snapshot.cotHistory ?? [], cryptoHistory: snapshot.cryptoHistory ?? [] }
      const data = JSON.stringify(archive)
      const filename = `archive-${createHash('sha256').update(data).digest('hex').slice(0, 12)}.json`
      writeFileSync(`dist/data/${filename}`, data)
      snapshot.archiveUrl = filename
      snapshot.archiveCounts = Object.fromEntries(Object.entries(archive).map(([key, rows]) => [key, rows.length]))
      for (const key of Object.keys(archive)) snapshot[key] = []
      writeFileSync(path, JSON.stringify(snapshot))
    },
  }],
  // GitHub Pages serves this project at /bullsandbears/, not the domain root.
  // Keep local development rooted at / while emitting repository-aware asset
  // and data URLs for the production artifact.
  base: mode === 'production' ? '/bullsandbears/' : '/',
  build: {
    sourcemap: false,
    target: 'es2022',
  },
}))
