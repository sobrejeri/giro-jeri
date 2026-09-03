// ── fleet.js ────────────────────────────────────────────
// Elegibilidade de operadores por FROTA.
//
// DOIS MODELOS, por veículo (coluna vehicles.requires_opt_in, migration 066):
//   • opt-out (padrão, requires_opt_in=false): a coop recebe a solicitação a
//     menos que tenha DESATIVADO o veículo (preferência is_active=false).
//     Serve para veículo comum — buggy, 4x4 — que quase todas operam.
//   • opt-in (requires_opt_in=true): a coop só recebe se tiver ATIVADO o
//     veículo explicitamente (is_active=true). Serve para veículo especial —
//     helicóptero — que quase nenhuma opera.
//
// Fail-open em erro/ausência de dados para o modelo opt-out (nunca deixa de
// notificar por engano). O opt-in NÃO é fail-open: sem opt-in explícito, não
// recebe — é justamente o ponto do recurso.

// Veículos EXIGIDOS por cada reserva.
// Ordem de resolução:
//   1. booking_vehicles (reserva privativa: o cliente escolheu os veículos);
//   2. se não houver nenhum — caso do COMPARTILHADO, que não gera
//      booking_vehicles —, cai nas regras de preço do serviço
//      (vehicle_pricing_rules), que é onde mora "quais veículos fazem este
//      passeio". Sem esse passo, um voo compartilhado ficava "sem veículo" e
//      escapava do filtro, indo para todas os operadores.
// Retorna Map<bookingId, string[] vehicleIds>.
export async function requiredVehiclesByBooking(supabase, bookings) {
  const result = new Map();
  const list = (bookings || []).filter((b) => b?.id);
  if (list.length === 0) return result;

  const ids = list.map((b) => b.id);
  const { data: bvs } = await supabase
    .from('booking_vehicles')
    .select('booking_id, vehicle_id')
    .in('booking_id', ids);

  for (const row of bvs || []) {
    if (!row.vehicle_id) continue;
    if (!result.has(row.booking_id)) result.set(row.booking_id, new Set());
    result.get(row.booking_id).add(row.vehicle_id);
  }

  // Reservas sem booking_vehicles → resolve pelos veículos que atendem o serviço.
  const semVeiculo = list.filter((b) => !result.has(b.id) && b.service_id);
  if (semVeiculo.length > 0) {
    const serviceIds = [...new Set(semVeiculo.map((b) => b.service_id))];
    const { data: rules } = await supabase
      .from('vehicle_pricing_rules')
      .select('service_id, vehicle_id')
      .eq('is_active', true)
      .in('service_id', serviceIds);

    const byService = new Map();
    for (const r of rules || []) {
      if (!r.vehicle_id) continue;
      if (!byService.has(r.service_id)) byService.set(r.service_id, new Set());
      byService.get(r.service_id).add(r.vehicle_id);
    }
    for (const b of semVeiculo) {
      const vs = byService.get(b.service_id);
      if (vs?.size) result.set(b.id, vs);
    }
  }

  // Set → array
  return new Map([...result].map(([k, v]) => [k, [...v]]));
}

