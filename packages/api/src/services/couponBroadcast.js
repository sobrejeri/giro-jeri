// ── services/couponBroadcast.js ─────────────────────────
// Divulgação de um cupom para os clientes cadastrados, por WhatsApp.
//
// Três decisões que sustentam este arquivo:
//
// 1. CADÊNCIA. O envio é sequencial, com pausa entre mensagens. Disparar
//    centenas de mensagens em paralelo é o comportamento que o WhatsApp
//    classifica como spam — o número da empresa é bloqueado e leva junto TODA
//    a operação (OTP de cadastro, aviso de reserva aceita, ordem de serviço).
//    Um disparo lento é chato; um número banido para a plataforma inteira.
//
// 2. QUEM RECEBE. Só cliente ativo, com telefone, que não pediu para sair e
//    cujo número não foi reprovado na checagem de WhatsApp. E nunca duas vezes
//    o mesmo cupom — a UNIQUE (coupon_id, user_id) no banco é a garantia real;
//    o filtro aqui só evita gastar chamada à toa.
//
// 3. EM SEGUNDO PLANO. Mil clientes a ~1,2s cada são 20 minutos. Nenhuma
//    requisição HTTP espera isso: a rota devolve o id do disparo na hora e o
//    progresso é gravado no banco, para a tela do admin acompanhar.
import { signOptOutToken } from '../lib/optOutToken.js';
import { isWhatsappEnabled, toZapiPhone } from './whatsapp.js';

const ZAPI_BASE   = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';
const TURISTA_APP = (process.env.TURISTA_APP_URL || 'https://sobrejeri.github.io/giro-jeri').replace(/\/$/, '');

// Pausa entre mensagens. Ajustável por env se o Z-API mudar os limites.
const INTERVALO_MS = Number(process.env.BROADCAST_INTERVALO_MS) || 1200;
// Teto por disparo. Protege contra um clique que geraria horas de envio.
const TETO_POR_DISPARO = Number(process.env.BROADCAST_TETO) || 500;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function descontoTexto(cupom) {
  return cupom.discount_type === 'percentage'
    ? `${Number(cupom.discount_value)}% de desconto`
    : `${fmtBRL(cupom.discount_value)} de desconto`;
}

/**
 * Texto da mensagem. Exportado porque a tela do admin mostra a MESMA prévia —
 * o dono precisa ler exatamente o que o cliente vai receber antes de disparar.
 */
export function montarMensagem(cupom, { nome } = {}) {
  const saudacao = nome ? `Oi, ${String(nome).trim().split(/\s+/)[0]}! ` : '';
  const validade = cupom.valid_until
    ? `\nVálido até ${new Date(cupom.valid_until).toLocaleDateString('pt-BR')}.`
    : '';
  const minimo = Number(cupom.min_order_amount) > 0
    ? `\nEm reservas a partir de ${fmtBRL(cupom.min_order_amount)}.`
    : '';

  return [
    `${saudacao}A Turiva preparou uma oferta para você 🌴`,
    '',
    `*${cupom.title}*`,
    cupom.description ? cupom.description : null,
    `${descontoTexto(cupom)} com o código *${cupom.code}*.${minimo}${validade}`,
  ].filter((l) => l !== null).join('\n');
}

