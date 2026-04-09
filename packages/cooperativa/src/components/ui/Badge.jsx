const styles = {
  // comercial
  draft:           'bg-gray-100 text-gray-600',
  awaiting_payment:'bg-amber-100 text-amber-700',
  paid:            'bg-green-100 text-green-700',
  payment_failed:  'bg-red-100 text-red-700',
  cancelled:       'bg-gray-100 text-gray-500',
  refunded:        'bg-purple-100 text-purple-700',
  // operacional
  new:              'bg-blue-100 text-blue-700',
  awaiting_dispatch:'bg-amber-100 text-amber-700',
  confirmed:        'bg-teal-100 text-teal-700',
  assigned:         'bg-indigo-100 text-indigo-700',
  en_route:         'bg-orange-100 text-orange-700',
  in_progress:      'bg-brand/10 text-brand',
  completed:        'bg-green-100 text-green-700',
  occurrence:       'bg-red-100 text-red-700',
  // cotação
  pending_quote:    'bg-amber-100 text-amber-700',
  quoted:           'bg-blue-100 text-blue-700',
  accepted:         'bg-teal-100 text-teal-700',
  expired:          'bg-gray-100 text-gray-500',
  rejected:         'bg-red-100 text-red-700',
  // serviço
  tour:             'bg-purple-100 text-purple-700',
  transfer:         'bg-sky-100 text-sky-700',
  // tipo de usuário
  tourist:          'bg-green-100 text-green-700',
  operator:         'bg-indigo-100 text-indigo-700',
  admin:            'bg-red-100 text-red-700',
  agency:           'bg-purple-100 text-purple-700',
  finance:          'bg-teal-100 text-teal-700',
  affiliate:        'bg-orange-100 text-orange-700',
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
}

export default function Badge({ value, className = '' }) {
  const cls = styles[value] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} ${className}`}>
      {labels[value] || value}
    </span>
  )
}
