import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const isProd  = process.env.NODE_ENV === 'production'
const buildId = String(Date.now())

// Emite dist/version.json no build — usado pelo app para detectar nova
// versão em produção e oferecer ao usuário recarregar.
function emitVersionJson() {
  return {
    name: 'emit-version-json',
    apply: 'build',
    writeBundle(opts) {
      writeFileSync(join(opts.dir, 'version.json'), JSON.stringify({ buildId }))
    },
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define:  { __BUILD_ID__: JSON.stringify(buildId) },
  base: isProd ? '/giro-jeri/cooperativa/' : '/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
