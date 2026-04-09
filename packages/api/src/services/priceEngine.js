import { supabase } from '../supabase.js';
import dayjs from 'dayjs';

// =============================================================================
// MOTOR DE PREÇOS — Giro Jeri
//
// Responsável por calcular o valor correto de qualquer reserva.
// O backend é a única fonte de verdade — o frontend só exibe o resultado.
// =============================================================================

// ── Busca configuração do sistema ─────────────────────
async function getSetting(key, defaultValue) {
  const { data } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', key)
    .single();
  return data ? data.setting_value : defaultValue;
}

// ── Verifica se a data está em alta temporada ─────────
export async function getSeasonAddition(regionId, serviceDate, subtotal) {
  const { data: rule } = await supabase
    .from('high_season_rules')
    .select('additional_type, additional_value')
    .eq('region_id', regionId)
    .eq('is_active', true)
    .lte('start_date', serviceDate)
    .gte('end_date', serviceDate)
    .limit(1)
    .single();

  if (!rule) return 0;

  if (rule.additional_type === 'percentage') {
    return Math.round(subtotal * (rule.additional_value / 100) * 100) / 100;
  }
  return rule.additional_value;
}

// ── Valida e calcula desconto de cupom ─────────────────
export async function applyCoupon(code, userId, regionId, serviceType, subtotal) {
  if (!code) return { discount: 0, couponId: null };

  const { data: coupon, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (error || !coupon) {
    throw { status: 400, message: 'Cupom inválido ou não encontrado' };
  }

  // Verifica vigência
  const now = dayjs();
  if (coupon.valid_from && dayjs(coupon.valid_from).isAfter(now)) {
    throw { status: 400, message: 'Cupom ainda não está válido' };
  }
  if (coupon.valid_until && dayjs(coupon.valid_until).isBefore(now)) {
    throw { status: 400, message: 'Cupom expirado' };
  }

  // Verifica tipo de serviço
  if (coupon.applicable_service_type && coupon.applicable_service_type !== serviceType) {
    throw { status: 400, message: `Cupom válido apenas para ${coupon.applicable_service_type === 'tour' ? 'passeios' : 'transfers'}` };
  }

  // Verifica região
  if (coupon.applicable_region_id && coupon.applicable_region_id !== regionId) {
    throw { status: 400, message: 'Cupom não válido para esta região' };
  }

  // Verifica valor mínimo
  if (coupon.min_order_amount && subtotal < coupon.min_order_amount) {
    throw {
      status: 400,
      message: `Pedido mínimo de R$ ${coupon.min_order_amount.toFixed(2)} para usar este cupom`,
    };
  }

  // Verifica limite total de uso
  if (coupon.usage_limit_total) {
    const { count } = await supabase
      .from('coupon_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id);

    if (count >= coupon.usage_limit_total) {
      throw { status: 400, message: 'Cupom esgotado' };
    }
  }

  // Verifica limite por usuário
  if (coupon.usage_limit_per_user && userId) {
    const { count } = await supabase
      .from('coupon_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id)
      .eq('user_id', userId);

    if (count >= coupon.usage_limit_per_user) {
      throw { status: 400, message: 'Você já utilizou este cupom' };
    }
  }

  // Calcula desconto
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round(subtotal * (coupon.discount_value / 100) * 100) / 100;
  } else {
    discount = coupon.discount_value;
  }

  // Aplica teto de desconto
  if (coupon.max_discount_amount) {
    discount = Math.min(discount, coupon.max_discount_amount);
  }

  // Nunca descontar mais que o subtotal
  discount = Math.min(discount, subtotal);

  return { discount, couponId: coupon.id };
}

// =============================================================================
// CÁLCULO DE PASSEIO PRIVATIVO
// Preço = soma dos veículos escolhidos + alta temporada - cupom
// =============================================================================

export async function calculatePrivateTour({
  regionId,
  tourId,
  serviceDate,
  vehicles,   // [{ vehicleId, quantity }]
  couponCode,
  userId,
}) {
  if (!vehicles || vehicles.length === 0) {
    throw { status: 400, message: 'Selecione pelo menos um veículo' };
  }

  // Busca regras de preço para cada veículo neste passeio
  let subtotal = 0;
  const vehicleDetails = [];

  for (const v of vehicles) {
    // Tenta regra específica para o passeio primeiro, depois regra geral
    const { data: rule } = await supabase
      .from('vehicle_pricing_rules')
      .select(`
        base_price,
        vehicles ( id, name, seat_capacity, image_url )
      `)
      .eq('vehicle_id', v.vehicleId)
      .eq('service_type', 'tour')
      .eq('is_active', true)
      .or(`service_id.eq.${tourId},service_id.is.null`)
      .order('service_id', { ascending: false, nullsFirst: false }) // específico antes do genérico
      .limit(1)
      .single();

    if (!rule) {
      throw {
        status: 400,
        message: `Veículo ${v.vehicleId} não disponível para este passeio`,
      };
    }

    const lineTotal = rule.base_price * v.quantity;
    subtotal += lineTotal;

    vehicleDetails.push({
      vehicleId:        v.vehicleId,
      vehicleName:      rule.vehicles.name,
      vehicleCapacity:  rule.vehicles.seat_capacity,
      quantity:         v.quantity,
      unitPrice:        rule.base_price,
      totalPrice:       lineTotal,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;

  // Alta temporada
  const seasonAddition = await getSeasonAddition(regionId, serviceDate, subtotal);

  const subtotalWithSeason = subtotal + seasonAddition;

  // Cupom
  const { discount, couponId } = await applyCoupon(
    couponCode, userId, regionId, 'tour', subtotalWithSeason
  );

  const total = Math.round((subtotalWithSeason - discount) * 100) / 100;

  return {
    mode:             'private',
    subtotalAmount:   subtotal,
    seasonAdditional: seasonAddition,
    discountAmount:   discount,
    totalAmount:      Math.max(0, total),
    couponId,
    vehicleDetails,
    breakdown: {
      vehicles:        `R$ ${subtotal.toFixed(2)}`,
      altaTemporada:   seasonAddition > 0 ? `+ R$ ${seasonAddition.toFixed(2)}` : null,
      desconto:        discount > 0 ? `- R$ ${discount.toFixed(2)}` : null,
      total:           `R$ ${Math.max(0, total).toFixed(2)}`,
    },
  };
}

// =============================================================================
// CÁLCULO DE PASSEIO COMPARTILHADO
// Preço = preço por pessoa × quantidade + alta temporada - cupom
// =============================================================================

export async function calculateSharedTour({
  regionId,
  tourId,
  serviceDate,
  peopleCount,
  couponCode,
  userId,
}) {
  const { data: tour } = await supabase
    .from('tours')
    .select('name, shared_price_per_person, is_shared_enabled')
    .eq('id', tourId)
    .single();

  if (!tour) throw { status: 404, message: 'Passeio não encontrado' };
  if (!tour.is_shared_enabled) {
    throw { status: 400, message: 'Este passeio não aceita modo compartilhado' };
  }
  if (!tour.shared_price_per_person) {
    throw { status: 400, message: 'Preço por pessoa não configurado para este passeio' };
  }

  const subtotal = Math.round(tour.shared_price_per_person * peopleCount * 100) / 100;

  const seasonAddition = await getSeasonAddition(regionId, serviceDate, subtotal);
  const subtotalWithSeason = subtotal + seasonAddition;

  const { discount, couponId } = await applyCoupon(
    couponCode, userId, regionId, 'tour', subtotalWithSeason
  );

  const total = Math.round((subtotalWithSeason - discount) * 100) / 100;

  return {
    mode:             'shared',
    pricePerPerson:   tour.shared_price_per_person,
    peopleCount,
    subtotalAmount:   subtotal,
    seasonAdditional: seasonAddition,
    discountAmount:   discount,
    totalAmount:      Math.max(0, total),
    couponId,
    breakdown: {
      porPessoa:     `R$ ${tour.shared_price_per_person.toFixed(2)} × ${peopleCount} pessoas`,
      subtotal:      `R$ ${subtotal.toFixed(2)}`,
      altaTemporada: seasonAddition > 0 ? `+ R$ ${seasonAddition.toFixed(2)}` : null,
      desconto:      discount > 0 ? `- R$ ${discount.toFixed(2)}` : null,
      total:         `R$ ${Math.max(0, total).toFixed(2)}`,
    },
  };
}

// =============================================================================
// CÁLCULO DE TRANSFER COM ROTA TABELADA
// Preço = preço da rota + alta temporada - cupom
// =============================================================================

export async function calculateTabbedTransfer({
  regionId,
  routeId,
  serviceDate,
  serviceTime,
  couponCode,
  userId,
}) {
  // Valida antecedência mínima de 4h
  await validateTransferAdvance(serviceDate, serviceTime);

  const { data: route } = await supabase
    .from('transfer_routes')
    .select('origin_name, destination_name, default_price')
    .eq('id', routeId)
    .eq('is_active', true)
    .single();

  if (!route) throw { status: 404, message: 'Rota não encontrada ou indisponível' };

  const subtotal = route.default_price;
  const seasonAddition = await getSeasonAddition(regionId, serviceDate, subtotal);
  const subtotalWithSeason = subtotal + seasonAddition;

  const { discount, couponId } = await applyCoupon(
    couponCode, userId, regionId, 'transfer', subtotalWithSeason
  );

  const total = Math.round((subtotalWithSeason - discount) * 100) / 100;

  return {
    type:             'tabbed_route',
    routeName:        `${route.origin_name} → ${route.destination_name}`,
    subtotalAmount:   subtotal,
    seasonAdditional: seasonAddition,
    discountAmount:   discount,
    totalAmount:      Math.max(0, total),
    couponId,
    breakdown: {
      rota:          `R$ ${subtotal.toFixed(2)}`,
      altaTemporada: seasonAddition > 0 ? `+ R$ ${seasonAddition.toFixed(2)}` : null,
      desconto:      discount > 0 ? `- R$ ${discount.toFixed(2)}` : null,
      total:         `R$ ${Math.max(0, total).toFixed(2)}`,
    },
  };
}

// =============================================================================
// VALIDAÇÃO DE ANTECEDÊNCIA MÍNIMA PARA TRANSFER
// =============================================================================

export async function validateTransferAdvance(serviceDate, serviceTime) {
  const minHours = parseInt(await getSetting('transfer_min_advance_hours', '4'));

  const serviceDateTime = dayjs(`${serviceDate}T${serviceTime}`);
  const minAllowed      = dayjs().add(minHours, 'hour');

  if (serviceDateTime.isBefore(minAllowed)) {
    throw {
      status: 400,
      message: `Transfers precisam ser agendados com pelo menos ${minHours} horas de antecedência. Horário mínimo: ${minAllowed.format('DD/MM [às] HH:mm')}.`,
    };
  }
}

// =============================================================================
// SUGESTÃO INTELIGENTE DE VEÍCULOS
// Para reservas privativas: sugere combinações que atendam X pessoas
// =============================================================================

export async function suggestVehicles({ regionId, tourId, peopleCount }) {
  // Busca veículos disponíveis com seus preços para este tour
  const { data: rules } = await supabase
    .from('vehicle_pricing_rules')
    .select(`
      base_price,
      vehicles (
        id, name, seat_capacity, vehicle_type, image_url, display_order
      )
    `)
    .eq('service_type', 'tour')
    .eq('is_active', true)
    .or(`service_id.eq.${tourId},service_id.is.null`)
    .order('service_id', { ascending: false, nullsFirst: false });

  if (!rules || rules.length === 0) return [];

  // Deduplica: para cada veículo, pega o preço mais específico
  const vehicleMap = new Map();
  for (const r of rules) {
    if (!vehicleMap.has(r.vehicles.id)) {
      vehicleMap.set(r.vehicles.id, {
        id:        r.vehicles.id,
        name:      r.vehicles.name,
        capacity:  r.vehicles.seat_capacity,
        type:      r.vehicles.vehicle_type,
        imageUrl:  r.vehicles.image_url,
        price:     r.base_price,
        order:     r.vehicles.display_order,
      });
    }
  }

  const available = Array.from(vehicleMap.values())
    .sort((a, b) => a.order - b.order);

  const suggestions = [];

  // ── Estratégia 1: menor número de veículos ─────────
  // Busca o veículo com maior capacidade que atenda sozinho
  const singleVehicle = available
    .filter(v => v.capacity >= peopleCount)
    .sort((a, b) => a.price - b.price)[0]; // mais barato entre os que atendem

  if (singleVehicle) {
    suggestions.push({
      label:       'Menos veículos',
      description: 'Um único veículo para seu grupo',
      vehicles:    [{ ...singleVehicle, quantity: 1 }],
      totalPrice:  singleVehicle.price,
      totalCapacity: singleVehicle.capacity,
    });
  }

  // ── Estratégia 2: melhor custo-benefício ───────────
  // Minimiza o custo total usando combinações
  const cheapest = findCheapestCombination(available, peopleCount);
  if (cheapest && JSON.stringify(cheapest.vehicles) !== JSON.stringify(suggestions[0]?.vehicles)) {
    suggestions.push({
      label:       'Melhor custo',
      description: 'Combinação mais econômica',
      ...cheapest,
    });
  }

  // ── Estratégia 3: aventura (buggys/quadris) ────────
  const adventureVehicles = available.filter(v =>
    ['buggy', 'quadricycle', 'utv_2', 'utv_4'].includes(v.type)
  );
  const adventureCombination = findCheapestCombination(adventureVehicles, peopleCount);
  if (adventureCombination) {
    suggestions.push({
      label:       'Aventura',
      description: 'Buggys e UTVs para mais emoção',
      ...adventureCombination,
    });
  }

  // ── Estratégia 4: premium (Hilux) ──────────────────
  const premiumVehicles = available.filter(v =>
    ['hilux_4x4', 'hilux_sw4'].includes(v.type)
  );
  const premiumCombination = findCheapestCombination(
    [...premiumVehicles, ...available], peopleCount, premiumVehicles
  );
  if (premiumCombination && premiumCombination.vehicles.some(v =>
    ['hilux_4x4', 'hilux_sw4'].includes(v.type))
  ) {
    suggestions.push({
      label:       'Premium',
      description: 'Conforto com Hilux para seu grupo',
      ...premiumCombination,
    });
  }

  // Remove sugestões duplicadas
  const unique = [];
  const seen   = new Set();
  for (const s of suggestions) {
    const key = s.vehicles.map(v => `${v.id}:${v.quantity}`).sort().join(',');
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  }

  return unique.slice(0, 4); // máximo 4 sugestões
}

// ── Algoritmo guloso: encontra combinação mais barata ─
function findCheapestCombination(vehicles, peopleNeeded, preferredFirst = []) {
  if (!vehicles || vehicles.length === 0) return null;

  // Ordena por custo por assento (mais eficiente primeiro)
  const sorted = [...vehicles].sort((a, b) =>
    (a.price / a.capacity) - (b.price / b.capacity)
  );

  let remaining = peopleNeeded;
  const chosen  = new Map(); // vehicleId → quantity
  let totalPrice = 0;
  let totalCap   = 0;

  for (const v of sorted) {
    if (remaining <= 0) break;
    const qty = Math.ceil(remaining / v.capacity);
    chosen.set(v.id, { ...v, quantity: qty });
    remaining  -= v.capacity * qty;
    totalPrice += v.price * qty;
    totalCap   += v.capacity * qty;
  }

  if (remaining > 0) return null; // não conseguiu atender

  return {
    vehicles:      Array.from(chosen.values()),
    totalPrice:    Math.round(totalPrice * 100) / 100,
    totalCapacity: totalCap,
  };
}
