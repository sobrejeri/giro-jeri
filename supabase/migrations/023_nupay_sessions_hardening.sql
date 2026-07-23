-- =============================================================================
-- 023 - NuPay Sessions: idempotencia, estados e finalizacao atomica
-- =============================================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(200),
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(80),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_session
  ON payments (provider_session_id)
  WHERE provider_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_nupay_active_booking
  ON payments (booking_id)
  WHERE gateway_name = 'nupay' AND status = 'pending';

UPDATE system_settings
SET setting_value = 'false',
    description = 'Habilita NuPay somente quando NUPAY_ENABLED e as credenciais do ambiente estiverem configuradas.'
WHERE setting_key = 'payment_nupay_enabled';

DELETE FROM system_settings
WHERE setting_key IN (
  'payment_nupay_env',
  'payment_nupay_app_key',
  'payment_nupay_app_token',
  'payment_nupay_client_id',
  'payment_nupay_client_secret',
  'payment_nupay_merchant_id',
  'payment_nupay_webhook_secret'
);

CREATE OR REPLACE FUNCTION finalize_nupay_payment(
  p_payment_id UUID,
  p_provider_status TEXT,
  p_provider_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_gross NUMERIC(10, 2);
  v_fee NUMERIC(10, 2);
  v_platform_pct NUMERIC(5, 2) := 0;
  v_platform_amount NUMERIC(10, 2) := 0;
BEGIN
  SELECT *
  INTO v_payment
  FROM payments
  WHERE id = p_payment_id
    AND gateway_name = 'nupay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NuPay payment not found';
  END IF;

  IF v_payment.status = 'approved' THEN
    RETURN FALSE;
  END IF;

  IF v_payment.status <> 'pending' OR UPPER(p_provider_status) <> 'COMPLETED' THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO v_booking
  FROM bookings
  WHERE id = v_payment.booking_id
  FOR UPDATE;

  v_gross := ROUND(v_payment.amount_gross, 2);
  v_fee := ROUND(COALESCE(v_payment.gateway_fee_amount, 0), 2);
  SELECT LEAST(100, GREATEST(0,
    CASE
      WHEN setting_value ~ '^[0-9]+([.][0-9]+)?$' THEN setting_value::NUMERIC
      ELSE 0
    END
  ))
  INTO v_platform_pct
  FROM system_settings
  WHERE setting_key = 'payment_split_admin_pct';
  v_platform_amount := ROUND(v_gross * COALESCE(v_platform_pct, 0) / 100, 2);

  UPDATE payments
  SET status = 'approved',
      provider_status = 'COMPLETED',
      paid_at = NOW(),
      failure_code = NULL,
      raw_response_json = jsonb_strip_nulls(jsonb_build_object(
        'pspReferenceId', p_provider_payload ->> 'pspReferenceId',
        'referenceId', p_provider_payload ->> 'referenceId',
        'status', p_provider_payload ->> 'status',
        'code', p_provider_payload ->> 'code',
        'timestamp', p_provider_payload ->> 'timestamp'
      ))
  WHERE id = p_payment_id;

  UPDATE bookings
  SET status_commercial = 'paid',
      status_operational = 'awaiting_dispatch',
      payment_status = 'approved'
  WHERE id = v_payment.booking_id;

  IF v_booking.service_type = 'transfer' AND v_booking.service_id IS NOT NULL THEN
    UPDATE transfer_quotes
    SET status = 'paid'
    WHERE id = v_booking.service_id
      AND status = 'accepted';
  END IF;

  INSERT INTO financial_ledger (
    booking_id, payment_id, entry_type, description, amount, direction, financial_status
  ) VALUES
    (v_payment.booking_id, p_payment_id, 'booking_gross',
      'Receita bruta - ' || v_booking.booking_code, v_gross, 'inflow', 'pending'),
    (v_payment.booking_id, p_payment_id, 'gateway_fee',
      'Taxa gateway - ' || v_booking.booking_code, v_fee, 'outflow', 'pending'),
    (v_payment.booking_id, p_payment_id, 'booking_net',
      'Receita liquida - ' || v_booking.booking_code, v_gross - v_fee, 'inflow', 'pending');

  IF v_platform_amount > 0 THEN
    INSERT INTO financial_ledger (
      booking_id, payment_id, region_id, agency_id,
      entry_type, category, description, amount, direction, financial_status
    ) VALUES (
      v_payment.booking_id,
      p_payment_id,
      v_booking.region_id,
      v_booking.agency_id,
      'commission_platform',
      'platform_commission',
      'Comissao da plataforma - ' || v_booking.booking_code,
      v_platform_amount,
      'outflow',
      'pending'
    );
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION finalize_nupay_payment(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_nupay_payment(UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION finalize_nupay_payment(UUID, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_nupay_payment(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION finalize_nupay_refund(
  p_payment_id UUID,
  p_refund_id TEXT,
  p_provider_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_booking bookings%ROWTYPE;
BEGIN
  SELECT *
  INTO v_payment
  FROM payments
  WHERE id = p_payment_id
    AND gateway_name = 'nupay'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NuPay payment not found';
  END IF;

  IF v_payment.status = 'refunded' THEN
    RETURN FALSE;
  END IF;

  IF v_payment.status <> 'approved' OR UPPER(p_provider_status) <> 'REFUNDED' THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO v_booking
  FROM bookings
  WHERE id = v_payment.booking_id
  FOR UPDATE;

  UPDATE payments
  SET status = 'refunded',
      provider_status = 'REFUNDED',
      failure_code = NULL
  WHERE id = p_payment_id;

  UPDATE bookings
  SET status_commercial = 'refunded',
      status_operational = 'cancelled',
      payment_status = 'refunded'
  WHERE id = v_payment.booking_id;

  INSERT INTO financial_ledger (
    booking_id, payment_id, entry_type, category, description,
    amount, direction, financial_status, effective_date
  ) VALUES (
    v_payment.booking_id,
    p_payment_id,
    'refund',
    'nupay_refund',
    'Estorno NuPay - ' || v_booking.booking_code || ' - ' || p_refund_id,
    ROUND(v_payment.amount_gross, 2),
    'outflow',
    'paid',
    CURRENT_DATE
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION finalize_nupay_refund(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_nupay_refund(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION finalize_nupay_refund(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_nupay_refund(UUID, TEXT, TEXT) TO service_role;
