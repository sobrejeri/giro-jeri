// ── Formas de pagamento oferecidas no checkout ──────────────────────────────
// Lê as chaves de configuração do admin e devolve o que o Payment Brick do
// Mercado Pago deve mostrar.
//
// Duas regras que existem para o cliente NUNCA ficar sem conseguir pagar:
//
//  1. Configuração ausente = tudo ligado. Numa instalação que ainda não abriu
//     essa tela no admin, o checkout tem de seguir funcionando como sempre
//     funcionou — e não sumir com as formas de pagamento.
//  2. Tudo desligado = volta para PIX. Se alguém desmarcar as três opções por
//     engano, o pior resultado possível é uma tela de pagamento vazia, com o
//     cliente pronto para pagar e sem como. PIX é o mínimo garantido.

const ligado = (v) => v === undefined || v === null || v === '' ? true : String(v) === 'true';

export function formasAtivas(settings) {
  const s = settings || {};
  const escolhido = {
    pix:    ligado(s.payment_method_pix),
    credito: ligado(s.payment_method_credit),
    debito:  ligado(s.payment_method_debit),
  };

  // Rede de segurança da regra 2.
  if (!escolhido.pix && !escolhido.credito && !escolhido.debito) {
    return { pix: true, credito: false, debito: false, forcado: true };
  }
  return { ...escolhido, forcado: false };
}

export function maxParcelas(settings) {
  const n = Number(settings?.payment_max_installments);
  if (!Number.isFinite(n) || n < 1) return 12;   // padrão do Mercado Pago
  return Math.min(Math.trunc(n), 12);            // o MP não aceita mais que 12
}

/**
 * Monta o `customization.paymentMethods` do Payment Brick.
 *
 * Método desligado é OMITIDO do objeto — é assim que o Brick esconde uma forma
 * de pagamento. Passar lista vazia não desliga, e chegou a exibir tudo.
 */
export function paymentMethodsDoBrick(settings) {
  const f = formasAtivas(settings);
  const out = {};
  if (f.credito) out.creditCard   = 'all';
  if (f.debito)  out.debitCard    = 'all';
  if (f.pix)     out.bankTransfer = ['pix'];
  if (f.credito) out.maxInstallments = maxParcelas(settings);
  return out;
}
