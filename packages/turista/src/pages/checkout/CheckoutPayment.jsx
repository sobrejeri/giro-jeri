import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ShieldCheck, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { paymentMethodsDoBrick } from '../../lib/formasPagamento'

// ─── helpers ────────────────────────────────────────────────
function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

// ─── getMercadoPago ──────────────────────────────────────────
// Instancia o SDK somente quando o script já carregou. Com `publicKey` (chave
// do operador atribuído), tokeniza o cartão NA conta dela para o split;
// sem ela, usa a chave da plataforma (VITE_MP_PUBLIC_KEY, sem split).
function getMercadoPago(publicKey) {
  if (typeof window.MercadoPago === 'undefined') return null
  const key = publicKey || import.meta.env.VITE_MP_PUBLIC_KEY
  if (!key) return null
  try {
    return new window.MercadoPago(key, { locale: 'pt-BR' })
  } catch {
    return null
  }
}

// E-mail do usuário logado (para pré-preencher o pagador no Brick).
function getUserEmail() {
  try { return JSON.parse(localStorage.getItem('giro_user') || 'null')?.email || undefined }
  catch { return undefined }
}

// ─── PaymentBrick ────────────────────────────────────────────
// Brick unificado do Mercado Pago: cartão (crédito/débito) E PIX na mesma tela
// embutida. Tokeniza com segurança (PCI) e devolve os dados no onSubmit; a API
// cria o pagamento (com split quando o operador está conectada).
function PaymentBrick({ amount, publicKey, onCard, onPix, settings }) {
  const { t }    = useTranslation()
  const brickRef = useRef(null)
  const [phase,       setPhase]       = useState('loading') // loading | ready | error
  const [rejectedMsg, setRejectedMsg] = useState('')
  // true = falhou do nosso lado (rede, servidor); false = o gateway recusou.
  const [falhaInterna, setFalhaInterna] = useState(false)
  const enviandoRef = useRef(false)   // uma cobrança por vez
  // ── Identidade da TENTATIVA de pagar ───────────────────────────────────────
  // Esta chave é metade da proteção contra cobrança dupla: ela vira o
  // X-Idempotency-Key do Mercado Pago. Gerar uma nova a cada envio faz o retry
  // de um timeout parecer uma compra nova — e o MP cobra de novo, de verdade.
  //
  // Por isso ela nasce UMA vez e sobrevive a erro ambíguo (rede caiu, timeout,
  // erro nosso): nesses casos não sabemos se a cobrança existe, e repetir com a
  // MESMA chave devolve a primeira, nunca uma segunda. Só é descartada depois
  // de um estado DEFINITIVO — recusado ou aprovado —, quando um novo envio é
  // de fato uma cobrança nova.
  const tentativaRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const containerId = 'paymentBrick_container'

    async function mount() {
      const mp = getMercadoPago(publicKey)
      if (!mp) { setPhase('error'); return }
      let bricks
      try { bricks = mp.bricks() } catch { setPhase('error'); return }

      const email = getUserEmail()

      try {
        brickRef.current = await bricks.create('payment', containerId, {
          initialization: {
  amount: Number(amount) || 0,
  payer: {
    ...(email ? { email } : {}),
    entityType: 'individual',
  },
},
          customization: {
            visual: { style: { theme: 'default' } },
            // Quais formas aparecem vem das Configurações do admin. Método
            // desligado é OMITIDO do objeto — é assim que o Brick esconde uma
            // forma de pagamento; lista vazia não desliga.
            paymentMethods: paymentMethodsDoBrick(settings),
          },
          callbacks: {
            onReady: () => { if (!cancelled) setPhase('ready') },
            onError: (err) => {
              console.error('[brick] erro', err)
              if (!cancelled) setPhase((p) => (p === 'loading' ? 'error' : p))
            },
            onSubmit: async ({ selectedPaymentMethod, formData }) => {
              // Trava de reentrada: o Brick já bloqueia o botão enquanto a
              // promessa não resolve, mas uma segunda chamada (Enter no
              // teclado, toque duplo que escapa) criaria uma SEGUNDA cobrança
              // no Mercado Pago. Cobrança dupla é o erro caro deste fluxo.
              if (enviandoRef.current) return Promise.reject(new Error('Pagamento em processamento…'))
              enviandoRef.current = true
              try {
              setRejectedMsg('')
              try {
                // PIX (transferência bancária) → cria o pagamento e abre o QR.
                if (selectedPaymentMethod === 'bank_transfer' || formData?.payment_method_id === 'pix') {
                  await onPix(formData)
                  return Promise.resolve()
                }

                // Cartão (crédito/débito) → método inferido do payment_method_id.
                const pmId   = formData?.payment_method_id || ''
                const method = /^deb/i.test(pmId) ? 'debit_card' : 'credit_card'
                if (!tentativaRef.current) tentativaRef.current = crypto.randomUUID()
                const result = await onCard({
                  payment_method:    method,
                  card_token:        formData?.token,
                  payment_method_id: pmId,
                  issuer_id:         formData?.issuer_id ? String(formData.issuer_id) : undefined,
                  installments:      Number(formData?.installments) || 1,
                  payer_doc:         formData?.payer?.identification?.number,
                  // O e-mail é opcional no cadastro (dá para se registrar só
                  // com telefone), e o Mercado Pago EXIGE o do pagador. Quando
                  // a conta não tem, o Brick pede — e é esse, real, que vai.
                  payer_email:       formData?.payer?.email,
                  payment_attempt_id: tentativaRef.current,
                  // Device ID do antifraude do MP (security.js no index.html).
                  // Vai vazio se o script não tiver carregado — a cobrança
                  // segue, só sem o sinal que ajuda a aprovar.
                  device_id:         typeof window !== 'undefined' ? window.MP_DEVICE_SESSION_ID : undefined,
                })
                if (result?.status === 'rejected') {
                  // DEFINITIVO: o cartão foi recusado. O próximo envio é uma
                  // cobrança nova de verdade (outro cartão, outra bandeira),
                  // então precisa de uma chave nova — com a chave antiga o MP
                  // devolveria a mesma recusa sem sequer olhar o cartão novo.
                  tentativaRef.current = null
                  const msg = result.message_key ? t(result.message_key) : t('payment.rejected.generic')
                  setFalhaInterna(false)
                  setRejectedMsg(msg)
                  return Promise.reject(new Error(msg))
                }
                // Também DEFINITIVO: encerra a tentativa.
                if (result?.status === 'approved') tentativaRef.current = null
                // approved / in_process → o componente pai navega de tela.
                return Promise.resolve()
              } catch (err) {
                // Recusa do cartão e falha nossa são coisas diferentes. Antes
                // as duas apareciam sob "Pagamento recusado" — inclusive um
                // erro de banco, que dizia ao cliente que o cartão foi negado
                // quando o Mercado Pago podia ter aprovado a cobrança.
                setFalhaInterna(true)
                setRejectedMsg(
                  err?.message ||
                  'Não foi possível concluir a confirmação do pagamento. Estamos verificando o status da transação.',
                )
                return Promise.reject(err)
              }
              } finally {
                enviandoRef.current = false
              }
            },
          },
        })
      } catch (e) {
        console.error('[brick] create falhou', e)
        if (!cancelled) setPhase('error')
      }
    }

    mount()
    return () => {
      cancelled = true
      try { brickRef.current?.unmount?.() } catch { /* ignore */ }
    }
  // `settings` entra nas dependências: se o dono mudar as formas de pagamento
  // no admin, o Brick precisa ser remontado — ele lê a configuração só ao criar.
  }, [amount, publicKey, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'error') {
    return (
      // Beco sem saída antes: só dizia "atualize a página", e num app instalado
      // não existe botão de atualizar à vista. Quem chegava aqui ficava com a
      // reserva aceita e sem conseguir pagar.
      <div className="px-4 py-4 bg-red-50 rounded-2xl border border-red-100">
        <p className="text-[13px] text-red-700 font-semibold">Não foi possível carregar o pagamento.</p>
        <p className="text-[12px] text-red-600/80 mt-1 leading-snug">
          Costuma ser conexão instável. Sua reserva está guardada — pode tentar de novo.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={() => window.location.reload()}
            className="bg-brand text-white font-bold rounded-full px-4 py-2 text-[13px] active:scale-95 transition-transform"
          >
            Tentar de novo
          </button>
          <a
            href="https://wa.me/5588981222990"
            className="text-[12.5px] font-semibold text-gray-600 underline"
          >
            Falar no WhatsApp
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-1">
      {rejectedMsg && (
        <div className={`flex items-start gap-2 rounded-xl px-3 py-3 mb-3 border ${
          falhaInterna ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
        }`}>
          <AlertCircle size={15} className={`shrink-0 mt-0.5 ${falhaInterna ? 'text-amber-500' : 'text-red-400'}`} />
          <div>
            <p className={`text-[13px] font-semibold ${falhaInterna ? 'text-amber-800' : 'text-red-700'}`}>
              {falhaInterna ? 'Não conseguimos confirmar agora' : t('payment.card.declined')}
            </p>
            <p className={`text-[12px] mt-0.5 ${falhaInterna ? 'text-amber-700' : 'text-red-600'}`}>{rejectedMsg}</p>
            {falhaInterna && (
              <p className="text-[11px] text-amber-700/80 mt-1.5">
                Se o valor foi debitado, a reserva aparece em Minhas Reservas em alguns instantes —
                não pague de novo sem conferir lá.
              </p>
            )}
          </div>
        </div>
      )}
      <div id="paymentBrick_container" />
      {phase === 'loading' && (
        <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
          <span className="text-[13px]">Carregando pagamento seguro…</span>
        </div>
      )}
    </div>
  )
}

