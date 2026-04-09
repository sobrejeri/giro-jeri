import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── POST /api/payments/webhook — Mercado Pago ──────────
// Recebe eventos do gateway e processa pagamentos
router.post('/webhook', async (req, res, next) => {
  try {
    const event = req.body;

    // Idempotência: ignora eventos já processados
    const eventId = event.id?.toString() || event.data?.id?.toString();
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from('payment_events')
        .select('id')
        .eq('event_name', event.type || event.action)
        .eq('processing_status', 'completed')
        .limit(1)
        .single();

      if (existingEvent) {
        return res.status(200).json({ message: 'Evento já processado' });
      }
    }

    // Registra o evento bruto
    const { data: paymentEvent } = await supabase
      .from('payment_events')
      .insert({
        payment_id:         event.booking_id || null,
        event_name:         event.type || event.action || 'unknown',
        event_payload_json: event,
        processing_status:  'pending',
      })
      .select()
      .single();

    // ── Processa por tipo de evento ────────────────────
    if (event.type === 'payment' || event.action === 'payment.updated') {
      await processPaymentEvent(event);
    }

    // Marca evento como processado
    if (paymentEvent) {
      await supabase
        .from('payment_events')
        .update({
          processed_at:      new Date().toISOString(),
          processing_status: 'completed',
        })
        .eq('id', paymentEvent.id);
    }

    res.status(200).json({ message: 'OK' });
  } catch (err) {
    next(err);
  }
});

// ── Processa pagamento aprovado/falhou ─────────────────
async function processPaymentEvent(event) {
  const gatewayTxnId = event.data?.id?.toString();
  if (!gatewayTxnId) return;

  // Busca o payment pelo transaction_id
  const { data: payment } = await supabase
    .from('payments')
    .select('*, bookings(*)')
    .eq('gateway_transaction_id', gatewayTxnId)
    .single();

  if (!payment) return;

  const status = event.data?.status;

  if (status === 'approved') {
    await onPaymentApproved(payment);
  } else if (['rejected', 'cancelled'].includes(status)) {
    await onPaymentFailed(payment, status);
  }
}

