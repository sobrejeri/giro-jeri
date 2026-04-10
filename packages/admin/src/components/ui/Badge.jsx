const styles = {
  draft:           'bg-gray-700 text-gray-300',
  awaiting_payment:'bg-amber-900/40 text-amber-400',
  paid:            'bg-green-900/40 text-green-400',
  payment_failed:  'bg-red-900/40 text-red-400',
  cancelled:       'bg-gray-700 text-gray-400',
  refunded:        'bg-purple-900/40 text-purple-400',
  new:              'bg-blue-900/40 text-blue-400',
  awaiting_dispatch:'bg-amber-900/40 text-amber-400',
  confirmed:        'bg-teal-900/40 text-teal-400',
  assigned:         'bg-indigo-900/40 text-indigo-400',
  en_route:         'bg-orange-900/40 text-orange-400',
  in_progress:      'bg-brand/20 text-brand',
  completed:        'bg-green-900/40 text-green-400',
  occurrence:       'bg-red-900/40 text-red-400',
  pending_quote:    'bg-amber-900/40 text-amber-400',
  quoted:           'bg-blue-900/40 text-blue-400',
  accepted:         'bg-teal-900/40 text-teal-400',
  expired:          'bg-gray-700 text-gray-400',
  rejected:         'bg-red-900/40 text-red-400',
  tour:             'bg-purple-900/40 text-purple-400',
  transfer:         'bg-sky-900/40 text-sky-400',
  tourist:          'bg-green-900/40 text-green-400',
  operator:         'bg-indigo-900/40 text-indigo-400',
  admin:            'bg-red-900/40 text-red-400',
  agency:           'bg-purple-900/40 text-purple-400',
  finance:          'bg-teal-900/40 text-teal-400',
  affiliate:        'bg-orange-900/40 text-orange-400',
  // booleanos
  true:             'bg-green-900/40 text-green-400',
  false:            'bg-gray-700 text-gray-400',
}

const labels = {
  draft: 'Rascunho', awaiting_payment: 'Ag. Pagamento', paid: 'Pago',
  payment_failed: 'Falha Pgto', cancelled: 'Cancelado', refunded: 'Reembolsado',
  new: 'Novo', awaiting_dispatch: 'Ag. Despacho', confirmed: 'Confirmado',
  assigned: 'Atribuído', en_route: 'A Caminho', in_progress: 'Em Andamento',
  completed: 'Concluído', occurrence: 'Ocorrência',
  pending_quote: 'Ag. Cotação', quoted: 'Cotado', accepted: 'Aceito',
  expired: 'Expirado', rejected: 'Rejeitado',
  tour: 'Passeio', transfer: 'Transfer',
  tourist: 'Turista', operator: 'Operador', admin: 'Admin',
  agency: 'Agência', finance: 'Financeiro', affiliate: 'Afiliado',
  true: 'Ativo', false: 'Inativo',
}

export default function Badge({ value, className = '' }) {
  const key = String(value)
  const cls = styles[key] || 'bg-gray-700 text-gray-300'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} ${className}`}>
      {labels[key] || value}
    </span>
  )
}
