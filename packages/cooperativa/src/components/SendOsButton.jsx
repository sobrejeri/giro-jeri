import { useState } from 'react'
import { Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { orderPDFBase64 } from '../lib/orderPDF'

// Envia a Ordem de Serviço em PDF pelo WhatsApp, de uma vez, para o CLIENTE e o
// MOTORISTA. Substitui os dois botões antigos ("WhatsApp Motorista" / "WhatsApp
// Cliente"), que apenas ABRIAM a conversa e exigiam anexar o arquivo à mão.
//
// Em caso de falha mostra a resposta crua do Z-API: sem isso não dá para
// distinguir credencial inválida de formato recusado ou número sem WhatsApp.
//
// variant='inline' → botãozinho da lista de despacho
// variant='block'  → item grande do modal pós-despacho
export default function SendOsButton({ booking, form, cooperativa, variant = 'inline' }) {
  const [state, setState] = useState('idle')   // idle | sending | ok | error
  const [msg, setMsg]     = useState('')

  const mbOf = (b64) => (b64.length / 1024 / 1024).toFixed(2)

  async function send() {
    if (state === 'sending') return
    setState('sending'); setMsg('')
    let tamanho = '?'
    try {
      let pdf = await orderPDFBase64(booking, form, cooperativa)
      if (!pdf) throw new Error('Não foi possível gerar o PDF da OS.')
      tamanho = mbOf(pdf)

      try {
        const r = await api.sendOsPdf(booking.id, pdf)
        if (r?.error) throw new Error(`Z-API: ${r.error}`)
        if (!r?.sent) throw new Error('Nenhum número recebeu — confira os telefones.')
        setState('ok')
        setMsg(`OS enviada para ${r.sent} de ${r.total} número(s) · ${tamanho} MB`)
        return
      } catch (err) {
        // 413 = corpo recusado por tamanho. Refaz SEM o logo (bem menor) e
        // tenta uma vez — em vez de exigir que alguém troque a foto do perfil.
        const tooLarge = err?.status === 413 || /too large|entity/i.test(err?.message || '')
        if (!tooLarge) throw err
        pdf = await orderPDFBase64(booking, form, cooperativa, { noLogo: true })
        if (!pdf) throw err
        tamanho = mbOf(pdf)
        const r2 = await api.sendOsPdf(booking.id, pdf)
        if (r2?.error) throw new Error(`Z-API: ${r2.error}`)
        if (!r2?.sent) throw new Error('Nenhum número recebeu — confira os telefones.')
        setState('ok')
        setMsg(`OS enviada (sem logo) para ${r2.sent} de ${r2.total} número(s) · ${tamanho} MB`)
        return
      }
    } catch (e) {
      setState('error')
      // O tamanho no fim é o que fecha o diagnóstico quando o erro é de corpo.
      setMsg(`${e?.message || 'Falha ao enviar.'} · PDF ${tamanho} MB`)
    }
  }

  const label = state === 'sending' ? 'Enviando OS…'
              : state === 'ok'      ? 'OS enviada'
              : 'Enviar OS no WhatsApp'

  if (variant === 'block') {
    return (
      <>
        <button
          onClick={send}
          disabled={state === 'sending'}
          className="w-full flex items-center gap-3 p-3.5 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors text-left disabled:opacity-60"
        >
          <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
            {state === 'ok'    ? <CheckCircle2 size={16} className="text-green-600" />
            : state === 'error' ? <AlertCircle size={16} className="text-red-500" />
            : <Send size={16} className="text-green-600" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-green-800">{label}</p>
            <p className={`text-xs truncate ${state === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {msg || 'Cliente e motorista, automaticamente'}
            </p>
          </div>
        </button>
      </>
    )
  }

  return (
    <>
      <button
        onClick={send}
        disabled={state === 'sending'}
        className="flex items-center gap-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
      >
        {state === 'ok' ? <CheckCircle2 size={12} /> : <Send size={12} />} {label}
      </button>
      {msg && (
        <p className={`w-full text-[11px] mt-1 ${state === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {msg}
        </p>
      )}
    </>
  )
}
