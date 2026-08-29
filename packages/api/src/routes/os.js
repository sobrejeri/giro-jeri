// ── routes/os.js ────────────────────────────────────────
// Link PÚBLICO da Ordem de Serviço: GET /api/os/:token
//
// Aberto de propósito — quem abre é o passageiro ou o motorista, que não têm
// conta. O acesso é controlado pelo token assinado (lib/osToken.js), não por
// sessão. Devolve SÓ o que a OS mostra; nada de dados financeiros da
// operador, cadastro do cliente ou outras reservas.
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { verifyOsToken } from '../lib/osToken.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    let claims;
    try { claims = verifyOsToken(req.params.token); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    const { data: booking, error } = await supabase
      .from('bookings')
      .select(`id, booking_code, service_type, service_id, booking_mode, service_date,
               service_time, people_count, total_amount, origin_text, destination_text,
               pickup_place_name, destination_place_name, special_notes,
               status_commercial, status_operational, user_id, operator_id`)
      .eq('id', claims.booking_id)
      .maybeSingle();
    if (error) throw error;
    if (!booking) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });

    // Dados do despacho (veículo real, motorista, observações).
    const { data: assignment } = await supabase
      .from('operational_assignments')
      .select('real_vehicle_text, driver_name, driver_phone, dispatch_notes')
      .eq('booking_id', booking.id)
      .maybeSingle();

    // Cliente: só nome e telefone — é o que a OS exibe.
    const { data: cliente } = await supabase
      .from('users').select('full_name, phone').eq('id', booking.user_id).maybeSingle();

    // Operador responsável (cabeçalho da OS).
    let operador = null;
    if (booking.operator_id) {
      const { data: op } = await supabase
        .from('users')
        .select('full_name, document_number, phone, profile_photo_url')
        .eq('id', booking.operator_id).maybeSingle();
      if (op) {
        operador = {
          name:              op.full_name,
          cnpj:              op.document_number,
          phone:             op.phone,
          profile_photo_url: op.profile_photo_url,
        };
      }
    }

    // Nome, roteiro e duração do serviço — a OS precisa dizer O QUE foi
    // contratado, não só "Passeio — Privativo".
    const { attachServiceDetails } = await import('../services/serviceDetails.js');
    const [comServico] = await attachServiceDetails(supabase, [booking]);

    // Veículos escolhidos na reserva (quando privativo).
    const { data: veiculos } = await supabase
      .from('booking_vehicles')
      .select('quantity, vehicle_name_snapshot')
      .eq('booking_id', booking.id);

    res.json({
      booking: { ...comServico, users: cliente || null },
      assignment: assignment || null,
      operador,
      vehicles: veiculos || [],
    });
  } catch (err) { next(err); }
});

export default router;
