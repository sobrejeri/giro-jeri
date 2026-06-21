-- Permite que usuários autenticados insiram/atualizem pagamentos e
-- veículos vinculados às PRÓPRIAS reservas.
--
-- Causa raiz: a API executa as queries no contexto do usuário (auth.uid()
-- resolve via JWT). O insert em `bookings` passa pela policy FOR ALL, mas
-- `payments` e `booking_vehicles` só tinham policy de SELECT — sem INSERT,
-- o RLS bloqueava o pagamento com:
--   "new row violates row-level security policy for table payments".
--
-- Idempotente: pode ser executado quantas vezes for necessário.

DROP POLICY IF EXISTS "users_own_payments_insert" ON payments;
CREATE POLICY "users_own_payments_insert" ON payments
  FOR INSERT WITH CHECK (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "users_own_payments_update" ON payments;
CREATE POLICY "users_own_payments_update" ON payments
  FOR UPDATE USING (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "users_own_booking_vehicles_insert" ON booking_vehicles;
CREATE POLICY "users_own_booking_vehicles_insert" ON booking_vehicles
  FOR INSERT WITH CHECK (
    booking_id IN (
      SELECT id FROM bookings WHERE user_id IN (
        SELECT id FROM users WHERE auth_id = auth.uid()
      )
    )
  );
