// Passeio ou rota SOB COTAÇÃO (migração 128 no banco).
//
// O admin escolhe, no cadastro, entre "valor fixo" e "sob cotação". Sob
// cotação o item fica na vitrine SEM preço e o toque não leva ao carrinho: cai
// direto no fluxo de cotação que já existe, com os dados preenchidos —
//   • passeio → "Montar meu passeio" com as paradas do roteiro e a etiqueta do
//     passeio (a cooperativa sabe de qual passeio é o pedido);
//   • rota    → translado personalizado com origem e destino da rota.
// O servidor também recusa reservar esses itens pelo valor fixo.

export const ehSobCotacao = (item) => item?.quote_only === true

// Tela de cotação do passeio, já com o passeio escolhido.
export const linkCotacaoDoPasseio = (tour) =>
  `/passeio-personalizado?passeio=${encodeURIComponent(tour.id)}`
