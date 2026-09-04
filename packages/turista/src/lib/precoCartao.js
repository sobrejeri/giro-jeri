// Preço "a partir de" mostrado no cartão do passeio.
//
// UMA regra, um arquivo. Ela já existiu em quatro cópias — Tours, Home,
// HomeDesktop e ToursDesktop — e as quatro divergiram: no celular o cartão
// mostrava o menor preço da frota, e no PC o mesmo passeio só privativo
// aparecia como "Consultar preços", sem valor nenhum. Quem abria os dois via
// coisas diferentes do mesmo serviço.
//
// A regra:
//   • compartilhado ativo  → o preço POR PESSOA, que é a entrada por 1 pessoa;
//   • só privativo         → `from_price`, o menor preço da frota, calculado
//                            pela API como o menor base_price entre as regras
//                            ativas do passeio.
//
// NUNCA inventa valor: sem nenhum dos dois devolve null, e cada tela decide o
// que dizer. Mostrar zero seria pior — o cliente leria como grátis.

/**
 * @returns {null | { valor: number, porPessoa: boolean }}
 */
export function precoDeEntrada(tour) {
  if (!tour) return null

  const porPessoa = Number(tour.shared_price_per_person) || 0
  if (tour.is_shared_enabled && porPessoa > 0) {
    return { valor: porPessoa, porPessoa: true }
  }

  const daFrota = Number(tour.from_price) || 0
  if (daFrota > 0) return { valor: daFrota, porPessoa: false }

  // Preço por pessoa cadastrado sem a flag ligada: cadastro pela metade, e
  // mostrar o valor é melhor que deixar o cartão mudo.
  if (porPessoa > 0) return { valor: porPessoa, porPessoa: true }

  return null
}
