import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Megaphone, Share2, Copy, Check, ExternalLink, Info, ShoppingBag, Save,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input from '../components/ui/Input'

// Chaves de marketing (todas IDs PÚBLICOS — vivem no navegador do visitante).
const KEYS = ['marketing_meta_pixel_id', 'marketing_ga4_id', 'marketing_google_ads_id', 'marketing_google_ads_purchase_label']

const DESCRICOES = {
  marketing_meta_pixel_id:              'ID do Pixel da Meta (Instagram/Facebook)',
  marketing_ga4_id:                     'ID de métrica do Google Analytics 4 (G-XXXX)',
  marketing_google_ads_id:              'ID de conversão do Google Ads (AW-XXXX)',
  marketing_google_ads_purchase_label: 'Rótulo de conversão de compra do Google Ads',
}

function settingsToMap(list) {
  return Object.fromEntries((list || []).map((s) => [s.setting_key, s.setting_value ?? '']))
}

function StatusChip({ on }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
      on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
      {on ? 'Configurado' : 'Não configurado'}
    </span>
  )
}

export default function Marketing() {
  const qc = useQueryClient()
  const { data: settings = [], isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() })
  const { data: feed } = useQuery({ queryKey: ['marketing-feed'], queryFn: () => api.getMarketingFeed() })

  const [form, setForm] = useState({})
  const [savedSection, setSavedSection] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (settings.length) {
      const map = settingsToMap(settings)
      setForm(Object.fromEntries(KEYS.map((k) => [k, map[k] ?? ''])))
    }
  }, [settings])

  const saveMut = useMutation({
    mutationFn: async ({ keys }) => {
      const r = await Promise.allSettled(keys.map((k) =>
        api.updateSetting(k, { setting_value: String(form[k] ?? '').trim(), value_type: 'string', description: DESCRICOES[k] })))
      const falhas = keys.filter((_, i) => r[i].status === 'rejected')
      if (falhas.length) throw new Error(`Não foi possível salvar: ${falhas.join(', ')}.`)
      return r
    },
    onSuccess: (_, { secao }) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setErro(null); setSavedSection(secao)
      setTimeout(() => setSavedSection(null), 2500)
    },
    onError: (e, { secao }) => { setSavedSection(null); setErro({ secao, msg: e?.message || 'Falha ao salvar.' }) },
  })

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })) }
  function salvar(keys, secao) { setErro(null); setSavedSection(null); saveMut.mutate({ keys, secao }) }

  if (isLoading) return <PageSpinner />

  const feedBase   = import.meta.env.VITE_API_URL || window.location.origin
  const feedCsvUrl = `${feedBase}/api/marketing/catalog.csv`

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
          <Target size={20} className="text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-100">Marketing</h1>
          <p className="text-sm text-gray-400">Pixels de rastreamento e catálogo para anúncios no Instagram, Facebook e Google.</p>
        </div>
      </div>

      {/* ── Meta (Instagram / Facebook) ─────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone size={17} className="text-brand" />
            <h2 className="font-semibold text-gray-100">Meta — Instagram e Facebook</h2>
          </div>
          <StatusChip on={!!form.marketing_meta_pixel_id} />
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="ID do Pixel da Meta"
            placeholder="ex.: 1234567890123456"
            value={form.marketing_meta_pixel_id || ''}
            onChange={(e) => set('marketing_meta_pixel_id', e.target.value)}
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            Onde achar: Gerenciador de Eventos da Meta → Fontes de dados → seu Pixel → copie o <b>ID do conjunto de dados</b> (só números).
            O site do turista passa a registrar visitas, visualizações de passeio e compras — base para os anúncios do Instagram.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={() => salvar(['marketing_meta_pixel_id'], 'meta')} disabled={saveMut.isPending}>
              <Save size={15} /> Salvar Meta
            </Button>
            {savedSection === 'meta' && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={15} /> Salvo!</span>}
            {erro?.secao === 'meta' && <span className="text-sm text-red-400">{erro.msg}</span>}
          </div>
        </CardBody>
      </Card>

      {/* ── Google (GA4 + Ads) ──────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={17} className="text-brand" />
            <h2 className="font-semibold text-gray-100">Google — Analytics e Ads</h2>
          </div>
          <StatusChip on={!!form.marketing_ga4_id || !!form.marketing_google_ads_id} />
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Google Analytics 4 — ID de métrica"
            placeholder="G-XXXXXXXXXX"
            value={form.marketing_ga4_id || ''}
            onChange={(e) => set('marketing_ga4_id', e.target.value)}
          />
          <Input
            label="Google Ads — ID de conversão"
            placeholder="AW-XXXXXXXXX"
            value={form.marketing_google_ads_id || ''}
            onChange={(e) => set('marketing_google_ads_id', e.target.value)}
          />
          <Input
            label="Google Ads — rótulo de conversão de compra (opcional)"
            placeholder="AbCdEfGhIj (rótulo da ação de conversão 'Compra')"
            value={form.marketing_google_ads_purchase_label || ''}
            onChange={(e) => set('marketing_google_ads_purchase_label', e.target.value)}
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            GA4: Admin → Fluxos de dados → ID de métrica (começa com <b>G-</b>). Google Ads: Ferramentas → Conversões (ID começa com <b>AW-</b>),
            e o rótulo é o código da ação de conversão de <b>Compra</b>. Sem o rótulo, a compra ainda é contada pelo GA4.
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={() => salvar(['marketing_ga4_id', 'marketing_google_ads_id', 'marketing_google_ads_purchase_label'], 'google')} disabled={saveMut.isPending}>
              <Save size={15} /> Salvar Google
            </Button>
            {savedSection === 'google' && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={15} /> Salvo!</span>}
            {erro?.secao === 'google' && <span className="text-sm text-red-400">{erro.msg}</span>}
          </div>
        </CardBody>
      </Card>

      {/* ── Catálogo (feed) ─────────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center gap-2">
          <ShoppingBag size={17} className="text-brand" />
          <h2 className="font-semibold text-gray-100">Catálogo de produtos (feed)</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            Esta URL lista seus passeios ativos no formato que a Meta e o Google leem. Cole no
            {' '}<b>Commerce Manager</b> (Meta) ou no <b>Merchant Center</b> (Google) como fonte de dados agendada —
            eles buscam sozinhos e mantêm atualizado.
          </p>
          <FeedUrlBox url={feedCsvUrl} count={feed?.count} />
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
            <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed">
              A <b>lojinha orgânica</b> do Instagram (etiqueta de preço no post) exige produto físico e costuma barrar serviços.
              Este catálogo serve aos <b>anúncios dinâmicos</b> (retargeting): quem olhou um passeio no site é reimpactado com aquele passeio.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function FeedUrlBox({ url, count }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 text-[12px] text-gray-300 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
          {url}
        </code>
        <Button variant="secondary" size="icon" onClick={copy} title="Copiar URL" aria-label="Copiar URL do feed">
          {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
        </Button>
        <a href={url} target="_blank" rel="noreferrer">
          <Button variant="secondary" size="icon" title="Abrir feed" aria-label="Abrir feed"><ExternalLink size={15} /></Button>
        </a>
      </div>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Share2 size={13} />
        {count != null ? `${count} item(ns) no feed — passeios e transfers ativos, com preço e imagem.` : 'Carregando contagem do feed…'}
      </p>
    </div>
  )
}
