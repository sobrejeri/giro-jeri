// Passeio com ponto de embarque FIXO (migração 124): tem as duas coordenadas.
// Mesma regra do servidor (payments.js) e do rascunho do carrinho.
export const temEmbarqueFixo = (tour) =>
  !!tour && tour.meeting_latitude != null && tour.meeting_longitude != null
