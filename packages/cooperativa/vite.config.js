import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const isProd  = process.env.NODE_ENV === 'production'
// Onde o site vive. Com domínio próprio, na raiz; sem ele, em /giro-jeri/ do
// github.io. UMA variável decide as duas coisas — a base dos assets e o CNAME
// publicado — porque separá-las permitiria subir um CNAME com os assets
// apontando para o caminho antigo, e a página abriria em branco.
const CUSTOM_DOMAIN = (process.env.CUSTOM_DOMAIN || '').trim()
const SITE_ROOT     = CUSTOM_DOMAIN ? '' : '/giro-jeri'
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
  base: isProd ? `${SITE_ROOT}/cooperativa/` : '/',
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
