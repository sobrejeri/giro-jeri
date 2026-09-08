import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ShieldCheck, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { paymentMethodsDoBrick, formasAtivas } from '../../lib/formasPagamento'
import { useAuth } from '../../contexts/AuthContext'

// ─── helpers ────────────────────────────────────────────────
function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

// ─── BotaoAdquirente ────────────────────────────────────────
// Botão de pagamento com a identidade do ADQUIRENTE — cor e logo dele.
//
// O logo vem de `public/logos/`, e NÃO é importado: um import de arquivo
// ausente quebra o build inteiro do Vite, e este é justamente um arquivo que
// pode não estar lá (é marca de terceiro, baixada do brand kit deles). Como
// `<img>`, o arquivo faltando é só um 404 — o `onError` esconde a imagem e o
// botão continua inteiro, com a cor e o texto. Colocar o SVG oficial no
// caminho certo faz o logo aparecer sem tocar em código.
//
// BASE_URL é obrigatório: o app é publicado num subcaminho do GitHub Pages, e
// um '/logos/...' absoluto apontaria para a raiz do domínio.
// `carregando` é só deste botão (qual está abrindo); `desabilitado` vale para
// TODOS enquanto qualquer um abre. São coisas diferentes: sem a segunda, o
// cliente clicaria no segundo adquirente enquanto o primeiro já está
// redirecionando, e sairiam duas cobranças da mesma reserva.
function BotaoAdquirente({ estilo, rotulo, rotuloCarregando = 'Abrindo pagamento…',
  carregando, desabilitado, onClick }) {
  const [semLogo, setSemLogo] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      style={{
        backgroundColor: estilo.cor,
        color: estilo.texto,
        ...(estilo.borda ? { borderWidth: 1, borderColor: '#E5E7EB' } : {}),
      }}
      className="w-full flex items-center justify-center gap-2.5 rounded-xl font-semibold text-[14px] py-3.5 active:scale-[0.99] transition-transform disabled:opacity-60"
    >
      {!semLogo && estilo.logo && (
        <img
          src={import.meta.env.BASE_URL + 'logos/' + estilo.logo}
          onError={() => setSemLogo(true)}
          alt=""
          /* alt vazio e aria-hidden: o nome do adquirente já está no texto do
             botão. Repeti-lo faria o leitor de tela anunciar duas vezes. */
          aria-hidden="true"
          className="h-5 w-auto shrink-0"
        />
      )}
      <span>{carregando ? rotuloCarregando : rotulo}</span>
    </button>
  )
}

// Cor institucional do Pix (Banco Central). Literal, como o azul do Mercado
// Pago: é marca de terceiro, e mudar a paleta da Turiva não pode repintá-la.
const ESTILO_PIX = {
  cor: '#32BCAD', corAtiva: '#2BA697', texto: '#FFFFFF', logo: 'pix.svg',
}

// Cartão digitado AQUI DENTRO. Neutro de propósito: não é marca de ninguém —
// o formulário é do Mercado Pago, mas quem digita não sai do site, e pintá-lo
// de azul prometeria um redirecionamento que não acontece.
const ESTILO_CARTAO_SITE = {
  cor: '#FFFFFF', corAtiva: '#F3F4F6', texto: '#1F2937', borda: true,
  logo: 'cartao.svg',
}

