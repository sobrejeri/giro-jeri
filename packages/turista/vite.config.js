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

// Origem ABSOLUTA do site publicado — usada nas meta tags Open Graph (og:url,
// og:image). O WhatsApp/Instagram/Facebook NÃO executam JS: leem o HTML estático
// e precisam de uma URL absoluta e pública para a imagem da prévia. Com domínio
// próprio é ele; sem ele, o caminho do github.io. Injetada no index.html no
// lugar de %SITE_ORIGIN%.
const SITE_ORIGIN = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}` : 'https://sobrejeri.github.io/giro-jeri'

function injectOgOrigin() {
  return {
    name: 'inject-og-origin',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_ORIGIN%', SITE_ORIGIN)
    },
  }
}

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
  plugins: [react(), emitVersionJson(), injectOgOrigin()],
  define:  { __BUILD_ID__: JSON.stringify(buildId) },
  base: isProd ? `${SITE_ROOT}/` : '/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
