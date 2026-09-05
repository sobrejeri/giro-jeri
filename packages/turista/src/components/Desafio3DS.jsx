import { useEffect, useRef } from 'react'
import { ShieldCheck } from 'lucide-react'

// ── Desafio 3-D Secure ───────────────────────────────────────────────────────
// A tela do BANCO do cliente, dentro do nosso app.
//
// No Brasil o Mercado Pago exige autenticação do emissor no cartão de DÉBITO.
// O pagamento nasce pendente com um endereço de desafio; o cliente confirma no
// banco (senha, app, SMS) e só então o pagamento é aprovado. Sem esta etapa o
// débito simplesmente não funciona — era o que acontecia aqui.
//
// Por que um formulário e não um `src` no iframe: o emissor espera um POST com
// o `creq` (challenge request) que o Mercado Pago devolveu. Não dá para abrir
// por URL. Então montamos um form de verdade apontando para o iframe e o
// enviamos uma vez.
//
// Quem descobre o fim NÃO é esta tela: o emissor responde para o Mercado Pago,
// não para nós, e o iframe é de outro domínio — não temos como ler o que
// aconteceu lá dentro. Quem sabe é a consulta de status que a tela de
// processamento já faz a cada poucos segundos. Por isso aqui não há callback
// de sucesso: este componente só apresenta o desafio.

export default function Desafio3DS({ url, creq }) {
  const formRef = useRef(null)
  const enviadoRef = useRef(false)

  useEffect(() => {
    // Uma vez só. Reenviar o mesmo `creq` invalida o desafio no emissor, e o
    // cliente ficaria numa tela de erro do banco sem entender o motivo.
    if (enviadoRef.current || !url) return
    enviadoRef.current = true
    formRef.current?.submit()
  }, [url])

  if (!url) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border-b border-blue-100">
        <ShieldCheck size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-bold text-blue-900">Confirme com seu banco</p>
          <p className="text-[12px] text-blue-700/90 mt-0.5 leading-snug">
            O débito precisa da sua autenticação. Conclua abaixo — a reserva é
            confirmada sozinha assim que o banco aprovar.
          </p>
        </div>
      </div>

      {/* target aponta para o iframe pelo NOME, que é o que o navegador usa. */}
      <form ref={formRef} action={url} method="POST" target="desafio3ds" className="hidden">
        {creq && <input type="hidden" name="creq" value={creq} />}
      </form>

      <iframe
        name="desafio3ds"
        title="Autenticação do banco"
        className="w-full h-[460px] border-0"
      />
    </div>
  )
}
