// ── ConfirmarExecutor ───────────────────────────────────
// Ao concluir a corrida, a cooperativa confirma QUEM de fato executou — com
// documento e chave PIX. É o que a tela de repasses do admin mostra para saber
// a quem pagar (migrations 079/080/081).
//
// Vem pré-preenchido com o despacho: no caso comum quem rodou é quem foi
// escalado, e a ação é um toque em "Confirmar e concluir". O formulário existe
// para o caso em que trocaram o motorista na hora — que é justamente quando o
// repasse iria para a pessoa errada.
//
// Concluir SEM confirmar continua possível de propósito: a corrida já aconteceu
// e travar o encerramento por falta de uma chave PIX deixaria a reserva presa
// em "em andamento" — pior para todo mundo que um repasse pendente.

import { useEffect, useState } from 'react'
import { CheckCircle2, UserCheck } from 'lucide-react'
import Modal from './ui/Modal'
import Input, { Select } from './ui/Input'
import Button from './ui/Button'

export const TIPOS_PIX = [
  { value: '',           label: 'Tipo da chave' },
  { value: 'cpf',        label: 'CPF' },
  { value: 'cnpj',       label: 'CNPJ' },
  { value: 'email',      label: 'E-mail' },
  { value: 'phone',      label: 'Telefone' },
  { value: 'random_key', label: 'Chave aleatória' },
]

const VAZIO = { name: '', phone: '', document: '', pix_key: '', pix_key_type: '' }

export default function ConfirmarExecutor({ booking, executores = [], onCancel, onConfirm, isSending }) {
  const [form, setForm] = useState(VAZIO)

  // Recarrega a cada corrida aberta — sem isto o formulário manteria os dados
  // da corrida anterior e a cooperativa confirmaria o motorista errado.
  useEffect(() => {
    const a = booking?.operational_assignments?.[0]
    setForm({
      name:         a?.driver_name         || '',
      phone:        a?.driver_phone        || '',
      document:     a?.driver_document     || '',
      pix_key:      a?.driver_pix_key      || '',
      pix_key_type: a?.driver_pix_key_type || '',
    })
  }, [booking?.id])

  function usar(ex) {
    setForm({
      name:         ex.name         || '',
      phone:        ex.phone        || '',
      document:     ex.document     || '',
      pix_key:      ex.pix_key      || '',
      pix_key_type: ex.pix_key_type || '',
    })
  }

  const temNome = !!form.name.trim()
  const semPix  = temNome && !form.pix_key.trim()

  return (
    <Modal open={!!booking} onClose={onCancel} title="Quem executou esta corrida?" size="md">
      <div className="space-y-4">
        <p className="text-[13px] text-gray-600">
          Confira quem foi a campo. É por aqui que o pagamento chega até a pessoa.
        </p>

        {executores.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">Quem já rodou com vocês</p>
            <div className="flex flex-wrap gap-1.5">
              {executores.map((ex) => (
                <button
                  key={ex.name} type="button" onClick={() => usar(ex)}
                  className={`px-2.5 py-1 rounded-full text-[12px] border transition-colors ${
                    form.name === ex.name
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand hover:text-brand'
                  }`}
                >
                  {ex.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Input label="Nome de quem executou" placeholder="Ex: João da Silva"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="WhatsApp" placeholder="(88) 99999-9999"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="CPF / CNPJ" placeholder="000.000.000-00"
            value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
        </div>
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Input label="Chave PIX" placeholder="chave para receber"
            value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
          <Select label="Tipo" value={form.pix_key_type}
            onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })}>
            {TIPOS_PIX.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>

        {semPix && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Sem chave PIX o repasse fica pendente até alguém informar a chave.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => onConfirm(temNome ? form : null)} disabled={isSending} className="w-full">
            {isSending
              ? 'Concluindo…'
              : <span className="flex items-center justify-center gap-2">
                  <UserCheck size={16} /> Confirmar e concluir
                </span>}
          </Button>
          {/* Escape hatch: quem não tem os dados em mãos ainda encerra a corrida. */}
          <button
            type="button" onClick={() => onConfirm(null)} disabled={isSending}
            className="text-[12px] text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Concluir sem informar agora
            </span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