async function onPaymentApproved(payment) {
  // 1. Atualiza payment
  await supabase
    .from('payments')
    .update({ status: 'approved', paid_at: new Date().toISOString() })
    .eq('id', payment.id);

  // 2. Atualiza booking
  await supabase
    .from('bookings')
    .update({
      status_commercial:  'paid',
      status_operational: 'awaiting_dispatch',
      payment_status:     'approved',
    })
    .eq('id', payment.booking_id);

  const booking = payment.bookings;

  // 3. Lança no ledger financeiro
  const gatewayFeePercent = 3.5; // substituir por system_settings
  const gatewayFee = Math.round(payment.amount_gross * (gatewayFeePercent / 100) * 100) / 100;

  await supabase.from('financial_ledger').insert([
    {
      booking_id:           payment.booking_id,
      payment_id:           payment.id,
      entry_type:           'booking_gross',
      description:          `Receita bruta — reserva ${booking?.booking_code}`,
      amount:               payment.amount_gross,
      direction:            'inflow',
      financial_status:     'pending',
      expected_credit_date: payment.expected_credit_date,
    },
    {
      booking_id:       payment.booking_id,
      payment_id:       payment.id,
      entry_type:       'gateway_fee',
      description:      `Taxa gateway — reserva ${booking?.booking_code}`,
      amount:           gatewayFee,
      direction:        'outflow',
      financial_status: 'pending',
    },
    {
      booking_id:           payment.booking_id,
      payment_id:           payment.id,
      entry_type:           'booking_net',
      description:          `Receita líquida — reserva ${booking?.booking_code}`,
      amount:               payment.amount_gross - gatewayFee,
      direction:            'inflow',
      financial_status:     'pending',
      expected_credit_date: payment.expected_credit_date,
    },
  ]);

  // 4. Cria comissão (plataforma 7%)
  const platformPercent = 7;
  const platformAmount  = Math.round(payment.amount_gross * (platformPercent / 100) * 100) / 100;

  await supabase.from('commissions').insert({
    booking_id:         payment.booking_id,
    agency_id:          booking?.agency_id || null,
    commission_model:   'percentage',
    commission_percent: platformPercent,
    commission_amount:  platformAmount,
    platform_amount:    platformAmount,
    operator_amount:    payment.amount_gross - platformAmount - gatewayFee,
    payout_status:      'pending',
  });

  // 5. Agenda automações
  const serviceDate = booking?.service_date;
  const serviceTime = booking?.service_time;

  if (serviceDate && serviceTime) {
    const serviceAt = new Date(`${serviceDate}T${serviceTime}`);

    await supabase.from('automation_jobs').insert([
      {
        related_entity_type: 'bookings',
        related_entity_id:   payment.booking_id,
        job_type:            'booking_confirmation',
        run_at:              new Date().toISOString(),
      },
      {
        related_entity_type: 'bookings',
        related_entity_id:   payment.booking_id,
        job_type:            'pre_trip_reminder_24h',
        run_at:              new Date(serviceAt.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        related_entity_type: 'bookings',
        related_entity_id:   payment.booking_id,
        job_type:            'pre_trip_reminder_2h',
        run_at:              new Date(serviceAt.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        related_entity_type: 'bookings',
        related_entity_id:   payment.booking_id,
        job_type:            'post_trip_review_request',
        run_at:              new Date(serviceAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      },
    ]);
  }

  // 6. Notifica cliente
  await supabase.from('notifications').insert({
    user_id:      booking?.user_id,
    booking_id:   payment.booking_id,
    channel:      'whatsapp',
    template_key: 'booking_confirmed',
    title:        'Reserva confirmada!',
    message_body: `✅ Sua reserva *${booking?.booking_code}* foi confirmada! Fique de olho no app para atualizações.`,
  });

  // 7. Notifica operação
  await supabase.from('notifications').insert({
    booking_id:   payment.booking_id,
    channel:      'internal',
    template_key: 'new_booking_operator',
    title:        'Nova reserva aguardando despacho',
    message_body: `Nova reserva paga: ${booking?.booking_code}. Data: ${serviceDate} às ${serviceTime}.`,
  });
}

async function onPaymentFailed(payment, reason) {
  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('id', payment.id);

  await supabase
    .from('bookings')
    .update({ status_commercial: 'payment_failed', payment_status: 'failed' })
    .eq('id', payment.booking_id);
}

// ── POST /api/payments/intent — cria intenção de pagamento
router.post('/intent', authenticate, async (req, res, next) => {
  try {
    const { booking_id, payment_method, payment_type = 'full' } = req.body;

    // Busca a reserva
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', booking_id)
      .eq('user_id', req.user.id)
      .eq('status_commercial', 'awaiting_payment')
      .single();

    if (!booking) {
      return res.status(404).json({ error: 'Reserva não encontrada ou já processada' });
    }

    // Calcula valor a cobrar
    const amountToPay = payment_type === 'deposit'
      ? Math.round(booking.total_amount * 0.3 * 100) / 100  // 30% de sinal
      : booking.total_amount;

    // Cria registro do pagamento
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        booking_id,
        gateway_name:    'mercado_pago',
        payment_method,
        payment_type,
        amount_gross:    amountToPay,
        gateway_fee_amount: 0,  // atualizado pelo webhook
        currency:        'BRL',
        status:          'pending',
        expires_at:      new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min
      })
      .select()
      .single();

    if (error) throw error;

    // TODO: integrar com Mercado Pago SDK para gerar PIX/link de pagamento
    // const mpResponse = await createMercadoPagoPreference(booking, payment);

    res.json({
      payment_id:   payment.id,
      amount:       amountToPay,
      expires_at:   payment.expires_at,
      // pix_code: mpResponse.pix_code,
      // qr_code:  mpResponse.qr_code,
      message: 'Intent criado. Integre com Mercado Pago SDK para gerar o QR/PIX.',
    });
  } catch (err) { next(err); }
});

export default router;
