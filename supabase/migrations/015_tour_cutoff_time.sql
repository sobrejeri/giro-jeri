-- Horário limite de solicitação por passeio e transfer
-- NULL = sem restrição; '14:00:00' = aceita solicitações só até 14h do dia atual
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS booking_cutoff_time TIME DEFAULT NULL;

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS booking_cutoff_time TIME DEFAULT NULL;
