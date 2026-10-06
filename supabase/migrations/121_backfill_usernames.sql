-- =============================================================================
-- 121_backfill_usernames.sql — Gera @ para usuários existentes sem username
-- =============================================================================
-- Preenche users.username para todo usuário (turista ou operador) que ainda não
-- tem um, a partir do nome completo: minúsculas, sem acentos, separadores viram
-- ponto, mínimo 3 caracteres, e com sufixo numérico para garantir unicidade.
-- Admins ficam de fora (aparecem como "Turiva", não precisam de @).
-- Idempotente: só mexe em quem está com username nulo/vazio. Pode rodar de novo.
-- =============================================================================

DO $$
DECLARE
  u    RECORD;
  base TEXT;
  cand TEXT;
  i    INT;
BEGIN
  FOR u IN
    SELECT id, full_name FROM users
     WHERE (username IS NULL OR username = '')
       AND user_type IS DISTINCT FROM 'admin'
  LOOP
    -- Base do @ a partir do nome (sem acentos → separadores viram ponto).
    base := lower(coalesce(NULLIF(btrim(u.full_name), ''), 'usuario'));
    base := translate(
      base,
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    );
    base := regexp_replace(base, '[^a-z0-9]+', '.', 'g'); -- qualquer separador → ponto
    base := regexp_replace(base, '\.+', '.', 'g');         -- colapsa pontos
    base := btrim(base, '.');                              -- tira pontos das pontas
    base := left(base, 24);                                -- espaço para sufixo
    WHILE length(base) < 3 LOOP base := base || '0'; END LOOP;

    -- Evita reservar nomes do sistema.
    IF base IN ('admin','administrador','root','suporte','support','ajuda','help',
                'turiva','sistema','system','oficial','contato','null','undefined',
                'me','eu','user','usuario') THEN
      base := left('user.' || base, 24);
    END IF;

    -- Garante unicidade (base, base1, base2, …).
    cand := base;
    i := 0;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = cand) LOOP
      i := i + 1;
      cand := left(base, 24) || i::text;
    END LOOP;

    UPDATE users SET username = cand WHERE id = u.id;
  END LOOP;
END $$;

-- =============================================================================
-- VERIFICAÇÃO
-- =============================================================================
/*
SELECT count(*) FILTER (WHERE username IS NULL OR username = '') AS sem_username,
       count(*) FILTER (WHERE username IS NOT NULL AND username <> '') AS com_username
  FROM users WHERE user_type IS DISTINCT FROM 'admin';
*/
