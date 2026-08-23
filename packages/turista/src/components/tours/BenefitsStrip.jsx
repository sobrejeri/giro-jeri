// Faixa de confiança no rodapé da lista.
//
// Três colunas iguais, com o ícone ACIMA do texto e não ao lado: lado a lado,
// numa tela de 360px sobram ~90pt por coluna e "Cancelamento flexível" quebra
// em quatro linhas. Empilhado cabe em duas.
export default function BenefitsStrip({ itens = [] }) {
  return (
    <div className="bg-white/70 rounded-[22px] px-2 py-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-3 gap-1">
        {itens.map(({ icon: Icon, titulo, texto }) => (
          <div key={titulo} className="flex flex-col items-center text-center gap-1.5 px-1">
            <Icon size={18} className="text-brand" strokeWidth={2.2} />
            <div>
              <p className="text-[10.5px] font-bold text-gray-800 leading-tight">{titulo}</p>
              <p className="text-[9.5px] text-gray-500 leading-tight mt-0.5">{texto}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