// ─── BlocoPix ───────────────────────────────────────────────
// Escolher e pagar, nesta ordem. O botão de pagar SÓ existe depois da escolha:
// um botão de pagamento aceso sem nada selecionado convida ao clique e não diz
// o que vai acontecer — e era o que o Brick fazia, com um "Pagar" azul genérico
// visível desde a abertura da tela.
function BlocoPix({ selecionado, onSelecionar, precisaEmail, email, onEmail,
  erro, enviando, onPagar }) {
  // O e-mail existe porque a conta pode ter sido criada só com telefone, e o
  // Mercado Pago exige e-mail do pagador para emitir o PIX. Quem coletava isso
  // era o Brick; tirando o Brick, a coleta tinha de vir junto — senão essa
  // pessoa perderia o único meio de pagamento que ela tem.
  const emailOk = !precisaEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')

  return (
    <div>
      <button
        onClick={onSelecionar}
        aria-pressed={selecionado}
        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
          selecionado ? 'border-[#32BCAD] bg-[#32BCAD]/5' : 'border-gray-200 bg-white'
        }`}
      >
        <span
          className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            selecionado ? 'border-[#32BCAD]' : 'border-gray-300'
          }`}
        >
          {selecionado && <span className="w-2 h-2 rounded-full bg-[#32BCAD]" />}
        </span>
        <span className="w-8 h-8 rounded-full bg-[#32BCAD] flex items-center justify-center shrink-0">
          <img src={import.meta.env.BASE_URL + 'logos/pix.svg'} alt="" aria-hidden="true"
            className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-gray-900">Pix</span>
          <span className="block text-[11px] text-gray-500">Aprovação na hora, sem cadastro</span>
        </span>
      </button>

      {selecionado && (
        <div className="mt-3 space-y-3">
          {precisaEmail && (
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                Seu e-mail
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                placeholder="voce@exemplo.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] outline-none focus:border-[#32BCAD]"
              />
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                Sua conta não tem e-mail cadastrado, e ele é obrigatório para emitir o Pix.
              </p>
            </div>
          )}

          {erro && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
              <p className="text-[12px] text-red-700 leading-relaxed">{erro}</p>
            </div>
          )}

          <BotaoAdquirente
            estilo={ESTILO_PIX}
            rotulo="Pagar com Pix"
            rotuloCarregando="Gerando o Pix…"
            carregando={enviando}
            desabilitado={enviando || !emailOk}
            onClick={onPagar}
          />
          <p className="text-[11px] text-gray-500 text-center leading-relaxed">
            Você recebe o QR Code na próxima tela. A reserva confirma assim que o
            pagamento cair.
          </p>
        </div>
      )}
    </div>
  )
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
  // O e-mail da conta decide se o PIX precisa pedir um: cadastro só por
  // telefone é permitido, e o Mercado Pago exige e-mail do pagador.
  const { user }   = useAuth() || {}
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
  // Guarda QUAL adquirente está abrindo, não um booleano: com dois botões de
  // cartão na tela, um booleano acenderia "Abrindo pagamento…" nos dois e o
  // cliente não saberia qual ele apertou.
  const [redirecionando, setRedirecionando] = useState(null)
  const [pixSelecionado, setPixSelecionado] = useState(false)
  // O formulário de cartão no site começa FECHADO, como o Pix: a tela abre com
  // as opções, e o cliente escolhe antes de ver campo nenhum.
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [emailPix,       setEmailPix]       = useState('')
  const [erroPix,        setErroPix]        = useState('')
  const [enviandoPix,    setEnviandoPix]    = useState(false)
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

  // ── Formulário de cartão AQUI DENTRO (Bricks) ──────────────────────────
  // Terceira opção, ao lado dos botões que redirecionam. Existe porque o
  // Checkout Pro está restrito a quem tem conta no Mercado Pago
  // (`payment_mp_wallet_only`): sem esta, quem não tem conta fica sem NENHUM
  // caminho de cartão — só o Pix.
  //
  // Não substitui o Checkout Pro, soma a ele. São públicos diferentes: quem
  // tem conta no MP aprova muito melhor lá; quem não tem só tem esta.
  //
  // MESMA REGRA DE PADRÃO das outras chaves de pagamento: ausente = ligado, só
  // um 'false' explícito desliga.
  const formularioNoSite = String(settings?.payment_card_form_inline ?? 'true') !== 'false'

  // ── Quais botões de cartão aparecem ────────────────────────────────────
  // A lista vem PRONTA do servidor (/settings/public): ele já removeu o
  // adquirente sem credencial, porque um botão que responde 503 depois do
  // clique é pior que botão nenhum.
  //
  // Chave ausente = API antiga ou configurações que não chegaram. Aí vale o
  // comportamento de hoje: o Mercado Pago, se o Checkout Pro estiver ligado.
  // Nunca listar o Pagar.me por suposição — seria oferecer um caminho que
  // pode não existir.
  const acquirersDisponiveis = (() => {
    const bruto = settings?.payment_card_acquirers
    if (bruto === undefined || bruto === null) return cartaoNoMercadoPago ? ['mercado_pago'] : []
    const lista = String(bruto).split(',').map((s) => s.trim()).filter(Boolean)
    // O Mercado Pago ainda depende do Checkout Pro estar ligado: no modo
    // 'bricks' o cartão é digitado aqui dentro, pelo Brick, e não há botão.
    return lista.filter((g) => g !== 'mercado_pago' || cartaoNoMercadoPago)
  })()

  // Rótulo e aparência de cada botão.
  //
  // SEM texto de apoio embaixo, por decisão de produto: a tela fica com as
  // opções juntas, lidas de uma vez. O rótulo passou a ser o único lugar onde
  // o cliente aprende para onde vai — daí ele nomear o adquirente em vez de
  // dizer só "cartão".
  //
  // A COR é do adquirente, não do app. Um botão que leva o cliente para FORA do
  // site precisa parecer com o lugar para onde ele vai — quem toca "Pagar com
  // Mercado Pago" e cai numa tela azul do Mercado Pago entende que está no
  // lugar certo. Botão na cor da Turiva levando a outro domínio é justamente o
  // que ensina o cliente a desconfiar.
  const BOTOES_CARTAO = {
    mercado_pago: {
      // Nomeia o adquirente SEMPRE, e não só quando há restrição de conta: o
      // botão leva para fora do site, e dizer para onde é a única informação
      // que sobrou depois que os textos de apoio saíram. "Pagar com cartão"
      // ficou reservado para o formulário aqui dentro — dois botões com o
      // mesmo rótulo e destinos diferentes seria o pior resultado possível.
      rotulo: 'Pagar com Mercado Pago',
      // #009EE3 é o azul institucional do Mercado Pago. Fica como valor literal
      // (e não como cor do tema) de propósito: é marca de terceiro, e mudar a
      // paleta da Turiva não pode repintar o botão deles.
      cor: '#009EE3',
      corAtiva: '#0089C7',
      texto: '#FFFFFF',
      logo: 'mercadopago.svg',
      primario: true,
    },
    pagarme: {
      rotulo: 'Pagar com cartão',
      // Neutro de propósito: fica visualmente em segundo plano quando os dois
      // aparecem, que é a hierarquia certa — e continua legível quando é o
      // único botão da tela.
      cor: '#FFFFFF',
      corAtiva: '#F3F4F6',
      texto: '#1F2937',
      borda: true,
      logo: 'pagarme.svg',
      primario: false,
    },
  }

  // ── PIX: bloco próprio ou Brick ────────────────────────────────────────
  // O Brick só continua fazendo sentido no modo 'bricks', em que ele desenha o
  // FORMULÁRIO DE CARTÃO. Com o cartão nos botões hospedados, sobrava dele uma
  // lista de uma opção só e um "Pagar" genérico — pior que o nosso bloco, e
  // impossível de pintar com a marca do Pix (quem desenha é o SDK deles).
  //
  // No modo 'bricks' nada muda: o Brick segue inteiro, cartão e PIX.
  const pixAtivo  = formasAtivas(settings).pix
  const pixProprio = acquirersDisponiveis.length > 0 && pixAtivo

  // O formulário no site só entra no fluxo NOVO (o dos botões). No modo antigo
  // ('bricks' puro) ele já é a tela inteira, e oferecê-lo como opção seria
  // desenhar o mesmo formulário duas vezes.
  //
  // Exige também que o cartão esteja ligado nas formas de pagamento: sem
  // crédito nem débito, o Brick montaria vazio.
  const formasCartao = formasAtivas(settings)
  const ofereceFormulario = acquirersDisponiveis.length > 0 && formularioNoSite
    && (formasCartao.credito || formasCartao.debito)

  // O Brick do formulário fica só com o CARTÃO: o Pix tem bloco próprio logo
  // abaixo, e oferecê-lo duas vezes na mesma tela é convite a erro.
  const settingsSoCartao = { ...settings, payment_method_pix: 'false' }

  // A conta pode ter sido criada só com telefone, e o Mercado Pago exige
  // e-mail do pagador para emitir o PIX. Quem coletava isso era o Brick — sem
  // ele, quem não tem e-mail no cadastro ficaria sem nenhum meio de pagamento.
  const precisaEmailNoPix = !user?.email

  async function pagarComPix() {
    if (enviandoPix) return
    setEnviandoPix(true)
    setErroPix('')
    try {
      // O MESMO handlePix de sempre. O servidor prefere o e-mail da conta e só
      // usa este quando ela não tem — igual ao que o Brick mandava.
      await handlePix(precisaEmailNoPix ? { payer: { email: emailPix.trim() } } : undefined)
    } catch (err) {
      // O Brick engolia o erro na sua própria caixinha. Aqui ele precisa
      // aparecer: PIX que falha em silêncio é um cliente parado numa tela que
      // não responde.
      setEnviandoPix(false)
      setErroPix(err?.message || 'Não foi possível gerar o Pix. Tente de novo.')
    }
  }

  // Havendo QUALQUER botão de cartão hospedado, o Brick fica só com o PIX. Dois
  // caminhos de cartão na mesma tela — um botão que redireciona e um formulário
  // logo abaixo — confundem, e o formulário ainda tokenizaria um cartão que
  // ninguém vai usar.
  const settingsDoBrick = acquirersDisponiveis.length > 0
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
  // Um handler para os DOIS caminhos hospedados (Mercado Pago e Pagar.me): o
  // que muda entre eles é para onde o servidor manda, não o que a tela faz.
  // Duas cópias divergiriam — e aqui divergir significa uma delas parar de
  // tratar "já estava pago" ou de mostrar o erro.
  async function pagarComCartaoHospedado(acquirer) {
    if (redirecionando) return
    setRedirecionando(acquirer)
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
        // Quem decide de verdade é o servidor: ele só aceita um adquirente que
        // esteja na lista oferecida. Isto é o PEDIDO do cliente.
        card_acquirer: acquirer,
        // `checkout_pro` só faz sentido no Mercado Pago — é o nome do produto
        // deles. Mandá-lo junto do Pagar.me faria o servidor entrar no ramo
        // errado.
        ...(acquirer === 'mercado_pago' ? { checkout_pro: true } : {}),
      })
      // A reserva já estava paga (o servidor recusou abrir outro checkout).
      // Levar para a tela de sucesso é melhor que dizer "não deu": deu, antes.
      if (result?.status === 'approved') {
        navigate('/checkout/sucesso', {
          state: { ...state, booking_id: result.booking_id, booking_code: result.booking_code },
        })
        return
      }
      if (!result?.redirect_url) throw new Error('O gateway não devolveu o link de pagamento.')
      // Sai do app. Quem volta é o link de retorno, já com o id do pagamento.
      window.location.href = result.redirect_url
    } catch (err) {
      setRedirecionando(null)
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
                {acquirersDisponiveis.length > 0 && (
                  <div className="mb-2 space-y-2">
                    {erroCartao && (
                      <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
                        <p className="text-[12px] text-red-700 leading-relaxed">{erroCartao}</p>
                      </div>
                    )}
                    {acquirersDisponiveis.map((g) => {
                      const b = BOTOES_CARTAO[g]
                      if (!b) return null
                      return (
                        <BotaoAdquirente
                          key={g}
                          estilo={b}
                          rotulo={b.rotulo}
                          carregando={redirecionando === g}
                          desabilitado={!!redirecionando}
                          /* Seta, e não a função direta: onClick passa o
                             EVENTO como primeiro argumento, e um handler que
                             espera outra coisa recebe o clique no lugar. */
                          onClick={() => pagarComCartaoHospedado(g)}
                        />
                      )
                    })}

                    {/* ── Cartão AQUI DENTRO (Bricks) ────────────────────
                        Não redireciona: abre o formulário do Mercado Pago
                        embaixo do botão, como o Pix faz. É o caminho de quem
                        não tem conta no Mercado Pago e por isso não consegue
                        usar o Checkout Pro. */}
                    {ofereceFormulario && (
                      <div>
                        <BotaoAdquirente
                          estilo={ESTILO_CARTAO_SITE}
                          rotulo="Pagar com cartão"
                          desabilitado={!!redirecionando}
                          onClick={() => setFormularioAberto((v) => !v)}
                        />
                        {formularioAberto && (
                          <div className="mt-2">
                            <PaymentBrick
                              amount={total_price}
                              publicKey={sellerKey}
                              onCard={handleCardPayment}
                              onPix={handlePix}
                              settings={settingsSoCartao}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* ── PIX ────────────────────────────────────────────────
                    Bloco PRÓPRIO, com a mesma forma dos botões de cartão.
                    Antes esta parte era o Brick do Mercado Pago, e com o
                    cartão indo para os botões acima sobrava dele só uma lista
                    de UMA opção mais um "Pagar" genérico, azul, sempre visível
                    — inclusive antes de o cliente escolher qualquer coisa.

                    Aqui a escolha vem primeiro e o botão de pagar aparece
                    depois dela. O caminho do pagamento em si NÃO mudou: é o
                    mesmo handlePix, o mesmo /intent, a mesma tela de
                    processando. Só o gatilho é nosso. */}
                {pixProprio ? (
                  <BlocoPix
                    selecionado={pixSelecionado}
                    onSelecionar={() => setPixSelecionado((v) => !v)}
                    precisaEmail={precisaEmailNoPix}
                    email={emailPix}
                    onEmail={setEmailPix}
                    erro={erroPix}
                    enviando={enviandoPix}
                    onPagar={pagarComPix}
                  />
                ) : acquirersDisponiveis.length === 0 ? (
                  /* Modo 'bricks': o Brick ainda desenha o FORMULÁRIO DE
                     CARTÃO, então continua inteiro, cartão e PIX. */
                  <PaymentBrick
                    amount={total_price}
                    publicKey={sellerKey}
                    onCard={handleCardPayment}
                    onPix={handlePix}
                    settings={settingsDoBrick}
                  />
                ) : null /* cartão hospedado e PIX desligado: só os botões acima */}
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