// Dos veículos informados, quais são RESTRITOS (opt-in). Tolera a coluna
// ausente (migration 066 pendente) devolvendo conjunto vazio — aí tudo volta a
// se comportar como o modelo opt-out de antes.
export async function optInVehicleIds(supabase, vehicleIds) {
  const ids = [...new Set((vehicleIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('vehicles')
    .select('id')
    .eq('requires_opt_in', true)
    .in('id', ids);
  if (error) {
    if (error.code !== '42703') {
      console.error('[fleet] leitura de requires_opt_in falhou:', error.message);
    }
    return new Set();
  }
  return new Set((data || []).map((v) => v.id));
}

// ── MODAL (migrations 075/076) ──────────────────────────
// Segundo eixo do roteamento, e o mais simples de operar: em vez de ligar
// veículo a veículo, o admin diz que o operador opera terrestre, aéreo,
// aquático… A solicitação só chega a quem opera o modal dela.
//
// Opt-out, igual ao de veículo: sem linha, o operador recebe. Assim ligar o
// recurso não cala ninguém — só quem for desmarcado deixa de receber.

// Modal de cada veículo, já no id de `service_modals` — que é o que a
// preferência guarda em `entity_id`. Map<vehicleId, modalId>.
//
// Vem do VEÍCULO (e não da categoria do serviço) de propósito: é o veículo que
// o operador opera, e ele já está resolvido aqui para o filtro antigo.
export async function modalIdByVehicle(supabase, vehicleIds) {
  const out = new Map();
  const ids = [...new Set((vehicleIds || []).filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const { data: veics, error } = await supabase
      .from('vehicles').select('id, modal').in('id', ids);
    if (error) throw error;
    const slugs = [...new Set((veics || []).map((v) => v.modal).filter(Boolean))];
    if (slugs.length === 0) return out;

    const { data: modais, error: e2 } = await supabase
      .from('service_modals').select('id, slug').in('slug', slugs);
    if (e2) throw e2;
    const idPorSlug = new Map((modais || []).map((m) => [m.slug, m.id]));
    for (const v of veics || []) {
      const mId = idPorSlug.get(v.modal);
      if (mId) out.set(v.id, mId);
    }
    return out;
  } catch (err) {
    // 073/075 pendentes, ou qualquer falha: sem modal, ninguém é filtrado por
    // ele. Fail-open — nunca deixar de notificar por causa deste filtro.
    if (err?.code !== '42703' && err?.code !== '42P01') {
      console.error('[fleet] leitura de modal falhou:', err?.message);
    }
    return new Map();
  }
}

// Modais exigidos por um conjunto de veículos. Set<modalId>.
export function modalIdsOf(vehicleIds, modalPorVeiculo) {
  const out = new Set();
  for (const vId of vehicleIds || []) {
    const mId = modalPorVeiculo.get(vId);
    if (mId) out.add(mId);
  }
  return out;
}

// Modais que cada operador DESATIVOU. Map<opId, Set<modalId>>.
export async function modalPrefs(supabase, modalIds, operatorIds) {
  const disabled = new Map();
  const ids = [...new Set((modalIds || []).filter(Boolean))];
  if (ids.length === 0) return disabled;

  let q = supabase
    .from('operator_service_preferences')
    .select('operator_id, entity_id, is_active')
    .eq('entity_type', 'modal')
    .in('entity_id', ids);
  if (operatorIds?.length) q = q.in('operator_id', operatorIds);

  const { data, error } = await q;
  if (error) {
    console.error('[fleet] leitura de preferências de modal falhou:', error.message);
    return disabled;   // fail-open
  }
  for (const p of data || []) {
    if (p.is_active !== false) continue;
    if (!disabled.has(p.operator_id)) disabled.set(p.operator_id, new Set());
    disabled.get(p.operator_id).add(p.entity_id);
  }
  return disabled;
}

// COMBO: reserva que exige veículos de modais DIFERENTES (buggy + barco).
//
// O combo vai INTEIRO para UM operador — a "universal", que opera os dois
// meios e aceita fechar o pedido combinado (migration 077). Um operador,
// um recebedor: o split de recebedor único já funciona, e não é preciso ligar o
// motor de pernas nem liberar o split entre 2+ operadores.
//
// Os dois perfis saem do que já está cadastrado:
//   • categoria única → opera um modal só; nunca casa com um combo, porque não
//     executaria a outra metade;
//   • universal → opera todos os modais do combo E tem accepts_combos.
export function ehCombo(modalIds) {
  return !!modalIds && modalIds.size > 1;
}

// O operador opera TODOS os modais que a reserva exige?
// `aceitaCombo` é consultado só quando a reserva É um combo — serviço de modal
// único chega normalmente a quem não aceita combo.
export function operatorServesModals(opId, modalIds, disabledByOp, aceitaCombo = null) {
  if (!modalIds || modalIds.size === 0) return true;   // sem modal → fail-open
  if (ehCombo(modalIds) && aceitaCombo && aceitaCombo.get(opId) === false) return false;
  const dis = disabledByOp.get(opId);
  if (!dis) return true;
  for (const mId of modalIds) if (dis.has(mId)) return false;
  return true;
}

// accepts_combos de cada operador. Map<opId, boolean>.
// Ausência da coluna (077 pendente) devolve mapa vazio → ninguém é barrado por
// ela, e o combo volta a depender só dos modais operados.
export async function comboPrefs(supabase, operatorIds) {
  const out = new Map();
  const ids = [...new Set((operatorIds || []).filter(Boolean))];
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('users').select('id, accepts_combos').in('id', ids);
  if (error) {
    if (error.code !== '42703') {
      console.error('[fleet] leitura de accepts_combos falhou:', error.message);
    }
    return out;
  }
  for (const u of data || []) out.set(u.id, u.accepts_combos !== false);
  return out;
}

// Preferências de veículo de um conjunto de operadores.
// Retorna { disabled: Map<opId, Set<vehicleId>>, enabled: Map<opId, Set<vehicleId>> }.
export async function vehiclePrefs(supabase, vehicleIds, operatorIds) {
  const disabled = new Map();
  const enabled  = new Map();
  const ids = [...new Set((vehicleIds || []).filter(Boolean))];
  if (ids.length === 0) return { disabled, enabled };

  let q = supabase
    .from('operator_service_preferences')
    .select('operator_id, entity_id, is_active')
    .eq('entity_type', 'vehicle')
    .in('entity_id', ids);
  if (operatorIds?.length) q = q.in('operator_id', operatorIds);

  const { data, error } = await q;
  if (error) {
    console.error('[fleet] leitura de preferências falhou:', error.message);
    return { disabled, enabled };
  }
  for (const p of data || []) {
    const target = p.is_active ? enabled : disabled;
    if (!target.has(p.operator_id)) target.set(p.operator_id, new Set());
    target.get(p.operator_id).add(p.entity_id);
  }
  return { disabled, enabled };
}

// O operador `opId` atende uma reserva que exige `vehicleIds`?
// Regra por veículo: restrito → precisa de opt-in explícito; comum → basta não
// ter desativado. Precisa valer para TODOS os veículos da reserva.
//
// `combo` afrouxa o OPT-IN, e só ele. Decisão do dono: serviço aéreo avulso vai
// para o operador que voa (Frisonfly); combo que INCLUI aéreo vai para o
// operador universal, que fecha o pedido inteiro e subcontrata o trecho.
//
// Sem essa distinção a regra do dono era inexprimível: o opt-in do helicóptero
// bloquearia o universal no combo, a lista sairia vazia e o pedido cairia na
// rede de segurança — indo para TODAS os operadores, o contrário do que se
// queria. Dar opt-in ao universal também não serve: ele passaria a receber os
// voos avulsos.
//
// Não é um buraco: no combo quem faz o corte é o MODAL. Só chega ali quem o
// admin marcou como operando TODOS os meios do pedido e como aceitando combo
// (`operatorServesModals`). Um operador só de buggy não opera aéreo e
// continua fora. O que se dispensa é o opt-in POR VEÍCULO, que existe para o
// avulso e continua valendo lá.
export function operatorServesVehicles(opId, vehicleIds, optIn, prefs, combo = false) {
  if (!vehicleIds || vehicleIds.length === 0) return true; // sem veículo → fail-open
  const dis = prefs.disabled.get(opId);
  const ena = prefs.enabled.get(opId);
  return vehicleIds.every((vId) =>
    (optIn.has(vId) && !combo) ? !!ena?.has(vId) : !dis?.has(vId));
}

// Operadores que atendem um MODAL, sem passar por reserva nenhuma.
//
// Serve para a COTAÇÃO de translado personalizado: ela nasce sem veículo — o
// cliente só diz de onde, para onde e quando —, então não há o que filtrar por
// veículo. Sem isso a cotação era disparada para TODAS os operadores ativos,
// e a que só opera helicóptero recebia pedido de translado de rua.
//
// Fail-open em qualquer erro: notificar demais é melhor do que a cotação não
// chegar a ninguém e o cliente ficar sem resposta.
export async function eligibleOperatorsForModal(supabase, modalSlug) {
  const { data: ops } = await supabase
    .from('users')
    .select('id, phone')
    .eq('user_type', 'operator')
    .eq('is_active', true);
  const operators = ops || [];
  if (!modalSlug || operators.length === 0) return operators;

  try {
    const { data: modal, error } = await supabase
      .from('service_modals').select('id').eq('slug', modalSlug).maybeSingle();
    if (error) throw error;
    if (!modal?.id) return operators;   // 075 pendente ou modal inexistente

    const desativados = await modalPrefs(supabase, [modal.id], operators.map((o) => o.id));
    const filtrados = operators.filter((op) => !desativados.get(op.id)?.has(modal.id));
    if (filtrados.length === 0) {
      console.warn('[fleet] nenhum operador opera o modal %s — notificando todas', modalSlug);
      return operators;
    }
    return filtrados;
  } catch (err) {
    console.error('[fleet] elegibilidade por modal falhou, notificando todas:', err?.message);
    return operators;
  }
}

// Operadores ativos ELEGÍVEIS para uma reserva. Retorna [{ id, phone }].
export async function eligibleOperatorsForBooking(supabase, bookingId) {
  const { data: ops } = await supabase
    .from('users')
    .select('id, phone')
    .eq('user_type', 'operator')
    .eq('is_active', true);
  const operators = ops || [];
  if (!bookingId || operators.length === 0) return operators;

  try {
    const { data: bk } = await supabase
      .from('bookings').select('id, service_id').eq('id', bookingId).maybeSingle();
    if (!bk) return operators;

    const byBooking  = await requiredVehiclesByBooking(supabase, [bk]);
    const vehicleIds = byBooking.get(bookingId) || [];
    if (vehicleIds.length === 0) return operators; // fail-open

    const opIds = operators.map((o) => o.id);
    const [optIn, prefs, modalPorVeiculo] = await Promise.all([
      optInVehicleIds(supabase, vehicleIds),
      vehiclePrefs(supabase, vehicleIds, opIds),
      modalIdByVehicle(supabase, vehicleIds),
    ]);
    const modalIds = modalIdsOf(vehicleIds, modalPorVeiculo);
    const combo = ehCombo(modalIds);
    const [modaisDesativados, aceitaCombo] = await Promise.all([
      modalPrefs(supabase, [...modalIds], opIds),
      combo ? comboPrefs(supabase, opIds) : Promise.resolve(new Map()),
    ]);

    // Os dois filtros valem JUNTOS: opera o modal E não desativou o veículo.
    // O modal é o corte grosso (quem faz aéreo x terrestre); o veículo segue
    // para o ajuste fino dentro do mesmo modal.
    const elegiveis = operators.filter((op) =>
      operatorServesModals(op.id, modalIds, modaisDesativados, aceitaCombo)
      && operatorServesVehicles(op.id, vehicleIds, optIn, prefs, combo));

    // REDE DE SEGURANÇA. Lista vazia = ninguém recebe WhatsApp
    // (`notifyOperatorsNewBooking` faz skipped), e o pedido fica parado em
    // silêncio até alguém reparar. Isso é pior do que avisar demais.
    // Acontece de verdade num combo sem operador universal que cubra
    // aqueles meios — cadastro incompleto, não regra de negócio.
    if (elegiveis.length === 0) {
      console.warn('[fleet] reserva %s%s sem NENHUM operador elegível — notificando todas. '
        + 'Confira os meios operados e quem aceita combo no admin.',
        bookingId, combo ? ` (COMBO, ${modalIds.size} modais)` : '');
      return operators;
    }
    return elegiveis;
  } catch (err) {
    console.error('[fleet] elegibilidade falhou, notificando todos:', err?.message);
    return operators; // fail-open
  }
}

// ── Por que esta solicitação foi para estes operadores? ──────────────────────
// Devolve a MESMA decisão de `eligibleOperatorsForBooking`, mas explicada:
// quais veículos o serviço exige, em que meios eles caem, e para cada operador
// se recebeu ou não — com o motivo.
//
// Existe porque "a notificação está indo para todo mundo" é impossível de
// confirmar ou desmentir olhando a tela: o filtro roda no servidor e não deixa
// rastro. Sem isto, a discussão vira palpite dos dois lados.
//
// Usa as mesmas funções do caminho real. Se um dia divergirem, esta tela mente
// — por isso ela chama as funções, em vez de reimplementar a regra.
export async function explicarRoteamento(supabase, bookingId) {
  const { data: ops } = await supabase
    .from('users').select('id, full_name')
    .eq('user_type', 'operator').eq('is_active', true);
  const operators = ops || [];

  const { data: bk } = await supabase
    .from('bookings').select('id, service_id, service_type').eq('id', bookingId).maybeSingle();
  if (!bk) return { erro: 'Reserva não encontrada' };

  const byBooking  = await requiredVehiclesByBooking(supabase, [bk]);
  const vehicleIds = byBooking.get(bookingId) || [];

  // Sem veículo identificado o filtro abre para todos, de propósito: é melhor
  // avisar demais que deixar o pedido parado. Precisa aparecer na tela.
  if (vehicleIds.length === 0) {
    return {
      motivo_geral: 'sem_veiculo',
      explicacao: 'Não foi possível identificar o veículo deste serviço, então a '
                + 'solicitação foi para TODOS os operadores. Costuma ser preço de '
                + 'veículo não cadastrado para este passeio no Motor de Preços.',
      veiculos: [], modais: [], combo: false,
      operadores: operators.map((o) => ({ id: o.id, nome: o.full_name, recebeu: true, motivo: 'filtro não pôde ser aplicado' })),
    };
  }

  const opIds = operators.map((o) => o.id);
  const [optIn, prefs, modalPorVeiculo, nomesVeic] = await Promise.all([
    optInVehicleIds(supabase, vehicleIds),
    vehiclePrefs(supabase, vehicleIds, opIds),
    modalIdByVehicle(supabase, vehicleIds),
    supabase.from('vehicles').select('id, name, modal').in('id', vehicleIds),
  ]);
  const modalIds = modalIdsOf(vehicleIds, modalPorVeiculo);
  const combo    = ehCombo(modalIds);
  const [modaisDesativados, aceitaCombo] = await Promise.all([
    modalPrefs(supabase, [...modalIds], opIds),
    combo ? comboPrefs(supabase, opIds) : Promise.resolve(new Map()),
  ]);

  const operadores = operators.map((o) => {
    const serveModal   = operatorServesModals(o.id, modalIds, modaisDesativados, aceitaCombo);
    const serveVeiculo = operatorServesVehicles(o.id, vehicleIds, optIn, prefs, combo);
    let motivo;
    if (serveModal && serveVeiculo)   motivo = 'opera o meio e o veículo';
    else if (!serveModal && combo && aceitaCombo.get(o.id) === false) motivo = 'não aceita pedidos combinados';
    else if (!serveModal)             motivo = 'não opera este meio';
    else                              motivo = 'veículo desativado para este operador';
    return { id: o.id, nome: o.full_name, recebeu: serveModal && serveVeiculo, motivo };
  });

  // A rede de segurança da rota real: ninguém elegível = todos recebem.
  const nenhum = operadores.every((o) => !o.recebeu);
  return {
    motivo_geral: nenhum ? 'rede_de_seguranca' : 'filtrado',
    explicacao: nenhum
      ? 'Nenhum operador passou no filtro, então a solicitação foi para TODOS — '
      + 'pedido parado em silêncio é pior que aviso a mais. Confira os meios '
      + 'operados no cadastro de cada operador.'
      : null,
    veiculos: (nomesVeic.data || []).map((v) => ({ nome: v.name, modal: v.modal })),
    modais: [...modalIds],
    combo,
    operadores: nenhum
      ? operadores.map((o) => ({ ...o, recebeu: true, motivo: `${o.motivo} — mas recebeu pela rede de segurança` }))
      : operadores,
  };
}