async function enviarComBotao({ phone, message, label, url }) {
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
  const base = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}`;
  const cabecalho = { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN };

  // Botão quando a conta suporta; senão o link no corpo. Nunca deixa de entregar.
  try {
    const res = await fetch(`${base}/send-button-actions`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify({
        phone: toZapiPhone(phone),
        message,
        buttonActions: [{ id: '1', type: 'URL', url, label }],
      }),
    });
    if (res.ok) return { ok: true };
  } catch { /* cai para texto */ }

  const res = await fetch(`${base}/send-text`, {
    method: 'POST',
    headers: cabecalho,
    body: JSON.stringify({ phone: toZapiPhone(phone), message: `${message}\n\n👉 ${label}: ${url}` }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    return { ok: false, detalhe: `${res.status} ${corpo.slice(0, 200)}` };
  }
  return { ok: true };
}

/**
 * Clientes que ainda podem receber ESTE cupom.
 * Usada pela prévia (quantos vão receber) e pelo disparo — a mesma consulta nos
 * dois lugares, senão o número que o admin confirma não é o que sai.
 */
// Percorre TODAS as páginas de um select. O PostgREST devolve no máximo 1000
// linhas por consulta: sem paginar, uma base com mais de mil clientes seria
// silenciosamente cortada — e, pior, a lista de "quem já recebeu" viria
// incompleta, fazendo alguém receber a mesma oferta duas vezes.
async function lerTudo(montarConsulta, tamanho = 1000) {
  const todos = [];
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await montarConsulta().range(inicio, inicio + tamanho - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < tamanho) return todos;
  }
}

export async function destinatariosElegiveis(supabase, cupomId) {
  const usuarios = await lerTudo(() => supabase
    .from('users')
    .select('id, full_name, phone, whatsapp_valid')
    .eq('user_type', 'tourist')
    .eq('is_active', true)
    .eq('marketing_opt_out', false)
    .not('phone', 'is', null)
    .order('created_at', { ascending: true }));

  // whatsapp_valid === false significa checado e SEM WhatsApp. null = nunca
  // checado, e aí vale tentar — a maioria dos cadastros antigos está assim.
  const comWhats = usuarios.filter((u) => u.whatsapp_valid !== false && u.phone);

  const jaReceberam = await lerTudo(() => supabase
    .from('coupon_broadcast_recipients')
    .select('user_id')
    .eq('coupon_id', cupomId)
    .order('created_at', { ascending: true }));
  const enviados = new Set(jaReceberam.map((r) => r.user_id));

  return comWhats.filter((u) => !enviados.has(u.id));
}

/**
 * Dispara em segundo plano. NÃO devolve promessa do envio: quem chama responde
 * ao HTTP na hora e o progresso vai para `coupon_broadcasts`.
 */
export function dispararEmSegundoPlano(supabase, { broadcastId, cupom, destinatarios }) {
  (async () => {
    let enviados = 0;
    let falhas   = 0;

    for (const usuario of destinatarios.slice(0, TETO_POR_DISPARO)) {
      // RESERVA a vaga no banco ANTES de enviar. A UNIQUE (coupon_id, user_id)
      // é a única garantia real de que ninguém recebe a mesma oferta duas
      // vezes — a lista em memória pode estar desatualizada (outro disparo,
      // processo reiniciado no meio, base grande). Reservar depois do envio
      // deixaria a mensagem sair antes de o banco poder recusar.
      const { data: reserva, error: errReserva } = await supabase
        .from('coupon_broadcast_recipients')
        .insert({
          broadcast_id: broadcastId,
          coupon_id:    cupom.id,
          user_id:      usuario.id,
          phone:        usuario.phone,
          status:       'sent',
        })
        .select('id').single();

      if (errReserva) {
        // 23505 = já recebeu este cupom. Não é erro: é a proteção funcionando.
        if (errReserva.code !== '23505') {
          console.error('[broadcast] reserva falhou:', errReserva.message);
          falhas++;
        }
        continue;
      }

      const mensagem = montarMensagem(cupom, { nome: usuario.full_name });
      const linkSair = `${TURISTA_APP}/nao-quero-ofertas/${signOptOutToken(usuario.id)}`;
      const corpo    = `${mensagem}\n\n_Não quer mais ofertas? ${linkSair}_`;

      const r = await enviarComBotao({
        phone:   usuario.phone,
        message: corpo,
        label:   'Quero a oferta',
        url:     `${TURISTA_APP}/oferta/${encodeURIComponent(cupom.code)}`,
      });

      if (r.ok) enviados++; else falhas++;

      // A vaga já está reservada; aqui só corrige o desfecho quando falhou.
      if (!r.ok) {
        await supabase.from('coupon_broadcast_recipients')
          .update({ status: 'failed', error_text: String(r.detalhe || '').slice(0, 500) })
          .eq('id', reserva.id);
      }

      await supabase.from('notifications').insert({
        user_id:      usuario.id,
        channel:      'whatsapp',
        template_key: 'coupon_broadcast',
        title:        cupom.title,
        message_body: corpo,
        destination:  usuario.phone,
        send_status:  r.ok ? 'sent' : 'failed',
        sent_at:      r.ok ? new Date().toISOString() : null,
      });

      await supabase.from('coupon_broadcasts')
        .update({ sent_count: enviados, failed_count: falhas })
        .eq('id', broadcastId);

      await dormir(INTERVALO_MS);
    }

    await supabase.from('coupon_broadcasts').update({
      status:       'done',
      sent_count:   enviados,
      failed_count: falhas,
      finished_at:  new Date().toISOString(),
    }).eq('id', broadcastId);
  })().catch(async (err) => {
    console.error('[broadcast] disparo falhou:', err.message);
    await supabase.from('coupon_broadcasts').update({
      status:      'failed',
      error_text:  String(err.message).slice(0, 500),
      finished_at: new Date().toISOString(),
    }).eq('id', broadcastId);
  });
}

export { isWhatsappEnabled, TETO_POR_DISPARO };