// ─── CheckoutPayment (página principal) ─────────────────────
export default function CheckoutPayment() {
  const navigate   = useNavigate()
  const { state }  = useLocation()
  const { t }      = useTranslation()
  // Formas de pagamento configuradas pelo dono no admin.
  //
  // COM PRAZO. Isto é preferência de exibição — NÃO pode segurar a tela de
  // pagamento. Sem o prazo, a primeira versão deixava o cliente preso em
  // "Preparando pagamento seguro…" enquanto a API acordava (cold start do
  // Render leva dezenas de segundos), e o formulário nunca aparecia.
  //
  // Passados 2 segundos, segue com o padrão (todas as formas ligadas) e IGNORA
  // a resposta atrasada — aplicá-la depois remontaria o Brick, e o Mercado Pago
  // duplica o formulário quando remontado no mesmo container.
  const [settings, setSettings] = useState(undefined)
  useEffect(() => {
    let decidido = false
    const decidir = (v) => { if (!decidido) { decidido = true; setSettings(v) } }
    const prazo = setTimeout(() => decidir({}), 2000)
    api.getPublicSettings()
      .then((s) => decidir(s || {}))
      .catch(() => decidir({}))
      .finally(() => clearTimeout(prazo))
    return () => { decidido = true; clearTimeout(prazo) }
  }, [])
  // Chave pública do operador atribuído (split). Buscada para reservas já
  // existentes (pagamento pós-aceite). keyChecked evita montar o Brick antes.
  const [sellerKey,  setSellerKey]  = useState(null)
  const [keyChecked, setKeyChecked] = useState(() => !state?.existing_booking_id)
  // Checkout Pro: o cliente sai do app para pagar com cartão na página do
  // Mercado Pago. Enquanto o link não vem, o botão trava — sair duas vezes
  // criaria duas preferências para a mesma reserva.
  const [redirecionando, setRedirecionando] = useState(false)
  const [erroCartao,     setErroCartao]     = useState('')

  // Com o Checkout Pro ligado, o cartão sai do Brick: ele fica só com o PIX,
  // que continua funcionando no app. Ter as duas formas de pagar com cartão na
  // mesma tela confundiria — e o Brick tokenizaria um cartão que ninguém usaria.
  // LIGADO POR PADRÃO — a mesma regra do servidor (cartaoNoCheckoutPro em
  // routes/payments.js). Chave ausente significa Checkout Pro; só um 'bricks'
  // explícito volta ao formulário de cartão dentro do site. As duas pontas
  // PRECISAM concordar: discordando, o cliente vê um formulário que o servidor
  // recusa, ou um botão que não leva a lugar nenhum.
  //
  // Vale também quando as configurações não chegam (o fallback de 2s devolve
  // {}): sem saber, o certo é o caminho que funciona.
  const cartaoNoMercadoPago = settings?.payment_card_flow !== 'bricks'
  const settingsDoBrick = cartaoNoMercadoPago
    ? { ...settings, payment_method_credit: 'false', payment_method_debit: 'false' }
    : settings

  // COM PRAZO, pelo mesmo motivo das formas de pagamento logo acima — e a
  // ausência dele aqui era pior: esta chamada TRAVA o formulário. Sem resposta
  // (cold start do Render leva dezenas de segundos, e a API pode estar fora),
  // o cliente ficava preso em "Preparando pagamento seguro…" achando que o
  // botão não funcionou. A chave do operador é otimização de split; não pode
  // impedir alguém de pagar.
  useEffect(() => {
    const bid = state?.existing_booking_id
    if (!bid) { setKeyChecked(true); return }
    let decidido = false
    const seguir = () => { if (!decidido) { decidido = true; setKeyChecked(true) } }
    const prazo = setTimeout(() => {
      console.warn('[checkout] chave do operador demorou — seguindo com a da plataforma')
      seguir()
    }, 3000)
    api.getCheckoutKey(bid)
      .then((r) => { if (!decidido) setSellerKey(r?.public_key || null) })
      .catch(() => {})
      .finally(() => { clearTimeout(prazo); seguir() })
    return () => { decidido = true; clearTimeout(prazo) }
  }, [state?.existing_booking_id])

  if (!state) { navigate(-1); return null }

  const {
    service_name, service_type, booking_mode,
    service_date, service_date_iso, service_time,
    people_count, total_price: rawPrice, region_id, service_id,
    vehicles = [], origin_text, destination_text, cover_image_url,
    existing_booking_id, order_group_id,
  } = state

  const total_price = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
  const isPrivate   = booking_mode === 'private'
  const subtitleParts = [
    service_date,
    service_time,
    `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`,
  ].filter(Boolean)

  // PIX pelo Brick: cria o pagamento e leva à tela de QR + acompanhamento.
  async function handlePix(formData) {
    const result = await api.createPaymentIntent({
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles,
      origin_text, destination_text,
      total_price, payment_method: 'pix',
      service_name, cover_image_url,
      existing_booking_id: existing_booking_id || undefined,
      order_group_id: order_group_id || undefined,
      payer_doc: formData?.payer?.identification?.number,
      payer_email: formData?.payer?.email,
    })
    if (!result) throw new Error(t('payment.errorGeneric'))

    navigate('/checkout/processando', {
      state: {
        ...state,
        payment_id:        result.payment_id,
        booking_id:        result.booking_id,
        booking_code:      result.booking_code,
        amount:            result.amount,
        pix_code:          result.pix_code,
        qr_base64:         result.qr_base64,
        expires_at:        result.expires_at,
        manual_mode:       result.manual_mode,
        pix_key_type:      result.pix_key_type,
        pix_key:           result.pix_key,
        bank_name:         result.bank_name,
        bank_agency:       result.bank_agency,
        bank_account:      result.bank_account,
        bank_account_type: result.bank_account_type,
        payment_method:    'pix',
      },
    })
  }

  // Cartão pelo Brick: cria o pagamento e roteia pelo status.
  async function handleCardPayment(cardFields) {
    const result = await api.createPaymentIntent({
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles,
      origin_text, destination_text,
      total_price, service_name, cover_image_url,
      existing_booking_id: existing_booking_id || undefined,
      order_group_id: order_group_id || undefined,
      // Com QUAL chave pública o cartão foi tokenizado. O servidor usa isso
      // para não dividir uma cobrança cujo token pertence a outra conta — o
      // Mercado Pago recusaria o token, com uma mensagem que não explica nada.
      mp_public_key: sellerKey || import.meta.env.VITE_MP_PUBLIC_KEY || undefined,
      ...cardFields,
    })

    if (!result) throw new Error(t('payment.errorGeneric'))

    if (result.status === 'approved') {
      navigate('/checkout/sucesso', {
        state: {
          ...state,
          booking_id:     result.booking_id,
          booking_code:   result.booking_code,
          amount:         result.amount,
          installments:   result.installments,
          card_last_four: result.card_last_four,
          card_brand:     result.card_brand,
          payment_method: cardFields.payment_method,
        },
      })
      return result
    }

    // Débito com autenticação do emissor (3DS): o pagamento existe e está
    // pendente do banco do cliente. Vai para a tela de processamento, que já
    // consulta o status a cada poucos segundos — é ela quem descobre o
    // desfecho, porque o iframe do banco é de outro domínio e não nos avisa.
    if (result.status === 'challenge') {
      navigate('/checkout/processando', {
        state: {
          ...state,
          payment_id:      result.payment_id,
          booking_id:      result.booking_id,
          booking_code:    result.booking_code,
          amount:          result.amount,
          payment_method:  cardFields.payment_method,
          challenge_url:   result.challenge_url,
          challenge_creq:  result.challenge_creq,
        },
      })
      return result
    }

    // 'processing' = outra requisição está falando com o Mercado Pago agora com
    // esta MESMA tentativa (o servidor devolve 202 em vez de cobrar de novo).
    // 'pending' com `reconciliado` = a tentativa já virou cobrança e o desfecho
    // ainda não saiu. Nos dois casos existe cobrança em curso: a tela de
    // processamento é quem consulta o status até o desfecho. Sem este galho o
    // cliente ficava parado no checkout, sem erro e sem confirmação.
    if (result.status === 'in_process' || result.status === 'processing' ||
        (result.reconciliado && result.status === 'pending')) {
      navigate('/checkout/processando', {
        state: {
          ...state,
          payment_id:     result.payment_id,
          booking_id:     result.booking_id,
          booking_code:   result.booking_code,
          amount:         result.amount,
          payment_method: cardFields.payment_method,
        },
      })
      return result
    }

    // rejected → retorna para o Brick exibir a mensagem
    return result
  }

  // ── Checkout Pro: o cartão é digitado na página do Mercado Pago ──────────
  // Não há token para enviar: pedimos um link e mandamos o cliente para lá. A
  // confirmação continua vindo do webhook e da tela de processamento, como no
  // PIX — o retorno do navegador não confirma nada sozinho.
  async function pagarComCartaoNoMercadoPago() {
    if (redirecionando) return
    setRedirecionando(true)
    setErroCartao('')
    try {
      const result = await api.createPaymentIntent({
        ...(existing_booking_id ? { existing_booking_id } : {}),
        ...(order_group_id ? { order_group_id } : {}),
        service_type, service_id, booking_mode,
        service_date_iso, service_time, people_count, region_id,
        vehicles, origin_text, destination_text,
        total_price, service_name, cover_image_url,
        payment_method: 'credit_card',
        checkout_pro: true,
      })
      // A reserva já estava paga (o servidor recusou abrir outro checkout).
      // Levar para a tela de sucesso é melhor que dizer "não deu": deu, antes.
      if (result?.status === 'approved') {
        navigate('/checkout/sucesso', {
          state: { ...state, booking_id: result.booking_id, booking_code: result.booking_code },
        })
        return
      }
      if (!result?.redirect_url) throw new Error('O Mercado Pago não devolveu o link de pagamento.')
      // Sai do app. Quem volta é o back_url, já com o id do pagamento.
      window.location.href = result.redirect_url
    } catch (err) {
      setRedirecionando(false)
      setErroCartao(err?.message || 'Não foi possível abrir o pagamento com cartão.')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white px-4 pt-12 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{t('payment.title')}</h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 space-y-3">
        {/* Resumo mini */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 mb-0.5">
              {service_type === 'tour' ? t('payment.summary.tour') : t('payment.summary.transfer')}
              {isPrivate ? ` · ${t('payment.summary.private')}` : ` · ${t('payment.summary.shared')}`}
            </p>
            <p className="text-[15px] font-bold text-gray-900 truncate">{service_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{subtitleParts.join(' · ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400">{t('payment.summary.total')}</p>
            <p className="text-[18px] font-bold text-brand">R$ {fmt(total_price)}</p>
          </div>
        </div>

        {/* Pagamento (Brick unificado: cartão + PIX) */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-1">{t('payment.choose')}</p>
          <div className="px-3 pb-3 pt-1">
            {/* Espera TAMBÉM as formas de pagamento chegarem. Sem isso o Brick
                montaria uma vez sem a configuração e outra com ela — e o
                Mercado Pago não gosta de ser montado duas vezes no mesmo
                container: o formulário aparece duplicado. */}
            {keyChecked && settings !== undefined ? (
              <>
                {cartaoNoMercadoPago && (
                  <div className="mb-3">
                    {erroCartao && (
                      <div className="mb-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
                        <p className="text-[12px] text-red-700 leading-relaxed">{erroCartao}</p>
                      </div>
                    )}
                    <button
                      onClick={pagarComCartaoNoMercadoPago}
                      disabled={redirecionando}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand text-white font-semibold text-[14px] py-3.5 active:scale-[0.99] transition-transform disabled:opacity-60"
                    >
                      {redirecionando ? 'Abrindo pagamento…' : 'Pagar com cartão'}
                    </button>
                    <p className="text-[11px] text-gray-500 text-center mt-2 leading-relaxed">
                      Você vai concluir no ambiente do Mercado Pago e volta para cá em seguida.
                    </p>
                  </div>
                )}
                <PaymentBrick
                  amount={total_price}
                  publicKey={sellerKey}
                  onCard={handleCardPayment}
                  onPix={handlePix}
                  settings={settingsDoBrick}
                />
              </>
            ) : (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-brand rounded-full animate-spin" />
                <span className="text-[13px]">Preparando pagamento seguro…</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-green-50 rounded-2xl p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-green-700 leading-relaxed">{t('payment.secureNote')}</p>
          </div>
        </div>
      </main>
    </div>
  )
}
